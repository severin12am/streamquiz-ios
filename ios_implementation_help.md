# WhoSmarter — React Native iOS Implementation Guide

This document is written for an agent (or developer) building a **React Native iOS app from scratch** that achieves **feature parity** with the existing WhoSmarter web app.

Read this file **together with**:

| File | Role |
|------|------|
| `PROJECT.md` | Authoritative product + architecture reference (state machine, DB schema, API contracts, timing) |
| `README.md` | Quick orientation, setup, and file map |
| **`ios_implementation_help.md`** (this file) | RN/iOS-specific decisions, porting map, parity checklist, and how to avoid dozens of on-device test loops |

**Do not re-read the web codebase line-by-line if these three files are present.** Port logic from the web source only when this guide points you to a specific file.

---

## 1. Mission

Build a native iOS client that:

1. Joins the **same Supabase project** and plays in the **same games** as web clients (cross-platform multiplayer).
2. Calls the **same deployed Next.js API** for AI (do not reimplement OpenRouter logic in the app).
3. Matches the web app's **state machine, timing, scoring, and UX flows** exactly.
4. Ships with enough **automated checks and staged validation** that physical iPhone testing is needed only a few times — not after every change.

---

## 2. Non-Negotiable Architecture Rules

### 2.1 Shared backend — do not fork

| Concern | Where it lives | RN app must |
|---------|----------------|-------------|
| Database + Realtime | Supabase (`games`, `players`) | Use `@supabase/supabase-js` directly |
| AI question generation | `POST /api/generate-questions` on deployed web host | `fetch` with absolute URL |
| AI answer judging | `POST /api/check-answer` | Same |
| ICE/TURN credentials | `GET /api/ice-servers` | Same |
| OpenRouter API key | Server env only (`OPENAI_API_KEY`) | **Never** bundle in the app |

The RN app is a **thin native client**. All AI and TURN secret handling stays on the existing Next.js deployment (Netlify).

### 2.2 State ownership (same as web)

| State | Storage | Who writes |
|-------|---------|------------|
| Shared round state (phase, deadline, question index) | `games` row | Any client, via **guarded** updates |
| Per-player state (pick, transcript, score, done) | `players` row | Each client writes **only its own row** |
| WebRTC signaling | Supabase Broadcast `webrtc:{gameId}` | Peers only |
| Media streams | In-memory P2P | Never uploaded |

### 2.3 Host vs guest

- **Host** = player with `role: 'host'` and `slot: 0`.
- On web, host intent comes from URL `?role=host`.
- On iOS:
  - **Create flow** → user is always host.
  - **Join via link** → user is always guest (`asHost: false`).
- Never infer host from "who created the game" after the fact — only from join intent + slot assignment in `joinGame()`.

### 2.4 Identity persistence

Web uses `localStorage`. iOS equivalent:

| Web key | RN storage | Purpose |
|---------|------------|---------|
| `whosmarter-client-id` | `@react-native-async-storage/async-storage` | Stable UUID per install — survives reload, re-attaches seat |
| `whosmarter-player-name` | AsyncStorage | Prefill join screen |
| `whosmarter-locale` | AsyncStorage | UI locale (`en`, `ru`, `es`, `fr`, `de`, `ja`, `ar`) |
| `whosmarter-recent-questions:{topic}` | AsyncStorage | Question dedup per topic |

Use `crypto.randomUUID()` (via `expo-crypto` or `react-native-get-random-values` polyfill) for new client IDs.

---

## 3. Recommended Tech Stack (iOS)

These choices minimize iOS pain and match web capabilities:

| Need | Package | Notes |
|------|---------|-------|
| RN framework | **Expo SDK 52+** with **development build** | Expo Go **cannot** run `react-native-webrtc` — you need a dev client or bare workflow |
| WebRTC mesh | `react-native-webrtc` | Same signaling protocol as `hooks/useMeshWebRTC.ts` |
| Supabase | `@supabase/supabase-js` | Singleton client, same as web |
| Navigation | `@react-navigation/native` + native stack | Screens below |
| Storage | `@react-native-async-storage/async-storage` | Replaces localStorage |
| Speech (voice mode) | `@react-native-voice/voice` | iOS Speech framework bridge; more reliable than Web Speech API |
| Permissions | `expo-camera` / `expo-av` or RN permissions API | Camera + mic before `getUserMedia` |
| Deep links | `expo-linking` + iOS Universal Links (optional v1: custom URL scheme) | Join `whosmarter://game/{id}` or `https://yourdomain.com/game/{id}` |
| QR display | `react-native-qrcode-svg` | Lobby + create screen |
| Share link | `expo-clipboard` + `expo-sharing` or Share API | Copy invite URL |
| Env vars | `expo-constants` + `app.config.ts` `extra` | See §4 |

