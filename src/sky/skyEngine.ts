/**
 * SkyEngine — a minimal raw-WebGL2 renderer for the sky.
 *
 * One persistent context, one program, one fullscreen triangle. Framework-free
 * (like `motion.ts`): React wiring lives in `SkyLayer`. It owns a self-contained
 * rAF loop that:
 *   • LERPS the EnvState-derived scalars (sun, phase, cloud, fog, rain, storm,
 *     wind) toward their targets each frame (the same exponential ease as the
 *     grid motion) so any weather/time change — real or a forced override —
 *     cross-fades over `skyTransitionMs` instead of snapping,
 *   • advances the drift with uTime so the deck blows and the bank rolls (and
 *     freezes that drift under reduced motion → one static frame),
 *   • schedules LIGHTNING on the CPU (see {@link flashEnvelope}) and feeds it in
 *     as one uniform, and
 *   • pauses entirely while the tab is hidden (no rAF work in the background).
 *
 * THE FRAGMENT SHADER IS THE PROTOTYPE'S — `docs/prototypes/sky-prototype.html`,
 * minus its snow layer (see `docs/sky.md` for why there is no snow). It paints,
 * in order: a noise-warped zenith→horizon gradient, the sun's glow, stars and a
 * moon, a cloud deck, a fog bank, rain, lightning, then saturation and grain.
 * Every weather state is a THING THAT IS DRAWN; nothing here is a tint over a
 * colour field, which is what the four-colour field this replaced could only do.
 *
 * The one deliberate difference from the prototype: the time-of-day palette
 * arrives as `uZenith` / `uHorizon` uniforms instead of a GLSL `palette()` with
 * the hexes in it, so `palette.ts` stays the single editable place for a colour.
 */
import { config } from '../config';
import { skyGradientAt } from './palette';
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
uniform vec2  uRes;
uniform float uTime;
uniform vec3  uZenith;   // time-of-day palette, top of screen
uniform vec3  uHorizon;  // …and bottom
uniform float uSun;      // 0 night .. 1 noon
uniform float uPhase;    // 0 rising .. 1 setting
uniform float uCloud;    // coverage 0..1
uniform float uFog;      // 0..1
uniform float uRain;     // 0..1
uniform float uStorm;    // 0..1
uniform float uWind;     // 0..1
uniform float uFlash;    // lightning envelope 0..1
uniform float uDrift;    // motion multiplier
uniform float uCloudScale;
uniform float uFogHeight;
uniform float uSat;
uniform float uGrain;

float hash(vec2 p){ p = fract(p*vec2(123.34,345.45)); p += dot(p,p+34.345); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); float a=hash(i), b=hash(i+vec2(1,0)), c=hash(i+vec2(0,1)), d=hash(i+vec2(1,1)); vec2 u=f*f*(3.0-2.0*f); return mix(mix(a,b,u.x),mix(c,d,u.x),u.y); }
float fbm5(vec2 p){ float v=0.0,a=0.5; for(int i=0;i<5;i++){ v+=a*vnoise(p); p=p*2.02+vec2(1.7,9.2); a*=0.5; } return v; }
float fbm3(vec2 p){ float v=0.0,a=0.5; for(int i=0;i<3;i++){ v+=a*vnoise(p); p=p*2.02+vec2(1.7,9.2); a*=0.5; } return v; }

float rainLayer(vec2 uv, float aspect, float speed, float scale, float seed, float t){
  vec2 p = uv*vec2(aspect,1.0);
  p.x += (1.0-uv.y)*(0.10+uWind*0.30);           // slant with wind
  p *= vec2(scale, scale*0.22);
  p.y += t*speed;
  vec2 id=floor(p), f=fract(p);
  float h=hash(id+seed);
  float on = step(1.0-uRain*0.55, h);
  float streak = smoothstep(0.40,0.5,f.x)*smoothstep(0.60,0.5,f.x) * smoothstep(0.0,0.25,f.y)*smoothstep(1.0,0.55,f.y);
  return on*streak;
}

