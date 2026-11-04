import { describe, expect, it } from 'vitest';
import { destination, HOP_AIR, hopPose, nextRow, rowStop, sampleJourney, footStep, solveLeg, strideAdvance, walkDuration, type Journey } from '../src/lib/companion/route';
import { createTrickBag, gestureClipTime, gestureLength, GESTURES, glitchState, GLITCH, TRICKS } from '../src/lib/companion/gestures';
import { beamOutState, farewellState, spawnState, BEAM_OUT_DURATION, SPAWN_DURATION, FAREWELL_DURATION, type HoloState } from '../src/lib/companion/timeline';

const times = (end: number) => Array.from({ length: 101 }, (_, i) => (i / 100) * end);
const built = (s: HoloState) => s.scan >= 1;

describe('hologram timeline', () => {
  it('builds Ben up from invisible to solid in the full entrance', () => {
    const start = spawnState(0, 'full');
    expect(start.scan).toBeLessThanOrEqual(0);
    expect(start.color).toBe(0);
    expect(start.done).toBe(false);
    const end = spawnState(SPAWN_DURATION.full, 'full');
    expect(end).toMatchObject({ glyphs: 0, beams: 0, color: 1, done: true });
    expect(end.scan).toBeGreaterThanOrEqual(1);
    expect(spawnState(1, 'full').glyphs).toBeGreaterThan(.9);
    expect(spawnState(1, 'full').beams).toBeGreaterThan(.9);
  });
  it('builds upwards and only turns to colour once Ben is complete', () => {
    for (const mode of ['full', 'short'] as const) {
      let previous = spawnState(0, mode);
      for (const t of times(SPAWN_DURATION[mode])) {
        const s = spawnState(t, mode);
        if (s.color > 0) expect(built(s)).toBe(true);
        expect(s.scan).toBeGreaterThanOrEqual(previous.scan);
        expect(s.color).toBeGreaterThanOrEqual(previous.color);
        previous = s;
      }
    }
  });
  it('keeps the short entrance quick and without glyph rain', () => {
    expect(SPAWN_DURATION.short).toBeLessThanOrEqual(1);
    for (const t of times(SPAWN_DURATION.short)) expect(spawnState(t, 'short').glyphs).toBe(0);
    expect(spawnState(SPAWN_DURATION.short, 'short')).toMatchObject({ color: 1, done: true });
  });
  it('drains the colour first, then dissolves Ben top down', () => {
    for (const [state, duration] of [[farewellState, FAREWELL_DURATION], [beamOutState, BEAM_OUT_DURATION]] as const) {
      const start = state(0);
      expect(start.color).toBe(1);
      expect(built(start)).toBe(true);
      const end = state(duration);
      expect(end.scan).toBeLessThanOrEqual(0);
      expect(end).toMatchObject({ color: 0, done: true });
      let previous = start;
      for (const t of times(duration)) {
        const s = state(t);
        if (s.color > 0) expect(built(s)).toBe(true);
        expect(s.scan).toBeLessThanOrEqual(previous.scan);
        expect(s.color).toBeLessThanOrEqual(previous.color);
        previous = s;
      }
    }
  });
  it('beams Ben away quickly between sections', () => {
    expect(BEAM_OUT_DURATION).toBeLessThanOrEqual(.5);
    for (const t of times(BEAM_OUT_DURATION)) expect(beamOutState(t).glyphs).toBe(0);
  });
});

