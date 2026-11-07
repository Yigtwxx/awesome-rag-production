/**
 * Hero scene: a RAG pipeline told with ~70k grainy particles.
 *
 *   stage 0  Ingest    scattered pages of "text" drift in space
 *   stage 1  Index     the pages break into chunks and settle into a porous
 *                      lattice sphere (spherical Voronoi cells = chunks)
 *   stage 2  Retrieve  a few cells light up amber and stream into the core
 *   stage 3  Generate  the core condenses into one ice-blue answer
 *
 * `setStage()` takes a continuous value (0..3) so GSAP can tween between
 * stages; every particle carries its own delay for a staggered morph.
 * Rendering: additive points + one post pass (chromatic fringe, grain,
 * night-sky gradient, vignette).
 */
import {
  Camera,
  Geometry,
  Mesh,
  Post,
  Program,
  Renderer,
  Transform,
  type OGLRenderingContext,
} from 'ogl';

// --- deterministic randomness (same sculpture on every load) -----------------

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Vec3 = [number, number, number];

export function randomUnit(rand: () => number): Vec3 {
  const z = rand() * 2 - 1;
  const phi = rand() * Math.PI * 2;
  const r = Math.sqrt(1 - z * z);
  return [r * Math.cos(phi), z, r * Math.sin(phi)];
}

export function gaussian(rand: () => number): number {
  return (
    Math.sqrt(-2 * Math.log(rand() + 1e-9)) * Math.cos(2 * Math.PI * rand())
  );
}

/** Evenly spread directions (Fibonacci sphere), jittered so cells vary. */
export function cellSeeds(
  count: number,
  rand: () => number,
  jitter: number,
): Vec3[] {
  const seeds: Vec3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = golden * i;
    const v: Vec3 = [
      Math.cos(theta) * r + (rand() - 0.5) * jitter,
      y + (rand() - 0.5) * jitter,
      Math.sin(theta) * r + (rand() - 0.5) * jitter,
    ];
    const len = Math.hypot(...v);
    seeds.push([v[0] / len, v[1] / len, v[2] / len]);
  }
  return seeds;
}

/** Nearest and second-nearest seed by angle (largest dot products). */
export function nearestTwo(d: Vec3, seeds: Vec3[]): [number, number, number] {
  let best = -2;
  let second = -2;
  let index = 0;
  for (let i = 0; i < seeds.length; i++) {
    const s = seeds[i]!;
    const dot = d[0] * s[0] + d[1] * s[1] + d[2] * s[2];
    if (dot > best) {
      second = best;
      best = dot;
      index = i;
    } else if (dot > second) {
      second = dot;
    }
  }
  return [best, second, index];
}

/** Cheap smooth 3D wobble for organic thickness/displacement. */
export function wobble(d: Vec3, k: number, phase: number): number {
  return (
    Math.sin(d[0] * k + phase) *
    Math.sin(d[1] * k * 1.3 + phase * 0.7) *
    Math.sin(d[2] * k * 0.9 + phase * 1.9)
  );
}

// --- particle field ---------------------------------------------------------------

const ROLE_LATTICE = 0;
const ROLE_CORE = 1;
const ROLE_DUST = 2;

interface ParticleField {
  position: Float32Array; // stage-1 target (lattice / core / dust)
  scatter: Float32Array; // stage-0 position (pages of text)
  random: Float32Array; // delay, size, brightness, seed
  meta: Float32Array; // role, selected, shell
  count: number;
}

interface FieldOptions {
  seed?: number;
  pages?: number;
  cells?: number;
  dust?: boolean;
}

