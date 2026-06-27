import { containsProfanity } from '@/lib/profanity';

describe('containsProfanity', () => {
  it('allows clean text', () => {
    expect(containsProfanity('90s movies')).toBe(false);
    expect(containsProfanity('Alice')).toBe(false);
    expect(containsProfanity('Paris')).toBe(false);
  });

  it('blocks obvious profanity', () => {
    expect(containsProfanity('what the fuck')).toBe(true);
    expect(containsProfanity('shit')).toBe(true);
  });

  it('catches basic leet speak', () => {
    expect(containsProfanity('f@ck')).toBe(true);
    expect(containsProfanity('sh1t')).toBe(true);
  });

  it('ignores empty input', () => {
    expect(containsProfanity('')).toBe(false);
    expect(containsProfanity('   ')).toBe(false);
  });
});
