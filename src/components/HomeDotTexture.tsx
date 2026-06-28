/** Tiled teal dot background for home screen — parity with web HomeDotTexture.tsx */
import React, { useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Pattern, Rect } from 'react-native-svg';
import { colors } from '@/theme';

const TILE = 220;
/** Web uses 720; slightly denser tile for finer grain on phone displays. */
const DOT_COUNT = 960;
const DOT_RGB = '47,125,119';
/** Sub-1 px radii read larger on iPhone — scale down vs web CSS px. */
const RADIUS_SCALE = 0.62;
const PATTERN_ID = 'homeDotSpeckle';

type DotSpec = { cx: number; cy: number; r: number; opacity: number };

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildDotTile(seed: number): DotSpec[] {
  const rand = mulberry32(seed);
  const dots: DotSpec[] = [];
  for (let i = 0; i < DOT_COUNT; i += 1) {
    const cx = rand() * TILE;
    const cy = rand() * TILE;
    const roll = rand();
    const baseR = roll < 0.88 ? 0.22 + rand() * 0.62 : 0.75 + rand() * 0.7;
    dots.push({
      cx,
      cy,
      r: baseR * RADIUS_SCALE,
      opacity: 0.08 + rand() * 0.2,
    });
  }
  return dots;
}

export function HomeDotTexture() {
  const { width, height } = useWindowDimensions();
  const [dots] = useState(() => buildDotTile((Date.now() ^ (DOT_COUNT * TILE)) >>> 0));

  if (width <= 0 || height <= 0) {
    return <View style={styles.base} pointerEvents="none" accessible={false} />;
  }

  return (
    <View style={styles.base} pointerEvents="none" accessible={false}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFillObject}>
        <Defs>
          <Pattern
            id={PATTERN_ID}
            patternUnits="userSpaceOnUse"
            width={TILE}
            height={TILE}
          >
            {dots.map((d, i) => (
              <Circle
                key={i}
                cx={d.cx}
                cy={d.cy}
                r={d.r}
                fill={`rgba(${DOT_RGB},${d.opacity.toFixed(3)})`}
              />
            ))}
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill={`url(#${PATTERN_ID})`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bg,
  },
});
