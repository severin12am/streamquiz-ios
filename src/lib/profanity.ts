/**
 * Simple client-side profanity filter for user-entered text (topic, name, answers).
 * Not exhaustive — blocks common English slurs/profanity and basic leet substitutions.
 */

const BLOCKED = new Set([
  'asshole',
  'bastard',
  'bitch',
  'bollocks',
  'bullshit',
  'cock',
  'cunt',
  'dick',
  'fag',
  'faggot',
  'fuck',
  'fucker',
  'fucking',
  'motherfucker',
  'nigga',
  'nigger',
  'piss',
  'pussy',
  'shit',
  'shitty',
  'slut',
  'twat',
  'whore',
  'wanker',
]);

function normalize(raw: string, atAs: 'a' | 'u' = 'a'): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/@/g, atAs)
    .replace(/[$]/g, 's')
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't');
}

function tokens(text: string, atAs: 'a' | 'u'): string[] {
  return normalize(text, atAs).split(/[^a-z]+/).filter(Boolean);
}

function matchesBlocklist(text: string, atAs: 'a' | 'u'): boolean {
  for (const token of tokens(text, atAs)) {
    if (BLOCKED.has(token)) return true;
  }

  const compact = normalize(text, atAs).replace(/[^a-z]/g, '');
  for (const word of BLOCKED) {
    if (word.length >= 4 && compact.includes(word)) return true;
  }

  return false;
}

/** Returns true when text contains a blocked word (whole token or embedded ≥4 chars). */
export function containsProfanity(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return matchesBlocklist(trimmed, 'a') || matchesBlocklist(trimmed, 'u');
}
