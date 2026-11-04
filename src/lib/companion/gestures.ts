import type { HoloState } from './timeline';

/** A one-off clip from ben-gestures.glb: which part plays, how fast, and how it begins and ends. */
export interface GestureSpec {
  /** Played part of the source clip, in seconds. */
  from: number; to: number;
  speed: number;
  /** Plays the part this many times (a looping clip such as push-ups). */
  loops?: number;
  /** Holds the last frame this long, in seconds. */
  hold?: number;
  /** The clip starts / ends far from the standing pose: Ben switches under a short hologram
   * glitch instead of morphing through a cross-fade. */
  snapIn?: boolean; snapOut?: boolean;
}

export const GESTURES: Record<string, GestureSpec> = {
  // The source bow stands still for its first and last half second.
  bow: { from: .6, to: 5.6, speed: 1.35 },
  dance_06: { from: 0, to: 3.7, speed: 1.15 },
  flip: { from: .3, to: 3.9, speed: 1.1 },
  front_kick_02: { from: 0, to: 1.37, speed: .9 },
  'press-up': { from: 0, to: 1.96, speed: 1.2, loops: 3, snapIn: true, snapOut: true },
  // Sits gaming with an invisible controller, loses, clutches his head and turns away. The
  // 15.8 s source sits throughout and is mostly still thumb play; the export keeps this stretch.
  play_video_game: { from: 12.4, to: 15.35, speed: 1, snapIn: true, snapOut: true },
  // Thumbs-up with three nods (the contact form); the source raises the arm from hanging,
  // the idle pose already has the hands on the hips.
  agree: { from: 1.7, to: 3.25, speed: 1 },
};

/** Clicking Ben plays these, shuffled, without repeating one before all have played: a dance,
 * a flip, a kick, push-ups and a round of video games. */
export const TRICKS = ['dance_06', 'flip', 'front_kick_02', 'press-up', 'play_video_game'] as const;

/** Half the length of the glitch that hides a snap, in seconds. */
export const GLITCH = .22;

export function gestureLength(spec: GestureSpec): number {
  return (spec.to - spec.from) * (spec.loops ?? 1) / spec.speed + (spec.hold ?? 0);
}

/** Source clip time for `t` seconds into the gesture. */
export function gestureClipTime(spec: GestureSpec, t: number): number {
  const span = spec.to - spec.from;
  const played = Math.max(0, t) * spec.speed;
  if (played >= span * (spec.loops ?? 1)) return spec.to;
  return spec.from + played % span;
}

/** Hologram flash around a snap: the colour drops away and returns within 2 × GLITCH. */
export function glitchState(spec: GestureSpec, t: number): HoloState | undefined {
  const pulse = (centre: number) => Math.abs(t - centre) < GLITCH ? Math.cos(Math.PI / 2 * (t - centre) / GLITCH) : 0;
  const bump = Math.max(spec.snapIn ? pulse(0) : 0, spec.snapOut ? pulse(gestureLength(spec)) : 0);
  if (bump <= 0) return undefined;
  return { scan: 1.05, color: 1 - .8 * bump, glyphs: 0, beams: 0, done: false };
}

/** Next trick from a shuffled bag; never the same one twice in a row. */
export function createTrickBag(random: () => number = Math.random) {
  let bag: string[] = [], last = '';
  return () => {
    if (!bag.length) {
      bag = [...TRICKS];
      for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [bag[i], bag[j]] = [bag[j]!, bag[i]!]; }
      if (bag[0] === last) bag.push(bag.shift()!);
    }
    last = bag.shift()!;
    return last;
  };
}