export function buildField(
  count: number,
  options: FieldOptions = {},
): ParticleField {
  const {
    seed = 20261107,
    pages: pageCount = 84,
    cells = 26,
    dust = true,
  } = options;
  const rand = mulberry32(seed);
  const position = new Float32Array(count * 3);
  const scatter = new Float32Array(count * 3);
  const random = new Float32Array(count * 4);
  const meta = new Float32Array(count * 3);

  const innerSeeds = cellSeeds(cells, rand, 0.35);
  const outerSeeds = cellSeeds(Math.max(6, Math.round(cells / 2)), rand, 0.5);
  // Retrieved cells: four spread-out indices, valid for any cell count.
  const selectedCells = new Set(
    [0.12, 0.35, 0.55, 0.8].map((f) => Math.floor(f * cells)),
  );

  // Pages: small rotated rectangles with rows of "text".
  const pages = Array.from({ length: pageCount }, () => {
    const center: Vec3 = [
      gaussian(rand) * 1.45,
      gaussian(rand) * 0.85,
      gaussian(rand) * 0.9,
    ];
    const a = rand() * Math.PI * 2;
    const b = (rand() - 0.5) * 1.2;
    const u: Vec3 = [Math.cos(a), Math.sin(b) * 0.3, Math.sin(a)];
    const v: Vec3 = [
      -Math.sin(a) * Math.sin(b),
      Math.cos(b),
      Math.cos(a) * Math.sin(b),
    ];
    return { center, u, v, w: 0.26 + rand() * 0.08, h: 0.34 + rand() * 0.1 };
  });

  const counts = {
    inner: Math.floor(count * 0.6),
    outer: Math.floor(count * 0.22),
    core: Math.floor(count * (dust ? 0.1 : 0.18)),
  };

  for (let i = 0; i < count; i++) {
    let role = ROLE_LATTICE;
    let selected = 0;
    let shell = 0;
    let target: Vec3;

    if (i < counts.inner + counts.outer) {
      shell = i < counts.inner ? 0 : 1;
      const seeds = shell === 0 ? innerSeeds : outerSeeds;
      const radius = shell === 0 ? 1 : 1.34;
      // Rejection-sample points near Voronoi cell borders -> lattice ribbons.
      for (;;) {
        const d = randomUnit(rand);
        const [best, second, cell] = nearestTwo(d, seeds);
        const width =
          (shell === 0 ? 0.03 : 0.022) *
          (0.55 + 0.9 * (0.5 + 0.5 * wobble(d, 3.1, 1.7)));
        const broken = shell === 1 && wobble(d, 2.2, 0.4) < -0.05; // outer shell is partial
        if (best - second > width || broken) continue;
        const r =
          radius * (1 + 0.07 * wobble(d, 2.4, 0.3)) + gaussian(rand) * 0.018;
        target = [d[0] * r, d[1] * r, d[2] * r];
        if (shell === 0 && selectedCells.has(cell)) selected = 1;
        break;
      }
    } else if (i < counts.inner + counts.outer + counts.core) {
      role = ROLE_CORE;
      const d = randomUnit(rand);
      const r = Math.abs(gaussian(rand)) * 0.16;
      target = [d[0] * r, d[1] * r, d[2] * r];
    } else {
      role = ROLE_DUST;
      const d = randomUnit(rand);
      const r = 2.2 + rand() * 3.5;
      target = [d[0] * r * 1.6, d[1] * r * 0.9, d[2] * r];
    }

    // Stage 0: every non-dust particle sits on a page, on a line of text.
    let s: Vec3 = target;
    if (role !== ROLE_DUST) {
      const page = pages[Math.floor(rand() * pages.length)]!;
      const row = Math.floor(rand() * 9);
      const rowLength =
        0.45 + (0.55 * ((row * 7919 + pages.indexOf(page)) % 10)) / 10;
      const x = (rand() * rowLength - 0.5) * page.w;
      const y = (0.5 - (row + 0.5) / 9) * page.h + gaussian(rand) * 0.004;
      s = [
        page.center[0] + page.u[0] * x + page.v[0] * y,
        page.center[1] + page.u[1] * x + page.v[1] * y,
        page.center[2] + page.u[2] * x + page.v[2] * y,
      ];
    }

    position.set(target, i * 3);
    scatter.set(s, i * 3);
    random.set(
      [rand(), 0.6 + rand() * 0.9, 0.45 + rand() * 0.55, rand()],
      i * 4,
    );
    meta.set([role, selected, shell], i * 3);
  }

  return { position, scatter, random, meta, count };
}

// --- shaders -------------------------------------------------------------------

