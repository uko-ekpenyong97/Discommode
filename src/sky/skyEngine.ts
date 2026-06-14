/**
 * SkyEngine — a minimal raw-WebGL2 renderer for the base sky gradient.
 *
 * One persistent context, one program, one fullscreen primitive. Framework-free
 * (like `motion.ts`): React wiring lives in `SkyLayer`. It owns a self-contained
 * rAF loop that:
 *   • LERPS the sun elevation and parallax toward their targets each frame (the
 *     same exponential ease as the grid motion) so any EnvState change — real or
 *     a forced override — cross-fades over `skyTransitionMs` instead of snapping,
 *   • idles (stops the loop) once everything has settled — there is no
 *     time-based animation yet — and
 *   • pauses entirely while the tab is hidden (no rAF work in the background).
 *
 * The gradient/sun colors are derived each frame from the lerped elevation via
 * the palette table, so the single eased scalar drives the whole cross-fade.
 */
import { config } from '../config';
import { paletteAt, sunOpacity, sunScreenY } from './palette';

const VERT = `#version 300 es
out vec2 vUv;
void main() {
  // Fullscreen triangle — covers the whole viewport (the minimal equivalent of
  // a fullscreen quad's two triangles), no vertex buffer needed.
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform vec2 uResolution;
uniform vec3 uHorizon;
uniform vec3 uZenith;
uniform vec3 uSunColor;
uniform vec2 uSunPos;       // uv-space sun centre
uniform float uSunOpacity;
uniform float uParallax;    // subtle vertical shift of gradient + sun
uniform float uTime;        // seconds — unused this phase, reserved for animation
void main() {
  vec2 uv = vUv;
  float gy = clamp(uv.y + uParallax, 0.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, smoothstep(0.0, 1.0, gy));

  // Soft sun/glow disc, aspect-corrected so it stays round.
  vec2 aspect = vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
  vec2 d = (uv - vec2(uSunPos.x, uSunPos.y + uParallax)) * aspect;
  float dist = length(d);
  float disc = smoothstep(0.16, 0.0, dist);
  float glow = smoothstep(0.65, 0.0, dist) * 0.45;
  col += uSunColor * (disc + glow) * uSunOpacity;

  col += vec3(uTime * 0.0); // keep uTime live (fed each frame for later use)
  fragColor = vec4(col, 1.0);
}`;

export interface SkyEngine {
  /** Set the target sun elevation. `immediate` snaps (used for the first paint). */
  setSun(target: number, immediate?: boolean): void;
  /** Set the target parallax shift (already scaled by `skyParallax`). */
  setParallax(target: number): void;
  /** Quick transitions + frozen time under reduced motion. */
  setReducedMotion(reduced: boolean): void;
  dispose(): void;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn('[sky] shader compile failed:', gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

const SETTLE_EPSILON = 0.0005;
const REDUCED_TRANSITION_MS = 150;
const MAX_DT = 0.05; // clamp the post-background frame jump

/**
 * Create a sky engine on a canvas, or return null if WebGL2 / program setup
 * fails (the caller then shows the CSS-gradient fallback).
 */
export function createSkyEngine(canvas: HTMLCanvasElement): SkyEngine | null {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('[sky] program link failed:', gl.getProgramInfoLog(program));
    return null;
  }
  gl.useProgram(program);

  // Attribute-less drawing still needs a bound VAO in WebGL2.
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const u = {
    resolution: gl.getUniformLocation(program, 'uResolution'),
    horizon: gl.getUniformLocation(program, 'uHorizon'),
    zenith: gl.getUniformLocation(program, 'uZenith'),
    sunColor: gl.getUniformLocation(program, 'uSunColor'),
    sunPos: gl.getUniformLocation(program, 'uSunPos'),
    sunOpacity: gl.getUniformLocation(program, 'uSunOpacity'),
    parallax: gl.getUniformLocation(program, 'uParallax'),
    time: gl.getUniformLocation(program, 'uTime'),
  };

  // --- eased state ---
  let curSun = 0;
  let targetSun = 0;
  let curParallax = 0;
  let targetParallax = 0;
  let reduced = false;
  const startTime = performance.now();

  let running = false;
  let raf = 0;
  let last = performance.now();
  let width = 0;
  let height = 0;

  function resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(window.innerWidth * dpr));
    const h = Math.max(1, Math.round(window.innerHeight * dpr));
    if (w === width && h === height) return;
    width = w;
    height = h;
    canvas.width = w;
    canvas.height = h;
    gl!.viewport(0, 0, w, h);
    requestRender();
  }

  function render(nowMs: number): void {
    const pal = paletteAt(curSun);
    gl!.uniform2f(u.resolution, width, height);
    gl!.uniform3f(u.horizon, pal.horizon[0], pal.horizon[1], pal.horizon[2]);
    gl!.uniform3f(u.zenith, pal.zenith[0], pal.zenith[1], pal.zenith[2]);
    gl!.uniform3f(u.sunColor, pal.sun[0], pal.sun[1], pal.sun[2]);
    gl!.uniform2f(u.sunPos, 0.5, sunScreenY(curSun));
    gl!.uniform1f(u.sunOpacity, sunOpacity(curSun));
    gl!.uniform1f(u.parallax, curParallax);
    gl!.uniform1f(u.time, reduced ? 0 : (nowMs - startTime) / 1000);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
  }

  function frame(now: number): void {
    const dt = Math.min((now - last) / 1000, MAX_DT);
    last = now;
    const tauMs = reduced ? REDUCED_TRANSITION_MS : config.skyTransitionMs;
    const k = 1 - Math.exp(-dt / (tauMs / 1000));
    curSun += (targetSun - curSun) * k;
    curParallax += (targetParallax - curParallax) * k;

    const settled =
      Math.abs(targetSun - curSun) < SETTLE_EPSILON &&
      Math.abs(targetParallax - curParallax) < SETTLE_EPSILON;
    if (settled) {
      curSun = targetSun;
      curParallax = targetParallax;
    }
    render(now);

    // No time-based animation yet, so stop once settled; any new target wakes us.
    if (settled) {
      running = false;
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  function requestRender(): void {
    if (running || document.hidden) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function onVisibility(): void {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      running = false;
    } else {
      // Re-render once to refresh the canvas (and resume any pending transition).
      requestRender();
    }
  }

  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', onVisibility);
  resize();

  return {
    setSun(target, immediate = false) {
      targetSun = target;
      if (immediate) {
        curSun = target;
        render(performance.now());
      } else {
        requestRender();
      }
    },
    setParallax(target) {
      targetParallax = target;
      requestRender();
    },
    setReducedMotion(value) {
      reduced = value;
      requestRender();
    },
    dispose() {
      cancelAnimationFrame(raf);
      running = false;
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      if (vao) gl.deleteVertexArray(vao);
    },
  };
}
