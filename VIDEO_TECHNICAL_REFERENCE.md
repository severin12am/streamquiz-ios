# WhoSmarter — Video & Audio Technical Reference

**Purpose:** This document explains how live camera and microphone work in WhoSmarter (web + native iOS). It is written for consulting another AI or engineer without reading the codebase. Plain-language summaries appear first; technical detail follows.

**Product:** Multiplayer quiz game (up to 6 players). Optional cameras; microphone always used for voice chat and/or voice answers.

**Deployed API base:** `https://whosmarter.com` (legacy alias: `https://streamquiz.netlify.app`)

**Supabase project:** `https://moyhwkzeetwkpqmhrcso.supabase.co`

---

## 1. Plain-language summary

### What actually happens when you see someone's face?

1. Your phone/browser opens the **camera and microphone** locally (nothing is sent to our quiz server for video).
2. Your device discovers who else is in the game via **Supabase Realtime** (a cloud messaging layer).
3. Your device opens a **direct connection** to every other player's device using **WebRTC** (a browser/mobile standard for real-time audio/video).
4. Small **setup messages** (not the video itself) travel through Supabase so the devices can find each other across home Wi‑Fi, cellular, and firewalls.
5. Once connected, **video and audio flow peer-to-peer** between devices. Our Next.js/Netlify server is **not** in the media path.

### What our servers do vs. what they do NOT do

| Our infrastructure | Role for video/audio |
|--------------------|----------------------|
| **Supabase Realtime** | “Who is online?” + exchange connection handshakes (SDP offers/answers, ICE candidates). **Does not carry video.** |
| **Next.js API (`GET /api/ice-servers`)** | Returns STUN/TURN server addresses and credentials so devices can connect across NAT/firewalls. **Does not carry video.** |
| **Supabase Postgres (`games`, `players`)** | Quiz state (scores, phases, answers). **Does not carry video.** |
| **OpenRouter / AI APIs** | Question generation and answer judging. **Does not carry video.** |

There is **no SFU, no MCU, no media server** for camera feeds. Video is a **full mesh**: each participant uploads their stream to every other participant.

### Why mesh instead of a media server?

- **Pros:** Simple, no heavy video infrastructure bill, low latency when it works, privacy (streams never stored on server).
- **Cons:** Upload bandwidth scales badly: with 6 players, each device sends 5 copies of their video. Works for ≤6 on decent connections; beyond that you’d want an SFU (Selective Forwarding Unit).

---

## 2. Architecture diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    EACH PLAYER DEVICE (iOS app or web browser)              │
│                                                                             │
│  GameScreen                                                                 │
│    ├── useGameState      → quiz phases, scores (Supabase DB + Realtime)     │
│    ├── useMeshWebRTC     → camera/mic capture + P2P mesh                    │
│    └── useSpeechRecognition → Apple Speech / Web Speech (voice answers)     │
│                                                                             │
│  UI: CameraGrid → CameraPanel → RTCView (native) or <video> (web)           │
└───────────────┬─────────────────────────────┬───────────────────────────────┘
                │                             │
                │  Quiz sync                  │  WebRTC signaling only
                │  (Postgres rows)            │  (Broadcast + Presence)
                ▼                             ▼
┌───────────────────────────────┐   ┌───────────────────────────────────────┐
│         SUPABASE              │   │  Supabase Realtime channel            │
│  games + players tables       │   │  `webrtc:{gameId}`                    │
│  Channels:                    │   │    • Broadcast event `signal`         │
│    game:{gameId}              │   │    • Presence keyed by player UUID    │
│    players:{gameId}           │   └───────────────────────────────────────┘
└───────────────────────────────┘
                ▲
                │  HTTPS (no video)
                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│              NEXT.JS ON NETLIFY (whosmarter.com)                            │
│  GET  /api/ice-servers     → STUN/TURN credentials (secrets stay server-side)│
│  POST /api/generate-questions, /api/check-answer  → AI (unrelated to video)│
└─────────────────────────────────────────────────────────────────────────────┘

        ═══════════════════════════════════════════════════════════
        ACTUAL VIDEO/AUDIO: direct P2P between devices (WebRTC)
        Player A ←──────── media ────────→ Player B
        (not through Supabase or Netlify)
        ═══════════════════════════════════════════════════════════
