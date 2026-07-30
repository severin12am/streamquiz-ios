# WhoSmarter iOS — PC migration verification

Give this file to Cursor AI on the **new PC** and ask it to perform the checks below.

## Instructions for the reviewing AI

You are verifying that the WhoSmarter React Native / Expo iOS repository migrated correctly from a laptop to this Windows PC.

Repository expected at:

```text
D:\WhoSmarter-IOS\streamquiz-ios
```

Perform a **read-only verification first**. Do not edit source files, update dependencies, run `npm audit fix`, commit, push, start an EAS build, or submit to Apple unless the user separately asks.

Never display, copy into chat, or commit:

- `.env` values
- `credentials/AuthKey_6987NR3ZTG.p8` contents
- API tokens, private keys, or credentials

Report each check as **PASS**, **WARNING**, or **FAIL**, followed by a concise final verdict.

---

## Expected project state

- GitHub: `https://github.com/severin12am/streamquiz-ios.git`
- Branch: `main`
- Migration baseline commit: `f1090e4`
- App version: `1.0.1`
- Bundle identifier: `com.severin.whosmarter`
- Expo project: `@severrrrin/whosmarter`
- EAS account: `severrrrin`
- Expo SDK: `54`
- Latest submitted TestFlight build at migration time: app `1.0.1`, build `17`

The verification document itself may be a commit after `f1090e4`; that is expected. Confirm that `f1090e4` is an ancestor of `HEAD`, not necessarily `HEAD` itself.

---

## 1. Git integrity

Run:

```powershell
git status -sb
git remote -v
git log -3 --oneline
git merge-base --is-ancestor f1090e4 HEAD
git rev-parse HEAD
git rev-parse origin/main
```

Pass conditions:

- Current branch is `main`.
- `origin` points to `severin12am/streamquiz-ios.git`.
- `f1090e4` is an ancestor of `HEAD`.
- Local `HEAD` equals `origin/main`.
- No unexpected modified or untracked app files.

Do not count `.env`, `credentials/*.p8`, `node_modules`, or `.expo` as missing from Git; they are intentionally ignored/local.

Verify secrets are not tracked:

```powershell
git ls-files .env .env.local credentials
git check-ignore -v .env credentials/AuthKey_6987NR3ZTG.p8
```

Pass conditions:

- `git ls-files` prints no secret files.
- `.env` and the `.p8` key are ignored.

---

## 2. Required local files (existence only)

Run without printing contents:

```powershell
Test-Path .env
Test-Path credentials\AuthKey_6987NR3ZTG.p8
(Get-Item credentials\AuthKey_6987NR3ZTG.p8).Length
```

Pass conditions:

- Both paths return `True`.
- The `.p8` file is non-empty (the laptop copy was approximately 257 bytes).

Validate the private-key envelope without printing the key:

```powershell
$keyText = Get-Content credentials\AuthKey_6987NR3ZTG.p8 -Raw
[bool]($keyText -match 'BEGIN PRIVATE KEY')
[bool]($keyText -match 'END PRIVATE KEY')
Remove-Variable keyText
```

Both booleans must be `True`.

Validate required `.env` names are present and non-empty without printing values:

```powershell
$required = @(
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_API_BASE_URL'
)
$envMap = @{}
Get-Content .env | ForEach-Object {
  if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$') {
    $envMap[$matches[1]] = $matches[2].Trim()
  }
}
$required | ForEach-Object { "$_ present and non-empty: $([bool]$envMap[$_])" }
Remove-Variable envMap
```

All three results must be `True`. Do not print their values.

---

## 3. Dependency installation

Run:

```powershell
node --version
npm --version
npm ls --depth=0
git status -sb
```

Pass conditions:

- Node and npm run normally.
- `npm ls --depth=0` has no missing required package.
- `npm install` did not modify `package.json` or `package-lock.json`.

Important:

- Existing `npm audit` warnings are known transitive Expo/build-tool findings.
- Do **not** run `npm audit fix`.
- Do **not** run `npm audit fix --force`; it proposes a breaking Expo 57 upgrade and dependency downgrades.
- Dependency security work should happen later as a dedicated, tested change.

---

## 4. Source and automated checks

Run:

```powershell
npm test -- --runInBand
npx expo config --type public
npx expo-doctor
```

Expected:

- Jest: 2 suites, 28 tests passing.
- Expo config reports version `1.0.1`.
- Bundle identifier is `com.severin.whosmarter`.
- Expo SDK is 54.

`expo-doctor` warnings must be assessed individually. Do not automatically change versions.

The project-wide TypeScript command may incorrectly include local web reference folders in some workspaces. If TypeScript is run, distinguish pre-existing/reference-folder errors from errors under `src/`.

---

## 5. PDF feature dependencies

Confirm:

```powershell
npm ls expo-document-picker expo-pdf-text-extract
```

Expected packages:

- `expo-document-picker`
- `expo-pdf-text-extract`

Inspect, without editing:

- `src/lib/extract-pdf-text.ts`
- `src/lib/pdf-source.ts`
- `src/components/CreateGame.tsx`
- `PDF_QUIZ_BUG_REVIEW.md`

The native PDF package requires a new native binary; TestFlight build `1.0.1 (17)` contains it. An old development client may not.

---

## 6. EAS / Expo account

If EAS CLI is not installed globally:

```powershell
npm install -g eas-cli
```

Then run:

```powershell
eas whoami
eas project:info
eas build:version:get --platform ios --profile production --non-interactive
eas build:list --platform ios --limit 3 --non-interactive
```

Pass conditions:

- Logged in as `severrrrin`.
- Project is `@severrrrin/whosmarter`.
- Remote iOS build number is at least `17`.
- Recent build includes app version `1.0.1`, build `17`.

Do not start another build. Do not submit anything.

The normal release flow is:

1. `eas build --profile production --platform ios`
2. `eas submit --platform ios --latest`

---

## 7. Optional local launch smoke test

Only after all checks above pass:

```powershell
npx expo start --dev-client
```

Confirm Metro starts without configuration errors. This does not prove that every native module exists in an older development-client binary.

Do not create a production build merely to test migration.

---

## 8. Separate Swift repository warning

The parent React Native repository is not the whole laptop state.

The laptop also contains a separate nested Swift repository at:

```text
D:\QUIZ_ios2\native-ios
```

Remote:

```text
https://github.com/severin12am/native_streamquiz.git
```

At migration time that separate repository had uncommitted changes:

- `README.md`
- `Secrets.example.plist`
- `StreamQuiz.xcodeproj/project.pbxproj`
- `StreamQuiz/Services/SupabaseService.swift`
- `StreamQuiz/Services/WebRTCManager.swift`
- `StreamQuiz/Utilities/WebRTCHelpers.swift` (new)

Those changes are **not transferred by cloning `streamquiz-ios`**. The laptop must not be reset until this Swift repository is separately committed/pushed or privately copied.

Also local-only on the laptop:

- `_ice-check.json`: TURN credentials; never commit
- `_web-live/`: optional read-only web reference snapshot

---

## Required final report

Return:

1. Git sync: PASS/WARNING/FAIL
2. `.env` presence/shape (no values): PASS/WARNING/FAIL
3. App Store `.p8` key presence/shape (no contents): PASS/WARNING/FAIL
4. Dependencies: PASS/WARNING/FAIL
5. Tests and Expo config: PASS/WARNING/FAIL
6. EAS identity/project/version: PASS/WARNING/FAIL
7. Any unexpected local changes
8. Reminder whether the separate `native-ios` Swift work is still at risk
9. Overall verdict: **safe to continue on PC** or **not yet safe**

