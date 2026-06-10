import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { Player } from '@/lib/types';
import { playerColor } from '@/lib/player-colors';
import { colors } from '@/theme';

interface Props {
  players: Player[];
}

export function ScoreBoard({ players }: Props) {
  const sorted = [...players].sort((a, b) => b.score - a.score || a.slot - b.slot);

  return (
    <View style={styles.wrap}>
      {sorted.map((p) => (
        <View key={p.id} style={styles.row}>
          <View style={[styles.dot, { backgroundColor: playerColor(p.slot) }]} />
          <Text style={styles.name} numberOfLines={1}>
            {p.name}
            {p.role === 'host' ? ' ★' : ''}
          </Text>
          <Text style={styles.score}>{p.score}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  name: { flex: 1, color: colors.text, fontSize: 14 },
  score: { color: colors.gold, fontWeight: '700', fontSize: 16, minWidth: 24, textAlign: 'right' },
});
