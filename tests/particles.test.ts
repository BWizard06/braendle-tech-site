import { describe, expect, it } from 'vitest';
import {
  HERO_DISSOLVE,
  HERO_DOT_MIN,
  HERO_DOT_RANGE,
  HERO_TONE_FLOOR,
  HERO_TONE_KNEE,
  dissolveKeep,
  dotDiameter,
  flattenTone,
  jitterHash,
  sampleParticleField,
  toneFromRgb,
  type ImageLike,
} from '../src/lib/hero/particles';

function solidImage(width: number, height: number, rgba: [number, number, number, number]): ImageLike {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = rgba[0];
    data[i * 4 + 1] = rgba[1];
    data[i * 4 + 2] = rgba[2];
    data[i * 4 + 3] = rgba[3];
  }
  return { data, width, height };
}

describe('toneFromRgb', () => {
  it('maps white to no ink and black to full ink', () => {
    expect(toneFromRgb(255, 255, 255)).toBeCloseTo(0, 5);
    expect(toneFromRgb(0, 0, 0)).toBeCloseTo(1, 5);
  });

  it('is monotonic in luminance', () => {
    const dark = toneFromRgb(40, 40, 40);
    const mid = toneFromRgb(128, 128, 128);
    const light = toneFromRgb(220, 220, 220);
    expect(dark).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(light);
  });
});

describe('dotDiameter', () => {
  it('spans the configured range and clamps outside [0,1]', () => {
    expect(dotDiameter(0)).toBeCloseTo(HERO_DOT_MIN, 6);
    expect(dotDiameter(1)).toBeCloseTo(HERO_DOT_MIN + HERO_DOT_RANGE, 6);
    expect(dotDiameter(-3)).toBeCloseTo(HERO_DOT_MIN, 6);
    expect(dotDiameter(9)).toBeCloseTo(HERO_DOT_MIN + HERO_DOT_RANGE, 6);
  });
});

describe('flattenTone', () => {
  it('collapses every tone below the knee onto one value', () => {
    const flat = flattenTone(0);
    expect(flat).toBeCloseTo(HERO_TONE_FLOOR, 6);
    for (const tone of [0.05, 0.18, 0.3, HERO_TONE_KNEE]) {
      expect(flattenTone(tone)).toBeCloseTo(flat, 6);
    }
  });

  it('keeps the dark end intact and stays monotonic above the knee', () => {
    expect(flattenTone(1)).toBeCloseTo(1, 6);
    const mid = flattenTone((HERO_TONE_KNEE + 1) / 2);
    expect(mid).toBeGreaterThan(HERO_TONE_FLOOR);
    expect(mid).toBeLessThan(1);
    expect(flattenTone(0.7)).toBeLessThan(flattenTone(0.85));
  });

  it('never leaves the unit range', () => {
    for (const tone of [-1, 0, 0.5, 1, 2]) {
      const value = flattenTone(tone);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});

describe('dissolveKeep', () => {
  it('keeps everything above the band and drops everything at the edge', () => {
    expect(dissolveKeep(0)).toBe(1);
    expect(dissolveKeep(1 - HERO_DISSOLVE)).toBe(1);
    expect(dissolveKeep(1)).toBe(0);
  });

  it('falls monotonically across the band', () => {
    const a = dissolveKeep(1 - HERO_DISSOLVE * 0.75);
    const b = dissolveKeep(1 - HERO_DISSOLVE * 0.5);
    const c = dissolveKeep(1 - HERO_DISSOLVE * 0.25);
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
  });
});

describe('jitterHash', () => {
  it('is deterministic and inside [0,1)', () => {
    for (const n of [0, 1, 17.3, 4096]) {
      const value = jitterHash(n);
      expect(value).toBe(jitterHash(n));
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('sampleParticleField', () => {
  it('drops pixels below the alpha threshold', () => {
    const field = sampleParticleField(solidImage(64, 64, [0, 0, 0, 10]));
    expect(field.count).toBe(0);
  });

  it('emits one particle per sampled opaque pixel with matching buffer lengths', () => {
    const field = sampleParticleField(solidImage(64, 64, [0, 0, 0, 255]), { dissolve: 0, jitter: 0 });
    expect(field.count).toBe(32 * 32);
    expect(field.positions.length).toBe(field.count * 3);
    expect(field.tones.length).toBe(field.count);
    expect(field.seeds.length).toBe(field.count);
  });

  it('normalises positions into the unit plane with z flat', () => {
    const field = sampleParticleField(solidImage(64, 64, [0, 0, 0, 255]), { dissolve: 0, jitter: 0 });
    for (let i = 0; i < field.count; i++) {
      expect(field.positions[i * 3]).toBeGreaterThanOrEqual(-0.5);
      expect(field.positions[i * 3]).toBeLessThanOrEqual(0.5);
      expect(field.positions[i * 3 + 1]).toBeGreaterThanOrEqual(-0.5);
      expect(field.positions[i * 3 + 1]).toBeLessThanOrEqual(0.5);
      expect(field.positions[i * 3 + 2]).toBe(0);
    }
  });

  it('is deterministic across runs', () => {
    const image = solidImage(48, 48, [90, 90, 90, 255]);
    const a = sampleParticleField(image);
    const b = sampleParticleField(image);
    expect(a.count).toBe(b.count);
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
    expect(Array.from(a.seeds)).toEqual(Array.from(b.seeds));
  });

  it('thins the field towards the bottom edge', () => {
    const image = solidImage(96, 96, [0, 0, 0, 255]);
    const withDissolve = sampleParticleField(image);
    const withoutDissolve = sampleParticleField(image, { dissolve: 0 });
    expect(withDissolve.count).toBeLessThan(withoutDissolve.count);
  });
});