**Do not** use Expo Go for integration testing of cameras, mic, or WebRTC.

---

## 4. Environment Configuration

### 4.1 Required app env vars

```bash
# .env (Expo)
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
EXPO_PUBLIC_API_BASE_URL=https://streamquiz.netlify.app   # NO trailing slash
```

All API calls use:

```typescript
const api = (path: string) => `${process.env.EXPO_PUBLIC_API_BASE_URL}${path}`;

// Examples:
fetch(api('/api/generate-questions'), { method: 'POST', ... });
fetch(api('/api/check-answer'), { method: 'POST', ... });
fetch(api('/api/ice-servers'), { cache: 'no-store' });
```

### 4.2 Local API development

If testing against `next dev` on your machine, iOS Simulator can reach `http://localhost:3000`, but a **physical iPhone cannot**. Use your machine's LAN IP or ngrok for device testing:

```bash
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.x:3000
```

---

## 5. Screen Map & Navigation

Mirror web routes as RN screens:

| Web route | RN screen | Entry |
|-----------|-----------|-------|
| `/` | `HomeScreen` | App launch |
| `/game/[id]?role=host` | `GameScreen` with `role="host"` | After create → "Go to game" |
| `/game/[id]` | `GameScreen` with `role="player"` | Deep link / paste game ID |

### `GameScreen` internal states (same component, conditional render)

```
Loading → JoinScreen (no seat) → Lobby (status=waiting)
  → Playing (camera grid + question panel) → WinnerScreen overlay (phase=ended)
```

Every player runs the **same** `GameScreen`. Gate host actions with `me.role === 'host'`.

### Suggested folder structure

```
src/
  api/           # generateQuestions, checkAnswer, fetchIceServers
  lib/
    types.ts     # COPY from web lib/types.ts (keep in sync)
    supabase.ts  # Port from web lib/supabase.ts
    mc-utils.ts
    quiz-prompts.ts   # NOT needed in app (server-only) — omit
    question-history.ts
    i18n/
    player-colors.ts
    client-id.ts
  hooks/
    useGameState.ts      # Port almost verbatim
    useMeshWebRTC.ts     # Port signaling logic; swap browser APIs
    useSpeechRecognition.ts
  screens/
    HomeScreen.tsx
    GameScreen.tsx
  components/
    CreateGame.tsx, JoinScreen.tsx, Lobby.tsx, CameraGrid.tsx,
    CameraPanel.tsx, QuestionPanel.tsx, MCOptions.tsx,
    ScoreBoard.tsx, CountdownTimer.tsx, WinnerScreen.tsx
  navigation/
    RootNavigator.tsx
```

---

## 6. Exact Parity Constants

Copy these **exactly** from `hooks/useGameState.ts`. Do not tune them for iOS.

```typescript
export const THINK_TIME_SECONDS         = 5;
export const QUESTION_TIME_SECONDS      = 15;
export const VOICE_ANSWER_SECONDS       = 12;
export const RESULT_TIME_SECONDS        = 5;
export const CHECK_TIMEOUT_SECONDS      = 15;
export const FIRST_ANSWER_GRACE_SECONDS = 4;

export const POLL_INTERVAL_MS     = 2500;
export const TICK_INTERVAL_MS     = 100;
export const MAX_INIT_ATTEMPTS    = 5;
export const INIT_RETRY_DELAY_MS  = 1200;
export const TRANSCRIPT_THROTTLE_MS = 350;  // GameScreen — throttle Supabase writes
```

Also copy `MAX_PLAYERS = 6` from `lib/types.ts`.

**Default create form values** (see `PROJECT.md` §6 — UI label **First answer** = DB `classic`):

| Field | Default |
|-------|---------|
| difficulty | `medium` |
| num_questions | `5` |
| mc_mode | `true` (multiple choice) |
| game_mode | `classic` (First answer) |
| cameras_enabled | `true` |

---

## 7. Core Logic Ports (Priority Order)

