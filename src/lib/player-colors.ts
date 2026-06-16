/** Per-player slot colors — matches web lib/player-colors.ts (lagoon palette). */
export const PLAYER_COLORS = [
  '#2f7d77',
  '#e08a3c',
  '#7b68d6',
  '#d65780',
  '#4f9d57',
  '#3b87bd',
] as const;

export function playerColor(slot: number): string {
  const n = PLAYER_COLORS.length;
  return PLAYER_COLORS[((slot % n) + n) % n];
}

export function playerInitial(name: string): string {
  const trimmed = (name ?? '').trim();
  return trimmed ? trimmed[0].toUpperCase() : '?';
}