```

---

## 3. Topology: full mesh

For **N** players, there are **N × (N−1) / 2** unique pairs, but each device maintains **(N−1)** outgoing `RTCPeerConnection` objects (one per remote peer).

| Players | Connections per device | Total pairs |
|---------|------------------------|-------------|
| 2 | 1 | 1 |
| 3 | 2 | 3 |
| 4 | 3 | 6 |
| 6 | 5 | 15 |

Each device **uploads** its camera (if enabled) and microphone to every other device. Download is also heavy (receiving everyone’s streams).

**Hard cap:** 6 players (`MAX_PLAYERS`), enforced at join.

**Peer identity:** Each player’s `players.id` UUID is the WebRTC peer id (`myId`). Signaling messages route by `from` and `to` matching these UUIDs.

---

## 4. WebRTC connection lifecycle (step by step)

### 4.1 Join signaling channel

When a player has `gameId` and `myId`, the client subscribes to Supabase channel:

- **Channel name:** `webrtc:{gameId}` (e.g. `webrtc:a1b2c3d4-...`)
- **Presence key:** `myId` (player UUID)
- On `SUBSCRIBED`, client calls `channel.track({ online_at: ... })` to announce presence

### 4.2 Discover peers (Presence)

Supabase **Presence** lists which player IDs are currently on the channel. Events: `sync`, `join`, `leave`.

The client runs **`reconcile()`** to match peer connections to presence:

- Someone new online → `ensurePeer(peerId)` creates `RTCPeerConnection`
- Someone absent for **8 seconds** (`PRESENCE_GRACE_MS`) → `teardownPeer(peerId)` (grace avoids tearing down on brief flickers)

Additionally, **`reconcile()` runs every 3 seconds** (`RECONCILE_INTERVAL_MS`) so missed events self-correct.

### 4.3 Load ICE servers (before creating connections)

**Critical:** `RTCPeerConnection` must be created with STUN/TURN config. If ICE servers are empty, devices only get “host” candidates and **remote video stays black** across NAT/VPN/cellular.

Flow:

1. `fetchIceServers()` → `GET https://whosmarter.com/api/ice-servers`
2. Client merges server list with extra Google STUN (`stun.l.google.com`, `stun1.l.google.com`)
3. On API failure, client falls back to Google STUN only (TURN may be missing → connectivity problems on restrictive networks)

`ensureIceServers()` blocks peer creation until this fetch completes.

### 4.4 Capture local media

`startCamera()` calls `getUserMedia`:

- **Audio:** always requested (`audio: true`)
- **Video:** only if `cameras_enabled` on the game row; otherwise `video: false` (mic-only mesh)

Audio/video **tracks start with `enabled` reflecting mic policy** (see §8). Video constraints use **dynamic quality tiers** based on peer count (see §7).

**Idempotency:** `startCamera()` returns early if capture already running (unless `force=true` for foreground recovery). Prevents thrashing that broke ICE on re-renders.

### 4.5 Attach tracks to each peer connection

For each `RTCPeerConnection`:

- First time: `addTrack(audio)` and `addTrack(video)` if camera on
- After capture restart: `replaceTrack()` on existing senders (no full renegotiation storm)

Local tracks can attach **after** peer exists — discovery is decoupled from capture.

### 4.6 Signaling (SDP + ICE) via Broadcast

Messages are **not** stored in Postgres. They are ephemeral broadcasts on `webrtc:{gameId}`.

**Type definition (`WebRTCSignal`):**

```typescript
{
  type: 'offer' | 'answer' | 'ice-candidate';
  from: string;   // sender player UUID
  to: string;     // recipient player UUID
  payload: unknown; // RTCSessionDescription or RTCIceCandidate JSON
}
```

Client sends:

```javascript
channel.send({ type: 'broadcast', event: 'signal', payload: signal });
```

Receiver ignores signals where `to !== myId` or `from === myId`.

**Handshake per pair:**

