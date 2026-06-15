# WhoSmarter iOS — Setup

React Native (Expo) iOS client with full parity to the WhoSmarter web app. Plays in the **same Supabase games** as browser clients.

## Prerequisites

- Node.js 18+
- **For iOS:** Apple Developer account ($99/yr) + a way to build (Mac **or** EAS Build in the cloud — see §11)
- Deployed WhoSmarter web API (Netlify or local Next.js)
- **Russia:** use a VPN if Supabase or the API is slow/blocked; test web in browser first with VPN on

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

## 5. Universal Links (tap web link → open app)

**App side** (this repo): `app.config.ts` sets `associatedDomains` from `EXPO_PUBLIC_API_BASE_URL`. Rebuild after changes:

```bash
npx expo prebuild --platform ios --clean
npx expo run:ios
```

**Server side** (web repo on Netlify): deploy `universal-links/apple-app-site-association` to `public/.well-known/` — see [`universal-links/README.md`](universal-links/README.md). You must set your Apple Team ID in that file.

When both sides are deployed, tapping `https://streamquiz.netlify.app/game/{uuid}` on an iPhone with the app installed opens the game as guest. Without the app, Safari opens as usual.

Custom scheme still works: `whosmarter://game/{uuid}` (legacy `streamquiz://` also supported)

Host always creates via the app (not via link).

## 6. Debug logs (share with support / AI)

In **dev builds** (`__DEV__`), tap **Logs** in the top-right (home or in-game).

The debug screen shows:
- API calls, join/seat, phase changes, clock sync, WebRTC peer state
- A **snapshot** of current game state when opened from a game
- **Copy all** — copies everything to the clipboard

**To share logs:** reproduce the bug → open Logs → Copy all → paste into chat, email, or Notes.

Logs also print to the Metro terminal where you ran `npm start` (useful on Simulator).

## 7. Code navigation (where to change what)

| If you need to change… | Open |
|------------------------|------|
| Round timing, phases, scoring | `src/hooks/useGameState.ts` (file header + MARK sections) |
| DB writes, join slots, clock sync | `src/lib/supabase.ts` |
| WebRTC / camera / mic mesh | `src/hooks/useMeshWebRTC.ts` |
| Mic policy, speech, rematch, UI flow | `src/screens/GameScreen.tsx` |
| API URLs, share links | `src/api/client.ts`, `src/lib/config.ts` |
| Types / MAX_PLAYERS | `src/lib/types.ts` |
| Deep links / Universal Links | `src/navigation/RootNavigator.tsx`, `app.config.ts`, `universal-links/` |
| User-visible strings | `src/lib/i18n/messages.ts` |

Each critical file has a top-of-file comment block. Spec reference: `PROJECT.md`, `ios_implementation_help.md`.

## 8. Unit tests

```bash
npm test
```

Pure helpers (clock math, MC scoring, join slots) — no device needed.

## 9. Screen recording

During a quiz, tap **Record** in the header. Tap **Stop** when done — video saves to Photos (records **your** screen, what you see on your phone).

Requires a new native build after installing `react-native-record-screen`.

## 10. Intentionally deferred

- **QR scanner** — lobby displays QR; guests scan with Camera app or paste link.
- **Android** — out of scope.

## 11. Testing without a Mac (Windows / Russia)

You **cannot** compile the iOS app on Windows. Options:

### A. What you can do right now (no Mac, no iPhone build)

| Step | Command / action | What it proves |
|------|------------------|----------------|
| Unit tests | `npm test` | Timing, scoring, join logic |
| Web cross-play | PC Chrome + phone Safari (with VPN if needed) | Full game loop, same Supabase |
| iOS **browser** | Safari on iPhone → `https://streamquiz.netlify.app` | Real iPhone network; not the native app |

The native app shares the same `useGameState` logic as this repo — web testing catches most sync/scoring bugs.

### B. Install the native app on your iPhone (recommended: EAS Build)

Expo builds on **Apple’s cloud Macs**; you stay on Windows.

1. Create [expo.dev](https://expo.dev) account (free tier includes some builds).
2. Enroll in [Apple Developer Program](https://developer.apple.com) if you can (needed for installing on a physical iPhone).
3. Install EAS CLI and log in:

```bash
npm install -g eas-cli
eas login
eas build:configure
```

4. Link the project (first time):

```bash
cd d:\QUIZ_ios
eas init
```

5. Register your iPhone for ad-hoc/internal installs:

```bash
eas device:create
```

(Open the link on your iPhone, install the profile, then re-run the command.)

6. Build a dev client in the cloud:

```bash
eas build --profile development --platform ios
```

7. When the build finishes, open the QR/link from the Expo dashboard on your iPhone and install.

8. On Windows, start Metro and point the phone at your PC (same Wi‑Fi):

```bash
npm start
```

Scan the Metro QR with the **dev client** (not Expo Go).

**VPN:** if `eas login` or the build upload fails from Russia, try a VPN. The installed app also needs VPN if Supabase is blocked in your region.

### C. Other ways to get an iOS build

| Option | Notes |
|--------|--------|
| Borrow a Mac once | `npx expo prebuild && npx expo run:ios --device` |
| Paid cloud Mac | MacinCloud, etc. — hourly rent |
| TestFlight | `eas build --profile preview` + `eas submit` — needs Apple Developer |

### D. What only a real iPhone native build can test

- Apple speech recognition (voice answers)
- WebRTC mic/camera on iOS
- Universal Links tap → open app
- Screen recording button → Photos

Everything else (lobby, MC, timers, rematch) you can validate with **web + `npm test`** first.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Setup banner / missing env | Copy `.env.example` → `.env`, restart Metro |
| API 404 | Use absolute `EXPO_PUBLIC_API_BASE_URL`, not `/api/...` |
| WebRTC black video | Test on device with TURN configured on web deployment |
| Voice not working on Simulator | Expected — test speech on physical iPhone |
| Lobby not updating | Check Supabase keys; polling fallback runs every 2.5s |
| Russia / can't reach Supabase | VPN; error screen in app mentions this |
| No Mac | Use EAS Build (§11), not `expo run:ios` on Windows |
| EAS build fails | `eas device:create` for physical device; Apple Developer membership |
