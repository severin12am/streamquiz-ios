/** Live multiplayer leaderboard — parity with web ScoreBoard.tsx */
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import type { GamePhase, Player } from '@/lib/types';
import { playerColor, playerInitial } from '@/lib/player-colors';
import { colors } from '@/theme';

interface Props {
  players: Player[];
  meId: string;
  phase?: GamePhase;
  label?: string;
}

export function ScoreBoard({ players, meId, phase, label }: Props) {
  const prevScores = useRef<Record<string, number>>({});
  const [flashing, setFlashing] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const changed: Record<string, boolean> = {};
    for (const p of players) {
      if (prevScores.current[p.id] !== undefined && prevScores.current[p.id] !== p.score) {
        changed[p.id] = true;
      }
      prevScores.current[p.id] = p.score;
    }
    if (Object.keys(changed).length > 0) {
      setFlashing((f) => ({ ...f, ...changed }));
      const t = setTimeout(() => setFlashing({}), 800);
      return () => clearTimeout(t);
    }
  }, [players]);

  const ranked = [...players].sort((a, b) => b.score - a.score || a.slot - b.slot);
  const showAnswered = phase === 'question' || phase === 'answering';
  const hasAnswered = (p: Player) =>
    phase === 'question' ? p.mc_index !== null : p.done;

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.heading}>{label}</Text> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {ranked.map((p) => {
          const isMe = p.id === meId;
          const flash = flashing[p.id];
          const colour = playerColor(p.slot);
          const answered = hasAnswered(p);
          return (
            <View key={p.id} style={[styles.chip, isMe && styles.chipMe]}>
              <View style={[styles.chipInner, flash && styles.chipFlash]}>
                <View style={[styles.avatar, { backgroundColor: colour }]}>
                  <Text style={styles.avatarText}>{playerInitial(p.name)}</Text>
                </View>
                <Text style={styles.name} numberOfLines={1}>
                  {p.name}
                </Text>
                {showAnswered ? (
                  <View
                    style={[
                      styles.answeredDot,
                      answered
                        ? { backgroundColor: colour, borderWidth: 0 }
                        : { backgroundColor: 'transparent', borderColor: colors.borderStrong },
                    ]}
                  />
                ) : null}
                <Text style={[styles.score, flash && styles.scoreFlash]}>{p.score}</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  heading: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  row: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  chip: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  chipMe: {
    borderColor: colors.accent,
    backgroundColor: '#d8ebe8',
  },
  chipInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  chipFlash: { transform: [{ scale: 1.05 }] },
  avatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.onPrimary, fontSize: 9, fontWeight: '700' },
  name: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
    maxWidth: 72,
  },
  answeredDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
  },
  score: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 16,
    minWidth: 20,
    textAlign: 'right',
  },
  scoreFlash: { color: colors.gold },
});