Implement in this order so you can validate without WebRTC or speech first.

### Phase A — Types + Supabase (test with Jest + Simulator)

1. Copy `lib/types.ts` unchanged.
2. Port `lib/supabase.ts`:
   - Replace `process.env.NEXT_PUBLIC_*` with `EXPO_PUBLIC_*`.
   - Keep `serverNow()`, `syncServerClock()`, `updateGameIfPhase()`, `updateGameIfDeadline()`, `joinGame()` **identical in behavior**.
   - Clock sync: HEAD request to `${supabaseUrl}/rest/v1/` with `apikey` header — works in RN `fetch`.
3. Port `lib/mc-utils.ts`, `lib/player-colors.ts`, `lib/client-id.ts` (AsyncStorage).
4. Port `lib/i18n/` (messages + helpers). Wire a `LocaleProvider` context like web.

**Gate:** Unit tests pass for `deadlineIn`, `secondsUntil`, `isMcAnswerCorrect`, `joinGame` slot logic (mock Supabase).

### Phase B — `useGameState` (test with web client in same game)

Port `hooks/useGameState.ts` with minimal changes:

- `'use client'` directive → remove.
- `fetch('/api/check-answer')` → `fetch(api('/api/check-answer'))`.
- Keep refs, ticker, guarded transitions, early advance, first-answer grace **unchanged**.

**Gate:** iOS Simulator + Chrome web player in same lobby; MC game completes with synced scores. No camera needed.

### Phase C — UI shell (Simulator)

Port screens/components. Use React Native `StyleSheet` or NativeWind — match web's dark TV-show feel using colors from `app/globals.css`:

| CSS variable | Approx use |
|--------------|------------|
| `--accent` / `#2f7d77` | Primary buttons, host highlight |
| `--bg-card`, `--bg-elevated` | Cards |
| `--correct`, `--wrong`, `--gold` | Result states, host badge |

**Gate:** Full navigation flow on Simulator: create → lobby UI → (mock game state) → winner overlay.

### Phase D — Speech + voice mode (one device test)

Port `useSpeechRecognition` using `@react-native-voice/voice`:

```typescript
// iOS: request speech recognition permission before start
Voice.start(speechLang); // 'en-US' | 'ru-RU' from speechLangFor(locale)
```

Replicate web `GameScreen` speech behavior:

- Start listening when `phase === 'answering' && !iAmDone && !typedMode`.
- Stop when phase changes or user switches to typed mode.
- Throttle `updateTranscript` to 350ms.
- Auto `finishAnswer` when phase leaves `answering` if user didn't press Done but has text.
- Typed fallback: `TextInput` always available (iOS users may prefer typing in noisy environments).

**Gate:** Voice round judged correctly against web players; Russian answers work (Unicode normalization is server-side — no change needed).

### Phase E — WebRTC mesh (physical device — plan for 2–3 sessions max)

Port `hooks/useMeshWebRTC.ts` to `react-native-webrtc`:

| Web API | RN equivalent |
|---------|---------------|
| `navigator.mediaDevices.getUserMedia` | `mediaDevices.getUserMedia` from `react-native-webrtc` |
| `RTCPeerConnection` | Same class from package |
| `MediaStream` | Same |
| `<video srcObject>` | `<RTCView streamURL={stream.toURL()} />` |

Keep **unchanged**:

- Channel name `webrtc:{gameId}`
- Signal shape `WebRTCSignal` (`offer` | `answer` | `ice-candidate`, `from`, `to`, `payload`)
- Perfect Negotiation (lower `players.id` = polite)
- ICE candidate buffering until `remoteDescription` set
- Presence keyed by `myId`
- Mic policy from `GameScreen`:
  - MC mode: mic always enabled on peer connection
  - Voice mode: mic enabled only during `answering` or push-to-talk held
  - Audio tracks start **disabled**; toggle `track.enabled`

Fetch ICE servers from API; fall back to same public STUN/TURN list as web if API fails.

**Info.plist requirements:**

```xml
<key>NSCameraUsageDescription</key>
<string>WhoSmarter uses your camera so other players can see you during the quiz.</string>
<key>NSMicrophoneUsageDescription</key>
<string>WhoSmarter uses your microphone for voice answers and talking to other players.</string>
<key>UIBackgroundModes</key>
<array>
  <string>audio</string>
</array>
```

