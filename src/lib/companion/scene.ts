import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { stationaryPositions } from '../avatar/clips';
import { createHologram, type Hologram } from './hologram';
import { GESTURES, gestureClipTime, gestureLength } from './gestures';
import { hopPose } from './route';
import type { HoloState } from './timeline';

export interface PoseInput {
  time: number; wave: number; dark: boolean;
  x: number; feet: number; height: number; facing: number; stride: number; walk: number;
  air: number; point: number; watch: number; progress: number;
  /** Cursor in viewport pixels (the canvas covers the viewport); null without a mouse. */
  pointer: { x: number; y: number } | null;
  /** Materialise / dissolve state; absent while Ben is simply solid. */
  holo?: HoloState;
  /** A one-off gesture from the extra clips (e.g. the bow), with seconds since it started. */
  gesture?: { name: string; time: number };
  /** Progress (0–1) of a hop between rows; absent otherwise. */
  hop?: number;
}
export interface FrameInfo {
  /** Vertical ground correction in pixels. */
  ground: number;
  /** Current head turn towards the cursor in degrees; positive is to the viewer's right. */
  look: number;
  /** Ben's head (neck joint) in viewport pixels, e.g. for a speech bubble. */
  head: { x: number; y: number };
}
export interface BenScene {
  draw: (input: PoseInput) => FrameInfo;
  resize: (width: number, height: number) => void;
  /** Adjusts the rendering budget when the page crosses the mobile breakpoint. */
  setMobile: (mobile: boolean) => void;
  destroy: () => void;
  /** Root travel of one loop of the walk clip, in body heights. */
  walkStride: number;
  /** The walk clip's own pace, in body heights per second. */
  walkSpeed: number;
  /** Loads extra gesture clips for the same rig (skeleton-only GLB). */
  addGestures: (url: string, signal: AbortSignal) => Promise<void>;
  /** Playing time of a loaded gesture in seconds, or 0 while it is unavailable. */
  gestureDuration: (name: string) => number;
}

/** Clips whose ground offset is captured once and held instead of tracked: standing clips, and
 * gestures, whose own root motion already lifts Ben (flip), seats him (video games) or lays him down (push-ups). */
const planted = (name: string) => name === 'wait' || name === 'greet_04' || name in GESTURES;
/** Cross-fade between clips (s); a snapping gesture switches at once, under its glitch. */
const FADE = .22, SNAP_FADE = .03;
/** How quickly Ben starts and stops looking at the cursor (per second). */
const ATTENTION_RATE = 4;
/** Let a cross-fade settle before the planted ground offset is captured (seconds). */
const GROUND_SETTLE = .3;
/** The idle clip is held on this frame: Ben stands still and only breathes. */
const IDLE_POSE_TIME = 0;
/** Distance of the imagined cursor plane in front of Ben, in body heights. */
const LOOK_DEPTH = 1.4;
/** Largest head turn (radians): about 43° sideways and 23° up or down. */
const MAX_YAW = .75, MAX_PITCH = .4;
/** Part of the turn the neck takes; the head adds the rest. */
const NECK_SHARE = .4;

export const GREETING_DURATION = 2.8;

function disposeModel(root: THREE.Object3D) {
  const materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => materials.add(m));
  });
  materials.forEach(material => {
    Object.values(material).forEach(value => { if (value instanceof THREE.Texture) textures.add(value); });
    material.dispose();
  });
  textures.forEach(texture => texture.dispose());
}