1. **Impolite** peer (see §5) creates **offer** → `setLocalDescription(offer)` → broadcast offer
2. **Polite** peer receives offer → `setRemoteDescription(offer)` → create **answer** → broadcast answer
3. Both sides gather **ICE candidates** as connectivity is discovered → broadcast each candidate to the other peer
4. ICE candidates may arrive before remote description is set → buffered in `iceBuffer`, flushed after `setRemoteDescription`

When ICE succeeds, `connectionState` becomes `connected` and remote `track` events deliver `MediaStream` to UI.

### 4.7 Display remote video

- **iOS (React Native):** `RTCView` with `streamURL={stream.toURL()}`, `objectFit="cover"`
- **Web:** `<video>` with `srcObject = stream`

`CameraGrid` maps `remoteStreams.get(playerId)` to each opponent’s `CameraPanel`. Local tile uses `localStream`.

---

## 5. Perfect Negotiation (avoiding signaling races)

When two peers try to offer at the same time, WebRTC can deadlock. WhoSmarter uses the **Perfect Negotiation** pattern:

- **Politeness is deterministic:** compare player UUID strings as strings. **Lower UUID = polite** peer.
- On **offer collision** (both offering while not `stable`):
  - **Polite** peer ignores the incoming offer (`ignoreOffer`)
  - **Impolite** peer wins
- On connection **failed** or **disconnected**:
  - **Impolite** peer initiates **ICE restart** (`createOffer({ iceRestart: true })`) to re-establish media path without full teardown

**react-native-webrtc note:** `negotiationneeded` event is unreliable on RN. The **impolite** side also calls `sendOffer()` explicitly after `ensurePeer()` and after attaching tracks.

---

## 6. STUN, TURN, and ICE (why “black video” happens)

### ICE (Interactive Connectivity Establishment)

WebRTC tries multiple network paths (“candidates”):

| Candidate type | Meaning |
|----------------|---------|
| **host** | Direct local IP (works on same LAN only) |
| **srflx** (server reflexive) | Public IP learned via **STUN** |
| **relay** | Traffic forwarded through **TURN** server |

### STUN

- Helps devices learn their public IP/port
- Does **not** relay media; cheap and public
- Example: `stun:stun.l.google.com:19302`

### TURN

- Relays media when direct P2P fails (symmetric NAT, strict firewalls, some cellular networks)
- Requires **username + credential** (cannot be hardcoded safely in app bundle)
- Provided via `GET /api/ice-servers` from server env vars

### Server-side ICE provider fallback chain (Next.js `app/api/ice-servers/route.ts`)

Documented in `PROJECT.md` (web deployment):

1. **Metered** — if `METERED_DOMAIN` + `METERED_API_KEY` env vars set on Netlify
2. **ExpressTURN or static TURN** — if `TURN_URLS` + `TURN_USERNAME` + `TURN_CREDENTIAL` set
3. **Public STUN + free TURN** — limited reliability (web reference code mentions freeturn.net as browser fallback; iOS client intentionally does **not** use dead public Metered relay)

### Client-side ICE merge (iOS / RN `src/api/client.ts`)

- Always adds Google STUN on top of server response
- Does **not** add deprecated `openrelay.metered.ca` (wastes ICE gathering time)
- If API fails: **STUN-only fallback** → may work on same Wi‑Fi but often fails cross-network

---

## 7. Dynamic video quality (bandwidth optimization)

Because mesh upload grows with peer count, resolution, frame rate, and max bitrate **scale down** as more peers join.

**Function:** `videoTierForPeerCount(peerCount)` where `peerCount = peers + 1` (includes self)

| Peers in game | Resolution | Frame rate | Max video bitrate |
|---------------|------------|------------|-----------------|
| ≤ 2 | 1280 × 720 (720p) | 30 fps | 1200 kbps |
| ≤ 3 | 960 × 540 | 24 fps | 900 kbps |
| 4+ | 640 × 480 | 20 fps | 600 kbps |

**Applied in two places:**

1. **`getUserMedia` constraints** when starting camera
2. **`applyDynamicQuality()`** — `videoTrack.applyConstraints(...)` + `RTCRtpSender.setParameters({ encodings: [{ maxBitrate }] })` per peer (best-effort; some RN WebRTC versions skip `setParameters`)

