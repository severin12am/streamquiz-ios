/** Question count picker (3–10) — parity with web KeycapSegSlider.tsx */
import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors } from '@/theme';

interface Props {
  min?: number;
  max?: number;
  value: number;
  onChange: (value: number) => void;
}

export function KeycapSegSlider({ min = 3, max = 10, value, onChange }: Props) {
  const values = useMemo(() => {
    const arr: number[] = [];
    for (let i = min; i <= max; i++) arr.push(i);
    return arr;
  }, [min, max]);

  return (
    <View style={styles.wrap}>
      <View style={styles.rail}>
        {values.map((n) => {
          const active = n === value;
          return (
            <Pressable
              key={n}
              style={[styles.seg, active && styles.segActive]}
              onPress={() => onChange(n)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.segText, active && styles.segTextActive]}>{n}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  rail: {
    flexDirection: 'row',
    borderRadius: 12,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
    gap: 4,
  },
  seg: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segActive: {
    backgroundColor: colors.accent,
  },
  segText: {
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 15,
  },
  segTextActive: {
    color: colors.onPrimary,
  },
});
