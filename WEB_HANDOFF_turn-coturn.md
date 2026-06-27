# WhoSmarter web (whosmarter.com) — pivot TURN relay to self-hosted coturn

This file is a **self-contained task** for the machine that hosts the **Next.js web app** (whosmarter.com on Netlify). You do **not** need the iOS repo to implement this — everything required is embedded below.

---

## TL;DR (for the human)

We run our own **coturn** TURN server on a VPS (`62.238.37.7`) so video/audio relay costs a flat monthly VPS fee instead of Metered.ca usage billing (next tier is **$99/mo**).

**What the web app must do:** replace `app/api/ice-servers/route.ts` with the new version below, set three Netlify env vars for coturn, **keep** existing Metered env vars as emergency backup, then **redeploy**.

**What you should see after deploy:** `GET https://whosmarter.com/api/ice-servers` returns our coturn IP (`62.238.37.7`) and **no** `metered.ca` entries while coturn is healthy.

**No iOS / Swift app rebuild required** — all clients already call this route at runtime.

---

## Background — why we’re changing this

WhoSmarter uses **WebRTC mesh** for camera/audio (up to 6 players). When two devices cannot connect directly (common on iPhone/cellular/VPN behind carrier-grade NAT), media is **relayed through a TURN server**.

| Infrastructure | Role |
|----------------|------|
| **Supabase Realtime** | Signaling only (SDP/ICE handshakes). Does **not** carry video. |
| **`GET /api/ice-servers`** | Returns STUN + TURN credentials to clients. |
| **TURN server** | Relays media when P2P fails. **This is what we’re changing.** |

Previously, Metered.ca was the primary relay. Usage was low on web (desktop/Wi‑Fi often connects direct) but **almost always on iPhone** (must relay). We self-hosted **coturn** on a VPS to make relay flat-cost.

Metered’s **free 20 GB/mo** tier stays configured as **emergency backup only** — used only when our coturn box is down.

---

## Critical concept — why we health-check (don’t list both TURN servers)

WebRTC’s `iceServers` array is **not** an ordered fallback list (“try A, then B, then C”).

WebRTC gathers candidates from **every** server in the array at once, then picks the best working path by candidate type:

```
host (direct LAN)  >  srflx (direct via STUN)  >  relay (TURN)
```

If we return **both** coturn and Metered in the same response, **both** allocate relay candidates and compete. Metered will relay some calls even while coturn is healthy → Metered quota burns on normal days.

**Solution:** the API route **health-checks coturn** and returns:

- coturn **up** → `[STUN, coturn]` only → Metered usage ≈ **0**
- coturn **down** → `[STUN, Metered]` → free 20 GB only used during outages

Direct P2P is still automatic whenever possible (STUN is always included; direct always beats relay).

---

## What’s wrong with the **current** live route (as of last check)

The deployed route at `whosmarter.com` still uses the **old logic**:

1. If `METERED_DOMAIN` + `METERED_API_KEY` are set → return Metered **immediately**
2. Never checks coturn env vars

So adding `TURN_USERNAME` (or other coturn env vars) **without replacing the route file** does nothing. Metered keeps winning.

**You must replace the route file** — env vars alone are not enough.

---

## Task checklist for the web AI

- [ ] **Replace** `app/api/ice-servers/route.ts` with the full file in §4 below (copy verbatim).
- [ ] **Set Netlify env vars** in §5 (all three `TURN_*` required).
- [ ] **Keep** existing `METERED_DOMAIN` and `METERED_API_KEY` (backup).
- [ ] **Redeploy** Netlify (env var changes require deploy).
- [ ] **Verify** §6 — API must show `62.238.37.7`, not `metered.ca`, while coturn is up.
- [ ] **Do not** change web `useMeshWebRTC.ts` or client fetch logic — clients already work.
- [ ] **Do not** remove Metered env vars — they are the fallback.

---

## Our coturn server (already running)

| Field | Value |
|-------|--------|
| Host/IP | `62.238.37.7` |
| Ports | `3478` UDP + TCP (`turn:`) |
| Username | `whosmarter` |
| Password | Set on VPS in `/etc/turnserver.conf` as `user=whosmarter:<password>` — must match Netlify `TURN_CREDENTIAL` |