**Estimated savings (from code comments):** ~30% bandwidth at 4 peers, ~50% at 5–6 vs. always-720p.

When `cameras_enabled: false` on the game: no video track; audio mesh only (lighter).

---

## 8. Microphone policy (GameScreen)

WebRTC always captures audio, but **`track.enabled`** controls whether peers hear you.

`GameScreen` computes `micPolicy()` and calls `setMicEnabled()`:

| Scenario | Mic to peers |
|----------|--------------|
| User tapped mute (`MicToggle`) | OFF |
| Multiple choice mode (`mc_mode`) | ON (open voice chat) |
| Typed answers mode (voice answers disabled) | ON |
| Legacy voice-answer mode, during `answering` phase, speaking answer | OFF (Apple Speech owns mic) |
| Legacy voice-answer mode, push-to-talk held | ON |
| Otherwise in voice mode | OFF until PTT |

During voice answering, local tile shows “muted to peers” (`mutedToPeers`) so user knows others can’t hear them while answering.

**iOS conflict:** Speech recognition and WebRTC mic cannot both use the microphone reliably during answer window — hence mic OFF to peers while listening.

---

## 9. Robustness and recovery mechanisms

These were added after production issues (black video, stuck “connecting”, mid-handshake teardown):

### 9.1 Reconciliation over events

- Don’t rely only on presence `join`/`leave`
- `reconcile()` every 3s + on every presence event
- `ensurePeer()` is **idempotent** (safe to call repeatedly)

### 9.2 Presence grace period

- 8s before tearing down peer missing from presence
- Prevents killing connections during Supabase flicker or phase transitions

### 9.3 ICE server gate

- Never create `RTCPeerConnection` until `iceServersRef` is populated

### 9.4 Stable signaling channel lifecycle

- Channel `useEffect` depends only on `[gameId, myId]`
- Callbacks held in refs so re-renders don’t unsubscribe mid-handshake

### 9.5 Foreground recovery (iOS)

On `AppState` → `active`:

- Re-announce presence (`channel.track`)
- Restart camera capture (`startCamera(true)`)
- `reconcile()`
- ICE restart or re-offer unhealthy peers

### 9.6 Network recovery (iOS NetInfo)

On connectivity regained or transport switch (Wi‑Fi ↔ cellular):

- Re-announce presence, reconcile, ICE restart
- **Does not** restart camera (avoids visible flicker every few seconds)
- Debounced: min 5s between network recoveries

### 9.7 Periodic health check

Every 3s reconcile loop: impolite peers in `failed`/`disconnected` → ICE restart; stuck `connecting` without remote description → re-offer

---

## 10. UI layout (CameraGrid)

- **Lobby / grid mode:** responsive columns (1–3) based on player count
- **Fill mode (WhatsApp-style):** opponent cameras as full-screen background under quiz overlay; 1 opponent = full screen, 2+ = 2-column grid
- Shows avatar fallback when camera off, permission denied, or no stream yet
- Badges: mic on/off, answering pill, correct/wrong after round

`showVideo` tied to `game.cameras_enabled` — UI can hide video even if audio mesh runs.

---

## 11. Bandwidth back-of-envelope

Assume 720p tier ~1.2 Mbps upload per outbound video stream + ~50–100 kbps audio.

| Players | Outbound streams | Rough upload (video+audio) |
|---------|------------------|----------------------------|
| 2 | 1 | ~1.3 Mbps |
| 3 | 2 | ~2.6 Mbps |
| 6 | 5 | ~6.5 Mbps (before tier downscale) |

With 4+ players, tiers drop to 600 kbps video → ~3 Mbps upload at 6 players (still significant).

**Download** is similar: each remote video inbound.

This is why mesh is capped at 6 and quality adapts.

---

## 12. Cross-platform parity

| Client | WebRTC stack | Signaling | ICE fetch |
|--------|--------------|-----------|-----------|
| **Web** (Next.js) | Browser native WebRTC | Same `webrtc:{gameId}` channel | `/api/ice-servers` relative URL |
| **iOS** (this RN repo) | `react-native-webrtc` | Same channel + same `WebRTCSignal` shape | Absolute `api('/api/ice-servers')` |
| **Native Swift** (separate repo `native_streamquiz`) | iOS WebRTC | Same Supabase channel (per workspace rules) | Same API |

