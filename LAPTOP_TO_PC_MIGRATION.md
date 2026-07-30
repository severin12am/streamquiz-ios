# Laptop → PC migration checklist (WhoSmarter iOS)

**Date prepared:** 2026-07-30  
**Laptop path:** `D:\QUIZ_ios2`  
**GitHub remote:** `https://github.com/severin12am/streamquiz-ios.git`  
**Branch:** `main` @ `ceafa85` (PDF quizzes + review doc) — **already pushed**

Use this after you reset the laptop so nothing important is lost.

---

## 1. What is already safe on GitHub (no copy needed)

Clone on the PC and you’re good for **app source**:

```bash
git clone https://github.com/severin12am/streamquiz-ios.git
cd streamquiz-ios
npm install
```

Includes: PDF quiz feature, telemetry, Global Rooms UI, etc.

---

## 2. Local-only leftovers on this laptop (decide per item)

| Item | Status | What to do |
|------|--------|------------|
| **App code on `main`** | Pushed | Just `git clone` / `git pull` on PC |
| **`native-ios/`** | Nested repo with **uncommitted** Swift edits | See §3 — **do not lose these** if you still care about the Swift app |
| **`_web-live/`** | Untracked local web snapshot (~small) | Optional. Only copy if you want offline web reference; otherwise re-fetch from web repo |
| **`_ice-check.json`** | Untracked; contains **TURN credentials** | **Do not commit.** Copy privately to PC only if you still need it for ICE debugging, or delete |
| **`.env`** | Usually gitignored | Copy if present (Supabase / API URLs). Never commit |
| **`credentials/AuthKey_*.p8`** | Needed for `eas submit` | **Must copy securely to PC** (or recreate in App Store Connect). Path referenced in `eas.json` |
| **Cursor / agent transcripts** | Outside repo | Optional; not required to build |

---

## 3. `native-ios/` (important)

This folder is a **separate git repo** (gitlink), not fully managed by the parent push.

On the laptop right now it has local changes, including roughly:

- `README.md`, `Secrets.example.plist`
- `StreamQuiz.xcodeproj/project.pbxproj`
- `StreamQuiz/Services/SupabaseService.swift`
- `StreamQuiz/Services/WebRTCManager.swift`
- `StreamQuiz/Utilities/WebRTCHelpers.swift` (new)

**Before wiping the laptop, pick one:**

**A (recommended if you still use Swift app):**  
Inside `native-ios`, commit + push to **its** GitHub remote (`native_streamquiz` or whatever `git remote -v` shows).

```bash
cd native-ios
git status
git remote -v
# then commit + push there
```

**B (quick backup):** Zip the whole `native-ios` folder to USB / cloud / PC.

**C (discard):** Only if you’re sure those Swift edits don’t matter.

---

## 4. Secrets & tooling to bring to the PC

Copy these **outside git** (USB, password manager, encrypted zip):

1. **`.env`** (if any) — Expo public keys / API base  
2. **`credentials/AuthKey_6987NR3ZTG.p8`** — App Store Connect API key for `eas submit`  
3. Optional: RevenueCat / Apple team notes you keep locally  
4. Optional: `_ice-check.json` only if needed for TURN debugging  

On the PC after clone:

```bash
# restore .env next to package.json
# restore credentials/*.p8 to ./credentials/ (same paths as eas.json)
npm install
npx eas login   # or reuse Expo account
```

---

## 5. EAS on the new PC

Same Expo account (`eas whoami`).

Usual TestFlight flow (the “2 steps” you meant):

| Step | Command | Meaning |
|------|---------|---------|
| 1. **Build** | `eas build --profile production --platform ios` | Cloud builds the `.ipa` (auto-increments build number) |
| 2. **Submit** | `eas submit --platform ios --latest` | Sends that build to App Store Connect → TestFlight |

PDF feature needs a **new native binary** (because of `expo-pdf-text-extract`). Old TestFlight builds won’t have PDF extract.

Dev client (optional):

```bash
eas build --profile development --platform ios
```

---

## 6. Minimal “before reset” pack

Copy to PC / external drive:

```
[ ] Confirm GitHub has latest main (git status clean for src/)
[ ] native-ios: committed+pushed OR zip backup
[ ] .env (if exists)
[ ] credentials/AuthKey_*.p8
[ ] This file: LAPTOP_TO_PC_MIGRATION.md
[ ] Optional: _web-live zip, _ice-check.json (private)
```

Then wipe laptop.

---

## 7. First-day checklist on the PC

1. Install Node LTS, Git, Expo account login  
2. `git clone` → `npm install`  
3. Restore `.env` + `credentials/`  
4. `eas whoami`  
5. Open project in Cursor  
6. When ready: production **build** → **submit** → TestFlight install → test PDF under More → PDF  

---

## 8. Safe to delete on laptop after backup

- `node_modules/` (reinstall on PC)  
- `.expo/` cache  
- `_web-live/` if you don’t need it  
- `_ice-check.json` after private copy or if unused  
