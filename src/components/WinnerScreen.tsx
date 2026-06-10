import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { Player } from '@/lib/types';
import { playerColor } from '@/lib/player-colors';
import type { TranslateFn } from '@/lib/i18n';
import { colors } from '@/theme';

interface Props {
  players: Player[];
  me: Player | null;
  onRematch: () => void;
  t: TranslateFn;
}

export function WinnerScreen({ players, me, onRematch, t }: Props) {
  const maxScore = Math.max(...players.map((p) => p.score), 0);
  const winners = players.filter((p) => p.score === maxScore);
  const sorted = [...players].sort((a, b) => b.score - a.score || a.slot - b.slot);

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <Text style={styles.title}>
          {winners.length > 1 ? t('winners') : t('winner')}
        </Text>
        <Text style={styles.winnerNames}>
          {winners.map((w) => w.name).join(', ')}
        </Text>
        <Text style={styles.sub}>{t('finalScores')}</Text>
        {sorted.map((p) => (
          <View key={p.id} style={styles.row}>
            <View style={[styles.dot, { backgroundColor: playerColor(p.slot) }]} />
            <Text style={styles.name}>{p.name}</Text>
            <Text style={styles.score}>{p.score}</Text>
          </View>
        ))}
        <Text style={styles.clipsNote}>{t('clipsComingSoon')}</Text>
        <Pressable
          style={[styles.btn, me?.rematch && styles.voted]}
          onPress={onRematch}
        >
          <Text style={styles.btnText}>
            {me?.rematch ? t('rematchWaiting') : t('rematchVote')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    padding: 24,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  title: { color: colors.gold, fontSize: 28, fontWeight: '800', textAlign: 'center' },
  winnerNames: { color: colors.text, fontSize: 20, textAlign: 'center', fontWeight: '600' },
  sub: { color: colors.textMuted, textAlign: 'center', marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  name: { flex: 1, color: colors.text },
  score: { color: colors.gold, fontWeight: '700' },
  clipsNote: { color: colors.textMuted, fontSize: 12, textAlign: 'center' },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  voted: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.accent },
  btnText: { color: '#fff', fontWeight: '700' },
});