export const PARTICLE_VERTEX = /* glsl */ `
attribute vec3 position;
attribute vec3 aScatter;
attribute vec4 aRandom;
attribute vec3 aMeta;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float uTime;
uniform float uStage;
uniform float uPointScale;
uniform float uPhase;  // per-instance rotation offset (satellites)
uniform float uFade;   // per-instance depth haze (satellites)
uniform float uSize;   // per-instance sprite size (satellites read smaller)

varying vec3 vColor;
varying float vAlpha;

mat3 rotY(float a) {
  float c = cos(a), s = sin(a);
  return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c);
}

float phase(float from, float delay) {
  float t = clamp((uStage - from - delay * 0.4) / 0.6, 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

void main() {
  float delay = aRandom.x;
  float seed = aRandom.w;
  float isCore = step(0.5, aMeta.x) * (1.0 - step(1.5, aMeta.x));
  float isDust = step(1.5, aMeta.x);
  float sel = aMeta.y;

  float t01 = phase(0.0, delay);
  float t12 = phase(1.0, delay);
  float t23 = phase(2.0, delay);

  vec3 drift = vec3(sin(uTime * 0.31 + seed * 6.28), cos(uTime * 0.23 + seed * 4.1), sin(uTime * 0.17 + seed * 2.3)) * 0.035;
  vec3 scatter = rotY(uTime * 0.02) * aScatter + drift;

  float spin = uTime * mix(0.07, -0.045, aMeta.z) + uPhase;
  vec3 lattice = rotY(spin) * position * (1.0 + 0.012 * sin(uTime * 0.9 + seed * 6.28));

  // Retrieved chunks spiral into the core.
  vec3 coreTarget = rotY(uTime * 0.6) * (normalize(position + 1e-4) * (0.06 + 0.16 * seed));
  vec3 streaming = rotY(t12 * 3.14 * (0.4 + seed)) * mix(lattice, coreTarget, t12);

  vec3 pos = mix(scatter, lattice, t01);
  pos = mix(pos, streaming, sel * t12);
  // The core contracts and pulses once the answer forms.
  pos *= mix(1.0, 0.78 + 0.08 * sin(uTime * 2.2), (isCore + sel) * t23);
  pos = mix(pos, aScatter + drift * 3.0, isDust);

  vec3 chalk = vec3(0.92, 0.94, 0.97);
  vec3 amber = vec3(1.0, 0.62, 0.22);
  vec3 ice = vec3(0.45, 0.82, 1.0);

  // Sculpted, not glittery: a key light from the upper left plus a cool rim,
  // computed in view space so the lighting stays put while the form turns.
  vec3 nView = normalize((modelViewMatrix * vec4(pos, 0.0)).xyz + 1e-5);
  vec3 keyLight = normalize(vec3(-0.55, 0.65, 0.55));
  float lambert = max(dot(nView, keyLight), 0.0);
  float rim = pow(1.0 - abs(nView.z), 3.0);
  float facing = smoothstep(-0.7, 0.45, nView.z);
  float shade = mix(1.0, 0.16 + 0.84 * lambert, t01 * (1.0 - isDust));

  vec3 col = chalk * (0.82 + 0.18 * aRandom.z) * shade;
  col += ice * rim * 0.35 * t01 * (1.0 - isCore);
  col = mix(col, amber * 1.35, sel * smoothstep(0.0, 0.35, t12));
  col = mix(col, amber * 0.9, isCore * t12 * (1.0 - t23));
  col = mix(col, ice * 1.25, max(sel, isCore) * t23);

  float alpha = 0.62 * (0.75 + 0.25 * aRandom.z);
  alpha *= mix(1.0, mix(0.3, 1.0, facing), t01 * (1.0 - isCore)); // far side recedes
  alpha *= mix(1.0, t12, isCore);                                // core appears on retrieve
  alpha *= mix(1.0, 0.38, t23 * (1.0 - max(sel, isCore)));        // lattice steps back
  alpha *= mix(0.75, 1.0, t01);                                   // pages a touch dimmer
  alpha *= mix(1.0, 0.55, isCore * t23);                         // keep the dense core blue, not blown out
  alpha = mix(alpha, 0.22 * aRandom.z, isDust);

  // Glints: about one grain in fourteen catches the light now and then. Each has
  // its own slow rhythm; pow() keeps the flash short so it reads as a sparkle
  // on sand, not a constant glitter.
  float canGlint = step(0.93, fract(seed * 7.31 + aRandom.x * 3.17));
  float wave = sin(uTime * (0.28 + seed * 0.7) + seed * 61.0);
  float glint = canGlint * pow(max(wave, 0.0), 64.0);
  col = mix(col, vec3(1.0, 0.95, 0.82) * 1.6, glint);
  alpha = mix(alpha, 1.0, glint);
  alpha *= uFade;

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = aRandom.y * (1.0 + 0.9 * max(sel, isCore) * t23) * (1.0 + 1.4 * glint) * uSize;
  gl_PointSize = size * uPointScale / -mv.z;

  vColor = col;
  vAlpha = alpha;
}
`;

