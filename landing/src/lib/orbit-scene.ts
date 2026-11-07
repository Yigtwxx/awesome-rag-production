/**
 * Evidence scene. The list is a small lattice atom; every benchmark claim is a
 * moon on one of three tilted orbits, one orbit per evidence tag (third-party,
 * vendor, author). In pitfalls mode the orbits fade and twenty coral "fault"
 * sparks flicker around the atom. The selected item flares and streams dust
 * into the core.
 */
import { Geometry, Mesh, Program, Transform } from 'ogl';
import {
  BRIDGE_VERTEX,
  POINT_FRAGMENT,
  buildBridge,
  cellSeeds,
  gaussian,
  mulberry32,
  nearestTwo,
  randomUnit,
  wobble,
} from './lattice-scene';
import type { Space } from './space';

export interface OrbitInput {
  /** Orbit index (0..2) of each claim, i.e. its evidence tag. */
  claims: number[];
  /** Colour per orbit / tag. */
  tagColors: string[];
  pitfalls: number;
}

export interface OrbitScene {
  setMode(mode: 0 | 1): void;
  select(index: number): void;
  setLayout(x: number, y: number, scale: number): void;
  /** Screen position of the selected moon or spark. */
  anchor(): { x: number; y: number; behind: boolean };
}

const MAX_MOONS = 24;

const ORBIT_VERTEX = /* glsl */ `
attribute vec3 position;
attribute vec3 aColor;
attribute vec4 aInfo; // size, alpha, kind (0 atom, 1 orbit dust, 2 moon, 3 fault), index

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float uTime;
uniform float uPointScale;
uniform float uMode;
uniform float uSel;
uniform vec3 uMoons[${MAX_MOONS}];

varying vec3 vColor;
varying float vAlpha;

mat3 rotY(float a) {
  float c = cos(a), s = sin(a);
  return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c);
}

float hash(float n) {
  return fract(sin(n) * 43758.5453);
}

void main() {
  float kind = aInfo.z;
  float index = aInfo.w;
  vec3 p = position;
  float isAtom = step(kind, 0.5);
  float isDust = step(0.5, kind) * step(kind, 1.5);
  float isMoon = step(1.5, kind) * step(kind, 2.5);
  float isFault = step(2.5, kind);

  if (isAtom > 0.5) p = rotY(uTime * 0.08) * p;
  if (isMoon > 0.5) p += uMoons[int(index + 0.5)];

  float selected = (isMoon * (1.0 - step(0.5, uMode)) + isFault * step(0.5, uMode))
    * (1.0 - step(0.5, abs(index - uSel)));

  float alpha = aInfo.y;
  alpha *= mix(1.0, 1.0 - uMode, isDust + isMoon);
  alpha *= mix(1.0, uMode, isFault);
  // Faults flicker like a failing signal.
  float blink = 0.35 + 0.65 * step(0.45, hash(floor(uTime * 9.0) + index * 7.13));
  alpha *= mix(1.0, blink, isFault * (1.0 - selected * 0.7));
  alpha = mix(alpha, min(1.0, alpha * 1.8 + 0.2), selected);

  vec3 col = aColor;
  col = mix(col, col * 1.6 + 0.15, selected);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec3 nView = normalize((modelViewMatrix * vec4(p, 0.0)).xyz + 1e-5);
  float facing = smoothstep(-0.7, 0.45, nView.z);
  alpha *= mix(1.0, mix(0.35, 1.0, facing), isAtom);

  gl_Position = projectionMatrix * mv;
  gl_PointSize = aInfo.x * (1.0 + selected * 1.4) * uPointScale / -mv.z;
  vColor = col;
  vAlpha = alpha;
}
`;

const ORBITS = [
  { r: 1.15, tiltX: 0.42, tiltZ: -0.25, speed: 0.11 },
  { r: 1.62, tiltX: -0.3, tiltZ: 0.32, speed: -0.075 },
  { r: 2.08, tiltX: 0.15, tiltZ: 0.6, speed: 0.05 },
];

function rgb(hex: string, lighten: number): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(
    (v) => v / 255 + (1 - v / 255) * lighten,
  ) as [number, number, number];
}

