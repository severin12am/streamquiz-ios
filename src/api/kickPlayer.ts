/**
 * Host kick — POST /api/kick-player.
 * Upserts game_bans then deletes the guest players row (service role).
 * iOS authenticates via hostClientId (no Google JWT).
 */
import { api } from '@/lib/config';
import { debugLog } from '@/lib/debug-log';

export async function kickPlayer(params: {
  gameId: string;
  targetPlayerId: string;
  hostClientId: string;
}): Promise<void> {
  const url = api('/api/kick-player');
  debugLog('api', 'kick-player', 'POST', {
    gameId: params.gameId.slice(0, 8),
    target: params.targetPlayerId.slice(0, 8),
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-WhoSmarter-Client': 'ios',
    },
    body: JSON.stringify({
      gameId: params.gameId,
      targetPlayerId: params.targetPlayerId,
      hostClientId: params.hostClientId,
    }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    debugLog('error', 'kick-player', `failed ${res.status}`, body.error);
    throw new Error(body.error ?? 'Failed to remove player');
  }

  debugLog('api', 'kick-player', 'ok');
}