describe('natural walking', () => {
  it('advances one full leg cycle per measured stride length', () => {
    expect(strideAdvance(300 * 1.5, 300, 1.5)).toBeCloseTo(Math.PI * 2);
    expect(strideAdvance(-150, 300, 1)).toBeCloseTo(Math.PI);
  });
  it('walks at the given pace within sensible bounds', () => {
    expect(walkDuration(300, 300, 1)).toBeCloseTo(1);
    expect(walkDuration(20, 300, 1)).toBe(.45);
    expect(walkDuration(5000, 300, 1)).toBe(1.8);
  });
});
// Hero frame, technology rule (its part of the page starts at the rule), projects dock.
const anchors=[
  {x:720,y:120,width:480,height:420,zone:0},
  {x:1060,y:900,width:140,height:165,zone:1065},
  {x:184,y:2300,width:1072,height:165,zone:1800,dock:true,standX:600},
];
describe('grounded companion motion',()=>{
  it('follows the part of the page being read',()=>{
    expect(destination(0,900,anchors).station).toBe(0);
    // 600 + 60 % of 900 = 1140: the technologies (from 1065) have begun.
    expect(destination(600,900,anchors)).toMatchObject({station:1,y:1065});
    // In the projects Ben stands in his dock, on its top edge, at the dock's standing point.
    expect(destination(1300,900,anchors)).toEqual({station:2,x:600,y:2300,height:165,row:-1,say:undefined,dock:true});
    // Phones use the same stations (smaller ones): Ben follows there too.
    expect(destination(600,844,anchors).station).toBe(1);
  });
  it('reaches a long part of the page as soon as it begins, wherever Ben stands in it',()=>{
    // The contact dock rests at the very end, far below where the contact part begins.
    const page=[...anchors,{x:184,y:4800,width:1072,height:165,zone:3600,dock:true,standX:1180}];
    expect(destination(3000,900,page).station).toBe(2);
    expect(destination(3100,900,page).station).toBe(3);
  });
  it('completes a jump in time, independent of subsequent scroll input',()=>{
    const journey:Journey={from:{x:300,y:500,height:300,station:0},to:{x:900,y:950,height:165,station:1},start:10,duration:.95,kind:'jump'};
    expect(sampleJourney(journey,10)).toMatchObject({x:300,y:500,done:false});
    const mid=sampleJourney(journey,10.475);
    expect(mid.y).toBeLessThan((500+950)/2);
    expect(mid.air).toBeCloseTo(1);
    expect(sampleJourney(journey,11)).toMatchObject({...journey.to,done:true});
  });
  it('plants a level shoe throughout stance and clears the ground on return',()=>{
    for(let n=0;n<100;n++){
      const t=n/100,step=footStep(t*Math.PI*2),reach=1.28-step.lift;
      if(t<.6)expect(step.lift).toBe(0);else expect(step.lift).toBeGreaterThan(0);
      const leg=solveLeg(step.forward,reach);
      const forward=-.68*Math.sin(leg.hip)-.66*Math.sin(leg.hip+leg.knee);
      const down=.68*Math.cos(leg.hip)+.66*Math.cos(leg.hip+leg.knee);
      expect(forward).toBeCloseTo(step.forward,5);expect(down).toBeCloseTo(reach,5);
      expect(leg.hip+leg.knee+leg.ankle).toBeCloseTo(0,8);
    }
    expect(footStep(2*Math.PI)).toEqual(footStep(0));
  });
});

describe('technology rows', () => {
  const section = { x: 1180, y: 1000, height: 165, station: 1, row: -1, say: 'section' };
  const rows = [{ x: 1180, y: 1200, say: 'a' }, { x: 1180, y: 1290, say: 'b' }, { x: 1180, y: 1380, say: 'c' }];
  it('follows the hovered row, otherwise the row passing 62 % of the viewport', () => {
    expect(rowStop(section, rows, 0, 900)).toEqual(section);
    // 800 + 62 % of 900 = 1358: rows a (1200) and b (1290) have passed, c (1380) not yet.
    expect(rowStop(section, rows, 800, 900)).toMatchObject({ row: 1, y: 1290, say: 'b', station: 1, height: 165 });
    expect(rowStop(section, rows, 800, 900, 2)).toMatchObject({ row: 2, y: 1380 });
  });
  it('hops one row at a time', () => {
    expect([nextRow(-1, 2), nextRow(0, 2), nextRow(2, 2), nextRow(2, -1)]).toEqual([0, 1, 2, 1]);
  });
  it('crouches in place, flies on an arc and lands in place', () => {
    const hop: Journey = { from: { ...section }, to: { ...section, y: 1200, row: 0 }, start: 0, duration: 1, kind: 'jump', lift: 26 };
    expect(sampleJourney(hop, .2)).toMatchObject({ y: 1000, air: 0 });
    expect(sampleJourney(hop, .53).air).toBeCloseTo(1);
    expect(sampleJourney(hop, .53).y).toBeCloseTo(1100 - 26);
    expect(sampleJourney(hop, .9)).toMatchObject({ y: 1200, row: 0 });
    expect(sampleJourney(hop, .9).air).toBeCloseTo(0);
    // Knees: still at the start, a dip before take-off, straight legs at take-off, a light tuck in
    // the air, a deeper bend on landing, standing again at the end.
    expect(hopPose(0)).toEqual({ knee: 0, arms: 0, planted: true });
    expect(hopPose(.18).knee).toBeCloseTo(.5);
    expect(hopPose(HOP_AIR.start).knee).toBe(0);
    expect(hopPose(HOP_AIR.start - .01).planted).toBe(true);
    expect(hopPose(.53)).toMatchObject({ planted: false });
    expect(hopPose(.53).arms).toBeCloseTo(1);
    expect(hopPose(.88)).toMatchObject({ knee: .55, planted: true });
    expect(hopPose(1)).toMatchObject({ knee: 0, planted: true });
    expect(hopPose(1).arms).toBeCloseTo(0);
    for (let i = 0; i < 100; i++) expect(hopPose(i / 100).knee).toBeLessThanOrEqual(.55);
  });
});

