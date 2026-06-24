/**
 * Question-count slider (3–20) — web KeycapSegSlider parity:
 * recessed track, teal fill, tick markers, and a draggable pill handle
 * that shows the current number. Tap the track or drag the handle.
 */
import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  PanResponder,
  StyleSheet,
  type LayoutChangeEvent,
} from 'react-native';
import { colors } from '@/theme';

interface Props {
  min?: number;
  max?: number;
  value: number;
  onChange: (value: number) => void;
}

const HANDLE = 40;

export function KeycapSegSlider({ min = 3, max = 20, value, onChange }: Props) {
  const [trackWidth, setTrackWidth] = useState(0);
  const widthRef = useRef(0);
  const valueRef = useRef(value);
  valueRef.current = value;

  const ticks = useMemo(() => {
    const arr: number[] = [];
    for (let i = min; i <= max; i++) arr.push(i);
    return arr;
  }, [min, max]);

  const range = max - min;
  const fraction = range > 0 ? (value - min) / range : 0;
  // Usable travel keeps the handle fully inside the track at both ends.
  const travel = Math.max(0, trackWidth - HANDLE);
  const handleLeft = fraction * travel;

  const valueForX = (x: number) => {
    const usable = Math.max(1, widthRef.current - HANDLE);
    const clamped = Math.min(usable, Math.max(0, x - HANDLE / 2));
    const f = clamped / usable;
    return Math.round(min + f * range);
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const next = valueForX(e.nativeEvent.locationX);
        if (next !== valueRef.current) onChange(next);
      },
      onPanResponderMove: (e) => {
        const next = valueForX(e.nativeEvent.locationX);
        if (next !== valueRef.current) onChange(next);
      },
    }),
  ).current;

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    widthRef.current = w;
    setTrackWidth(w);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.frame}>
        <View style={styles.track} onLayout={onLayout} {...pan.panHandlers}>
          {/* Tick markers */}
          <View style={styles.ticks} pointerEvents="none">
            {ticks.map((n) => (
              <View
                key={n}
                style={[styles.tick, n <= value ? styles.tickFilled : null]}
              />
            ))}
          </View>

          {/* Teal progress fill */}
          <View
            pointerEvents="none"
            style={[styles.fill, { width: handleLeft + HANDLE / 2 }]}
          />

          {/* Pill handle with the live number */}
          <View pointerEvents="none" style={[styles.handle, { left: handleLeft }]}>
            <Text style={styles.handleText}>{value}</Text>
          </View>
        </View>
      </View>

      <View style={styles.bounds}>
        <Text style={styles.boundText}>{min}</Text>
        <Text style={styles.boundText}>{max}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  frame: {
    backgroundColor: '#e7ebe3',
    borderRadius: 14,
    padding: 6,
    shadowColor: '#1f3a34',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  track: {
    height: HANDLE,
    borderRadius: 11,
    backgroundColor: '#f4f6f1',
    borderWidth: 1,
    borderTopColor: '#cdd8c4',
    borderLeftColor: '#dbe2d3',
    borderRightColor: '#dbe2d3',
    borderBottomColor: '#f0f3ec',
    justifyContent: 'center',
  },
  ticks: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: HANDLE / 2,
  },
  tick: {
    width: 2,
    height: 6,
    borderRadius: 1,
    backgroundColor: colors.borderStrong,
  },
  tickFilled: {
    backgroundColor: colors.accentBright,
    opacity: 0.55,
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(47,125,119,0.16)',
    borderTopLeftRadius: 11,
    borderBottomLeftRadius: 11,
  },
  handle: {
    position: 'absolute',
    top: 0,
    width: HANDLE,
    height: HANDLE,
    borderRadius: 10,
    backgroundColor: colors.accentBright,
    borderWidth: 1,
    borderColor: colors.accentHover,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0f2320',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 4,
    elevation: 4,
  },
  handleText: {
    color: colors.onPrimary,
    fontWeight: '800',
    fontSize: 16,
  },
  bounds: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginTop: 6,
  },
  boundText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
});
