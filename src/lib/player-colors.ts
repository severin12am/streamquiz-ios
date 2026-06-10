const COLORS = [
  '#2f7d77',
  '#c45c26',
  '#5b6ee1',
  '#b84d7a',
  '#8b6b3d',
  '#4a8f5c',
];

export function playerColor(slot: number): string {
  return COLORS[slot % COLORS.length] ?? COLORS[0];
}

export function playerInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : '?';
}
