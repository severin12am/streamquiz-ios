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
import type { Game, GameMode, Player, Question } from '@/lib/types';

// MARK: - Parity timing constants (must match web hooks/useGameState.ts)

// Answer window is per-game (games.answer_seconds, 5–30, default 20). These
// legacy constants remain the fallback default only — NEVER hardcode them for
// answer-phase deadlines; always go through answerSeconds(game).
export const DEFAULT_ANSWER_SECONDS = 20;
export const MIN_ANSWER_SECONDS = 5;
export const MAX_ANSWER_SECONDS = 30;
export const QUESTION_TIME_SECONDS = DEFAULT_ANSWER_SECONDS;
export const VOICE_ANSWER_SECONDS = DEFAULT_ANSWER_SECONDS;
export const RESULT_TIME_SECONDS = 5;
export const CHECK_TIMEOUT_SECONDS = 15;

// Legacy only — used by 'think' / 'classic' rows, NOT by regular/hardcore.
export const THINK_TIME_SECONDS = 5;
export const FIRST_ANSWER_GRACE_SECONDS = 4;

/** Host-configured answer window (5–30s), falling back to 20 for legacy rows. */
export function answerSeconds(game: Game | null | undefined): number {
  const n = game?.answer_seconds;
  if (typeof n === 'number' && Number.isFinite(n)) {
    return Math.min(MAX_ANSWER_SECONDS, Math.max(MIN_ANSWER_SECONDS, Math.round(n)));
  }
  return DEFAULT_ANSWER_SECONDS;
}

/**
 * True when the player's commit belongs to the CURRENT answer window.
 * Leftover picks from the previous round (old mc_index/done/answered_at that
 * haven't been reset yet) must NOT count, or a fresh round would instantly
 * "resolve itself". 2s slack each side absorbs clock skew / shrink races.
 */
export function answerBelongsToRound(
  p: Player,
  mcMode: boolean,
  deadline: string | null,
  phaseDurationSec: number,
): boolean {
  if (!hasAnswered(p, mcMode)) return false;
  if (!deadline || !p.answered_at) return false;
  const end = new Date(deadline).getTime();
  const start = end - phaseDurationSec * 1000;
  const at = new Date(p.answered_at).getTime();
  return at >= start - 2000 && at <= end + 2000;
}

export const POLL_INTERVAL_MS = 2500;
export const TICK_INTERVAL_MS = 100;
export const MAX_INIT_ATTEMPTS = 5;
export const INIT_RETRY_DELAY_MS = 1200;

/** Legacy timer-shrink behavior: only think/classic cut the deadline on first answer. */
export function shrinksOnFirstAnswer(mode: GameMode): boolean {
  return mode === 'think' || mode === 'classic';
}

