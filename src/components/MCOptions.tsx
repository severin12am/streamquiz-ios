/**
 * Multiple choice options — keycap press + reveal parity with web MCOptions.tsx.
 */
import React from 'react';
import { Text, StyleSheet, View } from 'react-native';
import { playerInitial } from '@/lib/player-colors';
import { KeycapButton, type KeycapVariant } from '@/components/KeycapButton';
import { colors } from '@/theme';

export interface OptionPick {
  id: string;
  name: string;
  colour: string;
  isMe: boolean;
}

const LABELS = ['A', 'B', 'C', 'D'] as const;

interface Props {
  options: [string, string, string, string];
  correctAnswer?: string;
  myPick?: number | null;
  picksByOption?: OptionPick[][];
  canSelect: boolean;
  youLabel?: string;
  onSelect: (index: number) => void;
}

export function MCOptions({
  options,
  correctAnswer,
  myPick = null,
  picksByOption,
  canSelect,
  youLabel = 'You',
  onSelect,
}: Props) {
  const revealed = correctAnswer != null;

  return (
    <View style={styles.grid}>
      {options.map((option, i) => {
        const pickedByMe = myPick === i;
        const isCorrect = revealed && option === correctAnswer;
        const isWrongPick = revealed && pickedByMe && !isCorrect;
        const picks = picksByOption?.[i] ?? [];

        let variant: KeycapVariant = 'secondary';
        if (revealed) {
          variant = isCorrect
            ? 'revealedCorrect'
            : isWrongPick
              ? 'revealedWrong'
              : 'revealedNeutral';
        } else if (pickedByMe) {
          variant = 'primary';
        }

        const badgeStyle = isCorrect
          ? styles.badgeCorrect
          : isWrongPick
            ? styles.badgeWrong
            : pickedByMe && !revealed
              ? styles.badgeSelected
              : styles.badge;

        return (
          <KeycapButton
            key={i}
            variant={variant}
            locked={revealed}
            disabled={!canSelect && !revealed}
            onPress={() => canSelect && onSelect(i)}
            contentStyle={styles.optionInner}
            textStyle={styles.optionText}
          >
            <View style={styles.row}>
              <View style={[styles.badge, badgeStyle]}>
                <Text
                  style={[
                    styles.badgeText,
                    (isCorrect || isWrongPick || (pickedByMe && !revealed)) && styles.badgeTextOn,
                  ]}
                >
                  {LABELS[i]}
                </Text>
              </View>
              <Text style={[styles.text, revealed && { color: colors.text }]} numberOfLines={4}>
                {option}
              </Text>
              <View style={styles.tags}>
                {pickedByMe && !revealed ? (
                  <Text style={styles.youTag}>{youLabel}</Text>
                ) : null}
                {revealed && picks.length > 0 ? (
                  <View style={styles.avatarRow}>
                    {picks.map((pick) => (
                      <View
                        key={pick.id}
                        style={[
                          styles.avatar,
                          { backgroundColor: pick.colour },
                          pick.isMe && styles.avatarMe,
                        ]}
                      >
                        <Text style={styles.avatarText}>{playerInitial(pick.name)}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                {isCorrect ? <Text style={styles.markCorrect}>✓</Text> : null}
                {isWrongPick ? <Text style={styles.markWrong}>✗</Text> : null}
              </View>
            </View>
          </KeycapButton>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 10 },
  optionInner: {
    alignItems: 'stretch',
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  optionText: { textAlign: 'left' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, width: '100%' },
  badge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgElevated,
  },
  badgeSelected: { backgroundColor: colors.accent },
  badgeCorrect: { backgroundColor: colors.correct },
  badgeWrong: { backgroundColor: colors.wrong },
  badgeText: { color: colors.textSecondary, fontWeight: '700', fontSize: 13 },
  badgeTextOn: { color: colors.onPrimary },
  text: { color: colors.text, flex: 1, fontSize: 15, lineHeight: 20 },
  tags: { alignItems: 'flex-end', gap: 4, minWidth: 28 },
  youTag: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.accent,
    backgroundColor: colors.bg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
    textTransform: 'uppercase',
  },
  avatarRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 4 },
  avatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarMe: { borderWidth: 2, borderColor: colors.text },
  avatarText: { color: colors.onPrimary, fontSize: 9, fontWeight: '700' },
  markCorrect: { color: colors.correct, fontSize: 18, fontWeight: '700' },
  markWrong: { color: colors.wrong, fontSize: 18, fontWeight: '700' },
});
