import { createCanvas, loadImage, type Canvas } from '@napi-rs/canvas';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { sampleParticleField, HERO_FIT } from '../src/lib/hero/particles';
import {
  HERO_PALETTES,
  POSTER_SIZE,
  paletteDotDiameter,
  type ThemeName,
} from '../src/lib/hero/palette';

const here = dirname(fileURLToPath(import.meta.url));
const assets = resolve(here, '../src/assets');

const TONE_BUCKETS = 48;
const SUPERSAMPLE = 3;

type Rgb = [number, number, number];

function parseHex(hex: string): Rgb {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function coverage(distance: number): number {
  const t = Math.min(Math.max((0.5 - distance) / 0.3, 0), 1);
  return t * t * (3 - 2 * t);
}

function makeSprite(color: Rgb, diameter: number): Canvas {
  const size = Math.max(6, Math.ceil(diameter * SUPERSAMPLE));
  const sprite = createCanvas(size, size);
  const ctx = sprite.getContext('2d');
  const image = ctx.createImageData(size, size);
  const centre = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5 - centre) / size;
      const dy = (y + 0.5 - centre) / size;
      const alpha = coverage(Math.sqrt(dx * dx + dy * dy));
      const i = (y * size + x) * 4;
      image.data[i] = color[0];
      image.data[i + 1] = color[1];
      image.data[i + 2] = color[2];
      image.data[i + 3] = Math.round(alpha * 255);
    }
  }

  ctx.putImageData(image, 0, 0);
  return sprite;
}

async function bake(theme: ThemeName, field: ReturnType<typeof sampleParticleField>): Promise<void> {
  const palette = HERO_PALETTES[theme];
  const tint = parseHex(palette.tint);
  const ink = parseHex(palette.ink);

  const canvas = createCanvas(POSTER_SIZE, POSTER_SIZE);
  const ctx = canvas.getContext('2d');
  const plane = POSTER_SIZE * HERO_FIT;
  const origin = (POSTER_SIZE - plane) / 2;

  const sprites: Canvas[] = [];
  const diameters: number[] = [];
  for (let b = 0; b <= TONE_BUCKETS; b++) {
    const tone = b / TONE_BUCKETS;
    const diameter = paletteDotDiameter(palette, tone) * plane;
    diameters.push(diameter);
    sprites.push(makeSprite(mix(tint, ink, tone), diameter));
  }

  for (let i = 0; i < field.count; i++) {
    const tone = field.tones[i]!;
    const bucket = Math.round(tone * TONE_BUCKETS);
    const diameter = diameters[bucket]!;
    const x = origin + (field.positions[i * 3]! + 0.5) * plane;
    const y = origin + (0.5 - field.positions[i * 3 + 1]!) * plane;
    ctx.drawImage(sprites[bucket]!, x - diameter / 2, y - diameter / 2, diameter, diameter);
  }

  const out = resolve(assets, `hero-poster-${theme}.png`);
  await writeFile(out, await canvas.encode('png'));
  console.log(`baked ${out} (${field.count} particles)`);
}

const source = await loadImage(resolve(assets, 'hero-source.png'));
const probe = createCanvas(source.width, source.height);
const probeCtx = probe.getContext('2d');
probeCtx.drawImage(source, 0, 0);
const field = sampleParticleField(probeCtx.getImageData(0, 0, source.width, source.height));

await bake('light', field);
await bake('dark', field);
