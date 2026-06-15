/** Tiled teal dot background for home screen — parity with web HomeDotTexture.tsx */
import React, { useEffect, useState } from 'react';
import { Dimensions, Image, StyleSheet, View } from 'react-native';
import { colors } from '@/theme';

const DOT_COUNT = 720;

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildDotSvgUri(width: number, height: number): string {
  const rand = mulberry32((Date.now() ^ (width * height)) >>> 0);
  const count = Math.round((width * height) / (220 * 220) * DOT_COUNT);
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    const x = rand() * width;
    const y = rand() * height;
    const roll = rand();
    const r = roll < 0.88 ? 0.22 + rand() * 0.62 : 0.75 + rand() * 0.7;
    const opacity = 0.08 + rand() * 0.2;
    parts.push(
      `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r.toFixed(2)}" fill="rgba(47,125,119,${opacity.toFixed(3)})"/>`,
    );
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(width)}" height="${Math.ceil(height)}">` +
    parts.join('') +
    '</svg>';
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function HomeDotTexture() {
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    const { width, height } = Dimensions.get('window');
    setUri(buildDotSvgUri(width, height));
  }, []);

  return (
    <View style={styles.base} pointerEvents="none">
      {uri ? (
        <Image source={{ uri }} style={styles.image} resizeMode="cover" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bg,
  },
  image: {
    width: '100%',
    height: '100%',
    opacity: 1,
  },
});
