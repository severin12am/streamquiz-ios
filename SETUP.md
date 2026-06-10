# StreamQuiz iOS — Setup

React Native (Expo) iOS client with full parity to the StreamQuiz web app. Plays in the **same Supabase games** as browser clients.

## Prerequisites

- Node.js 18+
- macOS with Xcode (for iOS Simulator and device builds)
- Apple Developer account (for physical device testing)
- Deployed StreamQuiz web API (Netlify or local Next.js)

## 1. Install

```bash
npm install
```

## 2. Environment

```bash
cp .env.example .env
```

| Variable | Purpose |
|----------|---------|
| `EXPO_PUBLIC_SUPABASE_URL` | Same Supabase project as web |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `EXPO_PUBLIC_API_BASE_URL` | Deployed web host, **no trailing slash** (e.g. `https://streamquiz.netlify.app`) |

Never put `OPENAI_API_KEY` in the app — AI runs on the Next.js server.

## 3. Development build (required for WebRTC)

Expo Go does **not** support `react-native-webrtc`. Use a dev client:

```bash
npx expo prebuild --platform ios
npx expo run:ios
```

First build compiles native WebRTC + Voice modules (~5–15 min). After that, iterate with:

```bash
npm start
```

## 4. Test against web (recommended order)

| Step | Setup | Validates |
|------|-------|-----------|
| 1 | iOS Simulator + Chrome | Lobby sync, MC gameplay, timers |
| 2 | Simulator + Chrome | Voice mode with **typed** answers |
| 3 | Physical iPhone + Chrome | Speech recognition, WebRTC audio |
| 4 | 2 devices | Cameras when `cameras_enabled: true` |

### Cross-platform smoke test

1. **Web host:** open deployed site → create game → copy link.
2. **iOS:** Home → paste game ID → join as guest.
3. **Web:** open link in second Chrome tab → join.
4. **iOS host:** create game on device → web guest joins via QR/link.
5. Host starts when ≥2 players; verify scores stay in sync through a full round.

### Simulator API URL

`EXPO_PUBLIC_API_BASE_URL=http://localhost:3000` works for Simulator if Next.js runs locally.

### Physical device API URL

Use your machine's LAN IP or ngrok — `localhost` is not reachable from a phone.

## 5. Deep links

- Guest join: `streamquiz://game/{uuid}` or `https://your-domain/game/{uuid}`
- Host always enters via Create → navigates with `asHost: true`

## 6. Debug logs (share with support / AI)

In **dev builds** (`__DEV__`), tap **Logs** in the top-right (home or in-game).

The debug screen shows:
- API calls, join/seat, phase changes, clock sync, WebRTC peer state
- A **snapshot** of current game state when opened from a game
- **Copy all** — copies everything to the clipboard

**To share logs:** reproduce the bug → open Logs → Copy all → paste into chat, email, or Notes.

Logs also print to the Metro terminal where you ran `npm start` (useful on Simulator).

## 7. Unit tests

```bash
npm test
```

Pure helpers (clock math, MC scoring, join slots) — no device needed.

## 8. Intentionally deferred (v1)

- **Answer clip download** — web records WebM in-browser; iOS shows "coming soon" on winner screen. Recording can be added via `expo-av` in v1.1.
- **QR scanner** — lobby displays QR; users scan with Camera app or paste link.
- **Android** — out of scope.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Setup banner / missing env | Copy `.env.example` → `.env`, restart Metro |
| API 404 | Use absolute `EXPO_PUBLIC_API_BASE_URL`, not `/api/...` |
| WebRTC black video | Test on device with TURN configured on web deployment |
| Voice not working on Simulator | Expected — test speech on physical iPhone |
| Lobby not updating | Check Supabase keys; polling fallback runs every 2.5s |
