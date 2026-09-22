/**
 * The sky's FLUID — a small stable-fluids solver run inside the sky's own WebGL2
 * context, whose output the sky's fragment shader samples as `tFluid`.
 *
 * Reference: ponpon-mania.com, where every background samples one shared fluid
 * texture the pointer writes into — velocity displaces UVs, density lifts
 * colour or thins masks. Here that texture is the WAKE: the cursor (and the
 * page's own moving cards, see `skySplat` in `skyStage.ts`) pushes air through
 * the weather, and each layer answers in the way that layer physically would —
 * a cloud deck parts, a fog bank opens a window and fills back in, rain bends,
 * stars scatter. What each layer does with it is in `skyEngine.ts`; this file
 * only makes the field.
 *
 * THE PIPELINE is the standard one (Stam, as popularised by Pavel Dobryakov's
 * WebGL-Fluid-Simulation), once per frame:
 *
 *   splat → curl → vorticity → divergence → pressure (Jacobi ×20) →
 *   gradient subtract → advect velocity → advect dye
 *
 * at 128×72 for the velocity grid and 256×144 for the dye, all half-float.
 *
 * IN SEVENTEEN PASSES, NOT THIRTY. At this size a pass costs next to nothing to
 * shade, and what it costs is being a pass: every render-target switch is a new
 * encoder, and thirty of them were most of the solver's millisecond. So the
 * curl is computed inside the vorticity pass (each of its five taps is four
 * velocity reads), the warm start's ×0.8 is folded into the first pressure
 * pass, and each pressure pass does TWO Jacobi sweeps — the inner sweep at the
 * four neighbours, with their own neighbours read through the same edge clamp
 * a separate pass would have seen. Ten passes, twenty iterations; the same
 * arithmetic, minus the half-float rounding between the two sweeps.
 *
 * THE OUTPUT IS THE DYE TARGET, and it carries both things the sky reads: the
 * dye advect writes `xy` = the (projected, advected) velocity in SCREEN HEIGHTS
 * PER SECOND and `z` = the density. One texture, one fetch per sky pixel.
 *
 * IT GOES TO SLEEP. Nothing splats without a pointer moving or a card moving,
 * and the field decays at `velocityDissipation` / `densityDissipation` per
 * 60 Hz frame. Half floats never quite reach zero by multiplication (a
 * subnormal times 0.98 rounds back to itself), so every advect flushes values
 * under a cutoff to exactly 0, and once enough time has passed since the last
 * splat for the largest value it could hold to have decayed below that cutoff,
 * the targets are cleared and the solver stops running. From then until the
 * next splat the sky does not fetch the texture at all — which is why the
 * idle sky is the pre-fluid sky to the byte, and costs what it cost.
 */

const SIM_W = 128;
const SIM_H = 72;
const DYE_W = 256;
const DYE_H = 144;
/** Jacobi iterations — run two to a pass, so this must be even. */
const PRESSURE_ITERATIONS = 20;
/** Pressure carried over from the last frame's solve (warm start). */
const PRESSURE_KEEP = 0.8;
/** Most splats taken in one frame; the rest wait for the next. */
export const MAX_SPLATS = 16;
/** Velocity (screen heights / s) and density below which a value is 0. */
const VEL_CUTOFF = 1e-3;
const DENSITY_CUTOFF = 1e-3;
/** Most velocity a splat may leave in a texel (screen heights / s). */
const VEL_MAX = 6;
/** Most density a texel may hold. The sky reads it clamped to 1. */
const DENSITY_MAX = 1.5;
/** However slow the decay is dialled, the field is cleared by this. */
const SLEEP_CAP_S = 12;

/** One queued splat, in the sim's own terms. */
export interface Splat {
  /** Position, 0..1 UV with y UP (GL). */
  u: number;
  v: number;
  /** Velocity, screen heights per second (x and y both in HEIGHTS, y up). */
  vx: number;
  vy: number;
  /** Density to add at the centre. */
  density: number;
}

export interface FluidParams {
  /** Splat radius as a fraction of the screen height (the gaussian's 1/e). */
  radius: number;
  /** Vorticity confinement. */
  curl: number;
  /** Per-60Hz-frame multipliers. */
  velocityDissipation: number;
  densityDissipation: number;
  /** Screen aspect (width / height). */
  aspect: number;
}

