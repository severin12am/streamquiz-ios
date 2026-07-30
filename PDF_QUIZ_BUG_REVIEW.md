# PDF Quizzes (iOS RN) — Bug-hunt handoff

**Repo:** WhoSmarter React Native iOS client (`QUIZ_ios2` / `streamquiz-ios`)  
**Goal of this doc:** Give another model enough context to hunt for bugs, regressions, and parity gaps.  
**Feature:** Host can create a quiz from an uploaded PDF (client extracts text; server generates questions from `source_text`).

**Do not commit or upload:** `_ice-check.json` (TURN credentials). Ignore `_web-live/` (local web snapshot) and `native-ios/` (separate nested repo) unless reviewing those deliberately.

---

## 1. Product / architecture (must understand)

Web already shipped this. iOS mirrors the **same API contract**, not a PDF-binary upload.

```
Host picks PDF
  → Device extracts text (Apple PDFKit via expo-pdf-text-extract)
  → Caps: 20 MB file, first 30 pages, 40_000 chars
  → POST /api/create-game {
       topic: "PDF: {filename}",
       difficulty: "medium",
       source_text: <capped text>,
       + usual fields
     }
  → Server stores games.source_text (immutable) and generates questions from it only

Rematch (PDF topic):
  → POST /api/generate-questions { ..., game_id }
  → Server loads stored source_text (client must NOT invent trivia from "PDF: file.pdf" alone)
  → On 402 / 409 / generate failure → replay SAME questions (graceful)
```

**Explicit non-goals of this pass:** OCR for scans, uploading PDF bytes to server/AI, Geography quizzes, server-side PDF parse at create time.

**Parity reference (web):** `_web-live/docs/IOS_PDF_QUIZZES.md`, `_web-live/lib/pdf-source.ts`, `_web-live/lib/extract-pdf-text.ts`, `_web-live/components/CreateGame.tsx`, rematch in `_web-live/components/GameScreen.tsx`.

---

## 2. Files changed (this feature)

| Path | Role |
|------|------|
| `src/lib/pdf-source.ts` | **NEW** — caps, `PDF:` topic encode/display, truncate |
| `src/lib/extract-pdf-text.ts` | **NEW** — native PDFKit extract wrapper |
| `src/components/CreateGame.tsx` | PDF picker UI, freeze topic/difficulty, create with `source_text` |
| `src/screens/HomeScreen.tsx` | Pass `source_text` into `createGame` |
| `src/api/createGame.ts` | Send `source_text` when present (log length only, not body) |
| `src/api/client.ts` | Rematch: send `game_id` when set; add `X-WhoSmarter-Client: ios` |
| `src/lib/types.ts` | `CreateGamePayload.source_text?`, `game_id?` |
| `src/screens/GameScreen.tsx` | PDF rematch via `game_id` + fallback to same questions |
| `src/screens/PublicGamesScreen.tsx` | Display filename via `displayPdfTopic` |
| `src/lib/i18n/messages.ts` | PDF strings (en/ru/es/fr/de/ja/ar) |
| `package.json` / `package-lock.json` | `expo-document-picker`, `expo-pdf-text-extract` |

**Native rebuild required:** `expo-pdf-text-extract` will not work in Expo Go / old binaries. User must rebuild (`npx expo run:ios` or EAS `development` / store profiles).

---

## 3. Constants (must match web)

From `src/lib/pdf-source.ts`:

- `MAX_PDF_BYTES = 20 * 1024 * 1024`
- `MAX_PDF_PAGES = 30`
- `MAX_PDF_TEXT_CHARS = 40_000`
- `PDF_TOPIC_PREFIX = 'PDF:'`
- Min usable text after extract ≈ **40** non-whitespace chars (enforced in extract helper)

---

## 4. End-to-end flows to verify

### Create (happy path)

1. Home → More → Specific types → **PDF**
2. Document picker → Reading…
3. Topic field replaced by PDF summary; difficulty hidden
4. Create → quota check → `createGame` with `source_text`
5. Lobby as host

### Create (errors)

- Native module missing → `pdfUnavailable`
- > 20 MB (when size known) → `pdfTooLarge`
- Password PDF → `pdfPassword`
- Empty / image-only / too little text → `pdfNotEnoughText` / `pdfReadError`
- Clear PDF → topic field returns

### Rematch

1. End game → host + ≥1 guest vote rematch
2. If topic starts with `PDF:` → `generateQuestions({ ..., game_id: game.id })`
3. Success → new questions into rematch lobby
4. Quota blocked locally OR API 402/409/failure → `rematch()` with **no** new questions (same set)

### Browse / display

- Public list shows filename without requiring `PDF:` prefix in UI (`displayPdfTopic`)

---

## 5. Known design choices / intentional limits