All clients share:

- Same Supabase project
- Same player UUID as peer id
- Same perfect negotiation rule (lower UUID = polite)
- Same presence keying

Interop requirement: web host + iOS guest (or vice versa) must see/hear each other in lobby when cameras enabled.

---

## 13. What is NOT synchronized via WebRTC

Quiz gameplay uses separate Supabase channels:

| Channel | Data |
|---------|------|
| `game:{gameId}` | Phase, question index, deadlines, `cameras_enabled`, etc. |
| `players:{gameId}` | Names, scores, MC picks, transcripts, `done`, rematch votes |

`cameras_enabled` is set at game creation (host option). If false, mesh is audio-only but still runs for voice chat.

Polling fallback: if Realtime blocked, game state polls every 2.5s (video signaling is separate; blocked Realtime would also break WebRTC signaling).

---

## 14. Permissions and platform requirements (iOS)

**Info.plist / Expo config:**

- `NSCameraUsageDescription`
- `NSMicrophoneUsageDescription`
- `NSSpeechRecognitionUsageDescription` (voice answers)
- `UIBackgroundModes: audio` (audio session)

**Cannot use Expo Go** for WebRTC — requires dev build / EAS with `react-native-webrtc` native module.

---

## 15. Environment and configuration

### Client-safe (embedded in app / web)

```
NEXT_PUBLIC_SUPABASE_URL=https://moyhwkzeetwkpqmhrcso.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
EXPO_PUBLIC_API_BASE_URL=https://whosmarter.com
```

### Server-only (Netlify — never in mobile bundle)

```
OPENAI_API_KEY=...          # OpenRouter key for AI routes
METERED_DOMAIN=...
METERED_API_KEY=...
# and/or
TURN_URLS=...
TURN_USERNAME=...
TURN_CREDENTIAL=...
```

TURN secrets must stay on server; clients fetch short-lived or static creds via `/api/ice-servers`.

---

## 16. API route reference

### `GET /api/ice-servers`

- **Auth:** None (public endpoint; credentials are scoped to TURN relay only)
- **Response:** `{ "iceServers": [ { "urls": "...", "username": "...", "credential": "..." }, ... ] }`
- **Cache:** Client uses `cache: 'no-store'`

Other API routes (`/api/generate-questions`, `/api/check-answer`, `/api/create-game`) are unrelated to video.

---

## 17. Key source files (this repo)

| File | Role |
|------|------|
| `src/hooks/useMeshWebRTC.ts` | Entire mesh: signaling, presence, ICE, capture, quality, recovery |
| `src/api/client.ts` | `fetchIceServers()`, Google STUN merge |
| `src/screens/GameScreen.tsx` | Wires mesh hook, `startCamera`, mic policy |
| `src/components/CameraGrid.tsx` | Layout of player tiles |
| `src/components/CameraPanel.tsx` | Single tile, `RTCView`, badges |
| `src/lib/types.ts` | `WebRTCSignal`, `cameras_enabled` on game |
| `src/lib/config.ts` | `API_BASE_URL`, `api()` helper |

Web reference copy: `_web-ref/hooks/useMeshWebRTC.ts` (browser variant; same algorithm).

Deployed server ICE route: `app/api/ice-servers/route.ts` on web/Netlify deployment (not always present in mobile-only checkouts).

---

## 18. Common failure modes (debugging checklist)

| Symptom | Likely cause | What to check |
|---------|--------------|---------------|
| Remote video black, audio maybe works | No TURN / ICE servers empty at peer creation | `/api/ice-servers` response; Netlify `METERED_*` or `TURN_*` env; logs for `ensureIceServers` |
| Works on Wi‑Fi, fails on cellular | NAT needs TURN relay | TURN credentials valid; test with TURN-only network |
| Stuck on “connecting” forever | Signaling race or channel torn down mid-handshake | Presence on `webrtc:{gameId}`; 3s reconcile running; channel effect only on gameId/myId |
| Video worked then died after background | iOS suspended capture/signaling | Foreground recovery path; `startCamera(true)` |
| Local preview works, no remote | Peer connections not reaching `connected` | ICE candidates exchanged; impolite side offering |
| Expo Go | No native WebRTC | Use development build |
| Web + iOS can’t see each other | Different game/channel or API base URL | Same `gameId`; iOS `EXPO_PUBLIC_API_BASE_URL` |
| Everyone’s upload saturated | 6-player mesh at 720p | Expected; tiers should downscale at 4+ |

