import React from 'react';
import { Pressable, Text, StyleSheet, View } from 'react-native';
import { colors } from '@/theme';

const LABELS = ['A', 'B', 'C', 'D'];

interface Props {
  options: [string, string, string, string];
  selected: number | null;
  disabled: boolean;
  onSelect: (index: number) => void;
}

export function MCOptions({ options, selected, disabled, onSelect }: Props) {
  return (
    <View style={styles.grid}>
      {options.map((opt, i) => {
        const active = selected === i;
        return (
          <Pressable
            key={i}
            style={[styles.option, active && styles.optionActive, disabled && styles.disabled]}
            disabled={disabled || selected !== null}
            onPress={() => onSelect(i)}
          >
            <Text style={styles.label}>{LABELS[i]}</Text>
            <Text style={styles.text}>{opt}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 10 },
  option: {
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  optionActive: { borderColor: colors.accentBright, backgroundColor: '#1e3330' },
  disabled: { opacity: 0.6 },
  label: {
    color: colors.accentBright,
    fontWeight: '700',
    fontSize: 16,
    width: 24,
  },
  text: { color: colors.text, flex: 1, fontSize: 15 },
});
