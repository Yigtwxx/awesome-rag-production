/**
 * Stacks scene: each reference architecture as a cutaway "nested atom".
 * Every stack layer is a lattice shell (innermost = the model / serving,
 * outermost = evaluation and monitoring, which wrap everything). The front-
 * right wedge is cut away so the inner shells show. Switching tiers blows the
 * current atom outward while the next one condenses in.
 */
import { Geometry, Mesh, Program, Transform } from 'ogl';
import {
  POINT_FRAGMENT,
  cellSeeds,
  gaussian,
  mulberry32,
  nearestTwo,
  randomUnit,
  wobble,
} from './lattice-scene';
import type { Space } from './space';

export interface StackTierInput {
  /** Layer colours, innermost first. */
  layers: string[];
}

export interface StackScene {
  select(index: number, immediate?: boolean): void;
  setLayout(x: number, y: number, scale: number): void;
  /** Screen anchors for the current tier's layer labels (innermost first). */
  anchors(): { x: number; y: number; behind: boolean }[];
}

const SHELL_VERTEX = /* glsl */ `
attribute vec3 position;
attribute vec3 aColor;
attribute vec4 aInfo; // size, alpha, shell index, seed

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float uTime;
uniform float uPointScale;
uniform float uMix;     // 0 = gone, 1 = fully formed
uniform float uBurst;   // 0 = formed, 1 = blown outward

varying vec3 vColor;
varying float vAlpha;

mat3 rotY(float a) {
  float c = cos(a), s = sin(a);
  return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c);
}

void main() {
  float shell = aInfo.z;
  float seed = aInfo.w;
  float dir = mod(shell, 2.0) * 2.0 - 1.0;
  // Shells sway rather than spin, so the cutaway keeps facing the viewer.
  vec3 p = rotY(sin(uTime * (0.22 + shell * 0.06) + shell) * 0.32 * dir) * position;
  // Condense in from a wider cloud, blow out on exit.
  float spread = (1.0 - uMix) * 0.9 + uBurst * 1.4;
  p *= 1.0 + spread * (0.5 + seed);
  p += vec3(sin(seed * 40.0), cos(seed * 23.0), sin(seed * 71.0)) * spread * 0.25;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec3 nView = normalize((modelViewMatrix * vec4(p, 0.0)).xyz + 1e-5);
  float lambert = max(dot(nView, normalize(vec3(-0.55, 0.65, 0.55))), 0.0);
  float facing = smoothstep(-0.7, 0.45, nView.z);

  float glint = step(0.95, fract(seed * 13.7)) * pow(max(sin(uTime * (0.3 + seed) + seed * 61.0), 0.0), 60.0);
  vec3 col = aColor * (0.35 + 0.75 * lambert) + vec3(0.45, 0.82, 1.0) * pow(1.0 - abs(nView.z), 3.0) * 0.25;
  col = mix(col, vec3(1.0, 0.96, 0.85) * 1.6, glint);

  gl_Position = projectionMatrix * mv;
  gl_PointSize = aInfo.x * (1.0 + glint * 1.3) * uPointScale / -mv.z;
  vColor = col;
  vAlpha = aInfo.y * mix(0.35, 1.0, facing) * uMix * (1.0 - uBurst) + glint * uMix * (1.0 - uBurst);
}
`;

const RADII = [0.45, 0.82, 1.18, 1.52];
const ANCHOR_LIFT = [0.1, 0.36, 0.62, 0.86];

function hexToRgb(hex: string, lighten: number): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(
    (v) => v / 255 + (1 - v / 255) * lighten,
  ) as [number, number, number];
}

