/**
 * Browse open public lobbies — GET /api/public-games.
 * Never list via client Supabase select on games (over-fetches questions).
 */
import { api } from '@/lib/config';
import { debugLog } from '@/lib/debug-log';
import type { PublicGameSummary } from '@/lib/types';

export async function fetchPublicGames(): Promise<PublicGameSummary[]> {
  const url = api('/api/public-games');
  debugLog('api', 'public-games', 'GET', { url });

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'X-WhoSmarter-Client': 'ios',
    },
    cache: 'no-store',
  });

  if (res.status === 429) {
    throw new Error('Too many requests');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? 'Failed to list open games');
  }

  const data = (await res.json()) as { games?: PublicGameSummary[] };
  const games = Array.isArray(data.games) ? data.games : [];
  debugLog('api', 'public-games', 'ok', { count: games.length });
  return games;
}
