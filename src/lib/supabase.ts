/**
 * Supabase client, clock sync, guarded DB updates, join/slot logic, Realtime subscriptions.
 *
 * Spec: PROJECT.md §9–10. Ported from web lib/supabase.ts — behavior must stay identical.
 *
 * Clock: serverNow() = Date.now() + offset from Supabase Date header. Resync every 30s.
 * Guards: updateGameIfPhase / updateGameIfDeadline — compare-and-swap; only one client wins.
 * Join: slot 0 = host (asHost:true), slots 1–5 = guests; reattach by client_id.
 */
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { debugLog } from '@/lib/debug-log';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';
import { MAX_PLAYERS, type Game, type Player } from './types';

let client: SupabaseClient | null = null;
let serverOffsetMs = 0;
let lastClockSync = 0;

export function getSupabase(): SupabaseClient {
  if (!client) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error('Supabase is not configured');
    }
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      realtime: { params: { eventsPerSecond: 10 } },
    });
  }
  return client;
}

export function serverNow(): number {
  return Date.now() + serverOffsetMs;
}

export async function syncServerClock(): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      method: 'HEAD',
      headers: { apikey: SUPABASE_ANON_KEY },
    });
    const dateHeader = res.headers.get('date');
    if (dateHeader) {
      const serverTime = new Date(dateHeader).getTime();
      serverOffsetMs = serverTime - Date.now();
      lastClockSync = Date.now();
      debugLog('sync', 'clock', 'synced', { offsetMs: serverOffsetMs });
    }
  } catch (e) {
    debugLog('warn', 'clock', 'sync failed', String(e));
  }
}

export function shouldResyncClock(): boolean {
  return Date.now() - lastClockSync > 30_000;
}

export function deadlineIn(seconds: number): string {
  return new Date(serverNow() + seconds * 1000).toISOString();
}

export function secondsUntil(deadlineIso: string | null, now = serverNow()): number {
  if (!deadlineIso) return 0;
  return Math.max(0, (new Date(deadlineIso).getTime() - now) / 1000);
}

export function msUntil(deadlineIso: string | null, now = serverNow()): number {
  if (!deadlineIso) return 0;
  return Math.max(0, new Date(deadlineIso).getTime() - now);
}

export async function fetchGame(gameId: string): Promise<Game | null> {
  const { data, error } = await getSupabase()
    .from('games')
    .select('*')
    .eq('id', gameId)
    .maybeSingle();
  if (error) throw error;
  return data as Game | null;
}

export async function fetchPlayers(gameId: string): Promise<Player[]> {
  const { data, error } = await getSupabase()
    .from('players')
    .select('*')
    .eq('game_id', gameId)
    .order('slot', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Player[];
}

export async function updateGame(gameId: string, patch: Partial<Game>): Promise<void> {
  const { error } = await getSupabase().from('games').update(patch).eq('id', gameId);
  if (error) throw error;
}

/** Returns true if this client won the race (expected phase matched). */
export async function updateGameIfPhase(
  gameId: string,
  expectedPhase: string,
  patch: Partial<Game>,
): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from('games')
    .update(patch)
    .eq('id', gameId)
    .eq('phase', expectedPhase)
    .select('id');
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function updateGameIfDeadline(
  gameId: string,
  expectedDeadline: string,
  patch: Partial<Game>,
): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from('games')
    .update(patch)
    .eq('id', gameId)
    .eq('phase_deadline', expectedDeadline)
    .select('id');
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function updatePlayer(playerId: string, patch: Partial<Player>): Promise<void> {
  const { error } = await getSupabase().from('players').update(patch).eq('id', playerId);
  if (error) throw error;
}

// Per-round reset as ONE atomic statement, not N separate writes. With many
// small parallel writes over a flaky connection, some could silently fail and
// leave a player's previous-round pick in place — which then showed up as a
// "question that answered itself". A single UPDATE ... WHERE game_id either
// resets everyone or throws, so there is no partial state.
export async function resetPlayersForRound(gameId: string): Promise<void> {
  const { error } = await getSupabase()
    .from('players')
    .update({ mc_index: null, transcript: '', correct: null, done: false })
    .eq('game_id', gameId);
  if (error) throw error;
}

export async function resetPlayersScores(gameId: string): Promise<void> {
  const { error } = await getSupabase().from('players').update({ score: 0 }).eq('game_id', gameId);
  if (error) throw error;
}

export async function resetPlayersRematch(gameId: string): Promise<void> {
  const { error } = await getSupabase()
    .from('players')
    .update({ rematch: false })
    .eq('game_id', gameId);
  if (error) throw error;
}

function nextFreeSlot(players: Player[], asHost: boolean): number | null {
  if (asHost) {
    const hostTaken = players.some((p) => p.slot === 0);
    return hostTaken ? null : 0;
  }
  const taken = new Set(players.map((p) => p.slot));
  for (let slot = 1; slot < MAX_PLAYERS; slot++) {
    if (!taken.has(slot)) return slot;
  }
  return null;
}

/**
 * Take or reattach a seat. Returns null if game full or host seat taken.
 * Role comes from slot (0=host), not from who created the game row.
 */
export async function joinGame(
  gameId: string,
  clientId: string,
  name: string,
  asHost: boolean,
): Promise<Player | null> {
  const supabase = getSupabase();
  const players = await fetchPlayers(gameId);

  debugLog('game', 'join', 'attempt', { gameId: gameId.slice(0, 8), asHost, name });

  const existing = players.find((p) => p.client_id === clientId);
  if (existing) {
    debugLog('game', 'join', 'reattach seat', { slot: existing.slot, role: existing.role });
    if (existing.name !== name.trim()) {
      await updatePlayer(existing.id, { name: name.trim() });
      return { ...existing, name: name.trim() };
    }
    return existing;
  }

  if (players.length >= MAX_PLAYERS) {
    debugLog('warn', 'join', 'game full');
    return null;
  }

  const slot = nextFreeSlot(players, asHost);
  if (slot === null) {
    debugLog('warn', 'join', 'no slot', { asHost });
    return null;
  }

  const role = slot === 0 ? 'host' : 'player';
  const { data, error } = await supabase
    .from('players')
    .insert({
      game_id: gameId,
      client_id: clientId,
      name: name.trim(),
      role,
      slot,
      score: 0,
      mc_index: null,
      transcript: '',
      correct: null,
      done: false,
      rematch: false,
    })
    .select('*')
    .single();

  if (error) {
    debugLog('error', 'join', 'insert failed', {
      code: error.code,
      message: error.message,
    });
    if (error.code === '23505') {
      const refreshed = await fetchPlayers(gameId);
      return refreshed.find((p) => p.client_id === clientId) ?? null;
    }
    throw error;
  }

  debugLog('game', 'join', 'new seat', { slot, role });
  return data as Player;
}

export function subscribeToGame(gameId: string, onUpdate: (game: Game) => void): RealtimeChannel {
  return getSupabase()
    .channel(`game:${gameId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
      (payload) => onUpdate(payload.new as Game),
    )
    .subscribe();
}

export function subscribeToPlayers(gameId: string, onChange: () => void): RealtimeChannel {
  return getSupabase()
    .channel(`players:${gameId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameId}` },
      () => onChange(),
    )
    .subscribe();
}

export function hasAnswered(player: Player, mcMode: boolean): boolean {
  if (mcMode) return player.mc_index !== null && player.mc_index !== undefined;
  return player.done === true;
}
