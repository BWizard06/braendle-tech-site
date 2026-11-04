import { mix, smoothstep } from './route';

export type SpawnMode = 'full' | 'short';

/**
 * Where the hologram stands at one moment, modelled on Tripo's viewer:
 * - `scan`: build height in body heights; Ben exists below it (sparkling at the edge).
 * - `color`: share (0–1) of horizontal bands already switched to full colour (glitch).
 * - `glyphs`, `beams`: opacity of the glyph rain and of the light-beam fans.
 */
export interface HoloState { scan: number; color: number; glyphs: number; beams: number; done: boolean }

export const SPAWN_DURATION = { full: 2.6, short: .9 } as const;
/** The goodbye wave before Ben dissolves, and the dissolve itself (seconds). */
export const FAREWELL_WAVE = 1.6;
export const FAREWELL_DURATION = 1.1;
/** Leaving a section; arriving uses the short entrance. */
export const BEAM_OUT_DURATION = .45;

const LOW = -.05, HIGH = 1.05;
const span = (t: number, from: number, to: number) => smoothstep((t - from) / (to - from));

export function spawnState(t: number, mode: SpawnMode): HoloState {
  if (mode === 'full') return {
    scan: mix(LOW, HIGH, span(t, .25, 1.85)),
    color: span(t, 1.9, 2.4),
    glyphs: span(t, 0, .3) * (1 - span(t, 2.1, 2.6)),
    beams: span(t, .05, .3) * (1 - span(t, 1.75, 2)),
    done: t >= SPAWN_DURATION.full,
  };
  return {
    scan: mix(LOW, HIGH, span(t, 0, .5)),
    color: span(t, .5, .85),
    glyphs: 0,
    beams: span(t, 0, .12) * (1 - span(t, .4, .55)),
    done: t >= SPAWN_DURATION.short,
  };
}

/** Colour glitches away first, then the hologram dissolves from the head down. */
export function farewellState(t: number): HoloState {
  return {
    color: 1 - span(t, 0, .35),
    scan: mix(HIGH, LOW, span(t, .35, 1)),
    glyphs: span(t, 0, .3) * (1 - span(t, .75, 1.1)),
    beams: span(t, .3, .45) * (1 - span(t, .9, 1.05)),
    done: t >= FAREWELL_DURATION,
  };
}

export function beamOutState(t: number): HoloState {
  return {
    color: 1 - span(t, 0, .15),
    scan: mix(HIGH, LOW, span(t, .15, .42)),
    glyphs: 0,
    beams: span(t, .1, .2) * (1 - span(t, .35, .45)),
    done: t >= BEAM_OUT_DURATION,
  };
}
