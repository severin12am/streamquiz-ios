# Server-side create quota (deploy to whosmarter.com)

The iOS app sends `X-Quota-Key` on create/rematch API calls (RevenueCat app user ID, or `device:{clientId}` fallback). Enforcement must happen **on the server** before AI runs.

## 1. Run Supabase migration

Execute `supabase/migration-v5-creator-quota.sql` in the Supabase SQL Editor.

## 2. Add Netlify env var

```
REVENUECAT_SECRET_API_KEY=sk_…   # RevenueCat → Project → API keys → Secret
```

## 3. Copy `lib/creator-quota.ts`

Into your Next.js repo (same constants as `src/lib/purchases.ts`).

## 4. Wire `POST /api/create-game`

```typescript
import { consumeCreateQuota } from '@/lib/creator-quota';

const quotaKey = request.headers.get('x-quota-key')?.trim();
if (!quotaKey) {
  return NextResponse.json({ error: 'Missing quota key' }, { status: 400 });
}

const quota = await consumeCreateQuota(supabaseAdmin, quotaKey);
if (!quota) {
  return NextResponse.json({ error: 'Create quota exceeded' }, { status: 402 });
}

// … generate questions + insert game …

return NextResponse.json({ gameId, questions, quota });
```

## 5. Wire `POST /api/generate-questions` (rematch)

Same `consumeCreateQuota` check before calling OpenRouter. Return `{ questions, quota }`.

## 6. Optional: `GET /api/quota`

```typescript
const quotaKey = request.headers.get('x-quota-key')?.trim();
const quota = await getQuotaSnapshot(supabaseAdmin, quotaKey);
return NextResponse.json({ quota });
```

The iOS client calls this on refresh when available; falls back to local counters until deployed.
