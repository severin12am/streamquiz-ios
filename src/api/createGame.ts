/**
 * Server-side game creation — POST /api/create-game.
 *
 * Replaces the old client flow (generate-questions + supabase games INSERT).
 * RLS v11+ blocks anonymous INSERT on games; the server creates the row with
 * the service role after generating questions (xAI → OpenRouter fallback).
 *
 * iOS identifies itself via X-WhoSmarter-Client: ios (no Bearer / Google auth).
 */
import { api } from '@/lib/config';
import { debugLog } from '@/lib/debug-log';
import type { CreateAllowance } from '@/lib/createQuota';
import type { CreateGamePayload, Question } from '@/lib/types';
import { quotaRequestHeaders } from '@/api/quotaHeaders';

export interface CreateGameResult {
  gameId: string;
  questions: Question[];
  provider?: string;
  /** Present when the server enforces quota (see server-reference/). */
  quota?: CreateAllowance;
}

async function apiError(res: Response, fallback: string): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (res.status === 402) {
    throw new Error(body.error ?? 'Create quota exceeded.');
  }
  if (res.status === 429) {
    throw new Error(body.error ?? 'Too many games created. Please wait a moment.');
  }
  throw new Error(body.error ?? fallback);
}

export async function createGame(
  payload: CreateGamePayload,
): Promise<CreateGameResult> {
  const url = api('/api/create-game');
  debugLog('api', 'create-game', 'POST', { url, topic: payload.topic });

  const res = await fetch(url, {
    method: 'POST',
    headers: await quotaRequestHeaders({
      'Content-Type': 'application/json',
      'X-WhoSmarter-Client': 'ios',
    }),
    body: JSON.stringify({
      topic: payload.topic.slice(0, 200),
      difficulty: payload.difficulty,
      num_questions: payload.num_questions,
      mc_mode: payload.mc_mode,
      game_mode: payload.game_mode,
      cameras_enabled: payload.cameras_enabled,
      locale: payload.locale,
      previous_questions: payload.previous_questions,
    }),
  });

  if (!res.ok) {
    debugLog('error', 'create-game', `failed ${res.status}`);
    await apiError(res, 'Failed to create game.');
  }

  const data = (await res.json()) as CreateGameResult;
  if (!data.gameId || !data.questions?.length) {
    throw new Error('Invalid response from create-game.');
  }

  debugLog('api', 'create-game', 'ok', {
    gameId: data.gameId.slice(0, 8),
    count: data.questions.length,
    provider: data.provider,
  });
  return data;
}
