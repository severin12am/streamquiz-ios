/**
 * Camera layout planner — pure, local-only (never synced via Supabase).
 *
 * Schema (portrait iPhone). Tapping any feed cycles `layoutMode`:
 *   2 players:  0 → 1 → 2 → 3 → 4 → 0   (mode 4 = letterbox)
 *   3–6:        0 → 1 → 2 → 3 → 0       (letterbox skipped)
 *   1 (alone):  no cycle (full-screen self)
 *
 *   0  you in PiP (top-right)      · all others on stage (grid)
 *   1  pipOther in PiP (top-right) · you + remaining others on stage
 *   2  you top 50%                 · all others bottom 50%
 *   3  all others top 50%          · you bottom 50%
 *   4  letterbox (2p only)         · you + other, equal, middle band, no PiP
 *
 * Hard rules: at most ONE PiP, top-right only; letterbox is 2-player only.
 */
import type { Player } from './types';

export type LayoutPlan =
  | { kind: 'grid'; stage: Player[]; pip: Player | null }
  | { kind: 'split'; topHalf: Player[]; bottomHalf: Player[] }
  | { kind: 'letterbox'; pair: Player[] };

/** Number of distinct layout modes for a given player count. */
export function layoutModeCount(playerCount: number): number {
  return playerCount === 2 ? 5 : 4;
}

/** Portrait stage grid columns: ≤2 tiles stack in 1 column, 3+ use 2 columns. */
export function stageGridColumns(n: number): number {
  return n <= 2 ? 1 : 2;
}

export function planLayout(me: Player, players: Player[], layoutMode: number): LayoutPlan {
  const others = players.filter((p) => p.id !== me.id).sort((a, b) => a.slot - b.slot);

  // Alone (lobby / solo): full-screen self, nothing to cycle.
  if (others.length === 0) {
    return { kind: 'grid', stage: [me], pip: null };
  }

  const modeCount = layoutModeCount(players.length);
  const mode = ((layoutMode % modeCount) + modeCount) % modeCount;

  // Lowest-slot remote is the only peer ever eligible for the PiP.
  const pipOther = others[0];
  const stageWithoutPipOther = [me, ...others.slice(1)];

  switch (mode) {
    case 0:
      return { kind: 'grid', stage: others, pip: me };
    case 1:
      return {
        kind: 'grid',
        stage: others.length === 1 ? [me] : stageWithoutPipOther,
        pip: pipOther,
      };
    case 2:
      return { kind: 'split', topHalf: [me], bottomHalf: others };
    case 3:
      return { kind: 'split', topHalf: others, bottomHalf: [me] };
    case 4:
      if (players.length !== 2) return { kind: 'grid', stage: others, pip: me };
      return { kind: 'letterbox', pair: [...players].sort((a, b) => a.slot - b.slot) };
    default:
      return { kind: 'grid', stage: others, pip: me };
  }
}
