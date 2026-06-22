import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '@/theme';

interface Props {
  timeLeftMs: number;
  totalMs: number;
  label?: string;
  /** 'ring' = big circular dial, 'bar' = thin shrinking line with seconds. */
  variant?: 'ring' | 'bar';
}

function timerColor(seconds: number): string {
  if (seconds > 10) return colors.timerOk;
  if (seconds > 5) return colors.timerWarning;
  return colors.timerUrgent;
}

export function CountdownTimer({ timeLeftMs, totalMs, label, variant = 'ring' }: Props) {
  const progress = totalMs > 0 ? Math.min(1, Math.max(0, timeLeftMs / totalMs)) : 0;
  const seconds = Math.max(0, Math.ceil(timeLeftMs / 1000));
  const ringColor = timerColor(seconds);

  if (variant === 'bar') {
    return (
      <View style={styles.barRow}>
        <View style={styles.barTrack}>
          <View
            style={[styles.barFill, { width: `${progress * 100}%`, backgroundColor: ringColor }]}
          />
        </View>
        <Text style={[styles.barSeconds, { color: ringColor }]}>{seconds}</Text>
      </View>
    );
  }

  const size = 88;
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);

  return (
    <View style={styles.wrap}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.border}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={ringColor}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={styles.center}>
        <Text style={[styles.seconds, { color: ringColor }]}>{seconds}</Text>
        {label ? <Text style={styles.label}>{label}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  center: { position: 'absolute', alignItems: 'center' },
  seconds: { fontSize: 28, fontWeight: '700' },
  label: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.16)',
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 2 },
  barSeconds: { fontSize: 13, fontWeight: '700', minWidth: 18, textAlign: 'right' },
});
