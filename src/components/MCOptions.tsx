/**
 * Multiple choice options — flat 2×2 grid of compact white cards.
 * Black text on white, no shadows; reveal colors + per-option picker avatars.
 */
import React from 'react';
import { Text, StyleSheet, View, Pressable } from 'react-native';
import { playerInitial } from '@/lib/player-colors';
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
  /** Render as translucent dark cards so the video shows through (overlay mode). */
  translucent?: boolean;
  onSelect: (index: number) => void;
}

export function MCOptions({
  options,
  correctAnswer,
  myPick = null,
  picksByOption,
  canSelect,
  youLabel = 'You',
  translucent = false,
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

        const boxStyle = [
          styles.box,
          translucent && styles.boxTranslucent,
          pickedByMe && !revealed && styles.boxSelected,
          isCorrect && styles.boxCorrect,
          isWrongPick && styles.boxWrong,
        ];
        const badgeStyle = [
          styles.badge,
          pickedByMe && !revealed && styles.badgeSelected,
          isCorrect && styles.badgeCorrect,
          isWrongPick && styles.badgeWrong,
        ];
        const badgeOn = (pickedByMe && !revealed) || isCorrect || isWrongPick;

        return (
          <Pressable
            key={i}
            disabled={!canSelect}
            onPress={() => canSelect && onSelect(i)}
            style={({ pressed }) => [...boxStyle, pressed && canSelect && styles.boxPressed]}
          >
            <View style={styles.row}>
              <View style={badgeStyle}>
                <Text style={[styles.badgeText, badgeOn && styles.badgeTextOn]}>{LABELS[i]}</Text>
              </View>
              <Text style={[styles.text, translucent && styles.textTranslucent]} numberOfLines={3}>
                {option}
              </Text>
              {isCorrect ? <Text style={styles.markCorrect}>✓</Text> : null}
              {isWrongPick ? <Text style={styles.markWrong}>✗</Text> : null}
            </View>

            {pickedByMe && !revealed ? <Text style={styles.youTag}>{youLabel}</Text> : null}

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
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8,
  },
  box: {
    width: '48.5%',
    minHeight: 46,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e3e8e0',
    paddingVertical: 8,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  boxPressed: { opacity: 0.7 },
  boxTranslucent: {
    backgroundColor: 'rgba(12,16,15,0.55)',
    borderColor: 'rgba(255,255,255,0.18)',
  },
  boxSelected: { borderColor: colors.accent, backgroundColor: '#e7f1ef' },
  boxCorrect: { borderColor: colors.correct, backgroundColor: '#e4f6ec' },
  boxWrong: { borderColor: colors.wrong, backgroundColor: '#fbe9e6' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef2ec',
  },
  badgeSelected: { backgroundColor: colors.accent },
  badgeCorrect: { backgroundColor: colors.correct },
  badgeWrong: { backgroundColor: colors.wrong },
  badgeText: { color: colors.textSecondary, fontWeight: '700', fontSize: 12 },
  badgeTextOn: { color: '#ffffff' },
  text: { color: '#1d2b27', flex: 1, fontSize: 13, lineHeight: 17, fontWeight: '500' },
  textTranslucent: {
    color: '#f3f7f4',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  markCorrect: { color: colors.correct, fontSize: 15, fontWeight: '800' },
  markWrong: { color: colors.wrong, fontSize: 15, fontWeight: '800' },
  youTag: {
    marginTop: 6,
    fontSize: 9,
    fontWeight: '700',
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  avatarRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  avatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarMe: { borderWidth: 2, borderColor: colors.text },
  avatarText: { color: '#ffffff', fontSize: 8, fontWeight: '700' },
});
