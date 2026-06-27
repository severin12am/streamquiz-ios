# WhoSmarter web (whosmarter.com) — add server-side create quota

This file is a **self-contained task** for the machine that hosts the **Next.js web app** (whosmarter.com on Netlify) and has the **Supabase** project. Everything needed is embedded below — you do **not** need the iOS repo.

---

## TL;DR (for the human)

The iOS app gates quiz creation (5 free, then 30/mo Basic or 300/mo Premium) but currently counts **on-device**, so reinstalling the app resets the counter (exploit). We are moving the counter to the **server**, keyed by RevenueCat user ID, so it survives reinstalls and is authoritative.

You need to:
1. Run one SQL migration in Supabase.
2. Add one Netlify env var (`REVENUECAT_SECRET_API_KEY`).
3. Have the AI add `lib/creator-quota.ts` and wire two existing API routes.
4. Deploy and test.

The iOS client is already shipping the required header and handles the new response — **the web side is fully backward compatible**: if you do nothing, the app keeps working with local counters.

---

## Contract (what the iOS app already sends/expects)

The iOS app (build 8+) now sends this header on `POST /api/create-game` and `POST /api/generate-questions`:

```
X-Quota-Key: <RevenueCat appUserId>   // e.g. "$RCAnonymousID:abc123…"
                                       // or "device:<uuid>" when RevenueCat is unavailable
```

The app will use server quota **only if** the response JSON contains a `quota` object of this exact shape:

```ts
interface CreateAllowance {
  allowed: boolean;   // remaining > 0
  tier: 'free' | 'basic' | 'premium';
  used: number;       // creates used in current window
  limit: number;      // 5 (free), 30 (basic), 300 (premium)
  remaining: number;  // max(0, limit - used)
}
```

- On success, return `{ gameId, questions, quota }` (create-game) or `{ questions, quota }` (generate-questions).
- When the quota is exceeded, return **HTTP 402** with `{ "error": "Create quota exceeded" }`. The iOS app maps 402 to its paywall.
- If you omit `quota` entirely, the iOS app silently falls back to its local counter (no breakage).

**Important parity rule:** Do not rename existing routes, change the `games`/`players` schema, or alter phase/timing. This change is purely additive (one new table + quota checks).

---

## STEP 1 — Supabase migration (run in SQL Editor)

```sql
-- Migration: server-side creator quota
create table if not exists public.creator_quota (
  quota_key text primary key,
  free_used integer not null default 0 check (free_used >= 0),
  monthly_used integer not null default 0 check (monthly_used >= 0),
  month_key text not null default '',
  updated_at timestamptz not null default now()
);

create index if not exists creator_quota_updated_at_idx
  on public.creator_quota (updated_at desc);

alter table public.creator_quota enable row level security;
-- No policies → anon/authenticated cannot touch it; the service role bypasses RLS.

comment on table public.creator_quota is
  'Create-quiz usage counters keyed by RevenueCat app user ID (authoritative server-side quota).';
```

---

## STEP 2 — Netlify environment variable

Add (Site settings → Environment variables):

```
REVENUECAT_SECRET_API_KEY = sk_…   # RevenueCat → Project → API keys → Secret API key
```

This is the **secret** key (`sk_…`), server-only. It is NOT the public `appl_…` SDK key. Never expose it to the client.

> If you have not created a secret key yet: RevenueCat dashboard → Project settings → API keys → "+ New" under Secret API keys.

---

## STEP 3 (for the AI) — add `lib/creator-quota.ts`

Create `lib/creator-quota.ts` (adjust import path for your Supabase admin client if different). The tier values and limits MUST match the iOS app: free = 5, basic = 30, premium = 300; entitlement IDs are lowercase `basic` / `premium`.

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type QuotaTier = 'free' | 'basic' | 'premium';

export interface QuotaSnapshot {
  allowed: boolean;
  tier: QuotaTier;
  used: number;
  limit: number;
  remaining: number;
}

const FREE_TRIAL_CREATES = 5;
const BASIC_MONTHLY_GAMES = 30;
const PREMIUM_MONTHLY_GAMES = 300;

