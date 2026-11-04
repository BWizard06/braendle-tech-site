import * as THREE from 'three';
import type { HoloState } from './timeline';

/** The site accent (`--accent` in global.css) for the light and the dark theme. */
const ACCENT = { light: '#26708c', dark: '#5fb3d1' } as const;
/** Glyph atlas, 4 × 4 cells: Ben's letters plus a few code characters. */
const GLYPHS = 'BENRÄDL{}<>/=;01';
const GLYPHS_PER_COLUMN = 16;

export interface Hologram {
  /** `base` is the world y of Ben's feet and `height` his body height, both in pixels. */
  update: (state: HoloState, time: number, base: number, height: number, dark: boolean) => void;
  /** Restore Ben's materials while retaining the effect for the next transition. */
  hide: () => void;
  dispose: () => void;
}

const HASH = /* glsl */`
float holoHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }`;
const SHARED_PARS = /* glsl */`
uniform float uScan;
uniform float uColor;
uniform float uGlitch;
uniform float uTime;
varying float vHoloHeight;
varying vec3 vHoloWorld;
varying vec3 vHoloNormal;${HASH}`;
const VERTEX_PARS = /* glsl */`
uniform float uBase;
uniform float uHeight;${SHARED_PARS}`;
// `transformed` is the skinned position in object space once <skinning_vertex> has run.
// While the colour glitches in, a few 9 px bands of the figure jump sideways.
const VERTEX_MAIN = /* glsl */`
  vec4 holoWorld = modelMatrix * vec4( transformed, 1.0 );
  vHoloWorld = holoWorld.xyz;
  vHoloHeight = ( holoWorld.y - uBase ) / uHeight;
  #ifdef USE_SKINNING
    vHoloNormal = normalize( transformedNormal );
  #else
    vHoloNormal = normalize( normalMatrix * normal );
  #endif
  float holoBand = floor( holoWorld.y / 9.0 );
  float holoTick = floor( uTime * 24.0 );
  float holoShift = uGlitch * step( 0.7, holoHash( vec2( holoBand, holoTick + 3.1 ) ) ) * ( holoHash( vec2( holoBand, holoTick ) ) - 0.5 ) * 16.0;
  if ( holoShift != 0.0 ) gl_Position = projectionMatrix * viewMatrix * ( holoWorld + vec4( holoShift, 0.0, 0.0, 0.0 ) );`;
// Horizontal 6 px bands switch to full colour in random order; near the threshold they flicker.
const FRAGMENT_PARS = /* glsl */`
uniform vec3 uHoloColor;
uniform float uFront;
uniform float uHot;${SHARED_PARS}
bool holoColored( float worldY ) {
  float band = floor( worldY / 6.0 );
  float order = holoHash( vec2( band, 7.3 ) );
  float jitter = ( holoHash( vec2( band, floor( uTime * 30.0 ) ) ) - 0.5 ) * 0.2;
  return order + jitter * uGlitch < uColor;
}`;

type Uniforms = Record<string, THREE.IUniform>;