**No `turns:` (TLS) on port 5349 for now.** TLS on a bare IP cannot get a trusted certificate; iOS rejects it. `turn:` on 3478 with **UDP + TCP** covers most networks (TCP helps when UDP is blocked).

**Firewall on VPS must allow:** 3478 UDP/TCP, and relay range (typically 49152–65535 UDP).

---

## Client contract (do not break)

All clients call:

```
GET /api/ice-servers  →  { "iceServers": RTCIceServer[] }
```

Each entry: `{ urls: string | string[], username?: string, credential?: string }`

| Client | Fetch behavior |
|--------|----------------|
| **Web** | `fetch('/api/ice-servers', { cache: 'no-store' })` in `hooks/useMeshWebRTC.ts` |
| **iOS (RN)** | `fetch(api('/api/ice-servers'), { cache: 'no-store' })` in `src/api/client.ts` — merges extra Google STUN |
| **Native Swift** | Same API (separate repo) |

Clients fetch **fresh per game connection**. Changing the route + redeploying updates all clients without app store release.

**Response shape when coturn is healthy (target):**

```json
{
  "iceServers": [
    { "urls": "stun:stun.l.google.com:19302" },
    {
      "urls": [
        "turn:62.238.37.7:3478?transport=udp",
        "turn:62.238.37.7:3478?transport=tcp"
      ],
      "username": "whosmarter",
      "credential": "<from TURN_CREDENTIAL env>"
    }
  ]
}
```

**No** `metered.ca` / `relay.metered.ca` entries when coturn is up.

---

## §4 — Replace `app/api/ice-servers/route.ts` with this entire file

Copy **verbatim** into the web repo at `app/api/ice-servers/route.ts`:

```typescript
// ============================================================
// API Route: GET /api/ice-servers
//
// Returns the list of ICE servers (STUN + TURN) every client (web, iOS,
// native Swift) uses to connect cameras/audio. Computed on the server so
// TURN credentials are never baked into a client bundle, and so we can
// decide the relay strategy centrally without shipping a new app build.
//
// RELAY STRATEGY (cost control):
//   Direct peer-to-peer is always preferred automatically by WebRTC (host/
//   srflx candidates outrank relay), so STUN is always included. When a
//   relay IS needed (common on iPhone/cellular/VPN behind carrier-grade NAT)
//   we want it to go through OUR self-hosted coturn VPS (flat monthly cost,
//   not metered), and we want Metered.ca used ONLY as an emergency backup if
//   our coturn box is down.
//
//   IMPORTANT: WebRTC does NOT treat the iceServers array as an ordered
//   fallback list — if we returned BOTH coturn and Metered, both relays would
//   compete on every call and Metered would silently relay (and bill) some of
//   them even while coturn is healthy. To make Metered a TRUE backup, we
//   health-check coturn HERE and return Metered only when coturn is
//   unreachable. The client fetches this route fresh per connection
//   (cache: 'no-store'), so the decision is always current.
//
// ---- ENV VARS (Netlify → Site configuration → Environment variables) ----
//   Our coturn (primary relay) — ALL THREE REQUIRED:
//     TURN_URLS        = turn:62.238.37.7:3478?transport=udp,turn:62.238.37.7:3478?transport=tcp
//     TURN_USERNAME    = whosmarter
//     TURN_CREDENTIAL  = <password matching coturn user= line on VPS>
//   Optional health-check override (else parsed from first TURN_URLS entry):
//     TURN_HEALTHCHECK_HOST = 62.238.37.7
//     TURN_HEALTHCHECK_PORT = 3478
//   Metered (emergency fallback only — keep configured):
//     METERED_DOMAIN   = <subdomain>.metered.live
//     METERED_API_KEY  = <api key>
// ============================================================

import { NextResponse } from 'next/server';
import net from 'net';

// net.connect needs the Node.js runtime (not Edge), and the relay decision
// must never be cached.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STUN = { urls: 'stun:stun.l.google.com:19302' };

const FALLBACK_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

function parseHostPort(turnUrl: string): { host: string; port: number } | null {
  const noScheme = turnUrl.replace(/^turns?:/i, '').split('?')[0];
  const lastColon = noScheme.lastIndexOf(':');
  if (lastColon === -1) return null;
  const host = noScheme.slice(0, lastColon).trim();
  const port = Number(noScheme.slice(lastColon + 1));
  if (!host || !Number.isFinite(port)) return null;
  return { host, port };
}

function tcpReachable(host: string, port: number, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (ok: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

async function getMeteredIceServers(): Promise<unknown[] | null> {
  const meteredKey = process.env.METERED_API_KEY;
  const meteredDomain = process.env.METERED_DOMAIN;
  if (!meteredKey || !meteredDomain) return null;
  try {
    const res = await fetch(
      `https://${meteredDomain}/api/v1/turn/credentials?apiKey=${meteredKey}`,
      { cache: 'no-store' },
    );
    if (res.ok) {
      const iceServers = await res.json();
      if (Array.isArray(iceServers) && iceServers.length > 0) return iceServers;
    }
    console.error('[ice-servers] Metered returned unexpected response');
  } catch (err) {
    console.error('[ice-servers] Metered fetch failed:', err);
  }
  return null;
}

