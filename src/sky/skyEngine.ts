/**
 * SkyEngine — a minimal raw-WebGL2 renderer for the atmospheric color field.
 *
 * One persistent context, one program, one fullscreen primitive. Framework-free
 * (like `motion.ts`): React wiring lives in `SkyLayer`. It owns a self-contained
 * rAF loop that:
 *   • LERPS the EnvState-derived scalars (sun elevation, fog, cloud, storm, wind,
 *     parallax) toward their targets each frame (the same exponential ease as the
 *     grid motion) so any weather/time change — real or a forced override —
 *     cross-fades over `skyTransitionMs` instead of snapping,
 *   • advances a slow noise drift with uTime so the field feels "alive but
 *     barely" (and freezes that drift under reduced motion → static field), and
 *   • pauses entirely while the tab is hidden (no rAF work in the background).
 *
 * The fragment shader flows layered value-noise (fbm) to mix between the four
 * active field colors, so color regions form, drift, and dissolve with soft,
 * watercolor-like edges. There is no horizon or sun disc.
 */
import { config } from '../config';
import { applyFieldWeather, fieldColorsAt } from './palette';
import type { DayPhase } from '../env/types';

const VERT = `#version 300 es
out vec2 vUv;
void main() {
  // Fullscreen triangle (minimal equivalent of a fullscreen quad), no buffer.
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform vec2 uResolution;
uniform vec3 uColor0;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform float uTime;      // seconds * drift already? no — raw seconds
uniform float uDrift;     // domain advance per second (slow)
uniform float uSoftness;  // 0 = crisp boundaries, 1 = diffuse
uniform float uGrain;     // subtle additive grain strength
uniform float uParallax;  // subtle vertical shift

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * vnoise(p);
    p *= 2.0;
    a *= 0.5;
  }
  return v;
}

void main() {
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 p = vec2(vUv.x * aspect, vUv.y + uParallax);
  float t = uTime * uDrift;

  // Three slow, independently-flowing noise fields drive the color mixing.
  float n1 = fbm(p * 2.1 + vec2(t, t * 0.6));
  float n2 = fbm(p * 1.6 + vec2(-t * 0.7, t * 0.4) + 11.0);
  float n3 = fbm(p * 1.05 + vec2(t * 0.3, -t * 0.2) + 5.0);

  // Softness widens the smoothstep band: small = crisp, large = diffuse bleed.
  float s = mix(0.04, 0.46, clamp(uSoftness, 0.0, 1.0));
  vec3 cA = mix(uColor0, uColor1, smoothstep(0.5 - s, 0.5 + s, n1));
  vec3 cB = mix(uColor2, uColor3, smoothstep(0.5 - s, 0.5 + s, n2));
  vec3 col = mix(cA, cB, smoothstep(0.5 - s, 0.5 + s, n3));

  // Faint grain to avoid flat banding.
  float g = (hash(vUv * uResolution + t) - 0.5) * uGrain;
  col += g;

  fragColor = vec4(col, 1.0);
}`;

/** EnvState-derived targets the engine lerps toward. */
export interface SkyTarget {
  sun: number;
  dayPhase: DayPhase;
  fog: number;
  cloud: number;
  storm: number;
  wind: number;
}

export interface SkyEngine {
  /** Set the EnvState targets. `immediate` snaps (used for the first paint). */
  setEnv(target: SkyTarget, immediate?: boolean): void;
  /** Set the target parallax shift (already scaled by `skyParallax`). */
  setParallax(target: number): void;
  /** Freeze the drift (static field) + use quick transitions under reduced motion. */
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
 * fails (the caller then shows the CSS fallback).
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

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const u = {
    resolution: gl.getUniformLocation(program, 'uResolution'),
    color0: gl.getUniformLocation(program, 'uColor0'),
    color1: gl.getUniformLocation(program, 'uColor1'),
    color2: gl.getUniformLocation(program, 'uColor2'),
    color3: gl.getUniformLocation(program, 'uColor3'),
    time: gl.getUniformLocation(program, 'uTime'),
    drift: gl.getUniformLocation(program, 'uDrift'),
    softness: gl.getUniformLocation(program, 'uSoftness'),
    grain: gl.getUniformLocation(program, 'uGrain'),
    parallax: gl.getUniformLocation(program, 'uParallax'),
  };

