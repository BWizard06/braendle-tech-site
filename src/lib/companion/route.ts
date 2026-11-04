/**
 * A station on the page (document pixels). `zone` is where its part of the page begins; a dock
 * (sticky, see Companion.astro) moves with scrolling and Ben stands at `standX` on its top edge.
 */
export interface Anchor { x: number; y: number; width: number; height: number; say?: string; zone?: number; dock?: boolean; standX?: number }
/** Where Ben stands: a station, optionally one of its rows (-1 is the station itself). */
export interface Stop { x: number; y: number; height: number; station: number; row?: number; say?: string; dock?: boolean }
/** `lift` is the height of a jump's arc in pixels (default: three quarters of Ben, ≤ 150). */
export interface Journey { from: Stop; to: Stop; start: number; duration: number; kind: 'walk' | 'jump'; lift?: number }
export const clamp = (n: number, min = 0, max = 1): number => Math.min(max, Math.max(min, n));
export const smoothstep = (n: number): number => { const t = clamp(n); return t * t * (3 - 2 * t); };
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** A part of the page becomes Ben's once its beginning passes this share of the viewport. */
export const ZONE_LINE = .6;

/**
 * The station for the part of the page being read: the last one whose zone has begun above
 * 60 % of the viewport. Long parts (projects, contact) have docks, so Ben stays in view there.
 */
export function destination(scroll: number, viewport: number, anchors: Anchor[]): Stop {
  let station = 0;
  anchors.forEach((a, i) => { if (i && (a.zone ?? a.y + a.height) < scroll + viewport * ZONE_LINE) station = i; });
  return stationStop(anchors, station);
}

/** Where Ben stands at a station: on the rule under its anchor (the hero frame is inset). */
export function stationStop(anchors: Anchor[], station: number): Stop {
  const a = anchors[station]!;
  if (a.dock) return { x: a.standX ?? a.x + a.width / 2, y: a.y, height: a.height, station, row: -1, say: a.say, dock: true };
  return { x: a.x + a.width / 2, y: a.y + a.height * (station ? 1 : .95), height: a.height * (station ? 1 : .88), station, row: -1, say: a.say };
}

/**
 * Inside a station with rows (the technology list): the hovered row, otherwise the lowest row
 * whose rule has passed 62 % of the viewport, otherwise the station itself.
 */
export function rowStop(section: Stop, rows: Array<{ x: number; y: number; say?: string }>, scroll: number, viewport: number, hovered = -1): Stop {
  let index = -1;
  if (hovered >= 0 && hovered < rows.length) index = hovered;
  else rows.forEach((r, i) => { if (r.y < scroll + viewport * .62) index = i; });
  if (index < 0) return section;
  const r = rows[index]!;
  return { ...section, x: r.x, y: r.y, row: index, say: r.say };
}

/** The next stop on the way between rows: one row per hop (-1 is the station itself). */
export function nextRow(from: number, to: number): number {
  return from === to ? from : from + Math.sign(to - from);
}

/**
 * A hop between rows, in Ben's own standing pose: he dips into his knees, pushes off, tucks his
 * legs a little on a ballistic arc and absorbs the landing. Times are parts of the hop (0–1).
 */
export const HOP_AIR = { start: .28, end: .78 } as const;
/** Knee bend (radians) over the hop: dip, push-off, slight tuck in the air, landing, recovery. */
const HOP_KNEE: ReadonlyArray<readonly [number, number]> = [[0, 0], [.18, .5], [.28, 0], [.53, .26], [.78, .08], [.88, .55], [1, 0]];

/** Knee bend (radians) and arm swing (0–1) at a hop's progress; `planted` while both feet are on a rule. */
export function hopPose(progress: number): { knee: number; arms: number; planted: boolean } {
  const p = clamp(progress);
  let knee = 0;
  for (let i = 1; i < HOP_KNEE.length; i++) {
    const [t0, k0] = HOP_KNEE[i - 1]!, [t1, k1] = HOP_KNEE[i]!;
    if (p <= t1) { knee = mix(k0, k1, smoothstep((p - t0) / (t1 - t0))); break; }
  }
  const flight = clamp((p - HOP_AIR.start) / (HOP_AIR.end - HOP_AIR.start));
  return { knee, arms: Math.sin(Math.PI * flight), planted: p < HOP_AIR.start || p > HOP_AIR.end };
}

/** A time-based journey ends even if the visitor stops scrolling halfway through it. */
export function sampleJourney(j: Journey, now: number): Stop & { done: boolean; air: number; progress: number } {
  const t = clamp((now - j.start) / j.duration);
  if (j.lift !== undefined) {
    // A hop: Ben stays put while crouching and landing and flies on a ballistic arc between.
    const a = clamp((t - HOP_AIR.start) / (HOP_AIR.end - HOP_AIR.start)), air = Math.sin(Math.PI * a);
    return { ...j.to, x: mix(j.from.x,j.to.x,a), y: mix(j.from.y,j.to.y,a) - air * j.lift,
      height: mix(j.from.height,j.to.height,a), done: t === 1, air, progress: t };
  }
  const p = smoothstep(t);
  const air = j.kind === 'jump' ? Math.sin(Math.PI * t) : 0;
  return { ...j.to, x: mix(j.from.x,j.to.x,p), y: mix(j.from.y,j.to.y,p) - air * (j.lift ?? Math.min(150,j.to.height*.75)),
    height: mix(j.from.height,j.to.height,p), done: t === 1, air, progress: t };
}

/** Leg phase (radians) for a horizontal move: one full cycle per measured clip stride. */
export function strideAdvance(dx: number, height: number, strideLength: number): number {
  return Math.abs(dx) / (height * strideLength) * Math.PI * 2;
}

/** A walk at `speed` body heights per second, never hurried below .45 s or dragged past 1.8 s. */
export function walkDuration(distance: number, height: number, speed: number): number {
  return clamp(distance / (height * speed), .45, 1.8);
}

/** Stance has zero lift; the return step clears the ground. */
export function footStep(phase: number): { forward: number; lift: number } {
  const t = ((phase / (Math.PI * 2)) % 1 + 1) % 1;
  if (t < .6) return { forward: mix(.34,-.34,t/.6), lift: 0 };
  const swing = (t-.6)/.4;
  return { forward: mix(-.34,.34,smoothstep(swing)), lift: Math.sin(swing*Math.PI)*.22 };
}

/** Two-bone IK keeps the supporting shoe level on the page baseline. */
export function solveLeg(forward: number, reach: number) {
  const upper = .68, lower = .66;
  const d = Math.min(Math.hypot(forward,reach),upper+lower-.001);
  const knee = Math.acos(clamp((d*d-upper*upper-lower*lower)/(2*upper*lower),-1,1));
  const hip = Math.atan2(-forward,reach)-Math.atan2(lower*Math.sin(knee),upper+lower*Math.cos(knee));
  return { hip, knee, ankle: -hip-knee };
}
