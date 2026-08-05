import { Canvas, extend, useFrame, useThree, type ThreeElement } from '@react-three/fiber';
import { shaderMaterial } from '@react-three/drei';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  BufferAttribute,
  BufferGeometry,
  NormalBlending,
  Vector2,
  Vector3,
  type ShaderMaterial,
} from 'three';
import {
  HERO_DOT_MIN,
  HERO_DOT_RANGE,
  HERO_FIT,
  sampleParticleField,
  type ParticleField,
} from '../../lib/hero/particles';
import { HERO_PALETTES, type ThemeName } from '../../lib/hero/palette';
import { HERO_FRAGMENT, HERO_VERTEX } from '../../lib/hero/shaders';

const MIN_OVERSCAN = 1;

const TUNING = {
  radius: 0.24,
  swirl: 0.095,
  push: 0.042,
  drift: 0.0035,
  lift: 0.16,
  freq: 3.4,
  burstReach: 0.28,
  burstLift: 0.4,
} as const;

const BURST_OUT = 1.05;
const BURST_HOLD = 0.26;
const BURST_BACK = 0.34;
const BURST_SPAN = BURST_OUT + BURST_HOLD + BURST_BACK;
const AMBIENT_SCALE = 0.62;
const CAMERA_Z = 4;

function burstEnvelope(elapsed: number): number {
  if (elapsed <= 0) return 0;
  if (elapsed < BURST_OUT) {
    const u = elapsed / BURST_OUT;
    return u * u * (3 - 2 * u);
  }
  if (elapsed < BURST_OUT + BURST_HOLD) return 1;
  const u = Math.min((elapsed - BURST_OUT - BURST_HOLD) / BURST_BACK, 1);
  const back = 1 - u;
  return back * back * back;
}

function envelopeToElapsed(value: number): number {
  const clamped = Math.min(Math.max(value, 0), 1);
  const u = 0.5 - Math.sin(Math.asin(1 - 2 * clamped) / 3);
  return u * BURST_OUT;
}

const HeroFieldMaterial = shaderMaterial(
  {
    uPlane: 1,
    uTime: 0,
    uPointer: new Vector2(0, 0),
    uStrength: 0,
    uLife: 0,
    uAmbient: 0,
    uScroll: 0,
    uBurst: 0,
    uRadius: TUNING.radius,
    uSwirl: TUNING.swirl,
    uPush: TUNING.push,
    uDrift: TUNING.drift,
    uLift: TUNING.lift,
    uFreq: TUNING.freq,
    uAtten: 1,
    uBurstReach: TUNING.burstReach,
    uBurstLift: TUNING.burstLift,
    uDot: new Vector2(HERO_DOT_MIN, HERO_DOT_RANGE),
    uInk: new Vector3(0, 0, 0),
    uTint: new Vector3(0, 0, 0),
    uHeat: new Vector3(0, 0, 0),
    uOpacity: 1,
  },
  HERO_VERTEX,
  HERO_FRAGMENT,
);

extend({ HeroFieldMaterial });

declare module '@react-three/fiber' {
  interface ThreeElements {
    heroFieldMaterial: ThreeElement<typeof HeroFieldMaterial>;
  }
}

interface HeroInput {
  px: number;
  py: number;
  life: number;
  ambient: number;
  scroll: number;
  burstQueue: number;
  overscan: number;
  drift: number;
  theme: ThemeName;
  wake?: () => void;
}

export interface HeroCanvasHandle {
  setScroll(progress: number): void;
  setTheme(theme: ThemeName): void;
  burst(): void;
  destroy(): void;
}

export interface MountOptions {
  src: string;
  pointerTarget: HTMLElement;
  frame: HTMLElement;
  theme: ThemeName;
  ambient: boolean;
  maxDpr: number;
  onReady?: () => void;
}

export function parseColor(css: string, fallback: [number, number, number]): Vector3 {
  const value = css.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const h = hex[1]!;
    const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h;
    return new Vector3(
      parseInt(full.slice(0, 2), 16) / 255,
      parseInt(full.slice(2, 4), 16) / 255,
      parseInt(full.slice(4, 6), 16) / 255,
    );
  }
  const nums = value.match(/[\d.]+/g);
  if (nums && nums.length >= 3) {
    return new Vector3(Number(nums[0]) / 255, Number(nums[1]) / 255, Number(nums[2]) / 255);
  }
  return new Vector3(...fallback);
}

