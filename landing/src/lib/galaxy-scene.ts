/**
 * Explore scene: the catalog as a spiral galaxy.
 *
 * Six arms = the six pipeline stages; each category is a small nebula on its
 * stage's arm; each tool is a star (a bright core plus a tight halo). A gold
 * bulge sits at the centre. Stars are born in the month the tool entered the
 * README (`setMonth`), so scrubbing the timeline replays the list's growth.
 * Retrieved tools (`setHits`) flare and stream dust to a query node above
 * the core: ice for the top hit, gold for the rest.
 */
import { Geometry, Mesh, Program, Transform, Vec3 } from 'ogl';
import {
  BRIDGE_VERTEX,
  POINT_FRAGMENT,
  buildBridge,
  gaussian,
  mulberry32,
} from './lattice-scene';
import type { Space } from './space';

export interface GalaxyInput {
  /** Per tool: pipeline group, category index, month index it appeared (-1 = always). */
  tools: { group: number; category: number; added: number }[];
  /** Pipeline-group colours, in group order. */
  colors: string[];
}

export interface Galaxy {
  setMonth(value: number): void;
  setHits(ids: number[]): void;
  setHover(id: number | undefined): void;
  setLayout(x: number, y: number, scale: number): void;
  /** Screen position of a tool's star (CSS px in the canvas). */
  toolScreen(id: number): { x: number; y: number; behind: boolean };
}

const GALAXY_VERTEX = /* glsl */ `
attribute vec3 position;
attribute vec3 aColor;
attribute vec4 aInfo;   // size, alpha, kind (0 dust, 1 nebula, 2 halo, 3 star), tool id
attribute float aAdded; // month index the particle is born (-1: always there)

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float uTime;
uniform float uPointScale;
uniform float uMonth;
uniform float uSpin;
uniform float uSearching;
uniform float uHover;
uniform float uHits[6];

varying vec3 vColor;
varying float vAlpha;

mat3 rotY(float a) {
  float c = cos(a), s = sin(a);
  return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c);
}

void main() {
  float kind = aInfo.z;
  float tool = aInfo.w;
  float r = length(position.xz);
  // Differential rotation: the inner disk turns faster than the rim.
  vec3 p = rotY(uSpin * (1.0 + 0.6 / (0.6 + r))) * position;

  float vis = aAdded < 0.0 ? 1.0 : smoothstep(aAdded - 0.2, aAdded + 0.6, uMonth);
  float born = vis * (1.0 - vis) * 4.0;

  float rank = -1.0;
  for (int i = 0; i < 6; i++) {
    if (tool >= 0.0 && abs(uHits[i] - tool) < 0.5) {
      rank = float(i);
      break;
    }
  }
  float isHit = step(0.0, rank);
  float isHover = (tool >= 0.0 && abs(uHover - tool) < 0.5) ? 1.0 : 0.0;
  float starish = step(1.5, kind);

  vec3 gold = vec3(1.0, 0.74, 0.3);
  vec3 ice = vec3(0.5, 0.84, 1.0);
  vec3 hitColor = mix(gold, ice, step(rank, 0.5) * isHit);
  vec3 col = mix(aColor, hitColor * 1.5, isHit * starish);
  col = mix(col, vec3(1.0), isHover * step(2.5, kind) * 0.7);

  float a = aInfo.y * vis;
  float bound = step(-0.5, tool);
  a *= mix(1.0, mix(0.22, 1.0, isHit), uSearching * bound);

  // Rare glints, like the hero's sand.
  float seed = fract(sin(dot(position.xz, vec2(12.9898, 78.233))) * 43758.5453);
  float glint = step(0.94, seed) * pow(max(sin(uTime * (0.3 + seed * 0.8) + seed * 61.0), 0.0), 60.0);
  col = mix(col, vec3(1.0, 0.96, 0.85) * 1.6, glint);
  a = mix(a, vis, glint);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = aInfo.x * (1.0 + born * 1.6 + isHit * starish * 1.3 + isHover * step(2.5, kind) * 0.9 + glint * 1.3);
  gl_PointSize = size * uPointScale / -mv.z;
  vColor = col;
  vAlpha = a;
}
`;

