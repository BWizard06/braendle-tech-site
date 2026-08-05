export const HERO_STRIDE = 2;
export const HERO_ALPHA_MIN = 128;
export const HERO_JITTER = 0.55;
export const HERO_TONE_GAMMA = 0.85;
export const HERO_FIT = 0.86;
export const HERO_DISSOLVE = 0.16;
export const HERO_DOT_MIN = 0.0035;
export const HERO_DOT_RANGE = 0.0052;
export const HERO_TONE_KNEE = 0.46;
export const HERO_TONE_FLOOR = 0.08;
export const HERO_TONE_GAIN = 0.52;

export interface ImageLike {
  data: Uint8ClampedArray | Uint8Array | number[];
  width: number;
  height: number;
}

export interface ParticleField {
  count: number;
  positions: Float32Array;
  tones: Float32Array;
  seeds: Float32Array;
}

export interface SampleOptions {
  stride?: number;
  alphaMin?: number;
  jitter?: number;
  gamma?: number;
  dissolve?: number;
}

export function dissolveKeep(v: number, dissolve = HERO_DISSOLVE): number {
  if (dissolve <= 0) return 1;
  const t = (v - (1 - dissolve)) / dissolve;
  if (t <= 0) return 1;
  if (t >= 1) return 0;
  return 1 - t * t * (3 - 2 * t);
}

export function jitterHash(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453123;
  return x - Math.floor(x);
}

export function toneFromRgb(r: number, g: number, b: number, gamma = HERO_TONE_GAMMA): number {
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return Math.pow(Math.min(Math.max(1 - lum, 0), 1), gamma);
}

export function flattenTone(
  tone: number,
  knee = HERO_TONE_KNEE,
  floor = HERO_TONE_FLOOR,
  gain = HERO_TONE_GAIN,
): number {
  const t = Math.min(Math.max((tone - knee) / (1 - knee), 0), 1);
  const eased = Math.pow(t, gain);
  return floor + (1 - floor) * eased;
}

export function dotDiameter(tone: number): number {
  return HERO_DOT_MIN + HERO_DOT_RANGE * Math.min(Math.max(tone, 0), 1);
}

export function sampleParticleField(image: ImageLike, options: SampleOptions = {}): ParticleField {
  const {
    stride = HERO_STRIDE,
    alphaMin = HERO_ALPHA_MIN,
    jitter = HERO_JITTER,
    gamma = HERO_TONE_GAMMA,
    dissolve = HERO_DISSOLVE,
  } = options;

  const { data, width, height } = image;
  const xs: number[] = [];
  const ys: number[] = [];
  const ts: number[] = [];

  let row = 0;
  for (let y = 0; y < height; y += stride, row++) {
    const offset = row % 2 === 1 ? stride / 2 : 0;
    const keep = dissolveKeep((y + 0.5) / height, dissolve);
    for (let fx = offset; fx < width; fx += stride) {
      const x = Math.round(fx);
      if (x >= width) continue;
      const i = (y * width + x) * 4;
      if ((data[i + 3] ?? 0) < alphaMin) continue;
      if (keep < 1 && jitterHash(y * width + x + 11.7) > keep) continue;

      const n = ts.length;
      const jx = jitter === 0 ? 0 : (jitterHash(n * 2.13 + 0.7) - 0.5) * stride * jitter;
      const jy = jitter === 0 ? 0 : (jitterHash(n * 3.71 + 4.2) - 0.5) * stride * jitter;

      xs.push(x + jx);
      ys.push(y + jy);
      ts.push(flattenTone(toneFromRgb(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0, gamma)));
    }
  }

  const count = ts.length;
  const positions = new Float32Array(count * 3);
  const tones = new Float32Array(count);
  const seeds = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (xs[i]! + 0.5) / width - 0.5;
    positions[i * 3 + 1] = 0.5 - (ys[i]! + 0.5) / height;
    positions[i * 3 + 2] = 0;
    tones[i] = ts[i]!;
    seeds[i] = jitterHash(i * 5.17 + 1.31);
  }

  return { count, positions, tones, seeds };
}