---

## 19. Design alternatives (for future AI consultation)

If asked “should we change architecture?”:

| Approach | When to use |
|----------|-------------|
| **Keep mesh** | ≤6 players, minimize ops cost, acceptable quality on good networks |
| **Add SFU** (e.g. LiveKit, mediasoup, Janus) | More players, mobile-heavy audience, need simulcast, recording |
| **MCU** | Rarely needed; high server cost |
| **Turn off video default** | `cameras_enabled: false` — audio mesh only, much lighter |

Current product choice: **mesh + adaptive bitrate + TURN fallback**.

---

## 20. Glossary

| Term | Meaning |
|------|---------|
| **WebRTC** | Standard for real-time peer media in browsers and mobile |
| **Mesh** | Every peer connects to every other peer |
| **SFU** | Server that receives each stream once and forwards to others (not used here) |
| **Signaling** | Out-of-band messages to set up WebRTC (not the media itself) |
| **SDP** | Session Description Protocol — codec/transport metadata in offer/answer |
| **ICE** | Finds workable network path between peers |
| **STUN** | Helps discover public address |
| **TURN** | Relays media when P2P fails |
| **Presence** | Supabase feature: who is currently subscribed to a channel |
| **Broadcast** | Supabase feature: ephemeral messages to channel subscribers |
| **Perfect Negotiation** | Algorithm to resolve concurrent WebRTC offers |
| **ICE restart** | Re-gather candidates on existing peer connection after network change |

---

## 21. Update log — TURN cost work (June 2026)

Context: TURN/Metered relay quota was barely used on web but almost always used on iPhone, because mobile players are usually on cellular/VPN behind carrier-grade NAT where direct P2P is impossible, so media must relay. Changes made:

**App side (`src/hooks/useMeshWebRTC.ts`, `app.config.ts`):**
- `enforceVideoSenderCaps()` — reliably applies the existing per-peer bitrate/framerate tiers to **every** sender, including peers created from an incoming offer (which previously ran uncapped at the camera's native bitrate). **No quality reduction** — the designed tiers were always intended; they're just now actually enforced, which bounds relayed bytes.
- `logSelectedCandidatePair()` — passive diagnostic logging host/srflx/relay per peer into DebugScreen (`webrtc / path … relayed:true/false`). Observational only; no effect on connections.
- `NSLocalNetworkUsageDescription` added so same-Wi-Fi iPhones can use local (host) ICE candidates and connect directly instead of relaying.

**Infra side (see `WEB_HANDOFF_turn-coturn.md` + `_web-ref/app/api/ice-servers/route.ts`):**
- Self-hosted **coturn** on a VPS (`62.238.37.7:3478`, udp+tcp) is the primary relay (flat cost, not metered).
- `GET /api/ice-servers` was rewritten to **health-check coturn** and return only `[STUN, coturn]` when it's up. Because WebRTC's `iceServers` is not an ordered fallback list (all relays compete), Metered would otherwise relay/bill some calls even when coturn is healthy — so Metered's free 20 GB tier is returned **only when the coturn TCP probe fails** (true emergency backup, ~0 normal usage).
- Still on static TURN credentials for now; time-limited HMAC creds + a domain/TLS (`turns:`) are noted as future hardening.

Rationale: bitrate enforcement reduces relayed bytes without touching quality; coturn makes the relay itself essentially free; health-checked Metered fallback preserves uptime — together targeting ~$0 TURN cost instead of Metered's $99/mo tier.

---

*Generated for WhoSmarter / StreamQuiz codebase. For quiz state machine and DB schema, see `PROJECT.md` and `APP_DESCRIPTION.md`.*
