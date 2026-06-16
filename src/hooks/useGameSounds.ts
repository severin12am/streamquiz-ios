/**
 * Play SFX in response to live game events — port of web hooks/useGameSounds.ts.
 */
import { useEffect, useRef } from 'react';
import { playSound } from '@/lib/sounds';
import type { Game, Player } from '@/lib/types';

interface UseGameSoundsOptions {
  game: Game | null;
  players: Player[];
  me: Player | null;
  timeLeft: number;
}

function hasAnswered(p: Player, mcMode: boolean): boolean {
  return mcMode ? p.mc_index !== null : Boolean(p.done);
}

export function useGameSounds({ game, players, me, timeLeft }: UseGameSoundsOptions): void {
  const ready = useRef(false);
  const prevPhase = useRef<string | null>(null);
  const prevStatus = useRef<string | null>(null);
  const prevQuestionIndex = useRef<number>(-1);
  const prevPlayerIds = useRef<Set<string>>(new Set());
  const prevAnswered = useRef<Record<string, boolean>>({});
  const prevScores = useRef<Record<string, number>>({});
  const prevCorrect = useRef<boolean | null>(null);
  const prevRematchVote = useRef(false);
  const lastTickSecond = useRef<number | null>(null);

  useEffect(() => {
    if (!game || !me) return;

    const mcMode = game.mc_mode;
    const answeredNow: Record<string, boolean> = {};
    for (const p of players) {
      answeredNow[p.id] = hasAnswered(p, mcMode);
    }

    if (!ready.current) {
      ready.current = true;
      prevPhase.current = game.phase;
      prevStatus.current = game.status;
      prevQuestionIndex.current = game.current_question_index;
      prevPlayerIds.current = new Set(players.map((p) => p.id));
      prevAnswered.current = answeredNow;
      prevScores.current = Object.fromEntries(players.map((p) => [p.id, p.score]));
      prevCorrect.current = me.correct;
      prevRematchVote.current = me.rematch ?? false;
      return;
    }

    const playerIds = new Set(players.map((p) => p.id));
    for (const id of playerIds) {
      if (!prevPlayerIds.current.has(id)) {
        playSound('join');
        break;
      }
    }
    prevPlayerIds.current = playerIds;

    if (prevStatus.current === 'waiting' && game.status === 'playing') {
      playSound('start');
    }
    prevStatus.current = game.status;

    if (
      game.status === 'playing' &&
      game.current_question_index > prevQuestionIndex.current &&
      prevQuestionIndex.current >= 0
    ) {
      playSound('nextRound');
    }
    prevQuestionIndex.current = game.current_question_index;

    const phase = game.phase;
    const oldPhase = prevPhase.current;
    if (phase !== oldPhase) {
      if (oldPhase === 'thinking' && (phase === 'question' || phase === 'answering')) {
        playSound('go');
      }
      if (phase === 'result' && oldPhase !== 'result') {
        playSound('reveal');
      }
      if (phase === 'ended' && oldPhase !== 'ended') {
        const ranked = [...players].sort((a, b) => b.score - a.score || a.slot - b.slot);
        const topScore = ranked[0]?.score ?? 0;
        const winners = ranked.filter((p) => p.score === topScore && topScore > 0);
        if (topScore === 0 || winners.length !== 1) {
          playSound('tie');
        } else {
          playSound('winner');
        }
      }
      prevPhase.current = phase;
      lastTickSecond.current = null;
    }

    for (const p of players) {
      const was = prevAnswered.current[p.id] ?? false;
      const now = answeredNow[p.id];
      if (!was && now) {
        if (p.id === me.id) {
          playSound('answerSelf');
        } else {
          playSound('answerOther');
        }
      }
    }
    prevAnswered.current = answeredNow;

    let playedOutcome = false;
    if (phase === 'result' && me.correct !== null && me.correct !== prevCorrect.current) {
      playSound(me.correct ? 'correct' : 'wrong');
      playedOutcome = true;
    }
    prevCorrect.current = me.correct;

    for (const p of players) {
      const prev = prevScores.current[p.id];
      if (prev !== undefined && p.score > prev) {
        if (p.id === me.id && playedOutcome) {
          // correct/wrong SFX already played
        } else {
          playSound('point');
        }
      }
      prevScores.current[p.id] = p.score;
    }

    if (me.rematch && !prevRematchVote.current) {
      playSound('vote');
    }
    prevRematchVote.current = me.rematch ?? false;
  }, [game, players, me]);

  useEffect(() => {
    if (!game) return;
    const timed =
      game.phase === 'thinking' || game.phase === 'question' || game.phase === 'answering';
    if (!timed) {
      lastTickSecond.current = null;
      return;
    }
    if (timeLeft > 3 || timeLeft <= 0) return;
    if (lastTickSecond.current === timeLeft) return;
    lastTickSecond.current = timeLeft;
    playSound('tick');
  }, [game, timeLeft]);
}