export interface Fluid {
  /** Step the solver by `dt` seconds with this frame's splats. A no-op when
   *  asleep and there is nothing to splat. */
  step(dt: number, splats: Splat[], p: FluidParams): void;
  /** True while the field may hold anything non-zero. */
  awake(): boolean;
  /** The texture the sky samples: xy velocity (heights/s), z density. */
  texture(): WebGLTexture;
  /** Zero everything and sleep. */
  clear(): void;
  dispose(): void;
}

const VERT = `#version 300 es
precision highp float;
uniform vec2 uTexel;
out vec2 vUv; out vec2 vL; out vec2 vR; out vec2 vT; out vec2 vB;
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  vL = p - vec2(uTexel.x, 0.0); vR = p + vec2(uTexel.x, 0.0);
  vT = p + vec2(0.0, uTexel.y); vB = p - vec2(0.0, uTexel.y);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const HEAD = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv; in vec2 vL; in vec2 vR; in vec2 vT; in vec2 vB;
out vec4 o;
`;

// uPts[i] = (u, v, vx, vy) — vx/vy already in the target's units; uAmt[i] = density.
const SPLAT = `${HEAD}
uniform sampler2D uTarget;
uniform float uAspect, uRadius, uDye, uMax;
uniform int uCount;
uniform vec4 uPts[${MAX_SPLATS}];
uniform float uAmt[${MAX_SPLATS}];
void main(){
  vec4 base = texture(uTarget, vUv);
  vec2 addV = vec2(0.0); float addD = 0.0;
  for (int i = 0; i < ${MAX_SPLATS}; i++) {
    if (i >= uCount) break;
    vec2 d = vUv - uPts[i].xy; d.x *= uAspect;
    float g = exp(-dot(d, d) / (uRadius * uRadius));
    addV += uPts[i].zw * g;
    addD += uAmt[i] * g;
  }
  if (uDye > 0.5) {
    base.z = min(base.z + addD, uMax);
  } else {
    base.xy += addV;
    float m = length(base.xy);
    if (m > uMax) base.xy *= uMax / m;
  }
  o = base;
}`;

// Curl, and vorticity confinement from it, in one pass. `at` clamps a tap to
// the grid the way a separate curl texture's CLAMP_TO_EDGE would have.
const VORTICITY = `${HEAD}
uniform sampler2D uVelocity;
uniform vec2 uTexel;
uniform float uCurl, uDt;
vec2 at(vec2 p){ return clamp(p, 0.5 * uTexel, 1.0 - 0.5 * uTexel); }
float curlAt(vec2 p){
  p = at(p);
  float L = texture(uVelocity, p - vec2(uTexel.x, 0.0)).y, R = texture(uVelocity, p + vec2(uTexel.x, 0.0)).y;
  float T = texture(uVelocity, p + vec2(0.0, uTexel.y)).x, B = texture(uVelocity, p - vec2(0.0, uTexel.y)).x;
  return 0.5 * (R - L - T + B);
}
void main(){
  float L = curlAt(vL), R = curlAt(vR), T = curlAt(vT), B = curlAt(vB);
  float C = curlAt(vUv);
  vec2 f = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  f /= length(f) + 0.0001;
  f *= uCurl * C; f.y *= -1.0;
  vec2 v = texture(uVelocity, vUv).xy + f * uDt;
  o = vec4(clamp(v, -1000.0, 1000.0), 0.0, 1.0);
}`;

const DIVERGENCE = `${HEAD}
uniform sampler2D uVelocity;
void main(){
  float L = texture(uVelocity, vL).x, R = texture(uVelocity, vR).x;
  float T = texture(uVelocity, vT).y, B = texture(uVelocity, vB).y;
  vec2 C = texture(uVelocity, vUv).xy;
  if (vL.x < 0.0) L = -C.x;
  if (vR.x > 1.0) R = -C.x;
  if (vT.y > 1.0) T = -C.y;
  if (vB.y < 0.0) B = -C.y;
  o = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`;