function inject(shader: THREE.WebGLProgramParametersWithUniforms, uniforms: Uniforms) {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
    .replace('#include <project_vertex>', `#include <project_vertex>\n${VERTEX_MAIN}`);
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`);
}

/** Ben's own material, shown only where it is already built and its band is in colour. */
function revealMaterial(original: THREE.Material, uniforms: Uniforms): THREE.Material {
  const material = original.clone();
  material.onBeforeCompile = shader => {
    inject(shader, uniforms);
    shader.fragmentShader = shader.fragmentShader.replace('void main() {',
      'void main() {\n\tif ( vHoloHeight > uScan || !holoColored( vHoloWorld.y ) ) discard;');
  };
  return material;
}

/** The hologram: rim light, scan lines, a fine grid, flicker, and a sparkling build edge. */
function holoMaterial(uniforms: Uniforms): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false });
  material.polygonOffset = true;
  material.polygonOffsetFactor = -1;
  material.polygonOffsetUnits = -4;
  material.onBeforeCompile = shader => {
    inject(shader, uniforms);
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', /* glsl */`#include <opaque_fragment>
  if ( holoColored( vHoloWorld.y ) ) discard;
  float edge = vHoloHeight - uScan;
  // The camera is orthographic and looks down -z, so the view direction is constant.
  float rim = pow( 1.0 - abs( vHoloNormal.z ), 2.0 );
  float lines = smoothstep( 0.55, 1.0, sin( vHoloWorld.y * 1.6 - uTime * 9.0 ) * 0.5 + 0.5 );
  vec2 cell = abs( fract( vHoloWorld.xy / 14.0 ) - 0.5 );
  float grid = 1.0 - smoothstep( 0.0, 0.07, min( cell.x, cell.y ) );
  float flicker = 0.88 + 0.12 * sin( uTime * 53.0 + vHoloHeight * 9.0 );
  float body = step( edge, 0.0 ) * ( 0.16 + 0.5 * rim + 0.28 * lines + 0.2 * grid ) * flicker;
  // Particles gather at the build edge: dense just below it, thinning out above it.
  float noise = holoHash( floor( vHoloWorld.xy / 2.5 ) + floor( uTime * 30.0 ) );
  float density = edge > 0.0 ? ( 1.0 - smoothstep( 0.0, 0.09, edge ) ) * 0.45 : ( 1.0 - smoothstep( 0.0, 0.05, -edge ) ) * 0.6;
  float sparkle = step( 1.0 - density, noise ) * uFront;
  float alpha = body + sparkle;
  if ( alpha < 0.01 ) discard;
  gl_FragColor = vec4( mix( uHoloColor * ( 0.8 + 0.6 * rim ), vec3( 1.0 ), sparkle * uHot ), clamp( alpha, 0.0, 1.0 ) );`);
  };
  return material;
}

function glyphAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 42px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  [...GLYPHS].forEach((glyph, i) => ctx.fillText(glyph, (i % 4) * 64 + 32, Math.floor(i / 4) * 64 + 34));
  return new THREE.CanvasTexture(canvas);
}

const GLYPH_VERTEX = /* glsl */`
attribute vec4 aColumn; // x, z, fall speed, phase
attribute vec2 aGlyph;  // position in the column, random seed
uniform float uTime;
uniform float uSize;
uniform float uSpacing;
uniform float uTop;
uniform float uSpan;
varying vec2 vUv;
varying float vFade;
varying float vCell;
varying float vHead;
void main() {
  float head = uTop - mod( uTime * aColumn.z + aColumn.w, uSpan );
  float y = head + aGlyph.x * uSpacing;
  vHead = 1.0 - step( 0.5, aGlyph.x );
  vFade = ( 1.0 - aGlyph.x / ${GLYPHS_PER_COLUMN}.0 ) * smoothstep( -0.02, 0.12, y ) * ( 1.0 - smoothstep( uTop - 0.15, uTop, y ) );
  vCell = floor( fract( sin( aGlyph.y * 91.7 + floor( uTime * 7.0 + aGlyph.y * 13.0 ) * 12.9898 ) * 43758.5453 ) * 16.0 );
  vUv = uv;
  vec3 p = vec3( aColumn.x + position.x * uSize, y + position.y * uSize, aColumn.y );
  gl_Position = projectionMatrix * modelViewMatrix * vec4( p, 1.0 );
}`;
const GLYPH_FRAGMENT = /* glsl */`
uniform sampler2D uAtlas;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uHeadMix;
varying vec2 vUv;
varying float vFade;
varying float vCell;
varying float vHead;
void main() {
  vec2 cell = vec2( mod( vCell, 4.0 ), floor( vCell / 4.0 ) );
  vec2 uv = vec2( ( cell.x + vUv.x ) / 4.0, 1.0 - ( cell.y + 1.0 - vUv.y ) / 4.0 );
  float alpha = texture2D( uAtlas, uv ).a * vFade * uOpacity;
  if ( alpha < 0.01 ) discard;
  gl_FragColor = vec4( mix( uColor, vec3( 1.0 ), vHead * uHeadMix ), alpha );
  #include <colorspace_fragment>
}`;

function glyphRain(columns: number, uniforms: Uniforms): THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial> {
  const geometry = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1) as unknown as THREE.InstancedBufferGeometry);
  const count = columns * GLYPHS_PER_COLUMN;
  geometry.instanceCount = count;
  const column = new Float32Array(count * 4), glyph = new Float32Array(count * 2);
  for (let c = 0; c < columns; c++) {
    const x = ((c + .5) / columns * 2 - 1) * .78 + (Math.random() - .5) * .04;
    // A few columns pass in front of Ben, never across his body.
    const z = Math.abs(x) > .34 && c % 3 === 0 ? .45 : -.45;
    const speed = .9 + Math.random() * .8, phase = Math.random() * 2.4;
    for (let k = 0; k < GLYPHS_PER_COLUMN; k++) {
      const i = c * GLYPHS_PER_COLUMN + k;
      column.set([x, z, speed, phase], i * 4);
      glyph.set([k, i], i * 2);
    }
  }
  geometry.setAttribute('aColumn', new THREE.InstancedBufferAttribute(column, 4));
  geometry.setAttribute('aGlyph', new THREE.InstancedBufferAttribute(glyph, 2));
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: uniforms.uTime!, uColor: uniforms.uHoloColor!,
      uAtlas: { value: glyphAtlas() }, uOpacity: { value: 0 }, uHeadMix: { value: 0 },
      uSize: { value: .052 }, uSpacing: { value: .062 }, uTop: { value: 1.3 }, uSpan: { value: 2.4 },
    },
    vertexShader: GLYPH_VERTEX, fragmentShader: GLYPH_FRAGMENT,
    transparent: true, depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}

// Two fans of thin light beams from far left and far right meet Ben at the build edge.
// Low on the body they come down steeply from above; at head height they are almost flat.
const BEAM_VERTEX = /* glsl */`
attribute float aEnd;   // 0 at the far end, 1 on Ben
attribute float aSide;  // -1 left, 1 right
attribute float aSeed;
uniform float uScan;
uniform float uTime;
uniform float uOpacity;
varying float vAlpha;
varying float vEnd;${HASH}
void main() {
  float a = holoHash( vec2( aSeed, 1.3 ) ), b = holoHash( vec2( aSeed, 2.7 ) ), c = holoHash( vec2( aSeed, 4.1 ) );
  float edge = clamp( uScan, 0.0, 1.0 );
  vec3 far = vec3( aSide * ( 0.7 + 0.35 * a ), edge + mix( 0.15, 0.85, b ) * ( 1.0 - edge * 0.75 ), -0.2 + 0.4 * c );
  vec3 near = vec3( aSide * ( 0.02 + 0.2 * b ), edge + ( c - 0.5 ) * 0.04, ( a - 0.5 ) * 0.15 );
  vEnd = aEnd;
  vAlpha = uOpacity * step( 0.25, holoHash( vec2( aSeed, floor( uTime * 14.0 ) ) ) ) * ( 0.35 + 0.65 * a );
  gl_Position = projectionMatrix * modelViewMatrix * vec4( mix( far, near, aEnd ), 1.0 );
}`;
const BEAM_FRAGMENT = /* glsl */`
uniform vec3 uColor;
varying float vAlpha;
varying float vEnd;
void main() {
  gl_FragColor = vec4( uColor, vAlpha * mix( 0.15, 1.0, vEnd ) );
  #include <colorspace_fragment>
}`;

function beamFans(perSide: number, uniforms: Uniforms): THREE.LineSegments<THREE.BufferGeometry, THREE.ShaderMaterial> {
  const lines = perSide * 2;
  const position = new Float32Array(lines * 2 * 3), end = new Float32Array(lines * 2);
  const side = new Float32Array(lines * 2), seed = new Float32Array(lines * 2);
  for (let i = 0; i < lines; i++) {
    for (let v = 0; v < 2; v++) {
      end[i * 2 + v] = v;
      side[i * 2 + v] = i < perSide ? -1 : 1;
      seed[i * 2 + v] = i + 1;
    }
  }
  const geometry = new THREE.BufferGeometry();
  // Positions come from the shader; the attribute only gives three.js a vertex count.
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  geometry.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { uScan: uniforms.uScan!, uTime: uniforms.uTime!, uColor: uniforms.uHoloColor!, uOpacity: { value: 0 } },
    vertexShader: BEAM_VERTEX, fragmentShader: BEAM_FRAGMENT,
    transparent: true, depthWrite: false,
  });
  const mesh = new THREE.LineSegments(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * Materialise / dissolve effect around Ben. `hide` restores Ben's own materials and
 * keeps the helpers dormant; `update` reactivates them. `dispose` releases the cache.
 */
export function createHologram(stage: THREE.Object3D, model: THREE.Object3D, compact: boolean): Hologram {
  const color = new THREE.Color();
  const uniforms: Uniforms = {
    uBase: { value: 0 }, uHeight: { value: 1 }, uScan: { value: 0 }, uColor: { value: 0 }, uGlitch: { value: 0 },
    uTime: { value: 0 }, uFront: { value: 0 }, uHot: { value: 0 }, uHoloColor: { value: color },
  };
  const skinned: THREE.SkinnedMesh[] = [];
  model.traverse(node => { if ((node as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(node as THREE.SkinnedMesh); });
  const originals = new Map<THREE.SkinnedMesh, THREE.Material | THREE.Material[]>();
  const reveals = new Map<THREE.SkinnedMesh, THREE.Material | THREE.Material[]>();
  const clones: THREE.Material[] = [];
  const holo = holoMaterial(uniforms);
  const overlays: THREE.SkinnedMesh[] = [];
  for (const mesh of skinned) {
    originals.set(mesh, mesh.material);
    const reveal = (m: THREE.Material) => { const c = revealMaterial(m, uniforms); clones.push(c); return c; };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(reveal) : reveal(mesh.material);
    reveals.set(mesh, mesh.material);
    // A second skinned mesh on the same geometry and skeleton draws the hologram.
    const overlay = new THREE.SkinnedMesh(mesh.geometry, holo);
    overlay.bindMode = mesh.bindMode;
    overlay.bind(mesh.skeleton, mesh.bindMatrix);
    overlay.position.copy(mesh.position);
    overlay.quaternion.copy(mesh.quaternion);
    overlay.scale.copy(mesh.scale);
    overlay.frustumCulled = false;
    overlay.renderOrder = 2;
    mesh.parent!.add(overlay);
    overlays.push(overlay);
  }
  const effects = new THREE.Group();
  const glyphs = glyphRain(compact ? 8 : 14, uniforms);
  const beams = beamFans(compact ? 16 : 26, uniforms);
  effects.add(glyphs, beams);
  stage.add(effects);
  let dark: boolean | undefined;
  let active = true, disposed = false;
  const setActive = (value: boolean) => {
    if (active === value) return;
    active = value;
    for (const [mesh, material] of value ? reveals : originals) mesh.material = material;
    for (const overlay of overlays) overlay.visible = value;
    effects.visible = value;
  };
  return {
    update(state, time, base, height, isDark) {
      if (disposed) return;
      setActive(true);
      const front = THREE.MathUtils.smoothstep(state.scan, -.06, -.02) * (1 - THREE.MathUtils.smoothstep(state.scan, 1.02, 1.05));
      uniforms.uScan!.value = state.scan;
      uniforms.uColor!.value = state.color;
      uniforms.uGlitch!.value = 4 * state.color * (1 - state.color);
      uniforms.uFront!.value = front;
      uniforms.uTime!.value = time;
      uniforms.uBase!.value = base;
      uniforms.uHeight!.value = height;
      if (isDark !== dark) {
        dark = isDark;
        color.set(dark ? ACCENT.dark : ACCENT.light);
        // Glow adds light on the dark page; on the light page it would vanish, so it covers.
        const blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
        for (const material of [holo, glyphs.material, beams.material]) material.blending = blending;
        glyphs.material.uniforms.uHeadMix!.value = dark ? .55 : 0;
        uniforms.uHot!.value = dark ? .6 : 0;
      }
      glyphs.material.uniforms.uOpacity!.value = state.glyphs;
      glyphs.visible = state.glyphs > .001;
      beams.material.uniforms.uOpacity!.value = state.beams;
      beams.visible = state.beams > .001;
    },
    hide() {
      if (!disposed) setActive(false);
    },
    dispose() {
      if (disposed) return;
      setActive(false); disposed = true;
      for (const overlay of overlays) overlay.removeFromParent();
      clones.forEach(material => material.dispose());
      holo.dispose();
      glyphs.geometry.dispose();
      (glyphs.material.uniforms.uAtlas!.value as THREE.Texture).dispose();
      glyphs.material.dispose();
      beams.geometry.dispose();
      beams.material.dispose();
      effects.removeFromParent();
    },
  };
}