1. **No OCR** — scanned PDFs fail clearly (same as web).
2. **Size may be missing** from document picker — if `size` is null/0, the 20 MB check is skipped and extraction is attempted anyway (`extract-pdf-text.ts`).
3. **Page-truncation note appended after char truncate** — can slightly exceed 40k when pages > 30 (web does the same pattern).
4. **PDF control lives under More** — not on the first-screen topic row (matches “Specific types of quiz” placement).
5. **Difficulty always sent as `medium` for PDF** — DB requires a value; generation ignores difficulty guide when `source_text` present (server-side).
6. **`source_text` is not kept in live game client state** — only used at create; rematch uses `game_id`.
7. **Telemetry must never log `source_text` body** — create logs boolean + char count only.

---

## 6. Suspected risk areas (please scrutinize)

These are starting points for bug hunting — confirm or dismiss with code evidence:

### A. Rematch `rematchInFlight` / loading state (`GameScreen.tsx`)

- On PDF quota-exhausted path: `await rematch(); return;` inside `try`, then `finally` clears loading.
- If `rematch()` returns early (vote guards fail) while phase stays `ended`, does `rematchInFlight` stay `true` and block future rematches?
- Compare carefully to web’s rematch (`_web-live/components/GameScreen.tsx`).

### B. PDF rematch vs non-PDF rematch inconsistency

- Non-PDF still navigates to Paywall when quota exhausted.
- PDF silently replays same questions.
- Is that intentional parity with web, and is user messaging missing on iOS for “quota → same questions”?

### C. Extract reliability / URI formats

- `expo-document-picker` + `copyToCacheDirectory: true` → `file://` URI passed to PDFKit.
- Any iOS URI form that `getPageCount` / `extractTextFromPage` reject?
- Password errors: is `.code` always present on thrown Error from the native module?

### D. Cap enforcement holes

- Missing file size → oversized file may still be parsed (memory/CPU risk).
- After char truncate, appending `[Quiz uses the first N of M pages.]` grows the string past 40k.
- Does server also re-validate max length and reject?

### E. Create payload / privacy

- Confirm `source_text` never enters Supabase Realtime game payloads on the client path.
- Confirm debug logs never dump the full excerpt.
- Confirm `HomeScreen` does not stash `source_text` in navigation params.

### F. Topic encoding edge cases

- Very long filenames → `encodePdfTopic` truncates to 200 with `...`
- `isPdfTopic` is prefix-based — could a normal topic legitimately start with `PDF:` and wrongly take rematch `game_id` path?
- Display vs storage mismatch in Browse / share UX.

### G. UI / state bugs in `CreateGame.tsx`

- PDF busy vs Create disabled interactions
- Clearing PDF while create in flight
- Topic text retained under PDF mode then restored on Clear (stale topic?)
- Profanity check skipped for PDF filenames (intentional?)

### H. Build / EAS

- New native module requires new binary. Old TestFlight/dev clients will show “unavailable”.
- Confirm `eas.json` profiles don’t need plugin changes; confirm `app.config.ts` plugins list doesn’t need an entry for document-picker / pdf-extract.

### I. i18n completeness

- All locales typed as `typeof en` — missing key in one locale would break TS (check CI).
- Placeholder replacements `{n}`, `{used}`, `{total}` — any string missing a placeholder?

### J. API contract drift

- Deployed `POST /api/create-game` must accept `source_text` and persist `games.source_text` (migration v19).
- Deployed `POST /api/generate-questions` must accept `game_id` and return 409 if source missing.
- If backend not deployed / migration missing → create/rematch failures; check fallback behavior.

---

## 7. Suggested test plan (manual)

1. Rebuild iOS with native modules (`eas build --profile development` or `npx expo run:ios`).
2. Small text PDF (<30 pages) → create → play → rematch → **new** questions when quota allows.
3. PDF >30 pages → UI shows first-30 note → quiz grounded only in first 30.
4. Dense PDF that truncates by chars → still creates; questions from truncated excerpt.
5. Image-only scan → clear error, no create.
6. Password PDF → clear error.
7. File >20 MB (if picker reports size) → rejected before extract.
8. Rematch with **no quota** on PDF game → lobby resets with **same** questions (no paywall).
9. Rematch with quota on PDF → new questions; `game_id` present in network request.
10. Non-PDF create/rematch unchanged (paywall still for create/rematch when out of quota).
11. Browse open games shows friendly PDF filename.
12. Guest joins PDF room without ever seeing the file / source text.

---

## 8. How to ask the reviewer model

Paste this file and ask something like:

> Review the PDF quiz iOS changes against this handoff. Read the listed files and web parity references. Report only concrete bugs or high-risk regressions with severity, file:line, trigger, and impact. Prefer false-negative avoidance on rematch, caps, API contract, and native extract failures.

Useful commands for the reviewer:

```bash
git show --stat HEAD
git diff HEAD~1 -- src/ package.json
rg -n "source_text|game_id|pdf|PDF|extractPdf|isPdfTopic" src
```

---

## 9. Out of scope for this review

- Geography quizzes (not implemented on iOS)
- Uploading PDF binaries to AI
- OCR
- Swift `native-ios/` app (separate codebase)
- Committing `_web-live/` snapshot or `_ice-check.json`