const RING_VERTEX = /* glsl */ `
attribute vec3 position;
attribute vec3 aRing; // angle, ring index, seed

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float uTime;
uniform float uStage;
uniform float uPointScale;

varying vec3 vColor;
varying float vAlpha;

void main() {
  float speed = 0.16 + aRing.y * 0.05;
  float head = mod(uTime * speed * (mod(aRing.y, 2.0) * 2.0 - 1.0) + aRing.y * 2.1, 6.2832);
  float behind = mod(head - aRing.x * (mod(aRing.y, 2.0) * 2.0 - 1.0) + 6.2832, 6.2832);
  float comet = exp(-behind * 2.2);

  vec3 ice = vec3(0.45, 0.82, 1.0);
  vec3 chalk = vec3(0.85, 0.88, 0.93);
  float iceAmount = smoothstep(2.2, 3.0, uStage);
  vColor = mix(chalk, ice, max(comet, iceAmount * 0.6));
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float depth = mv.z - (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).z;
  vAlpha = (0.05 + 0.05 * aRing.z + comet * 0.8) * mix(0.3, 1.0, smoothstep(-1.6, 1.4, depth));

  gl_Position = projectionMatrix * mv;
  gl_PointSize = (0.95 + comet * 1.8) * uPointScale / -mv.z;
}
`;

export const POINT_FRAGMENT = /* glsl */ `
precision highp float;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = exp(-d * d * 16.0) * vAlpha;
  gl_FragColor = vec4(vColor, a);
}
`;

export const POST_FRAGMENT = /* glsl */ `
precision highp float;
uniform sampler2D tMap;
uniform vec2 uFocus;       // object centre in uv space
uniform float uTime;
uniform float uAberration;
uniform vec2 uResolution;  // drawing-buffer pixels
varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

// Soft bloom: two rings of taps around the pixel (radius in drawing pixels).
vec3 glow(vec2 uv, float radius) {
  vec2 px = radius / uResolution;
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7854;
    vec2 d = vec2(cos(a), sin(a));
    sum += texture2D(tMap, uv + d * px).rgb;
    sum += texture2D(tMap, uv + d * px * 2.4 + d.yx * px * 0.6).rgb;
  }
  return sum / 16.0;
}

void main() {
  // Colour fringe only toward the frame edges, never on the form itself.
  vec2 dir = vUv - uFocus;
  vec2 offset = dir * uAberration * dot(dir, dir) * 4.0;
  vec3 col = vec3(
    texture2D(tMap, vUv + offset).r,
    texture2D(tMap, vUv).g,
    texture2D(tMap, vUv - offset).b
  );
  col += glow(vUv, 5.0) * 0.55 + glow(vUv, 14.0) * 0.35;

  // Deep, saturated night: ink-navy above, near-black below, a cool halo
  // behind the sculpture.
  vec3 top = vec3(0.028, 0.075, 0.19);
  vec3 low = vec3(0.004, 0.009, 0.026);
  vec3 sky = mix(low, top, smoothstep(0.0, 1.05, vUv.y));
  float halo = exp(-pow(length((vUv - uFocus) * vec2(1.45, 1.0)) * 1.9, 2.0));
  sky += vec3(0.02, 0.06, 0.16) * halo;

  vec3 color = sky + col;
  // Multiplicative grain keeps blacks black (additive grain lifts them to grey).
  float grain = hash(vUv * uResolution + fract(uTime * 7.0) * 100.0) - 0.5;
  color *= 1.0 + grain * 0.07;
  vec2 v = vUv - 0.5;
  color *= 1.0 - dot(v, v) * 0.4;
  gl_FragColor = vec4(color, 1.0);
}
`;

// --- rings ---------------------------------------------------------------------