  // --- eased state ---
  let curSun = 0;
  let curFog = 0;
  let curCloud = 0;
  let curStorm = 0;
  let curWind = 0;
  let curParallax = 0;
  const tgt: SkyTarget = { sun: 0, dayPhase: 'rising', fog: 0, cloud: 0, storm: 0, wind: 0 };
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
    const field = applyFieldWeather(
      fieldColorsAt(curSun, tgt.dayPhase),
      { fog: curFog, cloud: curCloud, storm: curStorm },
      {
        fogDesaturation: config.fogDesaturation,
        fogLift: config.fogLift,
        cloudMute: config.cloudMute,
        stormDarken: config.stormDarken,
      },
    );
    gl!.uniform2f(u.resolution, width, height);
    gl!.uniform3f(u.color0, field[0][0], field[0][1], field[0][2]);
    gl!.uniform3f(u.color1, field[1][0], field[1][1], field[1][2]);
    gl!.uniform3f(u.color2, field[2][0], field[2][1], field[2][2]);
    gl!.uniform3f(u.color3, field[3][0], field[3][1], field[3][2]);
    gl!.uniform1f(u.time, reduced ? 0 : (nowMs - startTime) / 1000);
    // Drift: base + storm agitation + wind contribution.
    const drift =
      config.fieldDriftSpeed * (1 + config.stormDrift * curStorm) + config.windDriftFactor * curWind;
    gl!.uniform1f(u.drift, drift);
    gl!.uniform1f(u.softness, config.fieldSoftness);
    gl!.uniform1f(u.grain, config.fieldGrain);
    gl!.uniform1f(u.parallax, curParallax);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
  }

  function frame(now: number): void {
    const dt = Math.min((now - last) / 1000, MAX_DT);
    last = now;
    const tauMs = reduced ? REDUCED_TRANSITION_MS : config.skyTransitionMs;
    const k = 1 - Math.exp(-dt / (tauMs / 1000));
    curSun += (tgt.sun - curSun) * k;
    curFog += (tgt.fog - curFog) * k;
    curCloud += (tgt.cloud - curCloud) * k;
    curStorm += (tgt.storm - curStorm) * k;
    curWind += (tgt.wind - curWind) * k;
    curParallax += (targetParallax - curParallax) * k;

    const settled =
      Math.abs(tgt.sun - curSun) < SETTLE_EPSILON &&
      Math.abs(tgt.fog - curFog) < SETTLE_EPSILON &&
      Math.abs(tgt.cloud - curCloud) < SETTLE_EPSILON &&
      Math.abs(tgt.storm - curStorm) < SETTLE_EPSILON &&
      Math.abs(tgt.wind - curWind) < SETTLE_EPSILON &&
      Math.abs(targetParallax - curParallax) < SETTLE_EPSILON;
    if (settled) {
      curSun = tgt.sun;
      curFog = tgt.fog;
      curCloud = tgt.cloud;
      curStorm = tgt.storm;
      curWind = tgt.wind;
      curParallax = targetParallax;
    }
    render(now);

    // The field drifts continuously while visible — keep going unless reduced
    // motion has frozen it AND everything has settled.
    if (reduced && settled) {
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
      requestRender();
    }
  }

  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', onVisibility);
  resize();

  return {
    setEnv(target, immediate = false) {
      tgt.sun = target.sun;
      tgt.dayPhase = target.dayPhase;
      tgt.fog = target.fog;
      tgt.cloud = target.cloud;
      tgt.storm = target.storm;
      tgt.wind = target.wind;
      if (immediate) {
        curSun = target.sun;
        curFog = target.fog;
        curCloud = target.cloud;
        curStorm = target.storm;
        curWind = target.wind;
        render(performance.now());
      }
      requestRender();
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