For voice recognition add `NSSpeechRecognitionUsageDescription`.

**Gate:** 2 physical devices (or 1 iPhone + 1 web) see/hear each other in lobby; remote video when `cameras_enabled: true`.

### Phase F — Polish parity

- Rematch flow (host regenerates questions via API, `mergePreviousQuestions`)
- Question history in AsyncStorage (`lib/question-history.ts`)
- Push-to-talk button (voice mode): `onPressIn` / `onPressOut` instead of Space key
- QR + share link on create and lobby

---

## 8. API Contracts (Copy Exactly)

### `POST /api/generate-questions`

**Request:**

```typescript
{
  topic: string;           // max 200 chars
  difficulty: 'easy' | 'medium' | 'hard';
  num_questions: number;   // clamped 3–10 server-side
  mc_mode: boolean;
  game_mode?: 'think' | 'classic';
  locale?: 'en' | 'ru';
  previous_questions?: string[];
}
```

**Response:** `{ questions: Question[] }`

**Create flow (host):**

1. Call API with payload.
2. `supabase.from('games').insert({ topic, difficulty, num_questions, mc_mode, game_mode, cameras_enabled, questions, status: 'waiting', phase: 'waiting' })`.
3. Navigate to game with `role=host`.

### `POST /api/check-answer`

**Request:**

```typescript
{
  question: string;
  correct_answer: string;
  accepted_answers?: string[];
  transcript: string;
}
```

**Response:** `{ correct: boolean, method?: 'local' | 'ai' }`

On network error, treat as **wrong** (web behavior).

### `GET /api/ice-servers`

**Response:** `{ iceServers: RTCIceServer[] }`

---

## 9. State Machine — Implementation Checklist

The ticker in `useGameState` is the heart of the app. Verify each transition:

| Trigger | From phase | To phase | Guard |
|---------|------------|----------|-------|
| Host starts | `waiting` | `thinking` or `question`/`answering` | `startGame()` |
| Deadline | `thinking` | `question`/`answering` | `updateGameIfPhase` |
| All picked OR deadline | `question` | `result` | `resolveMcRound()` |
| All done OR deadline | `answering` | `checking` | `updateGameIfPhase` |
| Judge complete | `checking` | `result` | `runVoiceCheck()` winner |
| Safety timeout | `checking` | `result` | `answer_correct: false` |
| Deadline | `result` | next Q or `ended` | `advanceToNext()` |
| First answer | `question`/`answering` | (shrink deadline) | `updateGameIfDeadline` |

**First-answer grace:** When any player answers, deadline shrinks to 4 seconds remaining (compare-and-swap on `phase_deadline`).

**Early advance:** When **every** player has `mc_index !== null` (MC) or `done === true` (voice), advance without waiting for timer.

**Host disconnect:** Any client may drive transitions — do not add host-only guards on the ticker.

---

## 10. Cross-Platform Interop Tests

Use this matrix **before** declaring parity. Most rows need only Simulator + browser; WebRTC rows need devices.

| # | Setup | Test | Pass criteria |
|---|-------|------|---------------|
| 1 | iOS Sim + Chrome | Host iOS creates, guest web joins | Both see lobby player list update < 3s |
| 2 | Same | Host starts think+MC game | Both see thinking countdown sync ±1s |
| 3 | Same | Both pick MC answers | Scores update correctly; result phase sync |
| 4 | iOS Sim + Chrome | Voice mode, typed answer on Sim | AI judge scores; no speech needed |
| 5 | 1 iPhone + Chrome | Voice mode, speak on iPhone | Transcript syncs; judge correct |
| 6 | 1 iPhone + Chrome | `cameras_enabled: false` | Audio mesh works in lobby |
| 7 | 2 devices | `cameras_enabled: true` | Remote `RTCView` shows video |
| 8 | iOS + web | Rematch vote | Fresh questions; lobby reset |
| 9 | 2 iOS installs | Same game | Slot collision handled; max 6 players |
| 10 | iOS | Reload app mid-game | Same `client_id` re-attaches seat |

---

## 11. Automated Testing (Avoid iPhone Loops)

### 11.1 Unit tests (Jest) — do this first

Extract pure functions and test without device:

```typescript
// Examples to test
secondsUntil(iso, serverNow)
roundStartPatch(game)
afterThinkPatch(game)
hasAnswered(player, mcMode)
isMcAnswerCorrect(chosen, correct)
normalizeMcText (from mc-utils)
playerColor(slot)
```