void main(){
  float aspect = uRes.x/max(uRes.y,1.0);
  vec2 uv = vUv;
  float t = uTime*uDrift;
  float sun = clamp(uSun,0.0,1.0);

  float dayAmt  = smoothstep(0.0,0.35,sun);                                // how much daylight
  float lowAmt  = smoothstep(0.0,0.12,sun)*(1.0-smoothstep(0.2,0.48,sun)); // golden hour
  float nightAmt= 1.0-smoothstep(0.0,0.12,sun);
  vec3 sunCol = mix(vec3(1.0,0.52,0.28), vec3(1.0,0.97,0.90), smoothstep(0.05,0.42,sun));

  // ---- base sky: soft vertical gradient, gently warped so it reads painted, not printed
  float warp = (fbm3(vec2(uv.x*aspect,uv.y)*1.4 + vec2(t*0.02,-t*0.01))-0.5)*0.16;
  float yy = clamp(uv.y+warp,0.0,1.0);
  vec3 col = mix(uHorizon,uZenith,smoothstep(0.0,1.0,yy));
  // horizon warmth at golden hour
  col += sunCol*pow(1.0-uv.y,3.0)*lowAmt*0.45;

  // ---- sun glow (position: side by phase, height by elevation)
  vec2 sunPos = vec2(mix(0.24,0.76,uPhase), mix(-0.06,0.86,sun));
  float sd = length((uv-sunPos)*vec2(aspect,1.0));
  float occl = (1.0-uCloud*0.55)*(1.0-uFog*0.75)*(1.0-uStorm*0.7);
  float glow = (exp(-sd*2.2)*0.32 + exp(-sd*8.0)*0.30 + exp(-sd*70.0)*0.75);
  col += sunCol*glow*smoothstep(0.0,0.10,sun)*occl*0.75;

  // ---- stars + moon (clear nights)
  {
    vec2 sp = uv*vec2(aspect,1.0)*150.0; vec2 id=floor(sp); vec2 f=fract(sp)-0.5;
    float h=hash(id); vec2 off=(vec2(hash(id+3.1),hash(id+7.7))-0.5)*0.6;
    float twinkle = 0.55+0.45*sin(uTime*1.7+h*80.0);
    float star = smoothstep(0.978,1.0,h)*smoothstep(0.10,0.0,length(f-off))*twinkle;
    vec2 mp=vec2(0.70,0.80); float md=length((uv-mp)*vec2(aspect,1.0));
    float moon=smoothstep(0.040,0.032,md); float mglow=exp(-md*7.0)*0.22;
    vec3 sky = col;
    col += vec3(0.85,0.92,1.0)*star*nightAmt;
    col += mix(vec3(0.70,0.78,0.95),vec3(0.96,0.97,1.0),moon)*(moon*0.85+mglow)*nightAmt;
    col = mix(sky, col, (1.0-uCloud*0.9)*(1.0-uFog*0.9));
  }

  // ---- clouds
  float cov = max(uCloud, uStorm);
  vec2 cp = vec2(uv.x*aspect, uv.y*1.5);
  vec2 wind = vec2(0.015+uWind*0.10, 0.004)*t;
  float n  = fbm5(cp*uCloudScale + wind + vec2(7.0,3.0));
  float nn = smoothstep(0.22,0.78,n);
  float thr = 1.0-cov;
  float cd = smoothstep(thr, thr+0.38, nn);
  cd = mix(cd, 1.0, smoothstep(0.72,1.0,cov)*0.92);      // full cover closes the ceiling; the texture comes from the shading below
  cd *= 0.95+0.05*uStorm;
  float n2 = fbm5(cp*uCloudScale*2.3 + wind*1.35 + vec2(2.0,11.0));
  float dayLight = mix(0.2,1.0,dayAmt);
  vec3 shadowCol = mix(vec3(0.58,0.63,0.72), vec3(0.28,0.30,0.38), uStorm) * (1.0-uRain*0.22) * dayLight;
  vec3 litCol    = mix(vec3(0.98,0.98,0.97), sunCol*1.05, lowAmt*0.85) * dayLight;
  // underlit at golden hour: the base of the cloud catches the sun
  litCol = mix(litCol, sunCol*1.1*dayLight, lowAmt*smoothstep(0.6,0.2,uv.y)*0.6);
  litCol *= 1.0 - uStorm*0.55 - uRain*0.15;
  vec3 cloudCol = mix(shadowCol, litCol, smoothstep(0.30,0.85,n2));
  cloudCol += vec3(0.9,0.92,1.0)*uFlash*0.9;             // lightning lights the deck from inside
  col = mix(col, cloudCol, cd);
  col *= 1.0 - uStorm*0.22*(1.0-uFlash);                 // storm dims the whole scene

  // ---- fog: a bright bank rolling in low, not a grey tint
  {
    vec2 fp = vec2(uv.x*aspect, uv.y);
    float fn = fbm5(fp*1.25 + vec2(t*(0.035+uWind*0.06), t*0.012) + vec2(20.0,5.0));
    float vb = 1.0-smoothstep(0.0, uFogHeight, uv.y);
    float fd = uFog*smoothstep(0.30,0.82, fn*0.62 + vb*0.60);
    vec3 fogCol = mix(vec3(0.30,0.34,0.44), vec3(0.91,0.91,0.89), smoothstep(0.0,0.32,sun));
    fogCol = mix(fogCol, fogCol*mix(vec3(1.0),sunCol,0.55), lowAmt);
    col = mix(col, fogCol, fd);
    col += sunCol*exp(-sd*3.0)*fd*lowAmt*0.25;           // sun bleeding through the bank
  }

  // ---- rain
  if(uRain>0.001){
    float r = rainLayer(uv,aspect,3.6,70.0,1.0,t)*0.55 + rainLayer(uv,aspect,2.4,42.0,2.0,t)*0.40;
    vec3 streak = mix(col, vec3(0.86,0.89,0.94), 0.55);
    col = mix(col, streak, r*uRain*0.85);
  }
  // ---- lightning lifts everything for a frame
  col += vec3(0.85,0.88,1.0)*uFlash*0.35;

  // saturation dial + grain
  float l = dot(col, vec3(0.299,0.587,0.114));
  col = mix(vec3(l), col, uSat);
  col += (hash(vUv*uRes + fract(uTime))-0.5)*uGrain;
  fragColor = vec4(clamp(col,0.0,1.0),1.0);
}`;

/** EnvState-derived targets the engine lerps toward. */
export interface SkyTarget {
  /** 0 = deep night, 1 = high noon. */
  sun: number;
  /** Rising → the low-sun band is dawn; setting → dusk. Eased as 0..1. */
  dayPhase: DayPhase;
  /** Cloud coverage, 0..1 — straight from `cloudiness`. */
  cloud: number;
  /** The fog bank, 0..1. A STATE, not a function of cloudiness. */
  fog: number;
  /** Rain streak density, 0..1 — straight from `precipitation`. */
  rain: number;
  /** Thunderstorm, 0..1: closes the deck, dims the scene, arms the lightning. */
  storm: number;
  /** Normalized wind: slants the rain, blows the deck, rolls the bank. */
  wind: number;
}

/** The numeric form the engine eases (dayPhase collapsed to 0 rising / 1 setting). */
type EasedSky = { sun: number; phase: number; cloud: number; fog: number; rain: number; storm: number; wind: number };

const KEYS = ['sun', 'phase', 'cloud', 'fog', 'rain', 'storm', 'wind'] as const;

function toEased(t: SkyTarget): EasedSky {
  return {
    sun: t.sun,
    phase: t.dayPhase === 'setting' ? 1 : 0,
    cloud: t.cloud,
    fog: t.fog,
    rain: t.rain,
    storm: t.storm,
    wind: t.wind,
  };
}

export interface SkyEngine {
  /** Set the EnvState targets. `immediate` snaps (used for the first paint). */
  setEnv(target: SkyTarget, immediate?: boolean): void;
  /** Freeze the drift + the lightning, and use quick transitions (reduced motion). */
  setReducedMotion(reduced: boolean): void;
  /** Re-read the viewport + `skyResolution` and resize the backing store. */
  syncSize(): void;
  /**
   * The BRIGHTEST pixel in a horizontal band of the sky, as 0..255 sRGB —
   * dev-only, for the contrast probe. `y0`/`y1` are fractions of the viewport
   * measured from the TOP. Pass `at` to sample a hypothetical sky (the probe
   * asks for clear noon, the brightest the sky ever gets) without disturbing
   * the live one.
   */
  sampleBand(y0: number, y1: number, at?: SkyTarget): [number, number, number] | null;
  /**
   * Per-frame GPU cost, in ms — dev-only, for `scripts/sky-perf.mjs`. Returns
   * one mean per BATCH of `batch` frames.
   *
   * Two things make this the shape it is. `drawArrays` only QUEUES the work, so
   * timing around one call measures how fast this thread can talk to the driver
   * and not how long the shader takes; the batch is closed with a one-pixel
   * `readPixels`, which the driver cannot answer without finishing every draw
   * behind it. And `performance.now()` is clamped to 100µs in a page that is
   * not cross-origin isolated, so a single frame of this shader can land inside
   * the clock's own resolution — averaging over a batch is what gets the number
   * out from under it.
   */
  benchmark(frames?: number, batch?: number): number[];
  /** The GL renderer string, for a perf table that says what it ran on. */
  renderer(): string;
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

/** Storm level above which lightning is armed. */
const FLASH_ARMED_AT = 0.3;
/** Gap between flashes, in ms — uniform in this range (the prototype's). */
const FLASH_GAP_MIN_MS = 3500;
const FLASH_GAP_SPAN_MS = 9000;
/**
 * The lightning envelope: THREE BURSTS with exponential decay, the way a real
 * strike reads — a hard leader, a small re-strike a tenth of a second later,
 * and a longer, brighter main stroke behind it. `d` is seconds since the strike
 * began; the result is scaled by how much of a storm there is, so a marginal
 * storm flickers rather than detonates.
 */
export function flashEnvelope(d: number, storm: number): number {
  if (d < 0) return 0;
  const burst = (t0: number, a: number, k: number) => (d > t0 ? a * Math.exp(-(d - t0) / k) : 0);
  const v = burst(0, 1.0, 0.09) + burst(0.1, 0.35, 0.07) + burst(0.18, 0.8, 0.14);
  return Math.min(1, v) * Math.min(1, storm * 1.5);
}

/**
 * Create a sky engine on a canvas, or return null if WebGL2 / program setup
 * fails (the caller then shows the CSS fallback).
 */
export function createSkyEngine(canvas: HTMLCanvasElement): SkyEngine | null {
  const gl = canvas.getContext('webgl2', {
    antialias: false,
    alpha: false,
    // The contrast probe reads pixels back out of this buffer in dev. It does
    // so in the same task as the draw, so no preserved buffer is needed.
    preserveDrawingBuffer: false,
  });
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

  const loc = (name: string) => gl.getUniformLocation(program, name);
  const u = {
    res: loc('uRes'),
    time: loc('uTime'),
    zenith: loc('uZenith'),
    horizon: loc('uHorizon'),
    sun: loc('uSun'),
    phase: loc('uPhase'),
    cloud: loc('uCloud'),
    fog: loc('uFog'),
    rain: loc('uRain'),
    storm: loc('uStorm'),
    wind: loc('uWind'),
    flash: loc('uFlash'),
    drift: loc('uDrift'),
    cloudScale: loc('uCloudScale'),
    fogHeight: loc('uFogHeight'),
    sat: loc('uSat'),
    grain: loc('uGrain'),
  };

  // --- eased state ---
  const cur: EasedSky = { sun: 0, phase: 0, cloud: 0, fog: 0, rain: 0, storm: 0, wind: 0 };
  const tgt: EasedSky = { ...cur };
  let reduced = false;
  const startTime = performance.now();

  let running = false;
  let raf = 0;
  let last = performance.now();
  let width = 0;
  let height = 0;

  // --- lightning ---
  let nextFlashAt = performance.now() + FLASH_GAP_MIN_MS;
  let flashStartedAt = -1;

  function resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * config.skyResolution;
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

  /** The flash uniform for this frame. Frozen at 0 under reduced motion — a
   *  static frame is the whole contract there, and a strobe is the one thing it
   *  must never be. */
  function flashFor(now: number): number {
    if (reduced) return 0;
    if (cur.storm > FLASH_ARMED_AT) {
      if (now > nextFlashAt) {
        flashStartedAt = now;
        nextFlashAt = now + FLASH_GAP_MIN_MS + Math.random() * FLASH_GAP_SPAN_MS;
      }
    } else {
      // Disarmed: hold the next strike off so a storm rolling in does not open
      // with one the same frame it crosses the threshold.
      nextFlashAt = now + 2000;
    }
    if (flashStartedAt < 0) return 0;
    return flashEnvelope((now - flashStartedAt) / 1000, cur.storm);
  }

  function render(nowMs: number, state: EasedSky = cur, flash = flashFor(nowMs)): void {
    const g = skyGradientAt(state.sun, state.phase);
    gl!.uniform2f(u.res, width, height);
    gl!.uniform1f(u.time, reduced ? 0 : (nowMs - startTime) / 1000);
    gl!.uniform3f(u.zenith, g.zenith[0], g.zenith[1], g.zenith[2]);
    gl!.uniform3f(u.horizon, g.horizon[0], g.horizon[1], g.horizon[2]);
    gl!.uniform1f(u.sun, state.sun);
    gl!.uniform1f(u.phase, state.phase);
    gl!.uniform1f(u.cloud, state.cloud);
    gl!.uniform1f(u.fog, state.fog);
    gl!.uniform1f(u.rain, state.rain);
    gl!.uniform1f(u.storm, state.storm);
    gl!.uniform1f(u.wind, state.wind);
    gl!.uniform1f(u.flash, flash);
    gl!.uniform1f(u.drift, config.skyDrift);
    gl!.uniform1f(u.cloudScale, config.cloudScale);
    gl!.uniform1f(u.fogHeight, config.fogHeight);
    gl!.uniform1f(u.sat, config.skySaturation);
    gl!.uniform1f(u.grain, config.skyGrain);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
  }

  function frame(now: number): void {
    const dt = Math.min((now - last) / 1000, MAX_DT);
    last = now;
    const tauMs = reduced ? REDUCED_TRANSITION_MS : config.skyTransitionMs;
    const k = 1 - Math.exp(-dt / (tauMs / 1000));
    let settled = true;
    for (const key of KEYS) {
      cur[key] += (tgt[key] - cur[key]) * k;
      if (Math.abs(tgt[key] - cur[key]) >= SETTLE_EPSILON) settled = false;
    }
    if (settled) for (const key of KEYS) cur[key] = tgt[key];

    render(now);

    // The sky moves continuously while visible — keep going unless reduced
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
      Object.assign(tgt, toEased(target));
      if (immediate) {
        Object.assign(cur, tgt);
        render(performance.now());
      }
      requestRender();
    },
    setReducedMotion(value) {
      reduced = value;
      requestRender();
    },
    syncSize: resize,
    sampleBand(y0, y1, at) {
      if (width === 0 || height === 0) return null;
      // `readPixels` measures from the BOTTOM of the buffer; the arguments are
      // from the top, which is how the DOM measures a band.
      const glY0 = Math.max(0, Math.min(height - 1, Math.round((1 - y1) * height)));
      const glY1 = Math.max(glY0 + 1, Math.min(height, Math.round((1 - y0) * height)));
      const h = glY1 - glY0;
      // Draw the sky being asked about into the (unpresented) back buffer and
      // read it straight back. Same task as the draw, so nothing has composited
      // it away yet.
      render(performance.now(), at ? toEased(at) : cur, 0);
      const px = new Uint8Array(width * h * 4);
      gl!.readPixels(0, glY0, width, h, gl!.RGBA, gl!.UNSIGNED_BYTE, px);
      let best: [number, number, number] = [0, 0, 0];
      let bestLuma = -1;
      for (let i = 0; i < px.length; i += 4) {
        const luma = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
        if (luma > bestLuma) {
          bestLuma = luma;
          best = [px[i], px[i + 1], px[i + 2]];
        }
      }
      if (at) render(performance.now()); // put the live sky back on screen
      return best;
    },
    benchmark(frames = 600, batch = 10) {
      const out: number[] = [];
      const px = new Uint8Array(4);
      // A read the driver cannot answer until every queued draw has landed.
      const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      render(performance.now()); // warm: shader compiled, uniforms resident
      sync();
      for (let r = 0; r < Math.max(1, Math.ceil(frames / batch)); r++) {
        const t0 = performance.now();
        // Walk uTime forward so no two frames in a batch are the same picture —
        // a driver is entitled to notice that they would be.
        for (let i = 0; i < batch; i++) render(t0 + i * 16.7, cur, 0);
        sync();
        out.push((performance.now() - t0) / batch);
      }
      return out;
    },
    renderer() {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
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
