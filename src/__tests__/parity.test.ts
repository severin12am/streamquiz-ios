/**
 * Unit tests for parity-critical pure functions.
 * Run before device testing: npm test
 * Does NOT cover WebRTC, speech, or full state machine integration.
 */
import { hasAnswered, msUntil, secondsUntil } from '@/lib/supabase';
import { isMcAnswerCorrect, normalizeMcText } from '@/lib/mc-utils';
import { playerColor } from '@/lib/player-colors';
import {
  THINK_TIME_SECONDS,
  QUESTION_TIME_SECONDS,
  VOICE_ANSWER_SECONDS,
  RESULT_TIME_SECONDS,
  FIRST_ANSWER_GRACE_SECONDS,
  POLL_INTERVAL_MS,
  DEFAULT_ANSWER_SECONDS,
  MIN_ANSWER_SECONDS,
  MAX_ANSWER_SECONDS,
  answerSeconds,
  answerBelongsToRound,
  roundStartPatch,
  afterThinkPatch,
  shrinksOnFirstAnswer,
} from '@/hooks/useGameState';
import type { Game, Player } from '@/lib/types';

describe('timing constants parity', () => {
  it('matches web app values', () => {
    expect(QUESTION_TIME_SECONDS).toBe(20);
    expect(VOICE_ANSWER_SECONDS).toBe(20);
    expect(RESULT_TIME_SECONDS).toBe(5);
    expect(POLL_INTERVAL_MS).toBe(2500);
  });

  it('keeps legacy think/classic constants', () => {
    expect(THINK_TIME_SECONDS).toBe(5);
    expect(FIRST_ANSWER_GRACE_SECONDS).toBe(4);
  });
});

describe('answerSeconds', () => {
  const g = (answer_seconds?: number): Game =>
    ({ answer_seconds } as unknown as Game);

  it('defaults to 20 when absent or invalid', () => {
    expect(DEFAULT_ANSWER_SECONDS).toBe(20);
    expect(answerSeconds(null)).toBe(20);
    expect(answerSeconds(undefined)).toBe(20);
    expect(answerSeconds(g(undefined))).toBe(20);
    expect(answerSeconds(g(NaN))).toBe(20);
  });

  it('clamps to 5–30', () => {
    expect(MIN_ANSWER_SECONDS).toBe(5);
    expect(MAX_ANSWER_SECONDS).toBe(30);
    expect(answerSeconds(g(3))).toBe(5);
    expect(answerSeconds(g(99))).toBe(30);
    expect(answerSeconds(g(12))).toBe(12);
    expect(answerSeconds(g(12.6))).toBe(13);
  });
});

describe('answerBelongsToRound (stale-pick guard)', () => {
  const player = (over: Partial<Player>): Player =>
    ({
      id: '1',
      game_id: 'g',
      client_id: 'c',
      name: 'A',
      role: 'player',
      slot: 1,
      score: 0,
      mc_index: null,
      transcript: null,
      correct: null,
      done: null,
      rematch: null,
      answered_at: null,
      ...over,
    } as Player);

  const end = Date.parse('2026-01-01T00:00:20.000Z'); // deadline
  const deadline = new Date(end).toISOString();
  const at = (ms: number) => new Date(end + ms).toISOString();

  it('returns false when the player has not answered', () => {
    expect(answerBelongsToRound(player({}), true, deadline, 20)).toBe(false);
  });

  it('counts a pick made inside the current window', () => {
    // answered 15s before the deadline, window is 20s → inside
    const p = player({ mc_index: 2, answered_at: at(-15000) });
    expect(answerBelongsToRound(p, true, deadline, 20)).toBe(true);
  });

  it('rejects a leftover pick from a previous round', () => {
    // answered 30s before this deadline, window is 20s → outside
    const p = player({ mc_index: 2, answered_at: at(-30000) });
    expect(answerBelongsToRound(p, true, deadline, 20)).toBe(false);
  });

  it('requires answered_at and a deadline', () => {
    expect(answerBelongsToRound(player({ mc_index: 1 }), true, deadline, 20)).toBe(false);
    expect(
      answerBelongsToRound(player({ mc_index: 1, answered_at: at(-5000) }), true, null, 20),
    ).toBe(false);
  });

  it('honors voice done with answered_at', () => {
    const p = player({ done: true, answered_at: at(-5000) });
    expect(answerBelongsToRound(p, false, deadline, 20)).toBe(true);
  });
});

