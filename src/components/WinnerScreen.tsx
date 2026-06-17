import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import type { Player } from '@/lib/types';
import { playerColor, playerInitial } from '@/lib/player-colors';
import type { TranslateFn } from '@/lib/i18n';
import { KeycapButton } from '@/components/KeycapButton';
import { KeycapWell } from '@/components/KeycapField';
import { colors } from '@/theme';

interface Props {
  players: Player[];
  me: Player | null;
  rematchLoading?: boolean;
  onRematch: () => void;
  onExit?: () => void;
  t: TranslateFn;
}

export function WinnerScreen({
  players,
  me,
  rematchLoading = false,
  onRematch,
  onExit,
  t,
}: Props) {
  const ranked = [...players].sort((a, b) => b.score - a.score || a.slot - b.slot);
  const topScore = ranked[0]?.score ?? 0;
  const winners = ranked.filter((p) => p.score === topScore && topScore > 0);
  const isTie = winners.length !== 1;
  const soleWinner = !isTie && topScore > 0 ? winners[0] : null;

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <Text style={styles.emoji}>{topScore === 0 ? '🤝' : '🏆'}</Text>
        <Text style={styles.kicker}>
          {topScore === 0 ? t('finalScores') : isTie ? t('winners') : t('winner')}
        </Text>

        {soleWinner ? (
          <View style={styles.hero}>
            <View
              style={[
                styles.heroAvatar,
                {
                  backgroundColor: playerColor(soleWinner.slot),
                  borderColor: colors.gold,
                },
              ]}
            >
              <Text style={styles.heroInitial}>{playerInitial(soleWinner.name)}</Text>
            </View>
            <Text style={[styles.heroName, { color: playerColor(soleWinner.slot) }]}>
              {soleWinner.name}
            </Text>
            <Text style={styles.heroScore}>
              {soleWinner.score} {t('score')}
            </Text>
          </View>
        ) : (
          <Text style={styles.tieNames}>
            {topScore === 0
              ? t('noAnswer')
              : winners.map((w) => w.name).join(', ')}
          </Text>
        )}

        <Text style={styles.sub}>{t('finalScores')}</Text>
        {ranked.map((p, i) => {
          const isWinner = p.score === topScore && topScore > 0;
          return (
            <KeycapWell key={p.id} style={[styles.row, isWinner && styles.rowWinner]}>
              <Text style={[styles.rank, isWinner && styles.rankWinner]}>
                {isWinner ? '🏆' : String(i + 1)}
              </Text>
              <View style={[styles.dot, { backgroundColor: playerColor(p.slot) }]}>
                <Text style={styles.dotText}>{playerInitial(p.name)}</Text>
              </View>
              <Text style={styles.name} numberOfLines={1}>
                {p.name}
                {p.id === me?.id ? ` (${t('youPick')})` : ''}
              </Text>
              <Text style={[styles.score, isWinner && styles.scoreWinner]}>{p.score}</Text>
            </KeycapWell>
          );
        })}

        <View style={styles.voteRow}>
          {players.map((p) => (
            <View key={p.id} style={styles.voteItem}>
              <View
                style={[
                  styles.voteDot,
                  p.rematch
                    ? { backgroundColor: playerColor(p.slot), borderWidth: 0 }
                    : { backgroundColor: 'transparent', borderColor: colors.borderStrong },
                ]}
              />
              <Text style={[styles.voteName, !p.rematch && styles.voteNameMuted]}>{p.name}</Text>
            </View>
          ))}
        </View>

        <View style={styles.actions}>
          <KeycapButton
            variant="primary"
            disabled={!!me?.rematch || rematchLoading}
            onPress={onRematch}
          >
            {rematchLoading ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : me?.rematch ? (
              t('rematchWaiting')
            ) : (
              t('rematchVote')
            )}
          </KeycapButton>

          {onExit ? (
            <KeycapButton variant="secondary" onPress={onExit}>
              {t('backHome')}
            </KeycapButton>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(238, 243, 236, 0.92)',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    padding: 24,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.gold,
    maxHeight: '90%',
  },
  emoji: { fontSize: 48, textAlign: 'center' },
  kicker: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 2,
    textAlign: 'center',
  },
  hero: { alignItems: 'center', gap: 8, marginVertical: 8 },
  heroAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
  },
  heroInitial: { color: colors.onPrimary, fontSize: 28, fontWeight: '800' },
  heroName: { fontSize: 24, fontWeight: '800', textAlign: 'center' },
  heroScore: { color: colors.gold, fontSize: 18, fontWeight: '700' },
  tieNames: {
    color: colors.gold,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginVertical: 8,
  },
  sub: { color: colors.textMuted, textAlign: 'center', marginTop: 4, fontSize: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  rowWinner: {
    borderTopColor: colors.gold,
    borderLeftColor: colors.gold,
    borderRightColor: colors.gold,
    borderBottomColor: colors.gold,
  },
  rank: { width: 24, textAlign: 'center', color: colors.textMuted, fontWeight: '700' },
  rankWinner: { color: colors.gold },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotText: { color: colors.onPrimary, fontSize: 11, fontWeight: '700' },
  name: { flex: 1, color: colors.text, fontSize: 14 },
  score: { color: colors.text, fontWeight: '700', fontSize: 18 },
  scoreWinner: { color: colors.gold },
  voteRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginTop: 8,
  },
  voteItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  voteDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
  voteName: { color: colors.text, fontSize: 12 },
  voteNameMuted: { color: colors.textMuted },
  actions: { gap: 10, marginTop: 8 },
});