function applyPalette(material: ShaderMaterial, theme: ThemeName): void {
  const palette = HERO_PALETTES[theme];
  const u = material.uniforms;
  (u.uInk!.value as Vector3).copy(parseColor(palette.ink, [0.078, 0.075, 0.071]));
  (u.uTint!.value as Vector3).copy(parseColor(palette.tint, [0.776, 0.745, 0.698]));
  (u.uHeat!.value as Vector3).copy(parseColor(palette.heat, [0.149, 0.439, 0.549]));
  (u.uDot!.value as Vector2).set(palette.dotMin, palette.dotRange);
}

interface FieldProps {
  field: ParticleField;
  input: HeroInput;
  onReady?: () => void;
}

function Field({ field, input, onReady }: FieldProps) {
  const viewport = useThree((s) => s.viewport);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const material = useRef<ShaderMaterial>(null);

  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(field.positions, 3));
    g.setAttribute('aTone', new BufferAttribute(field.tones, 1));
    g.setAttribute('aSeed', new BufferAttribute(field.seeds, 1));
    return g;
  }, [field]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  const fit = useRef({ span: 1, atten: 1 });
  fit.current = {
    span: Math.min(viewport.width, viewport.height) * HERO_FIT,
    atten: viewport.factor * viewport.dpr * camera.position.z,
  };

  useEffect(() => {
    invalidate();
  }, [viewport, camera, invalidate]);

  useEffect(() => {
    input.wake = invalidate;
    return () => {
      input.wake = undefined;
    };
  }, [input, invalidate]);

  const smooth = useRef({
    px: 0,
    py: 0,
    strength: 0,
    life: 0,
    ambient: 0,
    scroll: 0,
    time: 0,
    burst: 0,
    burstAt: 0,
    bursting: false,
    started: false,
  });
  const theme = useRef<ThemeName | null>(null);

  useLayoutEffect(() => {
    const m = material.current;
    if (!m) return;
    applyPalette(m, input.theme);
    theme.current = input.theme;
  }, [input]);

  const announced = useRef(false);

  useFrame((_, rawDelta) => {
    const m = material.current;
    if (!m) return;
    const s = smooth.current;
    const dt = Math.min(rawDelta, 1 / 30);

    if (!s.started) {
      s.started = true;
      s.px = input.px;
      s.py = input.py;
      s.scroll = input.scroll;
    }

    if (theme.current !== input.theme) {
      theme.current = input.theme;
      applyPalette(m, input.theme);
    }

    if (input.burstQueue > 0) {
      input.burstQueue = 0;
      s.burstAt = s.bursting ? envelopeToElapsed(s.burst) : 0;
      s.bursting = true;
    }

    if (s.bursting) {
      s.burstAt += dt;
      if (s.burstAt >= BURST_SPAN) {
        s.bursting = false;
        s.burstAt = 0;
        s.burst = 0;
      } else {
        s.burst = burstEnvelope(s.burstAt);
      }
    }

    const ease = (rate: number) => 1 - Math.exp(-dt * rate);
    s.px += (input.px - s.px) * ease(11);
    s.py += (input.py - s.py) * ease(11);
    s.life += (input.life - s.life) * ease(4);
    s.strength += (input.life - s.strength) * ease(6);
    s.ambient += (input.ambient - s.ambient) * ease(1.4);
    s.scroll += (input.scroll - s.scroll) * ease(14);
    s.time += dt * (0.35 + 0.65 * Math.max(s.life, s.ambient));

    const u = m.uniforms;
    u.uPlane!.value = fit.current.span / Math.max(input.overscan, MIN_OVERSCAN);
    u.uAtten!.value = fit.current.atten;
    (u.uPointer!.value as Vector2).set(s.px, s.py);
    u.uTime!.value = s.time;
    u.uLife!.value = s.life;
    u.uAmbient!.value = s.ambient * AMBIENT_SCALE;
    u.uDrift!.value = input.drift;
    u.uStrength!.value = s.strength;
    u.uScroll!.value = s.scroll;
    u.uBurst!.value = s.burst;

    if (!announced.current) {
      announced.current = true;
      requestAnimationFrame(() => onReady?.());
    }

    const busy =
      s.life > 1e-3 ||
      s.ambient > 1e-3 ||
      s.bursting ||
      Math.abs(input.px - s.px) > 1e-4 ||
      Math.abs(input.py - s.py) > 1e-4 ||
      Math.abs(input.life - s.life) > 1e-3 ||
      Math.abs(input.ambient - s.ambient) > 1e-3 ||
      Math.abs(input.life - s.strength) > 1e-3 ||
      Math.abs(input.scroll - s.scroll) > 1e-4;
    if (busy) invalidate();
  });

  return (
    <points frustumCulled={false} geometry={geometry}>
      <heroFieldMaterial
        ref={material}
        transparent
        blending={NormalBlending}
        depthTest={false}
        depthWrite={false}
      />
    </points>
  );
}

