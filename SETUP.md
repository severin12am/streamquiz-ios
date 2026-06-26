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
| `EXPO_PUBLIC_API_BASE_URL` | Deployed web host, **no trailing slash** (e.g. `https://whosmarter.com`) |
| `EXPO_PUBLIC_REVENUECAT_IOS_KEY` | RevenueCat **public** iOS SDK key (`appl_…`). Optional — when unset, the creator paywall shows but purchases are disabled and only the free trial applies. See §12. |

Never put `OPENAI_API_KEY` in the app — AI runs on the Next.js server. The RevenueCat *public* key is client-safe (it is not the secret API key).

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

When both sides are deployed, tapping `https://whosmarter.com/game/{uuid}` on an iPhone with the app installed opens the game as guest. Without the app, Safari opens as usual. Old `streamquiz.netlify.app` links still work in the app (legacy deep-link prefix).

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
| Creator paywall / subscriptions | `src/lib/purchases.ts`, `src/lib/createQuota.ts`, `src/context/EntitlementsProvider.tsx`, `src/screens/PaywallScreen.tsx` |
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
| iOS **browser** | Safari on iPhone → `https://whosmarter.com` | Real iPhone network; not the native app |

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

## 12. Monetization (creator paywall)

**Joining a quiz is always free.** Only **creating** a quiz is gated:

| Tier | Allowance |
|------|-----------|
| Free trial | **5** quizzes ever, then a hard paywall |
| `basic` | **30** quizzes per calendar month |
| `premium` | **300** quizzes per calendar month |

Prices (set in App Store Connect, shown localized by StoreKit): **$12.99/mo** for Basic (30 games), **$32.99/mo** for Premium (300 games), each with an **annual plan at 20% off**.

Apple requires In-App Purchase for unlocking app functionality (Stripe is not allowed here), so subscriptions go through **StoreKit via RevenueCat** (`react-native-purchases`). Usage counters live per-install in `AsyncStorage` (`src/lib/createQuota.ts`); the *subscription* itself is owned by StoreKit and is restorable/cross-device.

### Graceful fallback

The app runs fine **without** any billing setup: if `EXPO_PUBLIC_REVENUECAT_IOS_KEY` is unset (or the native module isn't in the build yet), the paywall renders with fallback prices, **Subscribe** is disabled, and users keep the 5-quiz free trial. No crashes.

### One-time setup to enable real purchases

1. **App Store Connect → Subscriptions:** create an auto-renewable subscription group with 4 products:

   | Product (suggested ID) | Price | Maps to |
   |------------------------|-------|---------|
   | `ws_basic_monthly` | $12.99 / mo | `basic` |
   | `ws_basic_annual` | $124.99 / yr (~20% off) | `basic` |
   | `ws_premium_monthly` | $32.99 / mo | `premium` |
   | `ws_premium_annual` | $316.99 / yr (~20% off) | `premium` |

2. **RevenueCat dashboard** ([app.revenuecat.com](https://app.revenuecat.com)):
   - Add the iOS app (bundle id `com.severin.whosmarter`) and the App Store Connect shared secret.
   - Create two **entitlements**: `basic` and `premium`.
   - Attach the basic products to `basic`, the premium products to `premium`.
   - Create a **default Offering** whose packages use these **identifiers** (the code maps by them):
     `BASIC_MONTHLY`, `BASIC_ANNUAL`, `PREMIUM_MONTHLY`, `PREMIUM_ANNUAL`.
   - Copy the **public iOS SDK key** (`appl_…`).

3. Set the key in `eas.json` (replace `appl_REPLACE_WITH_REVENUECAT_IOS_KEY`) or your local `.env`.

4. Rebuild the native client (new native module):

```bash
npx expo prebuild --platform ios --clean
eas build --profile development --platform ios   # or npx expo run:ios on a Mac
```

5. Test purchases in TestFlight or with a StoreKit sandbox Apple ID. Identifiers (entitlements, package IDs, fallback prices) can be tweaked in `src/lib/purchases.ts`.

> If you change entitlement names, the monthly cap values (`BASIC_MONTHLY_GAMES`, `PREMIUM_MONTHLY_GAMES`), or the `5` free-trial count, edit the constants at the top of `src/lib/purchases.ts`.

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
