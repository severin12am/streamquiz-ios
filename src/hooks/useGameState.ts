/**
 * Game state machine — heart of WhoSmarter iOS.
 *
 * Spec: PROJECT.md §7 (state machine), ios_implementation_help.md §9.
 * Tests: src/__tests__/parity.test.ts (constants + roundStartPatch only).
 *
 * Rules (do not break without updating web + tests):
 * - Any client may drive phase transitions when deadlines expire (not host-only).
 * - Use updateGameIfPhase / updateGameIfDeadline for guarded writes — prevents double scoring.
 * - Timing constants must match web exactly (exported at top of this file).
 * - me = player where client_id matches; each client writes only its own players row.
 *
 * Flow: load game → Realtime + 2.5s poll → 100ms ticker → deadline/early-advance logic.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { checkAnswer } from '@/api/client';
import { getMcOptionText, isMcAnswerCorrect, sanitizeMcQuestion } from '@/lib/mc-utils';
import {
  deadlineIn,
  fetchGame,
  fetchPlayers,
  hasAnswered,
  joinGame,
  msUntil,
  resetPlayersForRound,
  resetPlayersRematch,
  resetPlayersScores,
  secondsUntil,
  serverNow,
  shouldResyncClock,
  subscribeToGame,
  subscribeToPlayers,
  syncServerClock,
  updateGame,
  updateGameIfDeadline,
  updateGameIfPhase,
  updatePlayer,
} from '@/lib/supabase';
import { debugLog } from '@/lib/debug-log';
import type { Game, Player, Question } from '@/lib/types';

// MARK: - Parity timing constants (must match web hooks/useGameState.ts)

export const THINK_TIME_SECONDS = 5;
export const QUESTION_TIME_SECONDS = 15;
export const VOICE_ANSWER_SECONDS = 12;
export const RESULT_TIME_SECONDS = 5;
export const CHECK_TIMEOUT_SECONDS = 15;
export const FIRST_ANSWER_GRACE_SECONDS = 4;

export const POLL_INTERVAL_MS = 2500;
export const TICK_INTERVAL_MS = 100;
export const MAX_INIT_ATTEMPTS = 5;
export const INIT_RETRY_DELAY_MS = 1200;

// MARK: - Pure phase patches (unit-tested; used by startGame + advanceToNext)

/** First phase after host starts or after advancing to next question. */
export function roundStartPatch(game: Game): Partial<Game> {
  const q = game.questions[game.current_question_index];
  const sanitized = game.mc_mode && q ? { ...game, questions: sanitizeQuestions(game) } : game;
  const currentQ = sanitized.questions[sanitized.current_question_index];

  if (sanitized.game_mode === 'think') {
    return {
      phase: 'thinking',
      phase_deadline: deadlineIn(THINK_TIME_SECONDS),
      answer_correct: null,
      last_points: null,
    };
  }

  if (sanitized.mc_mode) {
    return {
      phase: 'question',
      phase_deadline: deadlineIn(QUESTION_TIME_SECONDS),
      answer_correct: null,
      last_points: null,
    };
  }

  return {
    phase: 'answering',
    phase_deadline: deadlineIn(VOICE_ANSWER_SECONDS),
    answer_correct: null,
    last_points: null,
  };
}

function sanitizeQuestions(game: Game): Question[] {
  return game.questions.map((q) => (q.options ? sanitizeMcQuestion(q) : q));
}

/** Transition when think-race countdown ends. */
export function afterThinkPatch(game: Game): Partial<Game> {
  if (game.mc_mode) {
    return {
      phase: 'question',
      phase_deadline: deadlineIn(QUESTION_TIME_SECONDS),
    };
  }
  return {
    phase: 'answering',
    phase_deadline: deadlineIn(VOICE_ANSWER_SECONDS),
  };
}

interface UseGameStateResult {
  game: Game | null;
  players: Player[];
  me: Player | null;
  loading: boolean;
  error: string | null;
  timeLeft: number;
  timeLeftMs: number;
  currentQuestion: Question | null;
  join: (name: string, asHost: boolean) => Promise<Player | null>;
  startGame: () => Promise<void>;
  submitMCAnswer: (index: number) => Promise<void>;
  updateTranscript: (text: string) => Promise<void>;
  finishAnswer: (text?: string) => Promise<void>;
  voteRematch: () => Promise<void>;
  rematch: (questions?: Question[]) => Promise<void>;
}

// MARK: - useGameState hook