function Scene({ field, input, maxDpr, onReady }: FieldProps & { maxDpr: number }) {
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, maxDpr]}
      flat
      gl={{ antialias: false, alpha: true, powerPreference: 'high-performance' }}
      camera={{ position: [0, 0, CAMERA_Z], fov: 32, near: 0.1, far: 20 }}
      style={{ pointerEvents: 'none', touchAction: 'none' }}
    >
      <Field field={field} input={input} onReady={onReady} />
    </Canvas>
  );
}

async function loadField(src: string): Promise<ParticleField> {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  await img.decode();

  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  if (!ctx) throw new Error('no 2d context available to sample the hero source');
  ctx.drawImage(img, 0, 0);
  return sampleParticleField(ctx.getImageData(0, 0, canvas.width, canvas.height));
}

export function mountHeroCanvas(container: HTMLElement, options: MountOptions): HeroCanvasHandle {
  const input: HeroInput = {
    px: 0,
    py: 0,
    life: 0,
    ambient: 0,
    scroll: 0,
    burstQueue: 0,
    overscan: 1,
    drift: options.ambient ? TUNING.drift : 0,
    theme: options.theme,
  };

  const target = options.pointerTarget;
  let ambientTimer: number | undefined;

  const measure = (): void => {
    const canvas = container.getBoundingClientRect();
    const frame = options.frame.getBoundingClientRect();
    const outer = Math.min(canvas.width, canvas.height);
    const inner = Math.min(frame.width, frame.height);
    if (outer <= 0 || inner <= 0) return;
    input.overscan = Math.max(outer / inner, MIN_OVERSCAN);
    input.wake?.();
  };

  measure();
  const resize = new ResizeObserver(measure);
  resize.observe(container);
  resize.observe(options.frame);

  const toFieldSpace = (clientX: number, clientY: number): boolean => {
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const plane = (Math.min(rect.width, rect.height) * HERO_FIT) / input.overscan;
    input.px = (clientX - rect.left - rect.width / 2) / plane;
    input.py = -(clientY - rect.top - rect.height / 2) / plane;
    return true;
  };

  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return;
    if (!toFieldSpace(event.clientX, event.clientY)) return;
    input.life = 1;
    input.wake?.();
  };

  const onPointerLeave = () => {
    input.life = 0;
    input.wake?.();
  };

  const onActivate = (event: PointerEvent) => {
    const node = event.target as HTMLElement | null;
    if (node?.closest('a, button, [role="button"], input, label')) return;
    toFieldSpace(event.clientX, event.clientY);
    input.burstQueue += 1;
    if (event.pointerType === 'touch') {
      input.life = 1;
      window.clearTimeout(ambientTimer);
      ambientTimer = window.setTimeout(() => {
        input.life = 0;
        input.wake?.();
      }, 900);
    }
    input.wake?.();
  };

  target.addEventListener('pointermove', onPointerMove, { passive: true });
  target.addEventListener('pointerleave', onPointerLeave, { passive: true });
  target.addEventListener('pointerup', onActivate, { passive: true });
  window.addEventListener('blur', onPointerLeave, { passive: true });

  let root: Root | null = null;
  let destroyed = false;

  void loadField(options.src)
    .then((field) => {
      if (destroyed) return;
      root = createRoot(container);
      root.render(
        <Scene
          field={field}
          input={input}
          maxDpr={options.maxDpr}
          onReady={() => {
            options.onReady?.();
            if (options.ambient) {
              input.ambient = 1;
              input.wake?.();
            }
          }}
        />,
      );
    })
    .catch((error: unknown) => {
      console.error('[hero] particle field unavailable, keeping the poster', error);
    });

  return {
    setScroll(progress: number) {
      const next = Math.min(Math.max(progress, 0), 1);
      if (next === input.scroll) return;
      input.scroll = next;
      input.wake?.();
    },
    setTheme(theme: ThemeName) {
      if (theme === input.theme) return;
      input.theme = theme;
      input.wake?.();
    },
    burst() {
      input.burstQueue += 1;
      input.wake?.();
    },
    destroy() {
      destroyed = true;
      resize.disconnect();
      window.clearTimeout(ambientTimer);
      target.removeEventListener('pointermove', onPointerMove);
      target.removeEventListener('pointerleave', onPointerLeave);
      target.removeEventListener('pointerup', onActivate);
      window.removeEventListener('blur', onPointerLeave);
      input.wake = undefined;
      root?.unmount();
      root = null;
    },
  };
}
