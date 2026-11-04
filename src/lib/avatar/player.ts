import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { stationaryPositions, type StudioClip } from './clips';

export type StudioView = 'body' | 'portrait';
export interface Playback { index: number; time: number; duration: number; playing: boolean }
interface Options {
  url: string;
  reducedMotion: boolean;
  onReady: (clips: StudioClip[]) => void;
  onProgress: (progress: number) => void;
  onPlayback: (state: Playback) => void;
  onError: () => void;
}

export async function createAvatarPlayer(host: HTMLElement, options: Options) {
  let disposed = false;
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 40);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 0.4;
  controls.maxDistance = 14;
  controls.minPolarAngle = 0.15;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.rotateSpeed = 0.7;
  controls.zoomSpeed = 0.65;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.65;
  room.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xf2f6ff, 0x89827b, 1.4));
  const key = new THREE.DirectionalLight(0xfff7ed, 3.1);
  key.position.set(-2.2, 4, 3.5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -4;
  key.shadow.camera.right = 4;
  key.shadow.camera.top = 4;
  key.shadow.camera.bottom = -4;
  key.shadow.normalBias = 0.025;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xcbdfee, 1.8);
  rim.position.set(2, 2.5, -2);
  scene.add(rim);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.17 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.008;
  floor.receiveShadow = true;
  scene.add(floor);

  let model: THREE.Group | undefined;
  let mixer: THREE.AnimationMixer | undefined;
  let skeleton: THREE.SkeletonHelper | undefined;
  let head: THREE.Bone | undefined;
  let active: THREE.AnimationAction | undefined;
  let sourceClips: THREE.AnimationClip[] = [];
  let fixedClips: THREE.AnimationClip[] = [];
  let index = 0;
  let playing = false;
  let looping = false;
  let inPlace = true;
  let speed = 1;
  let view: StudioView = 'body';
  let raf = 0;
  let previous = 0;
  let lastReport = 0;
  let needsRender = true;
  const baseBounds = new THREE.Box3();
  const boundsCache = new Map<string, THREE.Box3>();
  const headPosition = new THREE.Vector3();
  const lastHeadPosition = new THREE.Vector3();
  let followHead = false;

  const report = () => options.onPlayback({ index, time: active?.time ?? 0, duration: active?.getClip().duration ?? 0, playing });
  function singleAction() {
    if (!mixer || !active) return;
    for (const clip of [...sourceClips, ...fixedClips]) {
      const action = mixer.existingAction(clip);
      if (action && action !== active) action.stop();
    }
    active.stopFading().setEffectiveWeight(1);
  }

  function clipBounds(): THREE.Box3 {
    const cacheKey = `${inPlace}:${index}`;
    const cached = boundsCache.get(cacheKey);
    if (cached) return cached;
    if (!model || !mixer || !active) return baseBounds;
    singleAction();
    const time = active.time;
    const paused = active.paused;
    const bounds = new THREE.Box3();
    const bonePosition = new THREE.Vector3();
    // A conservative motion envelope keeps jumps and travelling clips in frame.
    for (let i = 0; i <= 16; i++) {
      active.time = active.getClip().duration * i / 16;
      active.paused = true;
      mixer.update(0);
      model.updateMatrixWorld(true);
      model.traverse(node => {
        if ((node as THREE.Bone).isBone) bounds.expandByPoint(node.getWorldPosition(bonePosition));
      });
    }
    active.time = time;
    active.paused = paused;
    mixer.update(0);
    model.updateMatrixWorld(true);
    if (bounds.isEmpty()) bounds.copy(baseBounds);
    bounds.expandByScalar(0.16);
    boundsCache.set(cacheKey, bounds);
    return bounds;
  }

  function setView(next: StudioView = view) {
    needsRender = true;
    view = next;
    followHead = view === 'portrait' && Boolean(head);
    let target: THREE.Vector3;
    let distance: number;
    if (followHead && head) {
      head.getWorldPosition(headPosition);
      lastHeadPosition.copy(headPosition);
      target = headPosition.clone().add(new THREE.Vector3(0, 0.08, 0));
      distance = 1.15 / Math.min(1, camera.aspect);
    } else {
      const bounds = clipBounds();
      const size = bounds.getSize(new THREE.Vector3());
      target = bounds.getCenter(new THREE.Vector3());
      const fov = THREE.MathUtils.degToRad(camera.fov / 2);
      distance = Math.max(size.y / 2 / Math.tan(fov), size.x / 2 / (Math.tan(fov) * camera.aspect)) * 1.12 + size.z * 0.5;
    }
    controls.target.copy(target);
    camera.position.copy(target).add(new THREE.Vector3(0.12 * distance, 0.035 * distance, distance));
    controls.update();
  }

  function play(next: number, autoPlay = true, fade = true) {
    if (!mixer || !sourceClips[next]) return;
    const old = active;
    const oldTime = old?.time ?? 0;
    index = next;
    const clip = (inPlace ? fixedClips : sourceClips)[index];
    const nextAction = mixer.clipAction(clip);
    if (old === nextAction || !fade || options.reducedMotion) mixer.stopAllAction();
    else {
      for (const candidate of [...sourceClips, ...fixedClips]) {
        const action = mixer.existingAction(candidate);
        if (action && action !== old && action !== nextAction) action.stop();
      }
    }
    active = nextAction.reset().setEffectiveTimeScale(1).setEffectiveWeight(1);
    active.setLoop(looping ? THREE.LoopRepeat : THREE.LoopOnce, looping ? Infinity : 1);
    active.clampWhenFinished = true;
    active.play();
    playing = autoPlay;
    active.paused = !playing;
    // Measure before cross-fading so the bounds are for this clip alone.
    setView();
    if (old && old !== active && fade && !options.reducedMotion && autoPlay) {
      old.enabled = true;
      old.paused = false;
      old.time = oldTime;
      old.setEffectiveWeight(1).play().fadeOut(0.28);
      active.fadeIn(0.28);
    }
    mixer.update(0);
    report();
  }

  function resize() {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height);
    needsRender = true;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (active) setView();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  function tick(now: number) {
    if (disposed || document.hidden) { raf = 0; return; }
    raf = requestAnimationFrame(tick);
    const dt = previous ? Math.min((now - previous) / 1000, 0.05) : 0;
    previous = now;
    if (playing) mixer?.update(dt * speed);
    if (followHead && head) {
      head.getWorldPosition(headPosition);
      const delta = headPosition.clone().sub(lastHeadPosition);
      camera.position.add(delta);
      controls.target.add(delta);
      lastHeadPosition.copy(headPosition);
    }
    const cameraChanged = controls.update();
    if (playing || needsRender || cameraChanged) {
      renderer.render(scene, camera);
      needsRender = false;
    }
    if (playing && now - lastReport > 100) { report(); lastReport = now; }
  }
  const visibility = () => {
    previous = 0;
    if (!document.hidden && !raf && !disposed) raf = requestAnimationFrame(tick);
  };
  document.addEventListener('visibilitychange', visibility);
  const contextLost = (event: Event) => { event.preventDefault(); options.onError(); };
  renderer.domElement.addEventListener('webglcontextlost', contextLost);

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    observer.disconnect();
    document.removeEventListener('visibilitychange', visibility);
    renderer.domElement.removeEventListener('webglcontextlost', contextLost);
    controls.dispose();
    mixer?.stopAllAction();
    if (model) mixer?.uncacheRoot(model);
    const textures = new Set<THREE.Texture>();
    scene.traverse(node => {
      const mesh = node as THREE.Mesh;
      mesh.geometry?.dispose();
      if (!mesh.material) return;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
        material.dispose();
      }
    });
    textures.forEach(texture => texture.dispose());
    key.shadow.dispose();
    environment.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }

  try {
    const gltf = await new GLTFLoader().loadAsync(options.url, event => {
      if (event.total) options.onProgress(Math.min(100, event.loaded / event.total * 100));
    });
    model = gltf.scene;
    scene.add(model);
    model.updateMatrixWorld(true);
    const initial = new THREE.Box3().setFromObject(model, true);
    const height = initial.getSize(new THREE.Vector3()).y;
    const scale = 1.8 / height;
    const center = initial.getCenter(new THREE.Vector3());
    model.scale.multiplyScalar(scale);
    model.position.set(-center.x * scale, -initial.min.y * scale, -center.z * scale);
    let hips: THREE.Bone | undefined;
    model.traverse(node => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; }
      if ((node as THREE.Bone).isBone && /Hips$/i.test(node.name)) hips = node as THREE.Bone;
      if ((node as THREE.Bone).isBone && /Head$/i.test(node.name)) head = node as THREE.Bone;
    });
    model.updateMatrixWorld(true);
    baseBounds.setFromObject(model, true);
    sourceClips = gltf.animations;
    if (!sourceClips.length) throw new Error('The model contains no animations.');
    fixedClips = sourceClips.map(clip => {
      const copy = clip.clone();
      copy.name = `${clip.name}__stationary`;
      for (const track of copy.tracks) {
        if (hips && track.name === `${hips.name}.position` && track.getValueSize() === 3) {
          track.values = stationaryPositions(track.values, hips.position.x, hips.position.z);
        }
      }
      return copy;
    });
    mixer = new THREE.AnimationMixer(model);
    mixer.addEventListener('finished', event => {
      if (event.action === active) { playing = false; needsRender = true; report(); }
    });
    skeleton = new THREE.SkeletonHelper(model);
    skeleton.visible = false;
    const boneMaterial = skeleton.material as THREE.LineBasicMaterial;
    boneMaterial.depthTest = false;
    boneMaterial.transparent = true;
    boneMaterial.opacity = 0.8;
    skeleton.renderOrder = 5;
    scene.add(skeleton);
    options.onReady(sourceClips.map((clip, i) => ({ index: i, name: clip.name, duration: clip.duration })));
    const initialIndex = sourceClips.findIndex(clip => clip.name === (options.reducedMotion ? 'wait' : 'greet_04'));
    play(Math.max(0, initialIndex), !options.reducedMotion, false);
    raf = requestAnimationFrame(tick);
  } catch (error) {
    dispose();
    throw error;
  }

  return {
    dispose,
    play,
    setView,
    toggle() {
      if (!active) return;
      if (!playing && active.time >= active.getClip().duration - 0.01) { play(index); return; }
      singleAction();
      playing = !playing;
      active.paused = !playing;
      report();
    },
    seek(time: number) {
      if (!active || !mixer) return;
      singleAction();
      playing = false;
      active.paused = true;
      active.time = THREE.MathUtils.clamp(time, 0, active.getClip().duration);
      mixer.update(0);
      needsRender = true;
      report();
    },
    setSpeed(value: number) { speed = THREE.MathUtils.clamp(value, 0.25, 2); },
    setLoop(value: boolean) {
      looping = value;
      active?.setLoop(value ? THREE.LoopRepeat : THREE.LoopOnce, value ? Infinity : 1);
    },
    setInPlace(value: boolean) {
      if (value === inPlace) return;
      const time = active?.time ?? 0;
      const wasPlaying = playing;
      inPlace = value;
      play(index, wasPlaying, false);
      if (active) { active.time = time; mixer?.update(0); }
      report();
    },
    setSkeleton(value: boolean) { if (skeleton) { skeleton.visible = value; needsRender = true; } },
  };
}

export type AvatarPlayer = Awaited<ReturnType<typeof createAvatarPlayer>>;
