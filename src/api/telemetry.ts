/**
 * Anonymous product telemetry — POST /api/telemetry (deployed Next.js API).
 *
 * Contract: TELEMETRY_IOS.md. Web already emits the same events so Supabase
 * `telemetry_events` includes both platforms.
 *
 * Hard rules (see TELEMETRY_IOS.md §1, §3.3):
 * - Fire-and-forget: failures are swallowed and MUST NEVER block create/join/play.
 * - HOST ONLY, once per finished match (guard with a ref in the caller).
 * - NEVER send: names, emails, IP, topic text, transcripts, Google/RevenueCat
 *   ids, quota keys, or raw ICE candidates / SDP / IP addresses.
 * - Do NOT POST `game_created` from the client — the server writes it from
 *   /api/create-game (the route 403s a client-side game_created).
 */
import { api } from '@/lib/config';
import { debugLog } from '@/lib/debug-log';

/** Server rounds bytes to 100 KB buckets; pre-round so we never ship a precise figure. */
export const roundBytes = (n: number): number => Math.round(n / 100_000) * 100_000;

/** Fire-and-forget POST. Never throws; never awaited on a gameplay path. */
export async function sendTelemetry(body: Record<string, unknown>): Promise<void> {
  try {
    const res = await fetch(api('/api/telemetry'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-WhoSmarter-Client': 'ios',
      },
      body: JSON.stringify(body),
    });
    // Ignore non-OK (400 bad payload / 403 game_created / 429 rate limit / etc.) —
    // telemetry must never surface an error into gameplay. Log only for debugging.
    if (!res.ok) debugLog('warn', 'telemetry', `HTTP ${res.status}`, { event: body.event });
    else debugLog('api', 'telemetry', 'ok', { event: body.event });
  } catch (e) {
    debugLog('warn', 'telemetry', 'network error', String(e));
  }
}

/** WebRTC mesh path/byte summary, collected from live peer connections at match end. */
export interface MeshTelemetry {
  pairsTotal: number;
  pairsP2p: number;
  pairsRelay: number;
  pairsFailed: number;
  /** Raw byte totals; rounded to 100 KB buckets before sending. */
  bytesSent: number;
  bytesRecv: number;
}

/**
 * Report `game_finished` + `webrtc_summary` for a finished match.
 * Caller MUST ensure: this device is the host, and this runs once per ended
 * session (see GameScreen's endTelemetrySentRef).
 */
export function reportMatchEndTelemetry(args: {
  gameId: string;
  difficulty: string;
  gameMode: string;
  mcMode: boolean;
  camerasOn: boolean;
  numQuestions: number;
  playerCount: number;
  mesh: MeshTelemetry;
}): void {
  const {
    gameId,
    difficulty,
    gameMode,
    mcMode,
    camerasOn,
    numQuestions,
    playerCount,
    mesh,
  } = args;

  void sendTelemetry({
    event: 'game_finished',
    game_ref: gameId,
    platform: 'ios',
    difficulty,
    game_mode: gameMode,
    mc_mode: mcMode,
    cameras_on: camerasOn,
    num_questions: numQuestions,
    player_count: playerCount,
    status: 'ended',
  });

  void sendTelemetry({
    event: 'webrtc_summary',
    game_ref: gameId,
    platform: 'ios',
    cameras_on: camerasOn,
    cameras_enabled_mesh: camerasOn,
    webrtc_pairs_total: mesh.pairsTotal,
    webrtc_pairs_p2p: mesh.pairsP2p,
    webrtc_pairs_relay: mesh.pairsRelay,
    webrtc_pairs_failed: mesh.pairsFailed,
    bytes_sent_total: roundBytes(mesh.bytesSent),
    bytes_recv_total: roundBytes(mesh.bytesRecv),
    player_count: playerCount,
  });
}