function buildTier(input: StackTierInput, seed: number, density: number) {
  const rand = mulberry32(seed);
  const position: number[] = [];
  const color: number[] = [];
  const info: number[] = [];
  input.layers.forEach((hex, shell) => {
    const r = RADII[Math.min(shell, RADII.length - 1)]!;
    const seeds = cellSeeds(8 + shell * 5, rand, 0.4);
    const rgb = hexToRgb(hex, 0.35);
    const count = Math.round(density * (0.35 + r * r));
    let made = 0;
    let guard = 0;
    while (made < count && guard < count * 40) {
      guard += 1;
      const d = randomUnit(rand);
      // Cutaway: drop the front-right wedge so inner shells show.
      if (d[0] > 0.05 && d[2] > 0.1 && d[1] > -0.35) continue;
      const [best, second] = nearestTwo(d, seeds);
      const width = 0.065 * (0.6 + 0.8 * (0.5 + 0.5 * wobble(d, 3.1, shell)));
      if (best - second > width) continue;
      const rr =
        r * (1 + 0.05 * wobble(d, 2.3, shell * 1.7)) + gaussian(rand) * 0.012;
      position.push(d[0] * rr, d[1] * rr, d[2] * rr);
      // Particles on the cut faces glow: the section reads like a diagram.
      const rim =
        (d[0] > -0.04 && d[0] < 0.13 && d[2] > 0.1) ||
        (d[2] > 0.02 && d[2] < 0.18 && d[0] > 0.05) ||
        (d[1] < -0.28 && d[1] > -0.42 && d[0] > 0.05 && d[2] > 0.1);
      color.push(...(rim ? rgb.map((v) => v * 0.5 + 0.55) : rgb));
      info.push(
        rim ? 1.7 : 1.0 + rand() * 0.9,
        rim ? 1 : 0.72 + rand() * 0.28,
        shell,
        rand(),
      );
      made += 1;
    }
  });
  // A small gold core: the answer the stack exists to produce.
  for (let i = 0; i < density * 0.25; i++) {
    const d = randomUnit(rand);
    const r = Math.abs(gaussian(rand)) * 0.11;
    position.push(d[0] * r, d[1] * r, d[2] * r);
    color.push(1.0, 0.78, 0.36);
    info.push(1.1 + rand() * 0.8, 0.8, 0, rand());
  }
  // Two tilted dust rings around the atom, like the hero's orbits.
  [
    { r: 2.0, tx: 1.2, tz: 0.35 },
    { r: 2.35, tx: 1.4, tz: -0.4 },
  ].forEach((ring) => {
    for (let i = 0; i < 2600; i++) {
      const a = rand() * Math.PI * 2;
      let x = Math.cos(a) * ring.r;
      let y = gaussian(rand) * 0.01;
      let z = Math.sin(a) * ring.r;
      [y, z] = [
        y * Math.cos(ring.tx) - z * Math.sin(ring.tx),
        y * Math.sin(ring.tx) + z * Math.cos(ring.tx),
      ];
      [x, y] = [
        x * Math.cos(ring.tz) - y * Math.sin(ring.tz),
        x * Math.sin(ring.tz) + y * Math.cos(ring.tz),
      ];
      position.push(x, y, z);
      color.push(0.72, 0.84, 1.0);
      info.push(0.8 + rand() * 0.5, 0.22 + rand() * 0.18, 0, rand());
    }
  });
  return {
    position: new Float32Array(position),
    color: new Float32Array(color),
    info: new Float32Array(info),
  };
}

export function createStackScene(
  space: Space,
  tiers: StackTierInput[],
): StackScene {
  const { gl, scene, shared } = space;
  const root = new Transform();
  root.setParent(scene);

  const meshes = tiers.map((tier, i) => {
    const data = buildTier(tier, 1000 + i * 77, 8200);
    const uniforms = {
      uTime: shared.uTime,
      uPointScale: shared.uPointScale,
      uMix: { value: 0 },
      uBurst: { value: 0 },
    };
    const mesh = new Mesh(gl, {
      mode: gl.POINTS,
      geometry: new Geometry(gl, {
        position: { size: 3, data: data.position },
        aColor: { size: 3, data: data.color },
        aInfo: { size: 4, data: data.info },
      }),
      program: new Program(gl, {
        vertex: SHELL_VERTEX,
        fragment: POINT_FRAGMENT,
        uniforms,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    });
    mesh.program.setBlendFunc(gl.SRC_ALPHA, gl.ONE);
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.setParent(root);
    return { mesh, uniforms, layers: tier.layers.length };
  });

  let current = -1;
  const fades = new Map<number, { target: number; burst: number }>();

  space.onFrame((_, dt) => {
    root.rotation.y = 0.5 + space.pointer.x * 0.25;
    root.rotation.x = 0.18 - space.pointer.y * 0.12;
    meshes.forEach((m, i) => {
      const fade = fades.get(i);
      if (!fade) return;
      const k = Math.min(1, dt * 2.2);
      m.uniforms.uMix.value += (fade.target - m.uniforms.uMix.value) * k;
      m.uniforms.uBurst.value += (fade.burst - m.uniforms.uBurst.value) * k;
      const gone = fade.target === 0 && m.uniforms.uBurst.value > 0.97;
      if (gone) {
        m.mesh.visible = false;
        m.uniforms.uMix.value = 0;
        m.uniforms.uBurst.value = 0;
        fades.delete(i);
      }
    });
  });

  return {
    select: (index, immediate = false) => {
      if (index === current) return;
      if (current >= 0) fades.set(current, { target: 0, burst: 1 });
      const next = meshes[index];
      if (!next) return;
      next.mesh.visible = true;
      next.uniforms.uBurst.value = 0;
      next.uniforms.uMix.value = immediate ? 1 : 0;
      fades.set(index, { target: 1, burst: 0 });
      if (immediate && current >= 0) {
        const prev = meshes[current]!;
        prev.mesh.visible = false;
        fades.delete(current);
      }
      current = index;
    },
    setLayout: (x, y, scale) => {
      root.position.set(x, y, 0);
      root.scale.set(scale, scale, scale);
    },
    anchors: () => {
      const tier = meshes[current];
      if (!tier) return [];
      root.updateMatrixWorld();
      return Array.from({ length: tier.layers }, (_, i) => {
        const r = RADII[Math.min(i, RADII.length - 1)]!;
        // A point on the cut face's rim, so leaders point into the cutaway.
        const local: [number, number, number] = [
          r * 0.72,
          ANCHOR_LIFT[i] ?? 0,
          r * 0.62,
        ];
        const m = root.worldMatrix;
        const wx =
          m[0]! * local[0] + m[4]! * local[1] + m[8]! * local[2] + m[12]!;
        const wy =
          m[1]! * local[0] + m[5]! * local[1] + m[9]! * local[2] + m[13]!;
        const wz =
          m[2]! * local[0] + m[6]! * local[1] + m[10]! * local[2] + m[14]!;
        return space.project(wx, wy, wz);
      });
    },
  };
}