function buildRings(): { position: Float32Array; ring: Float32Array } {
  const rand = mulberry32(7);
  const specs = [
    { r: 1.95, squash: 0.36, tiltX: 0.32, tiltZ: -0.42 },
    { r: 2.25, squash: 0.28, tiltX: -0.18, tiltZ: 0.3 },
    { r: 1.7, squash: 0.62, tiltX: 1.15, tiltZ: 0.12 },
  ];
  const perRing = 5200;
  const position = new Float32Array(specs.length * perRing * 3);
  const ring = new Float32Array(specs.length * perRing * 3);
  specs.forEach((spec, k) => {
    const [cx, sx] = [Math.cos(spec.tiltX), Math.sin(spec.tiltX)];
    const [cz, sz] = [Math.cos(spec.tiltZ), Math.sin(spec.tiltZ)];
    for (let i = 0; i < perRing; i++) {
      const angle = (i / perRing) * Math.PI * 2;
      const jitter = gaussian(rand) * 0.007;
      let x = Math.cos(angle) * (spec.r + jitter);
      let y = gaussian(rand) * 0.006;
      let z = Math.sin(angle) * (spec.r + jitter);
      z *= spec.squash / 0.5;
      // tilt around X, then Z
      [y, z] = [y * cx - z * sx, y * sx + z * cx];
      [x, y] = [x * cz - y * sz, x * sz + y * cz];
      const idx = (k * perRing + i) * 3;
      position.set([x, y, z], idx);
      ring.set([angle, k, rand()], idx);
    }
  });
  return { position, ring };
}

// --- satellite atoms ------------------------------------------------------------
// Smaller copies of the staged field at different depths: other knowledge
// bases in the same universe. They run the same four stages, each following
// the main sculpture with its own lag, and each has its own seed so no two
// share a cell pattern.

interface SatelliteSpec {
  /** Position in normalized screen space at its own depth. */
  x: number;
  y: number;
  z: number;
  scale: number;
  spin: number;
  seed: number;
  /** Catch-up rate toward the main stage, per 60 Hz frame (smaller = more delay). */
  lag: number;
}

// Wide screens: the gaps left of and around the copy, and the right margin.
const SATELLITES_WIDE: SatelliteSpec[] = [
  { x: -0.8, y: 0.72, z: -2.4, scale: 0.4, spin: 0.09, seed: 11, lag: 0.045 },
  { x: -0.3, y: -0.78, z: -1.4, scale: 0.28, spin: -0.13, seed: 23, lag: 0.03 },
  { x: -0.95, y: -0.08, z: -7, scale: 0.62, spin: -0.05, seed: 41, lag: 0.02 },
  { x: 0.94, y: 0.16, z: -4.5, scale: 0.36, spin: 0.11, seed: 53, lag: 0.035 },
];

// Tall screens: the copy fills the lower half, so stay in the top band.
const SATELLITES_TALL: SatelliteSpec[] = [
  { x: -0.74, y: 0.9, z: -3, scale: 0.26, spin: 0.1, seed: 11, lag: 0.04 },
  { x: 0.8, y: 0.6, z: -4.5, scale: 0.24, spin: -0.12, seed: 23, lag: 0.03 },
];

// --- dust bridges ----------------------------------------------------------------
// Once the cores light up (retrieve), streams of golden dust flow from the
// satellites' cores into the main core: evidence travelling to the answer.
// They turn ice-blue with the cores at the generate stage.

/** Pairs of atoms to connect; -1 is the main sculpture. */
const BRIDGES_WIDE: [number, number][] = [
  [0, -1],
  [1, -1],
  [2, -1],
  [3, -1],
  [0, 2],
];
const BRIDGES_TALL: [number, number][] = [
  [0, -1],
  [1, -1],
];

export function buildBridge(
  count: number,
  seed: number,
): {
  position: Float32Array;
  random: Float32Array;
} {
  const rand = mulberry32(seed);
  const position = new Float32Array(count * 3); // t, lateral, depth jitter
  const random = new Float32Array(count * 4); // size, speed, seed, brightness
  for (let i = 0; i < count; i++) {
    position.set([rand(), gaussian(rand), gaussian(rand)], i * 3);
    random.set(
      [0.6 + rand() * 0.9, 0.02 + rand() * 0.035, rand(), 0.4 + rand() * 0.6],
      i * 4,
    );
  }
  return { position, random };
}

