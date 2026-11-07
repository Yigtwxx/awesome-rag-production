/**
 * Shared WebGL "space" for the tab scenes (Explore, Stacks, Evidence): one
 * renderer, camera, the hero's post pass (night sky, bloom, grain, edge
 * fringe), a render loop that pauses off-screen / in hidden tabs, pointer
 * smoothing and 3D -> screen projection for HTML labels.
 */
import {
  Camera,
  Geometry,
  Mesh,
  Post,
  Program,
  Renderer,
  Transform,
  Vec3,
  type OGLRenderingContext,
} from 'ogl';
import { POINT_FRAGMENT, POST_FRAGMENT, mulberry32 } from './lattice-scene';

// Far starfield: depth for every tab scene. A few stars twinkle.
const STAR_VERTEX = /* glsl */ `
attribute vec3 position;
attribute vec2 aStar; // size, seed
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float uTime;
uniform float uPointScale;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float seed = aStar.y;
  float tw = step(0.85, seed) * pow(max(sin(uTime * (0.4 + seed) + seed * 50.0), 0.0), 30.0);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aStar.x * (1.0 + tw * 2.0) * uPointScale / -mv.z * 3.0;
  vColor = mix(vec3(0.7, 0.82, 1.0), vec3(1.0, 0.86, 0.6), step(0.9, fract(seed * 7.0)));
  vAlpha = 0.25 + 0.35 * fract(seed * 13.0) + tw * 0.6;
}
`;

export interface Space {
  gl: OGLRenderingContext;
  camera: Camera;
  scene: Transform;
  /** Shared uniforms every points program should reference. */
  shared: { uTime: { value: number }; uPointScale: { value: number } };
  pointer: { x: number; y: number };
  width: number;
  height: number;
  onFrame(callback: (time: number, dt: number) => void): void;
  onResize(callback: () => void): void;
  /** Where the post pass centres its halo/fringe, in uv (0..1). */
  setFocus(u: number, v: number): void;
  /** World position -> CSS pixels inside the canvas (camera matrices of the last frame). */
  project(
    x: number,
    y: number,
    z: number,
  ): { x: number; y: number; behind: boolean };
  start(still?: boolean): void;
  stop(): void;
}

export function createSpace(
  canvas: HTMLCanvasElement,
  options: { fov?: number; distance?: number } = {},
): Space | undefined {
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
  const gl = renderer.gl;
  gl.clearColor(0, 0, 0, 1);

  const camera = new Camera(gl, { fov: options.fov ?? 35, near: 0.1, far: 80 });
  camera.position.set(0, 0, options.distance ?? 6.4);
  const scene = new Transform();

  const shared = { uTime: { value: 0 }, uPointScale: { value: 1 } };
  const post = new Post(gl);
  const postUniforms = {
    uFocus: { value: [0.5, 0.5] },
    uTime: shared.uTime,
    uAberration: { value: 0.003 },
    uResolution: { value: [1, 1] },
  };
  post.addPass({ fragment: POST_FRAGMENT, uniforms: postUniforms });

  const starRand = mulberry32(99);
  const starCount = 2600;
  const starPos = new Float32Array(starCount * 3);
  const starInfo = new Float32Array(starCount * 2);
  for (let i = 0; i < starCount; i++) {
    const z = starRand() * 2 - 1;
    const phi = starRand() * Math.PI * 2;
    const r = 10 + starRand() * 8;
    const s = Math.sqrt(1 - z * z);
    starPos.set(
      [Math.cos(phi) * s * r, z * r * 0.7, Math.sin(phi) * s * r - 4],
      i * 3,
    );
    starInfo.set([0.5 + starRand() * 0.9, starRand()], i * 2);
  }
  const stars = new Mesh(gl, {
    mode: gl.POINTS,
    geometry: new Geometry(gl, {
      position: { size: 3, data: starPos },
      aStar: { size: 2, data: starInfo },
    }),
    program: new Program(gl, {
      vertex: STAR_VERTEX,
      fragment: POINT_FRAGMENT,
      uniforms: shared,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }),
  });
  stars.program.setBlendFunc(gl.SRC_ALPHA, gl.ONE);
  stars.frustumCulled = false;
  stars.setParent(scene);

  const frameCallbacks: ((time: number, dt: number) => void)[] = [];
  const resizeCallbacks: (() => void)[] = [];
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const host = canvas.parentElement ?? canvas;
  const start = performance.now();
  let last = start;
  let frame = 0;
  let running = false;

  const space: Space = {
    gl,
    camera,
    scene,
    shared,
    pointer,
    width: 1,
    height: 1,
    onFrame: (cb) => frameCallbacks.push(cb),
    onResize: (cb) => resizeCallbacks.push(cb),
    setFocus: (u, v) => {
      postUniforms.uFocus.value = [u, v];
    },
    project: (x, y, z) => {
      const v = new Vec3(x, y, z).applyMatrix4(camera.viewMatrix);
      const behind = v.z > 0; // camera looks down -z in view space
      v.applyMatrix4(camera.projectionMatrix);
      return {
        x: ((v.x + 1) / 2) * space.width,
        y: ((1 - v.y) / 2) * space.height,
        behind,
      };
    },
    start: (still = false) => {
      if (still) {
        draw(performance.now() + 8000);
        return;
      }
      if (running) return;
      running = true;
      last = performance.now();
      frame = requestAnimationFrame(loop);
    },
    stop: () => {
      running = false;
      cancelAnimationFrame(frame);
    },
  };

  const resize = (): void => {
    const { width, height } = host.getBoundingClientRect();
    space.width = Math.max(1, width);
    space.height = Math.max(1, height);
    renderer.setSize(space.width, space.height);
    camera.perspective({ aspect: space.width / space.height });
    post.resize();
    postUniforms.uResolution.value = [
      space.width * renderer.dpr,
      space.height * renderer.dpr,
    ];
    shared.uPointScale.value =
      8.4 * renderer.dpr * Math.min(1.25, space.height / 900);
    resizeCallbacks.forEach((cb) => cb());
  };

  function draw(now: number): void {
    const dt = Math.min(0.5, (now - last) / 1000);
    last = now;
    shared.uTime.value = (now - start) / 1000;
    pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 3);
    pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 3);
    frameCallbacks.forEach((cb) => cb(shared.uTime.value, dt));
    post.render({ scene, camera });
  }

  function loop(now: number): void {
    if (!running) return;
    draw(now);
    frame = requestAnimationFrame(loop);
  }

  host.addEventListener('pointermove', (event) => {
    const rect = host.getBoundingClientRect();
    pointer.tx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.ty = ((event.clientY - rect.top) / rect.height) * 2 - 1;
  });
  new ResizeObserver(() => {
    resize();
    if (!running) draw(performance.now());
  }).observe(host);
  resize();

  // Never burn GPU in a hidden tab.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
    } else if (running) {
      last = performance.now();
      frame = requestAnimationFrame(loop);
    }
  });

  return space;
}
