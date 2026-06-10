import { hasAnswered, msUntil, secondsUntil } from '@/lib/supabase';
import { isMcAnswerCorrect, normalizeMcText } from '@/lib/mc-utils';
import { playerColor } from '@/lib/player-colors';
import {
  THINK_TIME_SECONDS,
  QUESTION_TIME_SECONDS,
  FIRST_ANSWER_GRACE_SECONDS,
  POLL_INTERVAL_MS,
  roundStartPatch,
  afterThinkPatch,
} from '@/hooks/useGameState';
import type { Game, Player } from '@/lib/types';

describe('timing constants parity', () => {
  it('matches web app values', () => {
    expect(THINK_TIME_SECONDS).toBe(5);
    expect(QUESTION_TIME_SECONDS).toBe(15);
    expect(FIRST_ANSWER_GRACE_SECONDS).toBe(4);
    expect(POLL_INTERVAL_MS).toBe(2500);
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

  it('think mode starts with thinking phase', () => {
    const patch = roundStartPatch(game);
    expect(patch.phase).toBe('thinking');
    expect(patch.phase_deadline).toBeTruthy();
  });

  it('classic MC skips thinking', () => {
    const patch = roundStartPatch({ ...game, game_mode: 'classic' });
    expect(patch.phase).toBe('question');
  });

  it('after think goes to question for MC', () => {
    const patch = afterThinkPatch(game);
    expect(patch.phase).toBe('question');
  });
});