/** One viewport-sized canvas lets Ben cross the typography without a clipping box. */
export async function createBenScene(container: HTMLElement, url: string, signal: AbortSignal, mobile = false): Promise<BenScene> {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.25 : 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  renderer.domElement.dataset.benCanvas = '';
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 1, 1, 0, .1, 3000);
  camera.position.set(0, 0, 1500);
  const stage = new THREE.Group(), character = new THREE.Group();
  stage.add(character); scene.add(stage);
  stage.add(new THREE.HemisphereLight(0xf2f6ff, 0x89827b, 1.4));
  for (const [color, power, x, y, z] of [[0xfff7ed, 3.1, -2.2, 4, 3.5], [0xcbdfee, 1.8, 2, 2.5, -2]]) {
    const light = new THREE.DirectionalLight(color, power);
    light.position.set(x!, y!, z!); stage.add(light, light.target);
  }
  const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, .04);
  scene.environment = environment.texture; scene.environmentIntensity = .65;
  room.dispose(); pmrem.dispose();
  let model: THREE.Group | undefined, mixer: THREE.AnimationMixer | undefined;
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Companion model: ${response.status}`);
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(await response.arrayBuffer(), '');
    model = gltf.scene;
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    character.add(model);
    model.traverse(node => { if ((node as THREE.SkinnedMesh).isSkinnedMesh) (node as THREE.SkinnedMesh).skeleton.pose(); });
    model.updateMatrixWorld(true);
    const initial = new THREE.Box3().setFromObject(model, true);
    const height = initial.getSize(new THREE.Vector3()).y;
    const centre = initial.getCenter(new THREE.Vector3());
    model.scale.setScalar(1 / height);
    model.position.set(-centre.x / height, -initial.min.y / height, -centre.z / height);
    const baseY = model.position.y;
    let hips: THREE.Bone | undefined, head: THREE.Bone | undefined, neck: THREE.Bone | undefined, chest: THREE.Bone | undefined, spine: THREE.Bone | undefined;
    const soles: THREE.Bone[] = [];
    const limbs = new Map<string, THREE.Bone>();
    model.traverse(node => {
      if ((node as THREE.Mesh).isMesh) node.frustumCulled = false;
      if (!(node as THREE.Bone).isBone) return;
      const bone = node as THREE.Bone;
      if (/Hips$/.test(node.name)) hips = bone;
      if (/Spine2$/.test(node.name)) chest = bone;
      if (/Spine$/.test(node.name)) spine = bone;
      const limb = /(Left|Right)(UpLeg|Leg|Foot|Arm)$/.exec(node.name);
      if (limb) limbs.set(limb[1]! + limb[2]!, bone);
      if (/Head$/.test(node.name)) head = bone;
      if (/Neck$/.test(node.name)) neck = bone;
      if (/(Foot|ToeBase|Toe_End)$/.test(node.name)) soles.push(bone);
    });
    if (!hips || !head || !neck) throw new Error('Ben is missing his body rig.');
    // Measure how far the walk clip carries the hips per loop, before the root travel is
    // removed below; the controller then moves the legs exactly as fast as Ben travels.
    const walkSource = gltf.animations.find(clip => clip.name === 'walk');
    let walkStride = 1, walkSpeed = .5;
    if (walkSource) {
      const probe = new THREE.AnimationMixer(model), action = probe.clipAction(walkSource).play();
      character.updateMatrixWorld(true);
      const hipsAt = (time: number) => {
        action.time = time; probe.update(0); model!.updateMatrixWorld(true);
        return character.worldToLocal(hips!.getWorldPosition(new THREE.Vector3()));
      };
      const start = hipsAt(0), end = hipsAt(walkSource.duration - 1e-3);
      probe.stopAllAction(); probe.uncacheRoot(model);
      model.traverse(node => { if ((node as THREE.SkinnedMesh).isSkinnedMesh) (node as THREE.SkinnedMesh).skeleton.pose(); });
      const travel = Math.hypot(end.x - start.x, end.z - start.z);
      if (Number.isFinite(travel) && travel > .2) { walkStride = travel; walkSpeed = travel / walkSource.duration; }
    }
    const prepare = (source: THREE.AnimationClip) => {
      const clip = source.clone();
      for (const track of clip.tracks) {
        if (track.name !== `${hips!.name}.position`) continue;
        track.values = stationaryPositions(track.values, hips!.position.x, hips!.position.z);
      }
      return clip;
    };
    const clips = new Map(gltf.animations.map(source => [source.name, prepare(source)]));
    for (const name of ['wait', 'walk', 'greet_04']) if (!clips.has(name)) throw new Error(`Missing Ben animation: ${name}`);
    mixer = new THREE.AnimationMixer(model);
    const actions = new Map([...clips].map(([name, clip]) => [name, mixer!.clipAction(clip)]));
    const gestureDuration = (name: string) => {
      const spec = GESTURES[name];
      return spec && actions.has(name) ? gestureLength(spec) : 0;
    };
    let current: THREE.AnimationAction | undefined, currentName = '', lastWave = Infinity, lastGesture = Infinity, previous = 0, neutralLook = 0, attention = 0;
    let ground = 0, groundPrimed = false, heldGround: number | undefined, clipStarted = 0, capturedFor = -1;
    let hologram: Hologram | undefined;
    const headPose = head.quaternion.clone(), neckPose = neck.quaternion.clone();
    const headRest = head.quaternion.clone(), neckRest = neck.quaternion.clone();
    const point = new THREE.Vector3();
    const look = new THREE.Quaternion(), lookEuler = new THREE.Euler();
    const partial = new THREE.Quaternion(), parentTurn = new THREE.Quaternion(), localTurn = new THREE.Quaternion();
    let lookYaw = 0, lookPitch = 0;
    /** Rotates a bone by `share` of the world-space look rotation, whatever its local axes. */
    const turnInWorld = (bone: THREE.Bone, share: number) => {
      partial.identity().slerp(look, share);
      bone.parent!.getWorldQuaternion(parentTurn);
      localTurn.copy(parentTurn).invert().multiply(partial).multiply(parentTurn);
      bone.quaternion.premultiply(localTurn);
      bone.updateMatrixWorld(true);
    };
    // The mixer only rewrites a bone when its clip value changes, and the idle pose is frozen:
    // bones bent for a hop are put back by hand before the next frame, or the bends add up.
    const bent: Array<[THREE.Bone, THREE.Quaternion]> = [];
    /** Rotates a bone about a world axis through its own joint, whatever its local axes. */
    const turnAbout = (bone: THREE.Bone, axis: THREE.Vector3, angle: number) => {
      if (!bent.some(([b]) => b === bone)) bent.push([bone, bone.quaternion.clone()]);
      partial.setFromAxisAngle(axis, angle);
      bone.parent!.getWorldQuaternion(parentTurn);
      localTurn.copy(parentTurn).invert().multiply(partial).multiply(parentTurn);
      bone.quaternion.premultiply(localTurn);
      bone.updateMatrixWorld(true);
    };
    character.updateMatrixWorld(true);
    // Hops bend both legs at hip, knee and ankle; the leg length tells how far the hips sink.
    const legs = (['Left', 'Right'] as const).map(side => ({ hip: limbs.get(`${side}UpLeg`), knee: limbs.get(`${side}Leg`), ankle: limbs.get(`${side}Foot`) }))
      .filter((leg): leg is { hip: THREE.Bone; knee: THREE.Bone; ankle: THREE.Bone } => !!(leg.hip && leg.knee && leg.ankle));
    const localOf = (bone: THREE.Bone) => character.worldToLocal(bone.getWorldPosition(new THREE.Vector3()));
    const legLength = legs.length ? localOf(legs[0]!.hip).distanceTo(localOf(legs[0]!.knee)) + localOf(legs[0]!.knee).distanceTo(localOf(legs[0]!.ankle)) : 0;
    const arms = [limbs.get('LeftArm'), limbs.get('RightArm')];
    const sideways = new THREE.Vector3(), forward = new THREE.Vector3(), facingTurn = new THREE.Quaternion();
    const soleHeight = () => Math.min(...soles.map(bone => character.worldToLocal(bone.getWorldPosition(point)).y));
    const restSole = soles.length ? soleHeight() : 0;
    const shadowMaterial = new THREE.MeshBasicMaterial({ color: 0x25201c, transparent: true, opacity: .1, depthWrite: false });
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(.15, 32), shadowMaterial);
    shadow.scale.y = .13; shadow.position.set(0, .008, -.08); stage.add(shadow);
    container.append(renderer.domElement);
    let dead = false, lastWidth = 0, lastHeight = 0;
    return {
      walkStride, walkSpeed, gestureDuration,
      setMobile(value) {
        if (dead || mobile === value) return;
        mobile = value;
        renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.25 : 1.5));
        // A new breakpoint uses a different glyph/beam budget. Restore the model before
        // recreating the effect; otherwise the next cache could capture reveal materials.
        hologram?.dispose(); hologram = undefined;
      },
      async addGestures(url, signal) {
        const response = await fetch(url, { signal });
        if (!response.ok) throw new Error(`Companion gestures: ${response.status}`);
        const extra = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '');
        if (dead || signal.aborted) return;
        // The tracks address bones by name, so the skeleton-only file drives Ben's own rig.
        for (const source of extra.animations) if (!actions.has(source.name)) actions.set(source.name, mixer!.clipAction(prepare(source)));
      },
      resize(width, height) {
        const w = Math.round(width), h = Math.round(height);
        if (w === lastWidth && h === lastHeight) return;
        lastWidth = w; lastHeight = h;
        renderer.setSize(w, h, false); camera.right = w; camera.top = h; camera.updateProjectionMatrix();
      },
      draw(input) {
        if (dead) return { ground: 0, look: 0, head: { x: 0, y: 0 } };
        const dt = previous ? Math.min(input.time - previous, .25) : 0; previous = input.time;
        const waving = input.wave >= 0 && input.wave < GREETING_DURATION;
        const gestureTime = input.gesture?.time ?? -1;
        const gesture = input.gesture && gestureTime >= 0 && gestureTime < gestureDuration(input.gesture.name) ? input.gesture.name : undefined;
        // A hop keeps the standing clip; its legs are bent procedurally below.
        const name = input.walk > .08 ? 'walk' : gesture ?? (waving ? 'greet_04' : 'wait');
        const restart = (name === 'greet_04' && input.wave < lastWave) || (name === gesture && gestureTime < lastGesture);
        if (name !== currentName || restart) {
          const next = actions.get(name)!;
          for (const action of actions.values()) if (action !== current && action !== next) action.stop();
          const old = current;
          const fade = GESTURES[name]?.snapIn || GESTURES[currentName]?.snapOut ? SNAP_FADE : FADE;
          current = next.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();
          if (old && old !== current) { old.fadeOut(fade); current.fadeIn(fade); }
          currentName = name;
          // Keep the previous held offset through the cross-fade; recapture once it settles.
          clipStarted = input.time;
        }
        lastWave = input.wave; lastGesture = gestureTime;
        head!.quaternion.copy(headPose); neck!.quaternion.copy(neckPose);
        for (const [bone, rest] of bent) bone.quaternion.copy(rest);
        bent.length = 0;
        mixer!.update(dt);
        if (currentName === 'walk') current!.time = ((input.stride / (Math.PI * 2)) % 1) * current!.getClip().duration;
        else if (currentName === gesture) current!.time = gestureClipTime(GESTURES[gesture]!, gestureTime);
        else if (currentName === 'greet_04') current!.time = Math.min(input.wave, current!.getClip().duration);
        // The idle clip shifts weight and swings the arms all the time; Ben holds still instead.
        else if (currentName === 'wait') current!.time = IDLE_POSE_TIME;
        mixer!.update(0);
        headPose.copy(head!.quaternion); neckPose.copy(neck!.quaternion);
        neutralLook += ((currentName === 'wait' ? 1 : 0) - neutralLook) * (1 - Math.exp(-dt * 7));
        head!.quaternion.slerp(headRest, neutralLook);
        neck!.quaternion.slerp(neckRest, neutralLook);
        // A slow, barely visible breath keeps the still pose alive.
        if (chest && currentName === 'wait') chest.rotateX(Math.sin(input.time * 1.6) * .006);
        stage.position.set(input.x, lastHeight - input.feet, 0); stage.scale.setScalar(input.height);
        character.rotation.y = input.facing;
        model!.position.y = baseY;
        character.updateMatrixWorld(true);
        // Walking and jumping keep the supporting foot on the page baseline. While standing,
        // the offset is captured once the cross-fade has settled and then held: tracking it
        // every frame made Ben bob by ~4 px in idle and hop by up to 10 px between clips.
        const measured = soles.length ? restSole - soleHeight() : 0;
        let target = measured;
        if (planted(currentName)) {
          const settled = input.time - clipStarted >= GROUND_SETTLE;
          if (settled && clipStarted !== capturedFor) { heldGround = measured; capturedFor = clipStarted; }
          if (heldGround !== undefined) target = heldGround;
        } else {
          heldGround = undefined;
        }
        ground = groundPrimed ? ground + (target - ground) * (1 - Math.exp(-dt * 12)) : target;
        groundPrimed = true;
        model!.position.y += ground;
        character.updateMatrixWorld(true);
        if (input.hop !== undefined && legs.length) {
          // Dip, push off, tuck, land: thighs swing the knees forward, shins swing back by twice
          // as much and the feet stay level, so a planted foot never leaves its rule.
          const hop = hopPose(input.hop);
          character.getWorldQuaternion(facingTurn);
          sideways.set(1, 0, 0).applyQuaternion(facingTurn);
          forward.set(0, 0, 1).applyQuaternion(facingTurn);
          for (const leg of legs) {
            turnAbout(leg.hip, sideways, -hop.knee);
            turnAbout(leg.knee, sideways, 2 * hop.knee);
            turnAbout(leg.ankle, sideways, -hop.knee);
          }
          if (spine) turnAbout(spine, sideways, hop.knee * .3);
          // The arms lift off the hips a little while he is in the air.
          if (arms[0]) turnAbout(arms[0], forward, hop.arms * .3);
          if (arms[1]) turnAbout(arms[1], forward, -hop.arms * .3);
          if (hop.planted) model!.position.y -= legLength * (1 - Math.cos(hop.knee));
          character.updateMatrixWorld(true);
        }
        // Look at the cursor: the turn is computed in screen space from Ben's head to the
        // pointer and applied in world space, split between neck and head. Only once he
        // stands solid and still: materialising, greeting or bowing play out undisturbed,
        // and his gaze eases in afterwards instead of snapping to the cursor.
        attention += ((!input.holo && currentName === 'wait' ? 1 : 0) - attention) * (1 - Math.exp(-dt * ATTENTION_RATE));
        let yawTarget = 0, pitchTarget = 0;
        if (input.pointer && attention) {
          head!.getWorldPosition(point);
          const depth = input.height * LOOK_DEPTH;
          yawTarget = THREE.MathUtils.clamp(Math.atan2(input.pointer.x - point.x, depth), -MAX_YAW, MAX_YAW) * attention;
          // World y points up, the pointer's y points down.
          pitchTarget = THREE.MathUtils.clamp(Math.atan2(point.y - (lastHeight - input.pointer.y), depth), -MAX_PITCH, MAX_PITCH) * attention;
        }
        const follow = 1 - Math.exp(-dt * 9);
        lookYaw += (yawTarget - lookYaw) * follow;
        lookPitch += (pitchTarget - lookPitch) * follow;
        // Pitch about world x (positive looks down), then yaw about world y (positive looks right).
        look.setFromEuler(lookEuler.set(lookPitch, lookYaw, 0, 'YXZ'));
        turnInWorld(neck!, NECK_SHARE);
        turnInWorld(head!, 1 - NECK_SHARE);
        if (input.holo) {
          // Fewer glyph columns and beams on phones and tablets (the canvas is only Ben-sized).
          hologram ??= createHologram(stage, model!, innerWidth < 992);
          hologram.update(input.holo, input.time, stage.position.y, input.height, input.dark);
        } else if (hologram) {
          // Phones revisit sections often while scrolling. Keep the already compiled effect
          // available instead of allocating materials, textures and geometry on each arrival.
          if (mobile) hologram.hide();
          else { hologram.dispose(); hologram = undefined; }
        }
        const presence = input.holo ? THREE.MathUtils.clamp(input.holo.scan, 0, 1) : 1;
        shadowMaterial.opacity = (input.dark ? .17 : .1) * (1 - input.air * .85) * presence;
        shadow.scale.x = 1 - input.air * .35;
        renderer.toneMappingExposure = input.dark ? 1.2 : 1.05;
        renderer.render(scene, camera);
        // The camera works in viewport pixels with y pointing up.
        head!.getWorldPosition(point);
        return { ground: ground * input.height, look: THREE.MathUtils.radToDeg(lookYaw), head: { x: point.x, y: lastHeight - point.y } };
      },
      destroy() {
        if (dead) return; dead = true;
        hologram?.dispose(); hologram = undefined;
        mixer!.stopAllAction(); mixer!.uncacheRoot(model!);
        disposeModel(model!); shadow.geometry.dispose(); shadowMaterial.dispose(); environment.dispose();
        renderer.dispose(); renderer.domElement.remove();
      },
    };
  } catch (error) {
    if (model) disposeModel(model);
    environment.dispose(); renderer.dispose(); throw error;
  }
}