function orbitPoint(k: number, angle: number): [number, number, number] {
  const o = ORBITS[k] ?? ORBITS[0]!;
  let x = Math.cos(angle) * o.r;
  let y = 0;
  let z = Math.sin(angle) * o.r;
  [y, z] = [
    y * Math.cos(o.tiltX) - z * Math.sin(o.tiltX),
    y * Math.sin(o.tiltX) + z * Math.cos(o.tiltX),
  ];
  [x, y] = [
    x * Math.cos(o.tiltZ) - y * Math.sin(o.tiltZ),
    x * Math.sin(o.tiltZ) + y * Math.cos(o.tiltZ),
  ];
  return [x, y, z];
}

export function createOrbitScene(space: Space, input: OrbitInput): OrbitScene {
  const { gl, scene, shared } = space;
  const rand = mulberry32(2026);
  const position: number[] = [];
  const color: number[] = [];
  const info: number[] = [];
  const push = (
    p: number[],
    c: number[],
    size: number,
    alpha: number,
    kind: number,
    index: number,
  ): void => {
    position.push(...p);
    color.push(...c);
    info.push(size, alpha, kind, index);
  };

  // The list: a small lattice atom with a gold core.
  const seeds = cellSeeds(14, rand, 0.4);
  let made = 0;
  while (made < 9000) {
    const d = randomUnit(rand);
    const [best, second] = nearestTwo(d, seeds);
    if (best - second > 0.045 * (0.6 + 0.8 * (0.5 + 0.5 * wobble(d, 3, 1))))
      continue;
    const r = 0.55 + gaussian(rand) * 0.012;
    push(
      [d[0] * r, d[1] * r, d[2] * r],
      [0.9, 0.93, 0.98],
      0.9 + rand() * 0.7,
      0.6,
      0,
      -1,
    );
    made += 1;
  }
  for (let i = 0; i < 1600; i++) {
    const d = randomUnit(rand);
    const r = Math.abs(gaussian(rand)) * 0.13;
    push(
      [d[0] * r, d[1] * r, d[2] * r],
      [1, 0.76, 0.34],
      1 + rand() * 0.8,
      0.8,
      0,
      -1,
    );
  }

  // Orbit dust rings.
  ORBITS.forEach((_, k) => {
    const c = rgb(input.tagColors[k] ?? '#7fd3ff', 0.35);
    for (let i = 0; i < 2600; i++) {
      const p = orbitPoint(k, rand() * Math.PI * 2);
      push(
        [
          p[0] + gaussian(rand) * 0.012,
          p[1] + gaussian(rand) * 0.012,
          p[2] + gaussian(rand) * 0.012,
        ],
        c,
        0.7 + rand() * 0.5,
        0.16 + rand() * 0.12,
        1,
        k,
      );
    }
  });

  // Moons: one clump per claim, positioned by the uMoons uniform each frame.
  const moonOrbit = input.claims.slice(0, MAX_MOONS);
  moonOrbit.forEach((k, j) => {
    const c = rgb(input.tagColors[k] ?? '#7fd3ff', 0.4);
    for (let i = 0; i < 240; i++) {
      push(
        [
          gaussian(rand) * 0.045,
          gaussian(rand) * 0.045,
          gaussian(rand) * 0.045,
        ],
        c,
        1 + rand() * 0.9,
        0.75,
        2,
        j,
      );
    }
  });

  // Faults: coral sparks scattered on a wide shell around the atom.
  const faultPos: [number, number, number][] = [];
  for (let j = 0; j < input.pitfalls; j++) {
    const d = randomUnit(rand);
    const r = 1.4 + rand() * 0.9;
    const centre: [number, number, number] = [
      d[0] * r * 1.25,
      d[1] * r * 0.8,
      d[2] * r,
    ];
    faultPos.push(centre);
    for (let i = 0; i < 170; i++) {
      push(
        [
          centre[0] + gaussian(rand) * 0.05,
          centre[1] + gaussian(rand) * 0.05,
          centre[2] + gaussian(rand) * 0.05,
        ],
        [1, 0.42, 0.34],
        1 + rand() * 0.9,
        0.8,
        3,
        j,
      );
    }
  }

  const root = new Transform();
  root.setParent(scene);
  // A plain array of vec3s: OGL resolves `uMoons[0]` only for Array values.
  const moons: number[][] = Array.from({ length: MAX_MOONS }, () => [0, 0, 0]);
  const uniforms = {
    uTime: shared.uTime,
    uPointScale: shared.uPointScale,
    uMode: { value: 0 },
    uSel: { value: 0 },
    uMoons: { value: moons },
  };
  const mesh = new Mesh(gl, {
    mode: gl.POINTS,
    geometry: new Geometry(gl, {
      position: { size: 3, data: new Float32Array(position) },
      aColor: { size: 3, data: new Float32Array(color) },
      aInfo: { size: 4, data: new Float32Array(info) },
    }),
    program: new Program(gl, {
      vertex: ORBIT_VERTEX,
      fragment: POINT_FRAGMENT,
      uniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }),
  });
  mesh.program.setBlendFunc(gl.SRC_ALPHA, gl.ONE);
  mesh.frustumCulled = false;
  mesh.setParent(root);

  // Dust stream from the selected item into the core.
  const beamData = buildBridge(1500, 77);
  const beamUniforms = {
    uTime: shared.uTime,
    uPointScale: shared.uPointScale,
    uVisible: { value: 0 },
    uIce: { value: 1 },
    uSpread: { value: 0.5 },
    uA: { value: [0, 0, 0] },
    uB: { value: [0, 0, 0] },
    uC: { value: [0, 0, 0] },
  };
  const beam = new Mesh(gl, {
    mode: gl.POINTS,
    geometry: new Geometry(gl, {
      position: { size: 3, data: beamData.position },
      aRandom: { size: 4, data: beamData.random },
    }),
    program: new Program(gl, {
      vertex: BRIDGE_VERTEX,
      fragment: POINT_FRAGMENT,
      uniforms: beamUniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }),
  });
  beam.program.setBlendFunc(gl.SRC_ALPHA, gl.ONE);
  beam.frustumCulled = false;
  beam.setParent(root);

  let mode: 0 | 1 = 0;
  let selected = 0;
  let beamFade = 0;
  const counts = ORBITS.map((_, k) => moonOrbit.filter((o) => o === k).length);
  const slot = moonOrbit.map(
    (k, j) => moonOrbit.slice(0, j).filter((o) => o === k).length,
  );

  const moonPosition = (j: number, time: number): [number, number, number] => {
    const k = moonOrbit[j] ?? 0;
    const base =
      ((slot[j] ?? 0) / Math.max(1, counts[k] ?? 1)) * Math.PI * 2 + k * 0.9;
    return orbitPoint(k, base + time * (ORBITS[k]?.speed ?? 0.1));
  };

  const selectedLocal = (time: number): [number, number, number] =>
    mode === 0
      ? moonPosition(selected, time)
      : (faultPos[selected] ?? [0, 0, 0]);

  space.onFrame((time, dt) => {
    uniforms.uMode.value += (mode - uniforms.uMode.value) * Math.min(1, dt * 3);
    moonOrbit.forEach((_, j) => {
      moons[j] = moonPosition(j, time);
    });
    root.rotation.y = 0.35 + space.pointer.x * 0.2;
    root.rotation.x = 0.1 - space.pointer.y * 0.12;

    beamFade = Math.min(1, beamFade + dt * 1.2);
    const a = selectedLocal(time);
    beamUniforms.uA.value = a;
    beamUniforms.uB.value = [0, 0, 0];
    beamUniforms.uC.value = [a[0] * 0.5, a[1] * 0.5 + 0.4, a[2] * 0.5];
    beamUniforms.uVisible.value = beamFade * 0.9;
    const tag = mode === 0 ? (moonOrbit[selected] ?? 0) : -1;
    beamUniforms.uIce.value = tag === 0 ? 1 : 0;
  });

  return {
    setMode: (next) => {
      mode = next;
      beamFade = 0;
    },
    select: (index) => {
      selected = index;
      uniforms.uSel.value = index;
      beamFade = 0;
    },
    setLayout: (x, y, scale) => {
      root.position.set(x, y, 0);
      root.scale.set(scale, scale, scale);
    },
    anchor: () => {
      root.updateMatrixWorld();
      const local = selectedLocal(shared.uTime.value);
      const m = root.worldMatrix;
      const wx =
        m[0]! * local[0] + m[4]! * local[1] + m[8]! * local[2] + m[12]!;
      const wy =
        m[1]! * local[0] + m[5]! * local[1] + m[9]! * local[2] + m[13]!;
      const wz =
        m[2]! * local[0] + m[6]! * local[1] + m[10]! * local[2] + m[14]!;
      return space.project(wx, wy, wz);
    },
  };
}