export const BRIDGE_VERTEX = /* glsl */ `
attribute vec3 position; // x: curve parameter, yz: jitter across the stream
attribute vec4 aRandom;  // size, speed, seed, brightness

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float uTime;
uniform float uPointScale;
uniform float uVisible;
uniform float uIce;
uniform float uSpread; // stream width multiplier
uniform vec3 uA;
uniform vec3 uB;
uniform vec3 uC;

varying vec3 vColor;
varying float vAlpha;

vec3 bezier(float t) {
  float u = 1.0 - t;
  return u * u * uA + 2.0 * u * t * uC + t * t * uB;
}

void main() {
  float t = fract(position.x + uTime * aRandom.y);
  vec3 p = bezier(t);
  vec3 tangent = normalize(bezier(min(t + 0.01, 1.0)) - bezier(max(t - 0.01, 0.0)) + 1e-5);
  vec3 side = normalize(cross(tangent, vec3(0.0, 0.0, 1.0)) + 1e-5);
  vec3 up = cross(side, tangent);
  float spread = (0.03 + 0.075 * sin(t * 3.1416)) * uSpread;
  p += (side * position.y + up * position.z) * spread;

  float ends = smoothstep(0.0, 0.14, t) * smoothstep(1.0, 0.86, t);
  float wave = sin(uTime * (0.5 + aRandom.z * 1.1) + aRandom.z * 47.0);
  float glint = step(0.86, aRandom.z) * pow(max(wave, 0.0), 40.0);

  vec3 gold = vec3(1.0, 0.74, 0.3);
  vec3 ice = vec3(0.5, 0.84, 1.0);
  vColor = mix(mix(gold, ice, uIce) * 1.45, vec3(1.0, 0.96, 0.85) * 1.7, glint);
  vAlpha = (0.62 * aRandom.w + glint * 0.6) * ends * uVisible;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aRandom.x * 1.35 * (1.0 + 1.2 * glint) * uPointScale / -mv.z;
}
`;

// --- public API ----------------------------------------------------------------

export interface LatticeScene {
  /** Continuous stage value, 0 (ingest) .. 3 (generate). */
  setStage(value: number): void;
  setPointer(x: number, y: number): void;
  /** Object centre in normalized screen space (-1..1), and its scale. */
  setLayout(ndcX: number, ndcY: number, scale: number): void;
  start(still?: boolean): void;
  stop(): void;
  destroy(): void;
}

