import { HERO_DOT_MIN, HERO_DOT_RANGE } from './particles';

export type ThemeName = 'light' | 'dark';

export interface HeroPalette {
  tint: string;
  ink: string;
  heat: string;
  dotMin: number;
  dotRange: number;
}

export const HERO_PALETTES: Record<ThemeName, HeroPalette> = {
  light: {
    tint: '#c6beb2',
    ink: '#141312',
    heat: '#26708c',
    dotMin: HERO_DOT_MIN,
    dotRange: HERO_DOT_RANGE,
  },
  dark: {
    tint: '#f4f1ea',
    ink: '#33302a',
    heat: '#5fb3d1',
    dotMin: HERO_DOT_MIN + HERO_DOT_RANGE,
    dotRange: -HERO_DOT_RANGE,
  },
};

export function paletteDotDiameter(palette: HeroPalette, tone: number): number {
  return palette.dotMin + palette.dotRange * Math.min(Math.max(tone, 0), 1);
}

export const POSTER_SIZE = 768;