function currentMonth(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthlyLimit(tier: QuotaTier): number | null {
  if (tier === 'basic') return BASIC_MONTHLY_GAMES;
  if (tier === 'premium') return PREMIUM_MONTHLY_GAMES;
  return null;
}

function snapshot(tier: QuotaTier, used: number, limit: number): QuotaSnapshot {
  const remaining = Math.max(0, limit - used);
  return { allowed: remaining > 0, tier, used, limit, remaining };
}

/** Resolve subscription tier from RevenueCat REST API (authoritative). */
export async function fetchTierFromRevenueCat(quotaKey: string): Promise<QuotaTier> {
  const secret = process.env.REVENUECAT_SECRET_API_KEY?.trim();
  if (!secret || !quotaKey) return 'free';
  try {
    const res = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(quotaKey)}`,
      { headers: { Authorization: `Bearer ${secret}` }, cache: 'no-store' },
    );
    if (!res.ok) return 'free';
    const data = (await res.json()) as {
      subscriber?: { entitlements?: Record<string, { expires_date?: string | null }> };
    };
    const entitlements = data.subscriber?.entitlements ?? {};
    const active = (id: string) => {
      const e = entitlements[id];
      if (!e) return false;
      if (!e.expires_date) return true;
      return new Date(e.expires_date).getTime() > Date.now();
    };
    if (active('premium')) return 'premium';
    if (active('basic')) return 'basic';
    return 'free';
  } catch {
    return 'free';
  }
}

interface QuotaRow { free_used: number; monthly_used: number; month_key: string }

async function readRow(supabase: SupabaseClient, quotaKey: string): Promise<QuotaRow> {
  const { data } = await supabase
    .from('creator_quota')
    .select('free_used, monthly_used, month_key')
    .eq('quota_key', quotaKey)
    .maybeSingle();
  const month = currentMonth();
  if (!data) return { free_used: 0, monthly_used: 0, month_key: month };
  if (data.month_key !== month) return { free_used: data.free_used, monthly_used: 0, month_key: month };
  return data as QuotaRow;
}

/** Read-only quota check (no increment). For optional GET /api/quota. */
export async function getQuotaSnapshot(
  supabase: SupabaseClient,
  quotaKey: string,
  tier?: QuotaTier,
): Promise<QuotaSnapshot> {
  const resolvedTier = tier ?? (await fetchTierFromRevenueCat(quotaKey));
  const row = await readRow(supabase, quotaKey);
  const monthly = monthlyLimit(resolvedTier);
  if (monthly != null) return snapshot(resolvedTier, row.monthly_used, monthly);
  return snapshot(resolvedTier, row.free_used, FREE_TRIAL_CREATES);
}

/**
 * Atomically check + consume one create. Returns null when quota is exceeded.
 * Call BEFORE generating AI questions / inserting the game row.
 */
export async function consumeCreateQuota(
  supabase: SupabaseClient,
  quotaKey: string,
): Promise<QuotaSnapshot | null> {
  if (!quotaKey) return null;
  const tier = await fetchTierFromRevenueCat(quotaKey);
  const row = await readRow(supabase, quotaKey);
  const month = currentMonth();
  const monthly = monthlyLimit(tier);

  if (monthly != null) {
    const used = row.month_key === month ? row.monthly_used : 0;
    if (used >= monthly) return null;
    const nextUsed = used + 1;
    const { error } = await supabase.from('creator_quota').upsert(
      { quota_key: quotaKey, free_used: row.free_used, monthly_used: nextUsed, month_key: month, updated_at: new Date().toISOString() },
      { onConflict: 'quota_key' },
    );
    if (error) throw error;
    return snapshot(tier, nextUsed, monthly);
  }

  if (row.free_used >= FREE_TRIAL_CREATES) return null;
  const nextFree = row.free_used + 1;
  const { error } = await supabase.from('creator_quota').upsert(
    { quota_key: quotaKey, free_used: nextFree, monthly_used: row.month_key === month ? row.monthly_used : 0, month_key: month, updated_at: new Date().toISOString() },
    { onConflict: 'quota_key' },
  );
  if (error) throw error;
  return snapshot(tier, nextFree, FREE_TRIAL_CREATES);
}
```

> Use your existing **service-role** Supabase client (the one `create-game` already uses to insert the game row). Do not use the anon client — RLS blocks it by design.

---

## STEP 4 (for the AI) — wire the existing routes

### `POST /api/create-game`

Add the quota check **before** generating questions (so a blocked user spends no AI tokens), and include `quota` in the success response.

```ts
import { consumeCreateQuota } from '@/lib/creator-quota';

const quotaKey = request.headers.get('x-quota-key')?.trim();
if (!quotaKey) {
  return NextResponse.json({ error: 'Missing quota key' }, { status: 400 });
}

const quota = await consumeCreateQuota(supabaseAdmin, quotaKey);
if (!quota) {
  return NextResponse.json({ error: 'Create quota exceeded' }, { status: 402 });
}

// … existing: generate questions, insert game row …

return NextResponse.json({ gameId, questions, provider, quota });
```

### `POST /api/generate-questions` (rematch)

Same pattern — rematch counts as one create:

```ts
import { consumeCreateQuota } from '@/lib/creator-quota';

const quotaKey = request.headers.get('x-quota-key')?.trim();
if (!quotaKey) {
  return NextResponse.json({ error: 'Missing quota key' }, { status: 400 });
}
const quota = await consumeCreateQuota(supabaseAdmin, quotaKey);
if (!quota) {
  return NextResponse.json({ error: 'Create quota exceeded' }, { status: 402 });
}

// … existing: generate questions …

return NextResponse.json({ questions, quota });
```

> ⚠️ If the **web frontend** also calls these routes (browser play), it does NOT send `X-Quota-Key`. Decide one of:
> - **Recommended:** only enforce when the header is present (web stays unmetered for now):
>   ```ts
>   const quotaKey = request.headers.get('x-quota-key')?.trim();
>   if (quotaKey) {
>     const quota = await consumeCreateQuota(supabaseAdmin, quotaKey);
>     if (!quota) return NextResponse.json({ error: 'Create quota exceeded' }, { status: 402 });
>     // attach quota to response
>   }
>   ```
> - Or generate a web quota key from the browser and enforce there too (larger change).
> Pick the first unless you want to meter the web too.

### Optional — `GET /api/quota`

Lets the app refresh remaining counts on launch. If you skip it, the app gets quota from create/rematch responses and falls back locally otherwise.

```ts
import { getQuotaSnapshot } from '@/lib/creator-quota';

export async function GET(request: Request) {
  const quotaKey = request.headers.get('x-quota-key')?.trim();
  if (!quotaKey) return NextResponse.json({ error: 'Missing quota key' }, { status: 400 });
  const quota = await getQuotaSnapshot(supabaseAdmin, quotaKey);
  return NextResponse.json({ quota });
}
```

---

## STEP 5 — test

1. Deploy to Netlify with the env var set.
2. `curl` create-game with a header and confirm `quota` in the response + the row appears in `creator_quota`:
   ```bash
   curl -i -X POST https://whosmarter.com/api/create-game \
     -H "Content-Type: application/json" \
     -H "X-WhoSmarter-Client: ios" \
     -H "X-Quota-Key: device:test-123" \
     -d '{"topic":"space","difficulty":"easy","num_questions":3,"mc_mode":true,"game_mode":"regular","cameras_enabled":true,"locale":"en"}'
   ```
3. Repeat 6× with the same key → the 6th should return **HTTP 402** (free limit is 5).
4. In Supabase, confirm `creator_quota` shows `free_used = 5` for `device:test-123`.
5. For a subscribed RevenueCat user, the limit should be 30 (basic) or 300 (premium) and `monthly_used` increments instead.

---

## Notes / gotchas

- **Tier source of truth** is RevenueCat (via secret key). If `REVENUECAT_SECRET_API_KEY` is missing, everyone resolves to `free` (5/mo) — safe but strict.
- **Month reset** is by `YYYY-MM` (UTC server time); `monthly_used` auto-resets when the month changes.
- **Anonymous RevenueCat IDs** (`$RCAnonymousID:…`) are stable per install but change on reinstall unless the user restores purchases. For **paid** users this is fine (restore re-links). For **free** users, reinstall still yields a new key — that's acceptable; the main exploit we close is paid users exceeding monthly caps and trivial free-tier farming is bounded by the AI cost guardrails you already have (rate limits).
- Keep limits in sync with the iOS app: `FREE_TRIAL_CREATES=5`, `BASIC_MONTHLY_GAMES=30`, `PREMIUM_MONTHLY_GAMES=300`. If you change them on the server, tell the iOS side too.