export function useGameState(gameId: string, clientId: string): UseGameStateResult {
  const [game, setGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const gameRef = useRef<Game | null>(null);
  const playersRef = useRef<Player[]>([]);
  const meRef = useRef<Player | null>(null);
  const resolvingRef = useRef(false);
  const checkingRef = useRef(false);

  gameRef.current = game;
  playersRef.current = players;
  const me = useMemo(
    () => players.find((p) => p.client_id === clientId) ?? null,
    [players, clientId],
  );
  meRef.current = me;

  const currentQuestion = useMemo(() => {
    if (!game) return null;
    return game.questions[game.current_question_index] ?? null;
  }, [game]);

  const timeLeftMs = useMemo(() => {
    void tick;
    return msUntil(game?.phase_deadline ?? null);
  }, [game?.phase_deadline, tick]);

  const timeLeft = useMemo(() => {
    void tick;
    return secondsUntil(game?.phase_deadline ?? null);
  }, [game?.phase_deadline, tick]);

  const refreshPlayers = useCallback(async () => {
    const list = await fetchPlayers(gameId);
    setPlayers(list);
  }, [gameId]);

  const loadInitial = useCallback(async () => {
    for (let attempt = 1; attempt <= MAX_INIT_ATTEMPTS; attempt++) {
      try {
        await syncServerClock();
        const g = await fetchGame(gameId);
        if (!g) {
          setError('not_found');
          setLoading(false);
          return;
        }
        const list = await fetchPlayers(gameId);
        setGame(g);
        setPlayers(list);
        setError(null);
        debugLog('game', 'load', 'ok', {
          phase: g.phase,
          status: g.status,
          players: list.length,
        });
        setLoading(false);
        return;
      } catch (e) {
        debugLog('warn', 'load', `attempt ${attempt} failed`, String(e));
        if (attempt === MAX_INIT_ATTEMPTS) {
          setError('load_failed');
          debugLog('error', 'load', 'gave up after retries');
          setLoading(false);
          return;
        }
        await new Promise((r) => setTimeout(r, INIT_RETRY_DELAY_MS));
      }
    }
  }, [gameId]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  const lastPhaseRef = useRef<string | null>(null);
  useEffect(() => {
    if (!game) return;
    const key = `${game.status}:${game.phase}:${game.current_question_index}`;
    if (lastPhaseRef.current === key) return;
    lastPhaseRef.current = key;
    debugLog('game', 'phase', key, {
      deadline: game.phase_deadline,
      timeLeftMs: msUntil(game.phase_deadline),
    });
  }, [game]);

  useEffect(() => {
    const gameChannel = subscribeToGame(gameId, (g) => setGame(g));
    const playersChannel = subscribeToPlayers(gameId, () => {
      void refreshPlayers();
    });

    const poll = setInterval(() => {
      void (async () => {
        try {
          const g = await fetchGame(gameId);
          if (g) setGame(g);
          await refreshPlayers();
        } catch {
          // ignore polling errors
        }
      })();
    }, POLL_INTERVAL_MS);

    return () => {
      gameChannel.unsubscribe();
      playersChannel.unsubscribe();
      clearInterval(poll);
    };
  }, [gameId, refreshPlayers]);

  useEffect(() => {
    const id = setInterval(() => {
      setTick((t) => t + 1);
      if (shouldResyncClock()) void syncServerClock();
    }, TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // MARK: Phase handlers (called by ticker)

  const resolveMcRound = useCallback(async () => {
    if (resolvingRef.current) return;
    resolvingRef.current = true;
    try {
      const g = gameRef.current;
      if (!g || g.phase !== 'question') return;

      const won = await updateGameIfPhase(g.id, 'question', {
        phase: 'result',
        phase_deadline: deadlineIn(RESULT_TIME_SECONDS),
      });
      if (!won) return;

      const list = await fetchPlayers(g.id);
      const question = g.questions[g.current_question_index];
      const correctAnswer = question?.correct_answer ?? '';

      let anyCorrect = false;
      await Promise.all(
        list.map(async (p) => {
          const chosen =
            p.mc_index !== null && p.mc_index !== undefined
              ? getMcOptionText(question, p.mc_index)
              : null;
          const isCorrect = chosen ? isMcAnswerCorrect(chosen, correctAnswer) : false;
          if (isCorrect) anyCorrect = true;
          await updatePlayer(p.id, {
            correct: isCorrect,
            score: isCorrect ? p.score + 1 : p.score,
          });
        }),
      );

      await updateGame(g.id, {
        answer_correct: anyCorrect,
        last_points: anyCorrect ? 1 : 0,
      });
      await refreshPlayers();
    } finally {
      resolvingRef.current = false;
    }
  }, [refreshPlayers]);

  const runVoiceCheck = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    try {
      const g = gameRef.current;
      if (!g || g.phase !== 'checking') return;

      const list = await fetchPlayers(g.id);
      const question = g.questions[g.current_question_index];
      if (!question) return;

      let anyCorrect = false;
      await Promise.all(
        list.map(async (p) => {
          const transcript = (p.transcript ?? '').trim();
          if (!transcript) {
            await updatePlayer(p.id, { correct: false });
            return;
          }
          const result = await checkAnswer({
            question: question.question,
            correct_answer: question.correct_answer ?? '',
            accepted_answers: question.accepted_answers,
            transcript,
          });
          if (result.correct) anyCorrect = true;
          await updatePlayer(p.id, {
            correct: result.correct,
            score: result.correct ? p.score + 1 : p.score,
          });
        }),
      );

      const won = await updateGameIfPhase(g.id, 'checking', {
        phase: 'result',
        phase_deadline: deadlineIn(RESULT_TIME_SECONDS),
        answer_correct: anyCorrect,
        last_points: anyCorrect ? 1 : 0,
      });
      if (won) await refreshPlayers();
    } finally {
      checkingRef.current = false;
    }
  }, [refreshPlayers]);

  const advanceToNext = useCallback(async () => {
    const g = gameRef.current;
    if (!g || g.phase !== 'result') return;

    const nextIndex = g.current_question_index + 1;
    if (nextIndex >= g.num_questions) {
      await updateGameIfPhase(g.id, 'result', {
        phase: 'ended',
        status: 'ended',
        phase_deadline: null,
      });
      return;
    }

    await resetPlayersForRound(g.id);
    const won = await updateGameIfPhase(g.id, 'result', {
      current_question_index: nextIndex,
      ...roundStartPatch({ ...g, current_question_index: nextIndex }),
    });
    if (won) await refreshPlayers();
  }, [refreshPlayers]);

  /**
   * First-answer grace (both game modes): when any player answers during question/answering,
   * shrink phase_deadline so at most FIRST_ANSWER_GRACE_SECONDS (4s) remain for others.
   * Web "first answer" mode = classic (no thinking phase); think race adds 5s thinking first.
   */
  const maybeShrinkDeadline = useCallback(async () => {
    const g = gameRef.current;
    const list = playersRef.current;
    if (!g?.phase_deadline) return;
    if (g.phase !== 'question' && g.phase !== 'answering') return;

    const someoneAnswered = list.some((p) => hasAnswered(p, g.mc_mode));
    if (!someoneAnswered) return;

    const remaining = msUntil(g.phase_deadline);
    const graceMs = FIRST_ANSWER_GRACE_SECONDS * 1000;
    if (remaining <= graceMs) return;

    const newDeadline = new Date(serverNow() + graceMs).toISOString();
    await updateGameIfDeadline(g.id, g.phase_deadline, { phase_deadline: newDeadline });
  }, []);

  const maybeEarlyAdvance = useCallback(async () => {
    const g = gameRef.current;
    const list = playersRef.current;
    if (!g || list.length === 0) return;

    if (g.phase === 'question') {
      const allPicked = list.every((p) => p.mc_index !== null && p.mc_index !== undefined);
      if (allPicked) await resolveMcRound();
      return;
    }

    if (g.phase === 'answering') {
      const allDone = list.every((p) => p.done === true);
      if (!allDone) return;
      const won = await updateGameIfPhase(g.id, 'answering', { phase: 'checking', phase_deadline: null });
      if (won) void runVoiceCheck();
    }
  }, [resolveMcRound, runVoiceCheck]);

  // MARK: Ticker — runs every TICK_INTERVAL_MS via `tick` dep; advances phases on deadline

  useEffect(() => {
    const g = game;
    if (!g?.phase_deadline) return;
    if (!['thinking', 'question', 'answering', 'result', 'checking'].includes(g.phase)) return;

    if (msUntil(g.phase_deadline) > 0) {
      void maybeEarlyAdvance();
      return;
    }

    void (async () => {
      switch (g.phase) {
        case 'thinking': {
          await updateGameIfPhase(g.id, 'thinking', afterThinkPatch(g));
          break;
        }
        case 'question': {
          await resolveMcRound();
          break;
        }
        case 'answering': {
          const won = await updateGameIfPhase(g.id, 'answering', { phase: 'checking', phase_deadline: null });
          if (won) await runVoiceCheck();
          break;
        }
        case 'checking': {
          await updateGameIfPhase(g.id, 'checking', {
            phase: 'result',
            phase_deadline: deadlineIn(RESULT_TIME_SECONDS),
            answer_correct: false,
            last_points: 0,
          });
          break;
        }
        case 'result': {
          await advanceToNext();
          break;
        }
        default:
          break;
      }
    })();
  }, [game, tick, resolveMcRound, runVoiceCheck, advanceToNext, maybeEarlyAdvance]);

  useEffect(() => {
    if (game?.phase === 'checking') {
      const started = Date.now();
      const timeout = setInterval(() => {
        if (Date.now() - started > CHECK_TIMEOUT_SECONDS * 1000) {
          void updateGameIfPhase(game.id, 'checking', {
            phase: 'result',
            phase_deadline: deadlineIn(RESULT_TIME_SECONDS),
            answer_correct: false,
          });
        } else {
          void runVoiceCheck();
        }
      }, 500);
      return () => clearInterval(timeout);
    }
  }, [game?.id, game?.phase, runVoiceCheck]);

  // MARK: Player actions (UI calls these)

  const join = useCallback(
    async (name: string, asHost: boolean) => {
      const player = await joinGame(gameId, clientId, name, asHost);
      if (player) await refreshPlayers();
      return player;
    },
    [gameId, clientId, refreshPlayers],
  );

  const startGame = useCallback(async () => {
    const g = gameRef.current;
    const self = meRef.current;
    if (!g || !self || self.role !== 'host' || g.status !== 'waiting') return;

    await resetPlayersScores(g.id);
    const sanitized = g.mc_mode ? sanitizeQuestions(g) : g.questions;
    if (g.mc_mode) {
      await updateGame(g.id, { questions: sanitized });
    }

    await updateGame(g.id, {
      status: 'playing',
      current_question_index: 0,
      ...roundStartPatch({ ...g, current_question_index: 0, questions: sanitized }),
    });
    await resetPlayersForRound(g.id);
    await refreshPlayers();
  }, [refreshPlayers]);

  const submitMCAnswer = useCallback(
    async (index: number) => {
      const g = gameRef.current;
      const self = meRef.current;
      if (!g || !self || g.phase !== 'question') return;
      if (self.mc_index !== null && self.mc_index !== undefined) return;

      await updatePlayer(self.id, { mc_index: index });
      await refreshPlayers();
      void maybeShrinkDeadline();
      void maybeEarlyAdvance();
    },
    [refreshPlayers, maybeShrinkDeadline, maybeEarlyAdvance],
  );

  const updateTranscript = useCallback(
    async (text: string) => {
      const self = meRef.current;
      const g = gameRef.current;
      if (!self || !g || g.phase !== 'answering' || self.done) return;
      await updatePlayer(self.id, { transcript: text });
    },
    [],
  );

  const finishAnswer = useCallback(
    async (text?: string) => {
      const self = meRef.current;
      const g = gameRef.current;
      if (!self || !g || g.phase !== 'answering' || self.done) return;
      const patch: Partial<Player> = { done: true };
      if (text !== undefined) patch.transcript = text;
      await updatePlayer(self.id, patch);
      await refreshPlayers();
      void maybeShrinkDeadline();
      void maybeEarlyAdvance();
    },
    [refreshPlayers, maybeShrinkDeadline, maybeEarlyAdvance],
  );

  const voteRematch = useCallback(async () => {
    const self = meRef.current;
    const g = gameRef.current;
    if (!self || !g || g.phase !== 'ended') return;
    await updatePlayer(self.id, { rematch: true });
    await refreshPlayers();
  }, [refreshPlayers]);

  const rematch = useCallback(
    async (questions?: Question[]) => {
      const g = gameRef.current;
      const self = meRef.current;
      if (!g || !self || self.role !== 'host') return;

      const list = await fetchPlayers(g.id);
      const hostVoted = list.find((p) => p.role === 'host')?.rematch;
      const guestVotes = list.filter((p) => p.role === 'player' && p.rematch).length;
      if (!hostVoted || guestVotes < 1) return;

      const nextQuestions = questions ?? g.questions;
      await resetPlayersRematch(g.id);
      await resetPlayersScores(g.id);
      await updateGame(g.id, {
        questions: nextQuestions,
        status: 'waiting',
        phase: 'waiting',
        phase_deadline: null,
        current_question_index: 0,
        answer_correct: null,
        last_points: null,
      });
      await resetPlayersForRound(g.id);
      await refreshPlayers();
    },
    [refreshPlayers],
  );

  return {
    game,
    players,
    me,
    loading,
    error,
    timeLeft,
    timeLeftMs,
    currentQuestion,
    join,
    startGame,
    submitMCAnswer,
    updateTranscript,
    finishAnswer,
    voteRematch,
    rematch,
  };
}