describe('gestures and tricks', () => {
  it('plays loops and holds as long as specified', () => {
    const pushUps = GESTURES['press-up']!, gaming = GESTURES.play_video_game!;
    expect(gestureLength(pushUps)).toBeCloseTo(1.96 * 3 / 1.2);
    expect(gestureClipTime(pushUps, 1.96 / 1.2 + .1)).toBeCloseTo(.12);
    expect(gestureClipTime(pushUps, 99)).toBe(pushUps.to);
    const held = { from: 0, to: 3, speed: 1, hold: .7 };
    expect(gestureLength(held)).toBeCloseTo(3.7);
    expect(gestureClipTime(held, 3.4)).toBe(held.to);
    // Gaming plays a stretch from the middle of the source clip, once and without a hold.
    expect(gaming.hold).toBeUndefined();
    expect(gestureLength(gaming)).toBeCloseTo(2.95);
    expect(gestureClipTime(gaming, 0)).toBe(gaming.from);
    expect(gestureClipTime(gaming, 99)).toBe(gaming.to);
  });
  it('nods with a short, unsnapped agree gesture', () => {
    const agree = GESTURES.agree!;
    expect(gestureLength(agree)).toBeGreaterThan(1);
    expect(gestureLength(agree)).toBeLessThan(2.5);
    expect(gestureClipTime(agree, 0)).toBe(agree.from);
    expect(glitchState(agree, 0)).toBeUndefined();
    expect(glitchState(agree, gestureLength(agree))).toBeUndefined();
    expect(TRICKS).not.toContain('agree');
  });
  it('hides a snap under a glitch that peaks exactly at the switch', () => {
    const pushUps = GESTURES['press-up']!;
    expect(glitchState(pushUps, 0)!.color).toBeCloseTo(.2);
    expect(glitchState(pushUps, -GLITCH / 2)!.color).toBeGreaterThan(.2);
    expect(glitchState(pushUps, 1)).toBeUndefined();
    expect(glitchState(pushUps, gestureLength(pushUps))!.color).toBeCloseTo(.2);
    expect(glitchState(GESTURES.flip!, 0)).toBeUndefined();
    // Gaming sits from start to end, so it snaps in and out of the standing pose.
    const gaming = GESTURES.play_video_game!;
    expect(glitchState(gaming, 0)!.color).toBeCloseTo(.2);
    expect(glitchState(gaming, gestureLength(gaming))!.color).toBeCloseTo(.2);
    expect(glitchState(gaming, 2)).toBeUndefined();
  });
  it('plays every trick before repeating and never the same one twice in a row', () => {
    let seed = 7;
    const next = createTrickBag(() => (seed = (seed * 9301 + 49297) % 233280) / 233280);
    const played = Array.from({ length: 50 }, next);
    for (let i = 0; i < 50; i += 5) expect(new Set(played.slice(i, i + 5)).size).toBe(TRICKS.length);
    for (let i = 1; i < 50; i++) expect(played[i]).not.toBe(played[i - 1]);
    for (const trick of TRICKS) expect(GESTURES[trick]).toBeDefined();
  });
});