Mock Supabase for `updateGameIfPhase` returning true/false.

### 11.2 Integration tests with mock Supabase

Use a test Supabase project or `@supabase/supabase-js` against local stack. Script two "clients" in Node to race `updateGameIfPhase` — only one should win.

### 11.3 Debug screen (dev builds only)

Add a hidden `DebugScreen` showing:

- `client_id`, `me.id`, `game.phase`, `phase_deadline`, `serverOffsetMs`
- `timeLeft` / `timeLeftMs`
- Realtime channel status
- WebRTC: peer count, ICE state per peer
- Last API error

This cuts device debugging from hours to minutes.

### 11.4 What Simulator can and cannot do

| Feature | Simulator | Physical iPhone |
|---------|-----------|-----------------|
| Navigation, forms, i18n | ✅ | ✅ |
| Supabase sync vs web | ✅ | ✅ |
| MC gameplay | ✅ | ✅ |
| Voice recognition | ⚠️ Limited | ✅ |
| WebRTC camera/mic | ❌ Unreliable | ✅ |
| Push-to-talk feel | ⚠️ | ✅ |

**Strategy:** Complete Phases A–C entirely on Simulator. Budget **2–3** physical device sessions for Phase E (WebRTC) and one for voice polish.

---

## 12. Feature Parity Notes & iOS-Specific Gaps

### 12.1 Must-have for parity v1

- [x] Create game (all form options)
- [x] Join by link / game ID
- [x] Lobby with player list, share link, QR
- [x] Host start (requires ≥2 players)
- [x] Think + classic modes
- [x] MC + voice modes
- [x] All phases + timers + first-answer grace
- [x] Independent per-player scoring
- [x] Winner screen + rematch voting
- [x] EN + RU UI and question locale
- [x] Server clock sync
- [x] Realtime + 2.5s polling fallback
- [x] WebRTC audio (cameras optional per game setting)
- [x] Push-to-talk in voice mode between rounds

### 12.2 Acceptable v1 differences (document, don't block ship)

| Feature | Web | iOS v1 |
|---------|-----|--------|
| Space key PTT | Keyboard | Touch PTT button only |
| QR scan to join | Display only; user scans with camera app | Same — display QR; add native scanner in v1.1 if desired |
| Link format | `https://domain/game/{id}` | Same URL; register Universal Links so tapping opens app |

### 12.3 Speech on iOS

`@react-native-voice/voice` uses Apple Speech Recognition — **better** than Safari Web Speech API. Still provide **typed answer fallback** (web does this for Firefox).

When user types, set `typedMode: true` and stop voice recognition (same as web).

### 12.4 Mic vs speech recognition

Web runs **two** mic consumers:

1. WebRTC mesh (peer audio, gated by mic policy)
2. Speech recognition (separate capture on web)

On iOS, speech recognition may conflict with WebRTC audio session. **Recommended approach:**

- During `answering` phase: prioritize speech recognition; keep WebRTC mic track enabled for peers per parity policy.
- Configure `AVAudioSession` category `playAndRecord` with `defaultToSpeaker` and `allowBluetooth`.
- If conflicts arise: use `Voice` for transcript only and still send WebRTC audio — test on device once.

### 12.5 Deep linking

**Minimum v1:** Custom URL scheme `whosmarter://game/{uuid}`

**Better:** Universal Link `https://your-netlify-domain.app/game/{uuid}` → opens app with `role=player`

Host links after create still use web URL for sharing (works for everyone); host opens app via "Go to game" button internally.

Parse UUID from path; ignore unknown query params.

---

## 13. `useGameState` Actions — Who Can Call What

| Action | Caller | Preconditions |
|--------|--------|---------------|
| `join(name, asHost)` | Anyone | Game not full |
| `startGame()` | Host only | `status === 'waiting'` |
| `submitMCAnswer(i)` | Seated player | `phase === 'question'`, `mc_index === null` |
| `updateTranscript(text)` | Seated player | Voice phase |
| `finishAnswer(text?)` | Seated player | Sets `done: true` |
| `voteRematch()` | Seated player | `phase === 'ended'` |
| `rematch(questions?)` | Host only | Triggered when host + ≥1 guest voted |

