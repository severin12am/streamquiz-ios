/**
 * Bakes the home-screen dot speckle into assets/splash-pattern.png for the native splash.
 * Run: node scripts/generate-splash.mjs
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '../assets/splash-pattern.png');

const TILE = 220;
const DOT_COUNT = 960;
const DOT_RGB = '47,125,119';
const RADIUS_SCALE = 0.62;
const BASE = '#eef3ec';
/** Fixed seed — splash must look the same on every launch and every build. */
const SEED = (42 ^ (DOT_COUNT * TILE)) >>> 0;

/** iPhone 6.7" @3x cover asset; Expo scales/crops for other sizes. */
const WIDTH = 1284;
const HEIGHT = 2778;

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildTileSvg() {
  const rand = mulberry32(SEED);
  const circles = [];
  for (let i = 0; i < DOT_COUNT; i += 1) {
    const cx = rand() * TILE;
    const cy = rand() * TILE;
    const roll = rand();
    const baseR = roll < 0.88 ? 0.22 + rand() * 0.62 : 0.75 + rand() * 0.7;
    const r = baseR * RADIUS_SCALE;
    const opacity = 0.08 + rand() * 0.2;
    circles.push(
      `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${r.toFixed(2)}" fill="rgba(${DOT_RGB},${opacity.toFixed(3)})"/>`,
    );
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="${TILE}">` +
    `<rect width="100%" height="100%" fill="${BASE}"/>` +
    circles.join('') +
    '</svg>'
  );
}

async function main() {
  const tilePng = await sharp(Buffer.from(buildTileSvg())).png().toBuffer();
  const composites = [];
  for (let top = 0; top < HEIGHT; top += TILE) {
    for (let left = 0; left < WIDTH; left += TILE) {
      composites.push({ input: tilePng, left, top });
    }
  }

  await sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 4,
      background: { r: 238, g: 243, b: 236, alpha: 1 },
    },
  })
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toFile(OUT);

  console.log(`Wrote ${OUT} (${WIDTH}x${HEIGHT})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