/** Hardcore: only the single earliest correct answer scores; answers lock on submit. */
function answeredMs(player: Player): number {
  return player.answered_at ? new Date(player.answered_at).getTime() : Infinity;
}

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
      phase_deadline: deadlineIn(answerSeconds(sanitized)),
      answer_correct: null,
      last_points: null,
    };
  }

  return {
    phase: 'answering',
    phase_deadline: deadlineIn(answerSeconds(sanitized)),
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
      phase_deadline: deadlineIn(answerSeconds(game)),
    };
  }
  return {
    phase: 'answering',
    phase_deadline: deadlineIn(answerSeconds(game)),
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
  // Per-deadline guards (parity with web useGameState): each transition fires
  // at most once per phase_deadline. This is what stops a fresh round from
  // being resolved instantly by a STALE local players list whose picks/done
  // still belong to the previous question (the "question flashed by" bug).
  const actedDeadline = useRef<string | null>(null);
  const earlyDoneRef = useRef<string | null>(null);
  const shrunkDeadline = useRef<string | null>(null);
  // The phase_deadline for which we have observed a roster with NO live answers
  // (per answerBelongsToRound). This proves the per-round reset has landed and
  // the picks/done flags we now see belong to THIS round — not stale leftovers
  // from the previous question. Without it, a fresh round can be resolved (or
  // its timer shrunk) instantly off the previous round's answers, which looks
  // like "the question answered itself". See PROJECT.md §7 (Early advance).
  const freshRosterRound = useRef<string | null>(null);

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

  /**
   * Resolve an MC round — re-fetches the authoritative roster (a Realtime
   * players update may not have landed locally yet) and scores every correct
   * pick. The updateGameIfPhase('question' → ...) compare-and-swap guarantees
   * only one client resolves the round.
   */
  const resolveMcRound = useCallback(
    async (opts?: { requireAllAnswered?: boolean }): Promise<boolean> => {
      if (resolvingRef.current) return false;
      resolvingRef.current = true;
      try {
        const g = gameRef.current;
        if (!g) return false;

        const list = await fetchPlayers(g.id);

        // Early-advance safety: trust the freshly-fetched DB roster, not the
        // local one that triggered us. If it does NOT actually show everyone
        // answered, abort — this is the round-boundary race where the previous
        // round's picks briefly looked like answers for the new question (the
        // "question answered itself" bug). The deadline path passes no opts and
        // always resolves.
        const mcSecs = answerSeconds(g);
        const isLive = (p: Player) =>
          answerBelongsToRound(p, g.mc_mode, g.phase_deadline, mcSecs);

        if (opts?.requireAllAnswered && !list.every(isLive)) {
          debugLog('game', 'resolve', 'abort early MC: roster not all answered', {
            qIndex: g.current_question_index,
            picks: list.map((p) => p.mc_index ?? null),
          });
          return false;
        }

        const question = g.questions[g.current_question_index];
        const correctAnswer = question?.correct_answer ?? '';

        // Only picks committed within the current answer window count for
        // scoring — a leftover pick from the previous round must not score.
        const correctOf = (p: Player): boolean => {
          if (!isLive(p)) return false;
          const chosen =
            p.mc_index !== null && p.mc_index !== undefined
              ? getMcOptionText(question, p.mc_index)
              : null;
          return chosen ? isMcAnswerCorrect(chosen, correctAnswer) : false;
        };
        const anyCorrect = list.some(correctOf);

        // Hardcore: only the single earliest correct answer scores (smallest
        // answered_at among correct players). Every other mode: all correct score.
        const winnerId =
          g.game_mode === 'hardcore'
            ? (list
                .filter(correctOf)
                .sort((a, b) => answeredMs(a) - answeredMs(b))[0]?.id ?? null)
            : null;
        const scoredAny = g.game_mode === 'hardcore' ? winnerId !== null : anyCorrect;

        const won = await updateGameIfPhase(g.id, 'question', {
          phase: 'result',
          phase_deadline: deadlineIn(RESULT_TIME_SECONDS),
          answer_correct: anyCorrect,
          last_points: scoredAny ? 1 : 0,
        });
        if (!won) return false;

        debugLog('game', 'resolve', 'MC resolved', {
          qIndex: g.current_question_index,
          mode: g.game_mode,
          early: Boolean(opts?.requireAllAnswered),
          picks: list.map((p) => p.mc_index ?? null),
        });

        await Promise.all(
          list.map((p) => {
            const isCorrect = correctOf(p);
            // Hardcore awards the point only to the earliest correct player, but
            // still records `correct` on everyone for the reveal UI.
            const earnsPoint = g.game_mode === 'hardcore' ? p.id === winnerId : isCorrect;
            return updatePlayer(p.id, {
              correct: isCorrect,
              score: earnsPoint ? p.score + 1 : p.score,
            });
          }),
        );
        await refreshPlayers();
        return true;
      } finally {
        resolvingRef.current = false;
      }
    },
    [refreshPlayers],
  );

  /**
   * Judge a voice round — re-fetches the game (the local copy may still say
   * 'answering' on the client that just won the guard) and judges every
   * player's transcript independently. Guarded on 'checking'.
   */
  const runVoiceCheck = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    try {
      const g = (await fetchGame(gameId)) ?? gameRef.current;
      if (!g) return;

      const list = await fetchPlayers(g.id);
      const question = g.questions[g.current_question_index];
      if (!question) return;

      const results = await Promise.all(
        list.map(async (p) => {
          const answeredAt = answeredMs(p);
          const transcript = (p.transcript ?? '').trim();
          if (!transcript) return { id: p.id, score: p.score, correct: false, answeredAt };
          try {
            const result = await checkAnswer({
              question: question.question,
              correct_answer: question.correct_answer ?? '',
              accepted_answers: question.accepted_answers,
              transcript,
            });
            return { id: p.id, score: p.score, correct: result.correct, answeredAt };
          } catch {
            return { id: p.id, score: p.score, correct: false, answeredAt };
          }
        }),
      );
      const anyCorrect = results.some((r) => r.correct);

      // Hardcore: only the earliest correct transcript scores.
      const winnerId =
        g.game_mode === 'hardcore'
          ? (results
              .filter((r) => r.correct)
              .sort((a, b) => a.answeredAt - b.answeredAt)[0]?.id ?? null)
          : null;
      const scoredAny = g.game_mode === 'hardcore' ? winnerId !== null : anyCorrect;

      const won = await updateGameIfPhase(g.id, 'checking', {
        phase: 'result',
        phase_deadline: deadlineIn(RESULT_TIME_SECONDS),
        answer_correct: anyCorrect,
        last_points: scoredAny ? 1 : 0,
      });
      if (!won) return;

      await Promise.all(
        results.map((r) => {
          const earnsPoint = g.game_mode === 'hardcore' ? r.id === winnerId : r.correct;
          return updatePlayer(r.id, { correct: r.correct, score: r.score + (earnsPoint ? 1 : 0) });
        }),
      );
      await refreshPlayers();
    } finally {
      checkingRef.current = false;
    }
  }, [gameId, refreshPlayers]);

  /**
   * Advance to the next question (or end). Guarded on 'result'; the guard
   * winner is the ONLY client that resets the per-round player state, and it
   * does so AFTER the question switch wins (web parity) so losers never reset.
   */
  const advanceToNext = useCallback(async () => {
    const g = gameRef.current;
    if (!g) return;

    const nextIndex = g.current_question_index + 1;
    if (nextIndex >= g.num_questions) {
      await updateGameIfPhase(g.id, 'result', {
        phase: 'ended',
        status: 'ended',
        phase_deadline: null,
      });
      return;
    }

    const won = await updateGameIfPhase(g.id, 'result', {
      current_question_index: nextIndex,
      answer_correct: null,
      last_points: null,
      ...roundStartPatch({ ...g, current_question_index: nextIndex }),
    });
    if (won) {
      await resetPlayersForRound(g.id);
      await refreshPlayers();
    }
  }, [refreshPlayers]);

  // MARK: Ticker — single interval reading refs (web parity). Decoupled from
  // React re-renders so a freshly-arrived `game` never fires a transition with
  // a stale players list; the per-deadline guards make each step idempotent.

  useEffect(() => {
    const interval = setInterval(() => {
      void (async () => {
        const g = gameRef.current;
        if (!g) return;
        const roster = playersRef.current;

        // Only count commits that belong to the CURRENT answer window (by
        // answered_at vs phase_deadline). This is the stale-pick guard: leftover
        // picks from the previous round (reset write not landed yet) must not
        // count toward shrink / early-advance / resolve.
        const phaseSecs = answerSeconds(g);
        const liveAnswer = (p: Player) =>
          answerBelongsToRound(p, g.mc_mode, g.phase_deadline, phaseSecs);

        // Round-ready gate: a new deadline becomes eligible for early-advance
        // only after we have observed the roster with NO live answers for that
        // deadline. Keyed on the deadline itself (parity with web).
        const inAnswerablePhase = g.phase === 'question' || g.phase === 'answering';
        if (inAnswerablePhase && g.phase_deadline && !roster.some(liveAnswer)) {
          freshRosterRound.current = g.phase_deadline;
        }
        const roundReady =
          inAnswerablePhase && freshRosterRound.current === g.phase_deadline;

        // First-answer race (LEGACY think/classic only): once ANY player answers,
        // cut remaining time to the grace window for everyone else. regular and
        // hardcore keep the full fixed timer — no shrink. CAS on the deadline +
        // a per-deadline guard ensure this fires once per round only.
        if (
          inAnswerablePhase &&
          shrinksOnFirstAnswer(g.game_mode) &&
          roundReady &&
          g.phase_deadline &&
          shrunkDeadline.current !== g.phase_deadline &&
          roster.some(liveAnswer) &&
          msUntil(g.phase_deadline) > (FIRST_ANSWER_GRACE_SECONDS + 0.4) * 1000
        ) {
          shrunkDeadline.current = g.phase_deadline;
          await updateGameIfDeadline(g.id, g.phase_deadline, {
            phase_deadline: deadlineIn(FIRST_ANSWER_GRACE_SECONDS),
          });
          return;
        }

        // Early advance: everyone answered before the timer ends. Requires a
        // confirmed round-ready deadline (see above) so a stale roster from the
        // previous round can't trigger it.
        const everyoneAnswered =
          roundReady && roster.length > 0 && roster.every(liveAnswer);

        if (g.phase === 'question' && everyoneAnswered && earlyDoneRef.current !== g.phase_deadline) {
          earlyDoneRef.current = g.phase_deadline;
          const resolved = await resolveMcRound({ requireAllAnswered: true });
          // DB said not everyone actually answered (round-boundary race) — clear
          // the guard so a genuine "all answered" moment can still resolve early.
          if (!resolved) earlyDoneRef.current = null;
          return;
        }
        if (g.phase === 'answering' && everyoneAnswered && earlyDoneRef.current !== g.phase_deadline) {
          earlyDoneRef.current = g.phase_deadline;
          // Confirm against the authoritative DB roster before ending the round,
          // counting only commits within the current answer window.
          const fresh = await fetchPlayers(g.id);
          const answeringSecs = answerSeconds(g);
          if (
            !fresh.every((p) =>
              answerBelongsToRound(p, false, g.phase_deadline, answeringSecs),
            )
          ) {
            earlyDoneRef.current = null;
            return;
          }
          const won = await updateGameIfPhase(g.id, 'answering', {
            phase: 'checking',
            phase_deadline: deadlineIn(CHECK_TIMEOUT_SECONDS),
          });
          if (won) void runVoiceCheck();
          return;
        }

        // Deadline-driven transitions.
        if (!g.phase_deadline) return;
        if (!['thinking', 'question', 'answering', 'result', 'checking'].includes(g.phase)) return;
        if (new Date(g.phase_deadline).getTime() > serverNow()) return;
        if (actedDeadline.current === g.phase_deadline) return;
        actedDeadline.current = g.phase_deadline;

        try {
          switch (g.phase) {
            case 'thinking':
              await updateGameIfPhase(g.id, 'thinking', afterThinkPatch(g));
              break;
            case 'question':
              await resolveMcRound();
              break;
            case 'answering': {
              const won = await updateGameIfPhase(g.id, 'answering', {
                phase: 'checking',
                phase_deadline: deadlineIn(CHECK_TIMEOUT_SECONDS),
              });
              if (won) void runVoiceCheck();
              break;
            }
            case 'checking':
              // Safety net: the judge client vanished mid-check.
              await updateGameIfPhase(g.id, 'checking', {
                phase: 'result',
                phase_deadline: deadlineIn(RESULT_TIME_SECONDS),
                answer_correct: false,
                last_points: 0,
              });
              break;
            case 'result':
              await advanceToNext();
              break;
          }
        } catch (err) {
          debugLog('error', 'tick', 'transition failed', String(err));
          actedDeadline.current = null;
        }
      })();
    }, TICK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [resolveMcRound, runVoiceCheck, advanceToNext]);

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
      // Rule R1: permanently unlist so rematch cannot reappear in Browse.
      is_public: false,
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

      const alreadyPicked = self.mc_index !== null && self.mc_index !== undefined;
      // Regular ("every answer counts") lets you change your pick until the timer
      // ends. Hardcore (and legacy modes) lock on the first tap.
      if (alreadyPicked && g.game_mode !== 'regular') return;

      const patch: Partial<Player> = { mc_index: index };
      // Stamp answered_at on the FIRST pick only, using the synced server clock.
      if (!alreadyPicked) {
        patch.answered_at = new Date(serverNow()).toISOString();
      }
      await updatePlayer(self.id, patch);
      await refreshPlayers();
    },
    [refreshPlayers],
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
      // Stamp answered_at on the single commit (if not already set), synced clock.
      if (!self.answered_at) {
        patch.answered_at = new Date(serverNow()).toISOString();
      }
      await updatePlayer(self.id, patch);
      await refreshPlayers();
    },
    [refreshPlayers],
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