describe('shrinksOnFirstAnswer', () => {
  it('only legacy modes shrink the timer', () => {
    expect(shrinksOnFirstAnswer('think')).toBe(true);
    expect(shrinksOnFirstAnswer('classic')).toBe(true);
    expect(shrinksOnFirstAnswer('regular')).toBe(false);
    expect(shrinksOnFirstAnswer('hardcore')).toBe(false);
  });
});

describe('deadline helpers', () => {
  it('secondsUntil counts down', () => {
    const now = Date.now();
    const deadline = new Date(now + 5000).toISOString();
    const left = secondsUntil(deadline, now);
    expect(left).toBeGreaterThan(4.9);
    expect(left).toBeLessThanOrEqual(5);
  });

  it('msUntil returns milliseconds', () => {
    const now = Date.now();
    const deadline = new Date(now + 2500).toISOString();
    expect(msUntil(deadline, now)).toBe(2500);
  });
});

describe('mc-utils', () => {
  it('normalizes and compares answers', () => {
    expect(isMcAnswerCorrect('Paris', 'paris')).toBe(true);
    expect(normalizeMcText('  Hello! ')).toBe('hello');
  });
});

describe('player colors', () => {
  it('returns stable slot colors', () => {
    expect(playerColor(0)).toBe('#2f7d77');
    expect(playerColor(5)).toBeTruthy();
  });
});

describe('hasAnswered', () => {
  const base: Player = {
    id: '1',
    game_id: 'g',
    client_id: 'c',
    name: 'A',
    role: 'player',
    slot: 1,
    score: 0,
    mc_index: null,
    transcript: null,
    correct: null,
    done: null,
    rematch: null,
    answered_at: null,
  };

  it('detects MC pick', () => {
    expect(hasAnswered({ ...base, mc_index: 2 }, true)).toBe(true);
    expect(hasAnswered(base, true)).toBe(false);
  });

  it('detects voice done', () => {
    expect(hasAnswered({ ...base, done: true }, false)).toBe(true);
  });
});

describe('round patches', () => {
  const game: Game = {
    id: 'g',
    topic: 'test',
    difficulty: 'medium',
    num_questions: 5,
    mc_mode: true,
    cameras_enabled: false,
    game_mode: 'think',
    questions: [
      {
        question: 'Q?',
        options: ['A', 'B', 'C', 'D'],
        correct_answer: 'A',
      },
    ],
    status: 'playing',
    current_question_index: 0,
    phase: 'waiting',
    phase_deadline: null,
    answer_correct: null,
    last_points: null,
  };

  it('regular MC goes straight to question (no thinking)', () => {
    const patch = roundStartPatch({ ...game, game_mode: 'regular' });
    expect(patch.phase).toBe('question');
    expect(patch.phase_deadline).toBeTruthy();
  });

  it('hardcore MC goes straight to question (no thinking)', () => {
    const patch = roundStartPatch({ ...game, game_mode: 'hardcore' });
    expect(patch.phase).toBe('question');
  });

  it('regular voice goes straight to answering', () => {
    const voiceGame = { ...game, mc_mode: false };
    const patch = roundStartPatch({ ...voiceGame, game_mode: 'regular' });
    expect(patch.phase).toBe('answering');
  });

  it('hardcore voice goes straight to answering', () => {
    const voiceGame = { ...game, mc_mode: false };
    const patch = roundStartPatch({ ...voiceGame, game_mode: 'hardcore' });
    expect(patch.phase).toBe('answering');
  });

  it('legacy think mode still starts with thinking phase', () => {
    const patch = roundStartPatch({ ...game, game_mode: 'think' });
    expect(patch.phase).toBe('thinking');
    expect(patch.phase_deadline).toBeTruthy();
  });

  it('MC question deadline honors per-game answer_seconds', () => {
    const before = Date.now();
    const patch = roundStartPatch({ ...game, game_mode: 'regular', answer_seconds: 8 });
    const secs = (Date.parse(patch.phase_deadline as string) - before) / 1000;
    expect(secs).toBeGreaterThan(7);
    expect(secs).toBeLessThanOrEqual(9);
  });

  it('voice deadline defaults to 20s when answer_seconds absent', () => {
    const before = Date.now();
    const patch = roundStartPatch({ ...game, mc_mode: false, game_mode: 'regular' });
    const secs = (Date.parse(patch.phase_deadline as string) - before) / 1000;
    expect(secs).toBeGreaterThan(18);
    expect(secs).toBeLessThanOrEqual(21);
  });

  it('after think goes to question for MC', () => {
    const patch = afterThinkPatch({ ...game, game_mode: 'think' });
    expect(patch.phase).toBe('question');
  });
});