Rematch generation: host calls `/api/generate-questions` with `mergePreviousQuestions`, then `rematch(finalQuestions)`.

---

## 14. UI Behavior Parity (Easy to Miss)

1. **JoinScreen** prefills name from saved name; shows "game full" if `join()` returns null.
2. **Lobby** START disabled until `players.length >= 2`.
3. **MC mode:** mic always on for peers.
4. **Voice mode:** mic muted except during `answering` or PTT held.
5. **Question panel** shows thinking lock overlay when `phase === 'thinking'`.
6. **Result phase** shows ✓/✗ per player on camera tiles and in panel.
7. **Countdown timer** uses `timeLeftMs` for smooth SVG/circular progress (100ms tick).
8. **Camera grid** shows placeholder avatar when cameras off (colored initial per slot).
9. **Winner screen** ranks by score; handles ties; shows rematch button state from `me.rematch`.
10. **Error state** for failed game load: show VPN hint (Supabase geo-blocking) — copy from web `useGameState` error string.

---

## 15. Security Reminders

- Supabase anon key in the app is **expected** (same as web).
- Never embed `OPENAI_API_KEY` in the RN bundle.
- RLS is fully open — acceptable for private link games; do not change for iOS alone.

---

## 16. Implementation Definition of Done

The iOS app is **done** when:

1. All items in §12.1 are checked.
2. Cross-platform interop tests §10 rows 1–6 pass (Simulator + browser).
3. Rows 7–8 pass on physical device(s).
4. A web host + iOS guest + iOS host + web guest have all been verified in one session.
5. No phase desync in a full 5-question think+voice game with 3+ players.
6. `lib/types.ts` and timing constants match web repo.

---

## 17. Source File Quick Reference

When porting, read these web files in this order:

| Order | File | Why |
|-------|------|-----|
| 1 | `lib/types.ts` | Types + constants |
| 2 | `lib/supabase.ts` | DB + realtime + clock + join |
| 3 | `hooks/useGameState.ts` | State machine |
| 4 | `components/GameScreen.tsx` | Orchestration, speech throttle, rematch |
| 5 | `components/CreateGame.tsx` | Host flow |
| 6 | `components/QuestionPanel.tsx`, `MCOptions.tsx` | Play UI |
| 7 | `hooks/useMeshWebRTC.ts` | Hardest — do last |
| 8 | `hooks/useSpeechRecognition.ts` | Replace internals only |
| 9 | `lib/i18n/messages.ts` | All user-facing strings |

---

## 18. Common Failure Modes (Save Hours)

| Symptom | Cause | Fix |
|---------|-------|-----|
| Timers drift between iOS and web | Clock sync not running | Call `syncServerClock()` on mount + every 30s |
| Double scoring | Unguarded phase updates | Only use `updateGameIfPhase` for transitions |
| "No answer" after speaking | Transcript throttle + phase ended | Flush transcript on phase exit; auto `finishAnswer` |
| Russian always wrong | Local normalize stripping Cyrillic | Server handles this — ensure transcript sent as UTF-8 |
| Black remote video | No TURN / wrong ICE | Use `/api/ice-servers`; test on cellular not WiFi only |
| Join creates duplicate seat | New `client_id` each launch | Persist in AsyncStorage |
| API 404 | Relative `/api/...` URL | Use `EXPO_PUBLIC_API_BASE_URL` absolute path |
| WebRTC works on sim but not phone | Expo Go | Use development build with `react-native-webrtc` |
| Lobby doesn't update | Realtime not subscribed | Match channel names; add polling fallback |
| Host can't start | Only 1 player | Need ≥2 — by design |

---

## 19. Suggested Build Commandments for the Agent

1. **Port, don't reinvent** — `useGameState` and `supabase.ts` are battle-tested; changing the algorithm introduces desync bugs.
2. **Test against web early** — the browser is a free second client.
3. **Absolute API URLs** — never relative paths in RN.
4. **One Supabase client** — singleton, same as web.
5. **Expo dev client** — build once, then iterate with fast refresh.
6. **Copy i18n keys verbatim** — use the same dot-path keys from `messages.ts`.
7. **Log aggressively in dev** — strip in production.

---

*This guide targets parity with the WhoSmarter web app as documented in `PROJECT.md` (6-player multiplayer, think-race mode, optional cameras, AI judging, OpenRouter via Next.js API, 7 UI locales).*
