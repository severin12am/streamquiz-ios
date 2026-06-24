/**
 * HTTP calls to deployed Next.js API — never relative URLs, never OpenAI keys in app.
 *
 * Routes:
 *   POST /api/create-game      — server-side game creation (see createGame.ts)
 *   POST /api/generate-questions — rematch question regen (host only)
 *   POST /api/check-answer, GET /api/ice-servers
 * Base URL: EXPO_PUBLIC_API_BASE_URL (see lib/config.ts)
 */
import { api } from '@/lib/config';
import { debugLog } from '@/lib/debug-log';
import type { CreateGamePayload, Difficulty, Locale, Question } from '@/lib/types';

export { createGame } from '@/api/createGame';
export type { CreateGameResult } from '@/api/createGame';

async function apiError(res: Response, fallback: string): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (res.status === 429) {
    throw new Error(body.error ?? 'Too many requests. Please wait a moment.');
  }
  throw new Error(body.error ?? fallback);
}

/** Rematch only — host regenerates questions for an existing game row. */
export async function generateQuestions(payload: CreateGamePayload): Promise<Question[]> {
  const url = api('/api/generate-questions');
  debugLog('api', 'generate', 'POST', { url, topic: payload.topic });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      topic: payload.topic.slice(0, 200),
      difficulty: payload.difficulty,
      num_questions: payload.num_questions,
      mc_mode: payload.mc_mode,
      game_mode: payload.game_mode,
      locale: payload.locale,
      previous_questions: payload.previous_questions,
    }),
  });

  if (!res.ok) {
    debugLog('error', 'generate', `failed ${res.status}`);
    await apiError(res, `generate-questions failed (${res.status})`);
  }

  const data = (await res.json()) as { questions?: Question[] };
  if (!data.questions?.length) throw new Error('No questions returned');
  debugLog('api', 'generate', 'ok', { count: data.questions.length });
  return data.questions;
}

export async function checkAnswer(params: {
  question: string;
  correct_answer: string;
  accepted_answers?: string[];
  transcript: string;
}): Promise<{ correct: boolean; method?: 'local' | 'ai' }> {
  try {
    const res = await fetch(api('/api/check-answer'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      debugLog('warn', 'check-answer', `HTTP ${res.status}`);
      return { correct: false };
    }
    const out = (await res.json()) as { correct: boolean; method?: 'local' | 'ai' };
    debugLog('api', 'check-answer', out.correct ? 'correct' : 'wrong', { method: out.method });
    return out;
  } catch (e) {
    debugLog('error', 'check-answer', 'network error', String(e));
    return { correct: false };
  }
}

// STUN we always add on top of whatever the server returns (harmless, helps
// srflx candidate discovery). The real TURN relay must come from the server's
// /api/ice-servers (Metered creds) — see help_with_fixing_camera_issues.md §7.
// NOTE: we intentionally do NOT add openrelay.metered.ca here — Metered
// discontinued that free project, so it only wastes ICE-gathering time on
// failed TURN allocations. If the server has no working TURN, fix the Netlify
// METERED_* env vars rather than relying on a dead public relay.
const EXTRA_RELAYS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

function mergeIceServers(serverList: RTCIceServer[]): RTCIceServer[] {
  const seen = new Set(serverList.map((s) => JSON.stringify(s.urls)));
  const extras = EXTRA_RELAYS.filter((s) => !seen.has(JSON.stringify(s.urls)));
  return [...serverList, ...extras];
}

export async function fetchIceServers(): Promise<RTCIceServer[]> {
  try {
    const res = await fetch(api('/api/ice-servers'), { cache: 'no-store' });
    if (!res.ok) return EXTRA_RELAYS;
    const data = (await res.json()) as { iceServers?: RTCIceServer[] };
    return data.iceServers?.length ? mergeIceServers(data.iceServers) : EXTRA_RELAYS;
  } catch {
    return EXTRA_RELAYS;
  }
}

/** Web join URL — used for QR, copy, share; works for browser + Universal Links. */
export function gameShareUrl(gameId: string): string {
  const base = api('');
  return `${base}/game/${gameId}`;
}

export function parseGameIdFromLink(input: string): string | null {
  const trimmed = input.trim();
  const uuidRe =
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const match = trimmed.match(uuidRe);
  return match ? match[0] : null;
}

export type { Difficulty, Locale };