// TWO Jacobi sweeps: the inner one evaluated at each of the four neighbours
// (clamped to the grid, as a pass boundary would), the outer one here. `uKeep`
// is the warm start — 0.8 on the first pass, 1 on the rest.
const PRESSURE = `${HEAD}
uniform sampler2D uPressure, uDivergence;
uniform vec2 uTexel;
uniform float uKeep;
vec2 at(vec2 p){ return clamp(p, 0.5 * uTexel, 1.0 - 0.5 * uTexel); }
float jacobi(vec2 c){
  float L = texture(uPressure, c - vec2(uTexel.x, 0.0)).x, R = texture(uPressure, c + vec2(uTexel.x, 0.0)).x;
  float T = texture(uPressure, c + vec2(0.0, uTexel.y)).x, B = texture(uPressure, c - vec2(0.0, uTexel.y)).x;
  return ((L + R + B + T) * uKeep - texture(uDivergence, c).x) * 0.25;
}
void main(){
  float L = jacobi(at(vL)), R = jacobi(at(vR)), T = jacobi(at(vT)), B = jacobi(at(vB));
  float div = texture(uDivergence, vUv).x;
  o = vec4((L + R + B + T - div) * 0.25, 0.0, 0.0, 1.0);
}`;

const GRADIENT = `${HEAD}
uniform sampler2D uPressure, uVelocity;
void main(){
  float L = texture(uPressure, vL).x, R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x, B = texture(uPressure, vB).x;
  vec2 v = texture(uVelocity, vUv).xy - vec2(R - L, T - B);
  o = vec4(v, 0.0, 1.0);
}`;

// Velocity lives in SIM TEXELS / s — the pressure solve treats both axes alike,
// and the sim's texels are near enough square on screen. `uSimTexel` turns it
// into UV for the backtrace; `uCut` is the cutoff in the same texel units.
const ADVECT_VELOCITY = `${HEAD}
uniform sampler2D uVelocity;
uniform vec2 uSimTexel;
uniform float uDt, uDissipation, uCut;
void main(){
  vec2 coord = vUv - uDt * texture(uVelocity, vUv).xy * uSimTexel;
  vec2 v = texture(uVelocity, coord).xy * uDissipation;
  if (length(v) < uCut) v = vec2(0.0);
  o = vec4(v, 0.0, 1.0);
}`;

// The dye pass is also where the OUTPUT is written: xy = velocity in screen
// heights / s (`uToHeights`), z = the advected density.
const ADVECT_DYE = `${HEAD}
uniform sampler2D uVelocity, uSource;
uniform vec2 uSimTexel, uToHeights;
uniform float uDt, uDissipation, uCutV, uCutD;
void main(){
  vec2 v = texture(uVelocity, vUv).xy;
  vec2 coord = vUv - uDt * v * uSimTexel;
  float d = texture(uSource, coord).z * uDissipation;
  if (d < uCutD) d = 0.0;
  vec2 h = v * uToHeights;
  if (length(h) < uCutV) h = vec2(0.0);
  o = vec4(h, d, 1.0);
}`;

interface Target {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
  w: number;
  h: number;
}

interface Double {
  read: Target;
  write: Target;
  swap(): void;
}

/**
 * Build the solver on the sky's context, or return null if the context cannot
 * render to half floats (the sky then simply has no wake).
 */
