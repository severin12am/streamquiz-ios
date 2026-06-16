# WhoSmarter

A real-time live quiz show for **up to 6 players**, each on their own camera. Built with Next.js, Supabase, and OpenAI.

> **Upgrading from the old 2-player version?** Run `supabase/migration-v8-multiplayer.sql`
> once in your Supabase SQL Editor — it adds the new `players` table that
> holds per-player state for all six seats. Fresh setups just run
> `supabase/schema.sql` (which already includes it).

## Deploy to Netlify (online testing with friends)

### 1. Push to GitHub
```bash
git add .
git commit -m "Initial WhoSmarter app"
# Create a new repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/streamquiz.git
git branch -M main
git push -u origin main
```

### 2. Connect Netlify
1. Go to [app.netlify.com](https://app.netlify.com) → **Add new site** → **Import an existing project**
2. Choose **GitHub** → select your `streamquiz` repo
3. Netlify should auto-detect Next.js. Confirm:
   - **Build command:** `npm run build`
   - **Publish directory:** leave default (Netlify Next.js plugin handles this)

### 3. Add environment variables
In Netlify → **Site configuration** → **Environment variables**, add:

| Key | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://moyhwkzeetwkpqmhrcso.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your Supabase anon/publishable key |
| `OPENAI_API_KEY` | your OpenRouter key |

Click **Deploy site**.

### 4. Share the live URL
Netlify gives you something like `https://streamquiz.netlify.app`. Share that with friends — cameras and sync work over HTTPS.

---

### 1. Set up environment variables
```bash
cp .env.local.example .env.local
```
Open `.env.local` and fill in:
- `NEXT_PUBLIC_SUPABASE_URL` — from Supabase → Project Settings → API
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — same place
- `OPENAI_API_KEY` — from platform.openai.com → API Keys

### 2. Set up the Supabase database
1. Open your Supabase project dashboard
2. Go to **SQL Editor → New Query**
3. Paste the contents of `supabase/schema.sql`
4. Click **Run**

### 3. Run the app
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000)

---

## How to Play

1. **Host** goes to the home page → fills in topic, difficulty, number of questions → clicks **Create Challenge**
2. **Host** enters a name (takes the host seat) and sees a QR code + shareable link in the **lobby**
3. Up to **5 more players** open the link, enter a name, and take the next open seat — everyone's camera turns on and forms a peer-to-peer mesh
4. **Host** clicks **START QUIZ** (available once at least one other player has joined)
5. Each round, **everyone answers** — pick a multiple-choice option, or speak/type your answer in voice mode
6. Every correct answer scores **+1**, judged independently per player — scores update live on each camera tile
7. After all questions: a ranked winner screen, and anyone can vote to **rematch**

---

## Key Settings (where to change things)

| Setting | File | What to edit |
|---|---|---|
| Max players (6) | `lib/types.ts` | `MAX_PLAYERS` |
| Think time / Question time | `hooks/useGameState.ts` | `THINK_TIME_SECONDS` / `QUESTION_TIME_SECONDS` |
| Camera vs question split | `components/GameScreen.tsx` | `lg:flex-[2]` / `lg:flex-[3]` values |
| AI prompt | `app/api/generate-questions/route.ts` | `systemPrompt` / `userPrompt` |
| OpenAI model | `app/api/generate-questions/route.ts` | `model:` field |
| Scoring | `hooks/useGameState.ts` | `resolveMcRound()` and `runVoiceCheck()` |
| Camera quality | `hooks/useMeshWebRTC.ts` | `getUserMedia` constraints |
| Voice language | `hooks/useSpeechRecognition.ts` | `recognition.lang` |

---

## Project Structure

```
app/
  page.tsx                    ← Home / create game
  game/[id]/page.tsx          ← Game screen (both players)
  api/generate-questions/     ← OpenAI question generation

components/
  GameScreen.tsx              ← Orchestrator: join → lobby → game → winner
  JoinScreen.tsx              ← Name entry before taking a seat
  Lobby.tsx                   ← Player list + invite link + start
  CameraGrid.tsx              ← Responsive grid of all players' cameras
  CameraPanel.tsx             ← Single camera tile (name + score + ✓/✗)
  QuestionPanel.tsx           ← Centre panel (question + timer + answers)
  MCOptions.tsx               ← Multiple choice A/B/C/D grid
  ScoreBoard.tsx              ← Live multiplayer leaderboard
  CountdownTimer.tsx          ← Circular SVG countdown
  CreateGame.tsx              ← Host creation form
  WinnerScreen.tsx            ← Ranked end-of-game overlay + rematch

hooks/
  useGameState.ts             ← Game + players logic, Supabase sync
  useMeshWebRTC.ts            ← Peer-to-peer camera MESH (up to 6)
  useSpeechRecognition.ts     ← Browser voice recognition

lib/
  supabase.ts                 ← Supabase client + game/player helpers
  client-id.ts                ← Stable per-browser id + saved name
  types.ts                    ← All TypeScript types

supabase/
  schema.sql                  ← Run this once to set up the DB
  migration-v8-multiplayer.sql← Adds the players table (existing projects)
```

---

## Tech Stack

- **Next.js 15** (App Router)
- **Tailwind CSS** (dark TV-show theme)
- **Supabase** (Realtime sync + database)
- **OpenAI API** (question generation, gpt-4o-mini)
- **WebRTC** (peer-to-peer camera streaming via Supabase Broadcast signaling)
- **Web Speech API** (browser voice recognition, Chrome/Edge only)