export function createLatticeScene(
  canvas: HTMLCanvasElement,
  particleCount: number,
): LatticeScene | undefined {
  let renderer: Renderer;
  try {
    renderer = new Renderer({
      canvas,
      dpr: Math.min(window.devicePixelRatio || 1, 1.75),
      alpha: false,
      antialias: false,
      powerPreference: 'high-performance',
    });
  } catch {
    return undefined;
  }
  const gl: OGLRenderingContext = renderer.gl;
  gl.clearColor(0, 0, 0, 1);

  const camera = new Camera(gl, { fov: 35, near: 0.1, far: 50 });
  camera.position.set(0, 0, 6.4);

  const scene = new Transform();
  const group = new Transform();
  group.setParent(scene);

  const shared = {
    uTime: { value: 0 },
    uStage: { value: 0 },
    uPointScale: { value: 1 },
  };

  const field = buildField(particleCount);
  const particles = new Mesh(gl, {
    mode: gl.POINTS,
    geometry: new Geometry(gl, {
      position: { size: 3, data: field.position },
      aScatter: { size: 3, data: field.scatter },
      aRandom: { size: 4, data: field.random },
      aMeta: { size: 3, data: field.meta },
    }),
    program: new Program(gl, {
      vertex: PARTICLE_VERTEX,
      fragment: POINT_FRAGMENT,
      uniforms: {
        ...shared,
        uPhase: { value: 0 },
        uFade: { value: 1 },
        uSize: { value: 1 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }),
  });
  particles.program.setBlendFunc(gl.SRC_ALPHA, gl.ONE);
  particles.setParent(group);

  const ringData = buildRings();
  const rings = new Mesh(gl, {
    mode: gl.POINTS,
    geometry: new Geometry(gl, {
      position: { size: 3, data: ringData.position },
      aRing: { size: 3, data: ringData.ring },
    }),
    program: new Program(gl, {
      vertex: RING_VERTEX,
      fragment: POINT_FRAGMENT,
      uniforms: shared,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }),
  });
  rings.program.setBlendFunc(gl.SRC_ALPHA, gl.ONE);
  rings.setParent(group);

  const satelliteCount = Math.max(
    SATELLITES_WIDE.length,
    SATELLITES_TALL.length,
  );
  const satellitePoints = Math.round(Math.min(6000, particleCount * 0.06));
  const satellites = Array.from({ length: satelliteCount }, (_, i) => {
    const spec = SATELLITES_WIDE[i] ?? SATELLITES_TALL[i]!;
    const data = buildField(satellitePoints, {
      seed: spec.seed * 7919,
      pages: 14,
      cells: 12 + (spec.seed % 6),
      dust: false,
    });
    const uniforms = {
      uTime: shared.uTime,
      uPointScale: shared.uPointScale,
      uStage: { value: 0 },
      uPhase: { value: spec.seed * 0.37 },
      uFade: { value: 1 },
      uSize: { value: 1.75 },
    };
    const mesh = new Mesh(gl, {
      mode: gl.POINTS,
      geometry: new Geometry(gl, {
        position: { size: 3, data: data.position },
        aScatter: { size: 3, data: data.scatter },
        aRandom: { size: 4, data: data.random },
        aMeta: { size: 3, data: data.meta },
      }),
      program: new Program(gl, {
        vertex: PARTICLE_VERTEX,
        fragment: POINT_FRAGMENT,
        uniforms,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    });
    mesh.program.setBlendFunc(gl.SRC_ALPHA, gl.ONE);
    mesh.setParent(scene);
    return {
      mesh,
      uniforms,
      base: [0, 0, 0] as Vec3,
      depth: 0,
      lag: spec.lag,
    };
  });

  const bridgeCount = Math.max(BRIDGES_WIDE.length, BRIDGES_TALL.length);
  const bridgePoints = Math.round(Math.min(2600, particleCount * 0.027));
  const bridges = Array.from({ length: bridgeCount }, (_, i) => {
    const data = buildBridge(bridgePoints, 900 + i * 31);
    const uniforms = {
      uTime: shared.uTime,
      uPointScale: shared.uPointScale,
      uVisible: { value: 0 },
      uIce: { value: 0 },
      uSpread: { value: 1 },
      uA: { value: [0, 0, 0] },
      uB: { value: [0, 0, 0] },
      uC: { value: [0, 0, 0] },
    };
    const mesh = new Mesh(gl, {
      mode: gl.POINTS,
      geometry: new Geometry(gl, {
        position: { size: 3, data: data.position },
        aRandom: { size: 4, data: data.random },
      }),
      program: new Program(gl, {
        vertex: BRIDGE_VERTEX,
        fragment: POINT_FRAGMENT,
        uniforms,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    });
    mesh.program.setBlendFunc(gl.SRC_ALPHA, gl.ONE);
    mesh.frustumCulled = false; // vertices are placed in the shader
    mesh.setParent(scene);
    return { mesh, uniforms };
  });

  const post = new Post(gl);
  const postUniforms = {
    uFocus: { value: [0.5, 0.5] },
    uTime: shared.uTime,
    uAberration: { value: 0.003 },
    uResolution: { value: [1, 1] },
  };
  post.addPass({ fragment: POST_FRAGMENT, uniforms: postUniforms });

  const layout = { ndcX: 0, ndcY: 0, scale: 1 };
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const host = canvas.parentElement ?? canvas;
  let frame = 0;
  let running = false;
  let startTime = performance.now();

  const applyLayout = (): void => {
    const halfH = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
    const halfW = halfH * camera.aspect;
    group.position.set(layout.ndcX * halfW, layout.ndcY * halfH, 0);
    group.scale.set(layout.scale, layout.scale, layout.scale);
    postUniforms.uFocus.value = [(layout.ndcX + 1) / 2, (layout.ndcY + 1) / 2];

    const specs = camera.aspect < 0.9 ? SATELLITES_TALL : SATELLITES_WIDE;
    const tan = Math.tan((camera.fov * Math.PI) / 360);
    satellites.forEach((sat, i) => {
      const spec = specs[i];
      sat.mesh.visible = spec !== undefined;
      if (!spec) return;
      const distance = camera.position.z - spec.z;
      sat.base = [
        spec.x * tan * distance * camera.aspect,
        spec.y * tan * distance,
        spec.z,
      ];
      sat.depth = -spec.z;
      sat.mesh.scale.set(spec.scale, spec.scale, spec.scale);
      sat.mesh.rotation.z = spec.spin * 2;
      sat.lag = spec.lag;
      // Farther atoms are dimmer, like haze across a deep field.
      sat.uniforms.uFade.value = Math.min(
        1,
        Math.max(0.55, 1.2 - sat.depth * 0.045),
      );
    });
  };

  const resize = (): void => {
    const { width, height } = host.getBoundingClientRect();
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    renderer.setSize(w, h);
    camera.perspective({ aspect: w / h });
    post.resize();
    postUniforms.uResolution.value = [w * renderer.dpr, h * renderer.dpr];
    // Point sprites scale with the viewport so density reads the same everywhere.
    shared.uPointScale.value = 8.4 * renderer.dpr * Math.min(1.25, h / 900);
    applyLayout();
  };

  let lastDraw = performance.now();
  const draw = (): void => {
    const now = performance.now();
    // Frame-rate independent easing: same lag at 30 Hz and at 144 Hz.
    const dt = Math.min(0.5, (now - lastDraw) / 1000);
    lastDraw = now;
    shared.uTime.value = (now - startTime) / 1000;
    pointer.x += (pointer.tx - pointer.x) * 0.05;
    pointer.y += (pointer.ty - pointer.y) * 0.05;
    group.rotation.y = pointer.x * 0.35;
    group.rotation.x = -pointer.y * 0.2 + 0.12;
    // Parallax: nearer satellites shift more with the pointer.
    for (const sat of satellites) {
      if (!sat.mesh.visible) continue;
      const target = shared.uStage.value;
      const ease = 1 - Math.exp(-dt * sat.lag * 60);
      sat.uniforms.uStage.value += (target - sat.uniforms.uStage.value) * ease;
      const k = 0.35 / (1 + sat.depth * 0.25);
      sat.mesh.position.set(
        sat.base[0] - pointer.x * k,
        sat.base[1] + pointer.y * k * 0.6,
        sat.base[2],
      );
    }
    const pairs = camera.aspect < 0.9 ? BRIDGES_TALL : BRIDGES_WIDE;
    const main = shared.uStage.value;
    bridges.forEach((bridge, i) => {
      const pair = pairs[i];
      const ends = pair?.map((index) =>
        index < 0
          ? { pos: group.position, stage: main, on: true }
          : {
              pos: satellites[index]!.mesh.position,
              stage: satellites[index]!.uniforms.uStage.value,
              on: satellites[index]!.mesh.visible,
            },
      );
      const [a, b] = ends ?? [];
      if (!a || !b || !a.on || !b.on) {
        bridge.mesh.visible = false;
        return;
      }
      const stage = Math.min(a.stage, b.stage);
      const visible = Math.min(1, Math.max(0, (stage - 1.35) / 0.55));
      bridge.mesh.visible = visible > 0.001;
      if (!bridge.mesh.visible) return;
      const length = Math.hypot(
        b.pos.x - a.pos.x,
        b.pos.y - a.pos.y,
        b.pos.z - a.pos.z,
      );
      const sway = Math.sin(shared.uTime.value * 0.3 + i * 1.7) * 0.08 * length;
      bridge.uniforms.uA.value = [a.pos.x, a.pos.y, a.pos.z];
      bridge.uniforms.uB.value = [b.pos.x, b.pos.y, b.pos.z];
      bridge.uniforms.uC.value = [
        (a.pos.x + b.pos.x) / 2 + sway,
        (a.pos.y + b.pos.y) / 2 + length * 0.22,
        (a.pos.z + b.pos.z) / 2 + length * 0.1,
      ];
      bridge.uniforms.uVisible.value = visible;
      bridge.uniforms.uIce.value = Math.min(1, Math.max(0, (main - 2.3) / 0.7));
    });
    post.render({ scene, camera });
  };

  const loop = (): void => {
    if (!running) return;
    draw();
    frame = requestAnimationFrame(loop);
  };

  const observer = new ResizeObserver(() => {
    resize();
    if (!running) draw();
  });
  observer.observe(host);
  resize();

  return {
    setStage: (value) => {
      shared.uStage.value = value;
      if (!running) {
        for (const sat of satellites) sat.uniforms.uStage.value = value;
        draw();
      }
    },
    setPointer: (x, y) => {
      pointer.tx = x;
      pointer.ty = y;
    },
    setLayout: (ndcX, ndcY, scale) => {
      Object.assign(layout, { ndcX, ndcY, scale });
      applyLayout();
      if (!running) draw();
    },
    start: (still = false) => {
      if (still) {
        startTime = performance.now() - 8_000;
        draw();
        return;
      }
      if (running) return;
      running = true;
      frame = requestAnimationFrame(loop);
    },
    stop: () => {
      running = false;
      cancelAnimationFrame(frame);
    },
    destroy: () => {
      running = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