export function createFluid(gl: WebGL2RenderingContext): Fluid | null {
  if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) {
    return null;
  }

  const shaders: WebGLShader[] = [];
  function compile(type: number, src: string): WebGLShader | null {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn('[sky:fluid] shader compile failed:', gl.getShaderInfoLog(sh));
      return null;
    }
    shaders.push(sh);
    return sh;
  }
  const vs = compile(gl.VERTEX_SHADER, VERT);
  if (!vs) return null;

  type Prog = { p: WebGLProgram; u: (name: string) => WebGLUniformLocation | null };
  const programs: WebGLProgram[] = [];
  function program(src: string): Prog | null {
    const fs = compile(gl.FRAGMENT_SHADER, src);
    if (!fs) return null;
    const p = gl.createProgram();
    gl.attachShader(p, vs!);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.warn('[sky:fluid] program link failed:', gl.getProgramInfoLog(p));
      return null;
    }
    programs.push(p);
    const cache = new Map<string, WebGLUniformLocation | null>();
    return {
      p,
      u: (name) => {
        if (!cache.has(name)) cache.set(name, gl.getUniformLocation(p, name));
        return cache.get(name)!;
      },
    };
  }

  const splatP = program(SPLAT);
  const vortP = program(VORTICITY);
  const divP = program(DIVERGENCE);
  const presP = program(PRESSURE);
  const gradP = program(GRADIENT);
  const advVP = program(ADVECT_VELOCITY);
  const advDP = program(ADVECT_DYE);
  if (!splatP || !vortP || !divP || !presP || !gradP || !advVP || !advDP) return null;

  function target(w: number, h: number, internal: number, format: number): Target | null {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, gl.HALF_FLOAT, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!complete) return null;
    return { tex, fbo, w, h };
  }
  function double(w: number, h: number, internal: number, format: number): Double | null {
    const a = target(w, h, internal, format);
    const b = target(w, h, internal, format);
    if (!a || !b) return null;
    const d: Double = {
      read: a,
      write: b,
      swap() {
        const t = d.read;
        d.read = d.write;
        d.write = t;
      },
    };
    return d;
  }

  const velocity0 = double(SIM_W, SIM_H, gl.RG16F, gl.RG);
  const dye0 = double(DYE_W, DYE_H, gl.RGBA16F, gl.RGBA);
  const pressure0 = double(SIM_W, SIM_H, gl.R16F, gl.RED);
  const divergence0 = target(SIM_W, SIM_H, gl.R16F, gl.RED);
  if (!velocity0 || !dye0 || !pressure0 || !divergence0) return null;
  const velocity: Double = velocity0;
  const dye: Double = dye0;
  const pressure: Double = pressure0;
  const divergence: Target = divergence0;
  const all: Target[] = [velocity.read, velocity.write, dye.read, dye.write, pressure.read, pressure.write, divergence];

  const simTexel: [number, number] = [1 / SIM_W, 1 / SIM_H];
  const dyeTexel: [number, number] = [1 / DYE_W, 1 / DYE_H];

  function bindProgram(prog: Prog, texel: [number, number]): void {
    gl.useProgram(prog.p);
    gl.uniform2f(prog.u('uTexel'), texel[0], texel[1]);
  }
  let unit = 0;
  function tex(prog: Prog, name: string, t: Target): void {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.uniform1i(prog.u(name), unit);
    unit++;
  }
  function blit(to: Target): void {
    gl.bindFramebuffer(gl.FRAMEBUFFER, to.fbo);
    gl.viewport(0, 0, to.w, to.h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    unit = 0;
  }

  function clearAll(): void {
    gl.clearColor(0, 0, 0, 0);
    for (const t of all) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  clearAll();

  let awake = false;
  /** Seconds since the last splat, while awake. */
  let quiet = 0;

  const pts = new Float32Array(MAX_SPLATS * 4);
  const amt = new Float32Array(MAX_SPLATS);

  /** How long the field can hold anything after its last splat. */
  function sleepAfter(p: FluidParams): number {
    const frames = (keep: number, from: number, cut: number) =>
      keep >= 1 ? Infinity : keep <= 0 ? 0 : Math.log(cut / from) / Math.log(keep);
    const f = Math.max(
      frames(p.velocityDissipation, VEL_MAX, VEL_CUTOFF),
      frames(p.densityDissipation, DENSITY_MAX, DENSITY_CUTOFF),
    );
    return Math.min(SLEEP_CAP_S, f / 60);
  }

  function step(dtIn: number, splats: Splat[], p: FluidParams): void {
    if (!awake && splats.length === 0) return;
    const dt = Math.min(Math.max(dtIn, 0), 1 / 30);
    if (splats.length > 0) {
      awake = true;
      quiet = 0;
    } else {
      quiet += dt;
      if (quiet > sleepAfter(p)) {
        clearAll();
        awake = false;
        return;
      }
    }

    gl.disable(gl.BLEND);
    // Heights/s ↔ sim texels/s. A texel is 1/SIM_H of the height tall and
    // aspect/SIM_W of it wide.
    const toHx = p.aspect / SIM_W;
    const toHy = 1 / SIM_H;

    // 1 — splat, velocity then dye, every point of this frame in one pass each.
    if (splats.length > 0) {
      const n = Math.min(splats.length, MAX_SPLATS);
      for (let i = 0; i < n; i++) {
        const s = splats[i];
        pts[i * 4] = s.u;
        pts[i * 4 + 1] = s.v;
        pts[i * 4 + 2] = s.vx / toHx;
        pts[i * 4 + 3] = s.vy / toHy;
        amt[i] = s.density;
      }
      bindProgram(splatP!, simTexel);
      gl.uniform1f(splatP!.u('uAspect'), p.aspect);
      gl.uniform1f(splatP!.u('uRadius'), p.radius);
      gl.uniform1i(splatP!.u('uCount'), n);
      gl.uniform4fv(splatP!.u('uPts'), pts);
      gl.uniform1fv(splatP!.u('uAmt'), amt);
      gl.uniform1f(splatP!.u('uDye'), 0);
      gl.uniform1f(splatP!.u('uMax'), VEL_MAX / toHy);
      tex(splatP!, 'uTarget', velocity.read);
      blit(velocity.write);
      velocity.swap();
      bindProgram(splatP!, dyeTexel);
      gl.uniform1f(splatP!.u('uDye'), 1);
      gl.uniform1f(splatP!.u('uMax'), DENSITY_MAX);
      tex(splatP!, 'uTarget', dye.read);
      blit(dye.write);
      dye.swap();
    }

    // 2 — curl, and vorticity confinement from it, in one pass.
    bindProgram(vortP!, simTexel);
    tex(vortP!, 'uVelocity', velocity.read);
    gl.uniform1f(vortP!.u('uCurl'), p.curl);
    gl.uniform1f(vortP!.u('uDt'), dt);
    blit(velocity.write);
    velocity.swap();

    // 3 — divergence, then the pressure solve (warm-started).
    bindProgram(divP!, simTexel);
    tex(divP!, 'uVelocity', velocity.read);
    blit(divergence);
    bindProgram(presP!, simTexel);
    for (let i = 0; i < PRESSURE_ITERATIONS; i += 2) {
      gl.uniform1f(presP!.u('uKeep'), i === 0 ? PRESSURE_KEEP : 1);
      tex(presP!, 'uPressure', pressure.read);
      tex(presP!, 'uDivergence', divergence);
      blit(pressure.write);
      pressure.swap();
    }

    // 4 — subtract the gradient: the field is divergence-free.
    bindProgram(gradP!, simTexel);
    tex(gradP!, 'uPressure', pressure.read);
    tex(gradP!, 'uVelocity', velocity.read);
    blit(velocity.write);
    velocity.swap();

    // 5 — advect velocity, then the dye (which also writes the output).
    const frames60 = dt * 60;
    bindProgram(advVP!, simTexel);
    tex(advVP!, 'uVelocity', velocity.read);
    gl.uniform2f(advVP!.u('uSimTexel'), simTexel[0], simTexel[1]);
    gl.uniform1f(advVP!.u('uDt'), dt);
    gl.uniform1f(advVP!.u('uDissipation'), Math.pow(p.velocityDissipation, frames60));
    gl.uniform1f(advVP!.u('uCut'), VEL_CUTOFF / toHy);
    blit(velocity.write);
    velocity.swap();

    bindProgram(advDP!, dyeTexel);
    tex(advDP!, 'uVelocity', velocity.read);
    tex(advDP!, 'uSource', dye.read);
    gl.uniform2f(advDP!.u('uSimTexel'), simTexel[0], simTexel[1]);
    gl.uniform2f(advDP!.u('uToHeights'), toHx, toHy);
    gl.uniform1f(advDP!.u('uDt'), dt);
    gl.uniform1f(advDP!.u('uDissipation'), Math.pow(p.densityDissipation, frames60));
    gl.uniform1f(advDP!.u('uCutV'), VEL_CUTOFF);
    gl.uniform1f(advDP!.u('uCutD'), DENSITY_CUTOFF);
    blit(dye.write);
    dye.swap();

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0);
  }

  return {
    step,
    awake: () => awake,
    texture: () => dye.read.tex,
    clear() {
      clearAll();
      awake = false;
      quiet = 0;
    },
    dispose() {
      for (const t of all) {
        gl.deleteTexture(t.tex);
        gl.deleteFramebuffer(t.fbo);
      }
      for (const p of programs) gl.deleteProgram(p);
      for (const s of shaders) gl.deleteShader(s);
    },
  };
}