const QUERY_VERTEX = /* glsl */ `
attribute vec3 position;
attribute float aSeed;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float uTime;
uniform float uPointScale;
uniform float uVisible;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float pulse = 0.85 + 0.25 * sin(uTime * 3.0 + aSeed * 6.28);
  vec3 p = position * pulse;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = (1.4 + aSeed * 1.6) * uPointScale / -mv.z;
  vColor = mix(vec3(0.5, 0.84, 1.0), vec3(0.9, 0.97, 1.0), aSeed) * 1.4;
  vAlpha = 0.75 * uVisible;
}
`;

function hexToRgb(hex: string, lighten = 0): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  return c.map((v) => v + (1 - v) * lighten) as [number, number, number];
}

const ARM_SPIRAL = 0.9;
const spiralAngle = (group: number, groups: number, r: number): number =>
  (group / groups) * Math.PI * 2 + 0.35 + r * ARM_SPIRAL;
const spinFactor = (r: number): number => 1 + 0.6 / (0.6 + r);

export function createGalaxy(space: Space, input: GalaxyInput): Galaxy {
  const { gl, scene, shared } = space;
  const rand = mulberry32(42);
  const groups = Math.max(1, input.colors.length);

  // --- layout: categories along their group's arm, tools around them -------
  const categoryIds = [...new Set(input.tools.map((t) => t.category))];
  const catGroup = new Map(input.tools.map((t) => [t.category, t.group]));
  const catCentre = new Map<number, [number, number, number]>();
  for (let g = 0; g < groups; g++) {
    const cats = categoryIds.filter((c) => catGroup.get(c) === g);
    cats.forEach((c, i) => {
      const r = 0.95 + ((i + 0.5) / cats.length) * 1.65;
      const a = spiralAngle(g, groups, r);
      catCentre.set(c, [
        Math.cos(a) * r,
        gaussian(rand) * 0.04,
        Math.sin(a) * r,
      ]);
    });
  }
  const perCategory = new Map<number, number>();
  const toolPos = input.tools.map((t) => {
    const j = perCategory.get(t.category) ?? 0;
    perCategory.set(t.category, j + 1);
    const centre = catCentre.get(t.category) ?? [0, 0, 0];
    const angle = j * 2.39996 + t.category;
    const rr = 0.05 * Math.sqrt(j + 0.6);
    return [
      centre[0] + Math.cos(angle) * rr,
      centre[1] + gaussian(rand) * 0.025,
      centre[2] + Math.sin(angle) * rr,
    ] as [number, number, number];
  });

  // --- particles ----------------------------------------------------------------
  const position: number[] = [];
  const color: number[] = [];
  const info: number[] = [];
  const added: number[] = [];
  const push = (
    p: [number, number, number],
    c: [number, number, number],
    size: number,
    alpha: number,
    kind: number,
    tool: number,
    month: number,
  ): void => {
    position.push(...p);
    color.push(...c);
    info.push(size, alpha, kind, tool);
    added.push(month);
  };

  // Disk dust along six spiral arms, plus a gold bulge at the core.
  for (let i = 0; i < 34000; i++) {
    const g = Math.floor(rand() * groups);
    const r = 0.3 + Math.pow(rand(), 0.75) * 3.1;
    const a = spiralAngle(g, groups, r) + gaussian(rand) * (0.11 + 0.05 * r);
    const tint = hexToRgb(input.colors[g] ?? '#7fd3ff', 0.75);
    const cool: [number, number, number] = [0.72, 0.82, 0.98];
    const mixT = 0.4;
    push(
      [Math.cos(a) * r, gaussian(rand) * (0.03 + 0.02 * r), Math.sin(a) * r],
      [
        cool[0] * (1 - mixT) + tint[0] * mixT,
        cool[1] * (1 - mixT) + tint[1] * mixT,
        cool[2] * (1 - mixT) + tint[2] * mixT,
      ],
      0.8 + rand() * 0.8,
      0.3 + rand() * 0.4,
      0,
      -1,
      -1,
    );
  }
  for (let i = 0; i < 6500; i++) {
    const r = Math.abs(gaussian(rand)) * 0.3;
    const a = rand() * Math.PI * 2;
    push(
      [Math.cos(a) * r, gaussian(rand) * 0.08 * (1 - r), Math.sin(a) * r],
      [1.0, 0.76, 0.36],
      0.8 + rand() * 0.7,
      0.32 + rand() * 0.35,
      0,
      -1,
      -1,
    );
  }

  // Nebula per category: born with the category's first tool.
  for (const c of categoryIds) {
    const centre = catCentre.get(c)!;
    const g = catGroup.get(c) ?? 0;
    const months = input.tools
      .filter((t) => t.category === c)
      .map((t) => t.added);
    const born = months.some((m) => m < 0) ? -1 : Math.min(...months);
    const tint = hexToRgb(input.colors[g] ?? '#7fd3ff', 0.15);
    for (let i = 0; i < 300; i++) {
      push(
        [
          centre[0] + gaussian(rand) * 0.15,
          centre[1] + gaussian(rand) * 0.035,
          centre[2] + gaussian(rand) * 0.15,
        ],
        tint,
        1.2 + rand() * 1.0,
        0.2 + rand() * 0.2,
        1,
        -1,
        born,
      );
    }
  }

  // Tools: a bright core and a tight halo in the stage colour.
  input.tools.forEach((t, id) => {
    const p = toolPos[id]!;
    const tint = hexToRgb(input.colors[t.group] ?? '#7fd3ff', 0.2);
    for (let i = 0; i < 34; i++) {
      push(
        [
          p[0] + gaussian(rand) * 0.02,
          p[1] + gaussian(rand) * 0.012,
          p[2] + gaussian(rand) * 0.02,
        ],
        tint,
        1.0 + rand() * 0.7,
        0.7,
        2,
        id,
        t.added,
      );
    }
    push(
      p,
      hexToRgb(input.colors[t.group] ?? '#7fd3ff', 0.65),
      4.2,
      1,
      3,
      id,
      t.added,
    );
  });

  const root = new Transform();
  root.setParent(scene);

  const uniforms = {
    uTime: shared.uTime,
    uPointScale: shared.uPointScale,
    uMonth: { value: 1000 },
    uSpin: { value: 0 },
    uSearching: { value: 0 },
    uHover: { value: -1 },
    uHits: { value: [-1, -1, -1, -1, -1, -1] },
  };
  const galaxy = new Mesh(gl, {
    mode: gl.POINTS,
    geometry: new Geometry(gl, {
      position: { size: 3, data: new Float32Array(position) },
      aColor: { size: 3, data: new Float32Array(color) },
      aInfo: { size: 4, data: new Float32Array(info) },
      aAdded: { size: 1, data: new Float32Array(added) },
    }),
    program: new Program(gl, {
      vertex: GALAXY_VERTEX,
      fragment: POINT_FRAGMENT,
      uniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }),
  });
  galaxy.program.setBlendFunc(gl.SRC_ALPHA, gl.ONE);
  galaxy.frustumCulled = false;
  galaxy.setParent(root);

  // --- query node + retrieval beams -------------------------------------------------
  const QUERY: [number, number, number] = [-2.75, 0.75, 0.9];
  const qRand = mulberry32(7);
  const qPos = new Float32Array(700 * 3);
  const qSeed = new Float32Array(700);
  for (let i = 0; i < 700; i++) {
    qPos.set(
      [
        QUERY[0] + gaussian(qRand) * 0.06,
        QUERY[1] + gaussian(qRand) * 0.06,
        QUERY[2] + gaussian(qRand) * 0.06,
      ],
      i * 3,
    );
    qSeed[i] = qRand();
  }
  const queryUniforms = {
    uTime: shared.uTime,
    uPointScale: shared.uPointScale,
    uVisible: { value: 0 },
  };
  const query = new Mesh(gl, {
    mode: gl.POINTS,
    geometry: new Geometry(gl, {
      position: { size: 3, data: qPos },
      aSeed: { size: 1, data: qSeed },
    }),
    program: new Program(gl, {
      vertex: QUERY_VERTEX,
      fragment: POINT_FRAGMENT,
      uniforms: queryUniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }),
  });
  query.program.setBlendFunc(gl.SRC_ALPHA, gl.ONE);
  query.frustumCulled = false;
  query.setParent(root);

  const beams = Array.from({ length: 6 }, (_, i) => {
    const data = buildBridge(900, 300 + i * 17);
    const beamUniforms = {
      uTime: shared.uTime,
      uPointScale: shared.uPointScale,
      uVisible: { value: 0 },
      uIce: { value: i === 0 ? 1 : 0 },
      uSpread: { value: 0.42 },
      uA: { value: [0, 0, 0] },
      uB: { value: [...QUERY] },
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
        uniforms: beamUniforms,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    });
    mesh.program.setBlendFunc(gl.SRC_ALPHA, gl.ONE);
    mesh.frustumCulled = false;
    mesh.setParent(root);
    return { mesh, uniforms: beamUniforms };
  });

  // --- state + per-frame ---------------------------------------------------------------
  let hits: number[] = [];
  let searching = 0;
  let reveal = 0;
  const layout = { x: 0, y: 0, scale: 1 };

  const localPosition = (id: number): [number, number, number] => {
    const p = toolPos[id] ?? [0, 0, 0];
    const r = Math.hypot(p[0], p[2]);
    const a = uniforms.uSpin.value * spinFactor(r);
    const c = Math.cos(a);
    const s = Math.sin(a);
    // Same rotation as the shader's rotY (column-major mat3).
    return [c * p[0] + s * p[2], p[1], -s * p[0] + c * p[2]];
  };

  space.onFrame((time, dt) => {
    uniforms.uSpin.value = time * 0.035;
    const target = hits.length ? 1 : 0;
    searching += (target - searching) * Math.min(1, dt * 4);
    reveal = Math.min(1, reveal + dt * 1.2);
    uniforms.uSearching.value = searching;
    queryUniforms.uVisible.value = searching;
    root.rotation.x = space.pointer.y * 0.06;
    root.rotation.z = -space.pointer.x * 0.04;

    beams.forEach((beam, i) => {
      const id = hits[i];
      if (id === undefined) {
        beam.uniforms.uVisible.value = Math.max(
          0,
          beam.uniforms.uVisible.value - dt * 3,
        );
        beam.mesh.visible = beam.uniforms.uVisible.value > 0.01;
        return;
      }
      beam.mesh.visible = true;
      const a = localPosition(id);
      beam.uniforms.uA.value = a;
      beam.uniforms.uC.value = [
        (a[0] + QUERY[0]) / 2,
        Math.max(a[1], QUERY[1]) + 0.55,
        (a[2] + QUERY[2]) / 2,
      ];
      const delayed = Math.min(1, Math.max(0, reveal * 1.4 - i * 0.12));
      beam.uniforms.uVisible.value = delayed * (i === 0 ? 1 : 0.75);
    });
  });
  const applyLayout = (): void => {
    root.position.set(layout.x, layout.y, 0);
    root.scale.set(layout.scale, layout.scale, layout.scale);
  };
  space.onResize(applyLayout);

  return {
    setMonth: (value) => {
      uniforms.uMonth.value = value;
    },
    setHits: (ids) => {
      hits = ids.slice(0, 6);
      reveal = 0;
      uniforms.uHits.value = Array.from({ length: 6 }, (_, i) => hits[i] ?? -1);
    },
    setHover: (id) => {
      uniforms.uHover.value = id ?? -1;
    },
    setLayout: (x, y, scale) => {
      Object.assign(layout, { x, y, scale });
      applyLayout();
    },
    toolScreen: (id) => {
      const local = localPosition(id);
      const world = new Vec3(...local).applyMatrix4(root.worldMatrix);
      return space.project(world.x, world.y, world.z);
    },
  };
}
