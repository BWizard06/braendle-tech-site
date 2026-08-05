const SIMPLEX_2D = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                     -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x  = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
`;

export const HERO_VERTEX = `
uniform float uPlane;
uniform float uTime;
uniform vec2  uPointer;
uniform float uStrength;
uniform float uLife;
uniform float uAmbient;
uniform float uScroll;
uniform float uBurst;
uniform float uRadius;
uniform float uSwirl;
uniform float uPush;
uniform float uDrift;
uniform float uLift;
uniform float uFreq;
uniform float uAtten;
uniform float uBurstReach;
uniform float uBurstLift;
uniform vec2  uDot;

attribute float aTone;
attribute float aSeed;

varying float vTone;
varying float vHeat;
varying float vGlow;
varying float vFade;

${SIMPLEX_2D}

float fieldAt(vec2 q, float t) {
  return snoise(q + vec2(t * 0.11, t * -0.08))
       + 0.5 * snoise(q * 2.17 + vec2(t * -0.19, t * 0.13));
}

vec2 curlAt(vec2 q, float t) {
  const float e = 0.08;
  float nx1 = fieldAt(q + vec2(e, 0.0), t);
  float nx0 = fieldAt(q - vec2(e, 0.0), t);
  float ny1 = fieldAt(q + vec2(0.0, e), t);
  float ny0 = fieldAt(q - vec2(0.0, e), t);
  return vec2(ny1 - ny0, -(nx1 - nx0)) / (2.0 * e);
}

void main() {
  vec2 c = curlAt(position.xy * uFreq, uTime);
  vec2 flow = c / (1.0 + length(c));

  float alive = max(uLife, uAmbient);
  vec2 disp = flow * uDrift * alive * (0.55 + 0.9 * aSeed);

  vec2 d = position.xy - uPointer;
  float dist = length(d);
  float reach = uRadius * (0.72 + 0.52 * (0.5 + 0.5 * flow.y));
  float fall = 1.0 - smoothstep(0.0, reach, dist);
  fall = fall * fall * (3.0 - 2.0 * fall);
  float heat = fall * uStrength;

  vec2 away = d / max(dist, 1e-4);
  vec2 perp = vec2(-away.y, away.x);
  float bias = 0.5 + 0.5 * flow.x;
  disp += (perp * uSwirl * bias
         + away * uPush * (0.35 + 0.9 * (1.0 - bias))
         + flow * uSwirl * 0.85) * heat * (0.45 + 1.1 * aSeed);

  float lift = heat * uLift * (0.3 + 0.7 * (1.0 - aTone)) * (0.35 + aSeed);

  float aburst = abs(uBurst);
  vec2 radial = position.xy / max(length(position.xy), 1e-4);
  float angle = aSeed * 6.2831853;
  vec2 scatter = vec2(cos(angle), sin(angle));
  vec2 bdir = normalize(mix(radial, scatter, 0.5));
  vec2 bperp = vec2(-bdir.y, bdir.x);
  disp += (bdir + bperp * 0.4 * (aSeed - 0.5)) * uBurst * uBurstReach * (0.45 + aSeed);
  disp += flow * aburst * uBurstReach * 0.45;
  lift += uBurst * uBurstLift * (aSeed - 0.5) * 2.0;

  disp += flow * (0.16 * uScroll);
  disp.y += uScroll * 0.10 * (0.15 + aSeed);
  lift += uScroll * 0.22 * (aSeed - 0.5);

  vec3 p = position * uPlane;
  p.xy += disp * uPlane;
  p.z += lift * uPlane;

  vTone = aTone;
  vHeat = heat;

  float shear = 4.0 * heat * (1.0 - heat);
  float pointerGlow = clamp(shear * 1.7 - aSeed * 3.1, 0.0, 1.0);
  float burstGlow = clamp(aburst * 2.0 - aSeed * 2.4, 0.0, 1.0);
  vGlow = max(pointerGlow, burstGlow);
  vFade = 1.0 - smoothstep(0.30, 0.95, uScroll);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float dia = uPlane * (uDot.x + uDot.y * aTone) * (1.0 + heat * 0.8 + aburst * 0.55);
  gl_PointSize = max(dia * uAtten / -mv.z, 1.0);
  gl_Position = projectionMatrix * mv;
}
`;

export const HERO_FRAGMENT = `
uniform vec3 uInk;
uniform vec3 uTint;
uniform vec3 uHeat;
uniform float uOpacity;

varying float vTone;
varying float vHeat;
varying float vGlow;
varying float vFade;

void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.2, d);
  if (a <= 0.0) discard;
  vec3 col = mix(uTint, uInk, vTone);
  col = mix(col, uHeat, vGlow * 0.88);
  gl_FragColor = vec4(col, a * vFade * uOpacity);
}
`;