export async function GET() {
  const turnUrls = process.env.TURN_URLS;
  const turnUser = process.env.TURN_USERNAME;
  const turnCred = process.env.TURN_CREDENTIAL;
  const coturnConfigured = Boolean(turnUrls && turnUser && turnCred);

  if (coturnConfigured) {
    const urls = turnUrls!
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);
    const coturn = { urls, username: turnUser!, credential: turnCred! };

    const probe = process.env.TURN_HEALTHCHECK_HOST
      ? {
          host: process.env.TURN_HEALTHCHECK_HOST,
          port: Number(process.env.TURN_HEALTHCHECK_PORT ?? 3478),
        }
      : parseHostPort(urls[0] ?? '');

    const coturnUp = probe ? await tcpReachable(probe.host, probe.port) : true;

    if (coturnUp) {
      return NextResponse.json({ iceServers: [STUN, coturn] });
    }

    console.warn('[ice-servers] coturn unreachable — falling back to Metered');
    const metered = await getMeteredIceServers();
    if (metered) return NextResponse.json({ iceServers: [STUN, ...metered] });
    return NextResponse.json({ iceServers: [STUN, coturn] });
  }

  const metered = await getMeteredIceServers();
  if (metered) return NextResponse.json({ iceServers: [STUN, ...metered] });
  return NextResponse.json({ iceServers: FALLBACK_ICE_SERVERS });
}
```

### Why `runtime = 'nodejs'` matters

The TCP health-check uses Node’s `net` module. If this route runs on the **Edge** runtime, `net.connect` may fail or be unavailable. The `export const runtime = 'nodejs'` line forces the Node serverless runtime on Netlify.

---

## §5 — Netlify environment variables

Netlify → **Site configuration** → **Environment variables**. Set for **all** deploy contexts (Production at minimum).

### Required — coturn (primary relay)

| Variable | Example value | Notes |
|----------|---------------|--------|
| `TURN_URLS` | `turn:62.238.37.7:3478?transport=udp,turn:62.238.37.7:3478?transport=tcp` | **Both** UDP and TCP URLs. No spaces after commas. |
| `TURN_USERNAME` | `whosmarter` | Must match coturn config. |
| `TURN_CREDENTIAL` | *(your secret password)* | Must **exactly** match VPS line `user=whosmarter:<this password>`. Never commit to git. |

### Optional — health-check override

| Variable | Value | Notes |
|----------|--------|--------|
| `TURN_HEALTHCHECK_HOST` | `62.238.37.7` | Only if auto-parse from `TURN_URLS` fails. |
| `TURN_HEALTHCHECK_PORT` | `3478` | Default 3478 if host is set. |

### Keep — Metered (emergency backup)

| Variable | Notes |
|----------|--------|
| `METERED_DOMAIN` | Your `*.metered.live` subdomain — **do not remove** |
| `METERED_API_KEY` | Metered API key — **do not remove** |

These are only returned when coturn health-check fails.

### After saving env vars

Trigger a **new deploy** (Deploys → Trigger deploy → Deploy site). Env var edits alone do not always update running serverless functions until redeploy.

---

## §6 — Verification (pass/fail)

### Test 1 — API response (coturn healthy)

```bash
curl -s https://whosmarter.com/api/ice-servers
```

**PASS:**
- Contains `62.238.37.7` in `urls`
- Contains `username` `whosmarter`
- Does **not** contain `metered.ca` or `relay.metered.ca`

**FAIL (current broken state):**
- Only `standard.relay.metered.ca` / `stun.relay.metered.ca` entries
- No `62.238.37.7`

→ Route file not deployed, or missing `TURN_URLS` / `TURN_CREDENTIAL`, or deploy not finished.

### Test 2 — Fallback (optional, on VPS)

```bash
sudo systemctl stop coturn
# curl API again → should show Metered entries
sudo systemctl start coturn
# curl API again → back to coturn only
```

### Test 3 — End-to-end video

1. Join a game with cameras on (iPhone + web or two phones).
2. Remote video should work.
3. On iPhone DebugScreen: `webrtc / path` log with `relayed: true` means TURN was used (expected on cellular/VPN).
4. VPS bandwidth graph should show traffic when relaying.

### Test 4 — Trickle ICE (optional)

https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/

Add server from API response (`turn:62.238.37.7:3478?transport=udp` + username/credential). Gather candidates → should see type **`relay`**.

---

## What NOT to change on the web client

| File | Action |
|------|--------|
| `hooks/useMeshWebRTC.ts` | **No change** — already fetches `/api/ice-servers` |
| `lib/types.ts` | **No change** |
| iOS / Swift repos | **No change** — same API contract |

The pivot is **entirely server-side** (this route + env vars + deploy).

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|--------|-----|
| API still shows only Metered | Old route still deployed | Replace `route.ts` per §4, redeploy |
| API still shows only Metered | Missing `TURN_URLS` or `TURN_CREDENTIAL` | All three `TURN_*` vars required |
| API shows coturn but video black | Password mismatch | `TURN_CREDENTIAL` must match VPS `user=whosmarter:...` |
| API shows Metered despite coturn running | Netlify can’t reach coturn TCP 3478 | Check VPS firewall; set `TURN_HEALTHCHECK_HOST` |
| `net.connect` error in Netlify logs | Edge runtime | Ensure `export const runtime = 'nodejs'` in route |
| Metered usage still climbing | Both TURNs in same response | New route must **not** return both when coturn is up |
| Works on Wi‑Fi, fails on cellular | No relay / bad TURN | Confirm relay candidate from coturn (Trickle ICE test) |

---

## iOS-side work already done (FYI — no web action)

In the iOS repo (separate), these already ship to bound relay bandwidth and aid debugging:

- `enforceVideoSenderCaps()` — reliably applies existing per-peer bitrate caps (no quality reduction).
- `logSelectedCandidatePair()` — passive relay diagnostic in DebugScreen.
- `NSLocalNetworkUsageDescription` — same-Wi‑Fi direct connections when possible.

See `VIDEO_TECHNICAL_REFERENCE.md` in the iOS repo for full WebRTC architecture.

---

## Future hardening (optional, not this task)

- **Time-limited TURN credentials** (`use-auth-secret` on coturn + HMAC in this route) so leaked creds expire.
- **Domain + TLS** (`turn.whosmarter.com` + Let’s Encrypt) to enable `turns:` for strict networks.
- **Second coturn region** for latency/redundancy.

---

## Summary for the web AI

1. **Replace** `app/api/ice-servers/route.ts` with §4 (coturn-first + health-check + Metered fallback).
2. **Set** `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL` on Netlify.
3. **Keep** `METERED_DOMAIN`, `METERED_API_KEY`.
4. **Redeploy**.
5. **Confirm** `GET /api/ice-servers` shows `62.238.37.7`, not Metered, while coturn is up.

That completes the pivot. All clients pick up the new relay automatically.
