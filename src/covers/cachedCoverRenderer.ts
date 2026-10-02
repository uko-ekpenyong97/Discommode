import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  ClampToEdgeWrapping,
  GLSL3,
  LinearFilter,
  Mesh,
  NoBlending,
  NoColorSpace,
  OrthographicCamera,
  RawShaderMaterial,
  Scene,
  UnsignedByteType,
  WebGLRenderTarget,
} from 'three';
import type { Material, Texture, Vector2, WebGLRenderer } from 'three';
import { splitCoverGlsl } from './glsl';
import { CoverRenderer, coverCropOf } from './coverRenderer';
import type { CoverDrawer, DrawInput } from './coverRenderer';
import type { DialValues } from './dialValues';
import type { CachedCoverDef, CoverDef, Crop, InstanceFrame, Uniforms } from './types';

/**
 * ONE CACHED-PASS COVER ON ONE three.js RENDERER (card 03's print, drex.ts;
 * types.ts, CachedCoverDef):
 *
 *   pass A   the WHOLE frame at the output's scale, into one RGBA8 target —
 *            rendered once per size and dial state and kept (the "print")
 *   pass B   per draw, into the output, reading the crop of that print the
 *            instance shows
 *
 * The prints are kept by size, because the instances are few sizes, each
 * steady: the grid's tiles (one, capped by coverRenderMax), the hero and the
 * morph card that lands on it (the stage sizes this kind by the instance's
 * LAYOUT box, so a scale transform — the morph's travel, a tile's focus and
 * tilt — is not a new size; coverStage.ts). A print unused for a while is
 * given back. Nothing is allocated per draw.
 */
const VERTEX = `
in vec3 position;
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/** How long an unused print is kept, ms, and how many at most. */
const KEEP_MS = 30_000;
const KEEP_N = 4;

interface Print {
  rt: WebGLRenderTarget;
  /** The dials it was rendered with (`printKey`); '' = not rendered. */
  key: string;
  used: number;
}

/**
 * Where an output of `pxW × pxH` showing `crop` lies in the print: the print
 * is the whole frame at `s` px per frame unit (`w × h` px, whole), and the
 * output's top-left is its pixel (`ox`, `oy`), whole — so every output pixel
 * reads one print texel at its centre, and the per-pixel dither is the
 * print's, not a resampling of it.
 */
export interface PrintGeometry {
  w: number;
  h: number;
  s: number;
  ox: number;
  oy: number;
}

export function printGeometry(fw: number, fh: number, crop: Crop, pxW: number, pxH: number, out: PrintGeometry): PrintGeometry {
  const w0 = Math.max(1, Math.round((fw * pxW) / crop.w));
  out.s = w0 / fw;
  out.ox = Math.round(crop.x0 * out.s);
  out.oy = Math.round(crop.y0 * out.s);
  out.w = Math.max(w0, out.ox + pxW);
  out.h = Math.max(Math.round(fh * out.s), out.oy + pxH);
  return out;
}

export class CachedCoverRenderer implements CoverDrawer {
  readonly def: CachedCoverDef;
  private readonly gl: WebGLRenderer;
  private readonly a: Uniforms;
  private readonly b: Uniforms;
  private readonly matA: RawShaderMaterial;
  private readonly matB: RawShaderMaterial;
  private readonly sceneA = new Scene();
  private readonly sceneB = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly geometry = new BufferGeometry();
  private readonly prints = new Map<string, Print>();
  private values: DialValues;
  private key = '';
  private assets: Record<string, Texture> = {};
  private assetKey = '';
  private assetToken = 0;
  private ready_ = false;
  private readonly geo: PrintGeometry = { w: 1, h: 1, s: 1, ox: 0, oy: 0 };
  private readonly frame: InstanceFrame = {
    t: 0,
    crop: { x0: 0, y0: 0, w: 1, h: 1 },
    pxW: 1,
    pxH: 1,
    flipY: false,
    rtX0: 0,
    rtY0: 0,
    rtUnits: 1,
    rtW: 1,
    rtH: 1,
    dome: { x: 0, y: 0, amp: 0 },
    backdrop: null,
  };
  private draws = 0;
  private printsRendered = 0;
  private printMs = 0;
  private floorScene: Scene | null = null;
  private floorMat: RawShaderMaterial | null = null;

  constructor(renderer: WebGLRenderer, def: CachedCoverDef, values: DialValues) {
    this.gl = renderer;
    this.def = def;
    this.values = values;
    const passes = splitCoverGlsl(def.glsl, { FRAME_W: def.frame.w, FRAME_H: def.frame.h }, { version: false });
    this.a = def.uniformsA();
    this.b = def.uniformsB();
    const mat = (fragmentShader: string, uniforms: Uniforms) =>
      new RawShaderMaterial({
        glslVersion: GLSL3,
        vertexShader: VERTEX,
        fragmentShader,
        uniforms,
        blending: NoBlending,
        depthTest: false,
        depthWrite: false,
        transparent: false,
      });
    this.matA = mat(passes.a, this.a);
    this.matB = mat(passes.b, this.b);
    this.geometry.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const meshA = new Mesh(this.geometry, this.matA);
    const meshB = new Mesh(this.geometry, this.matB);
    meshA.frustumCulled = meshB.frustumCulled = false;
    this.sceneA.add(meshA);
    this.sceneB.add(meshB);
    this.setValues(values);
  }

  ready(): boolean {
    return this.ready_;
  }

  /** New dial values: rebind, and a new `printKey` makes every print stale (each
   *  is re-rendered on its next draw). The assets are never uploaded: pass A's
   *  input is built from them per size. */
  setValues(values: DialValues) {
    this.values = values;
    this.key = this.def.printKey(values);
    const key = this.def.assetKey(values);
    if (key !== this.assetKey) {
      this.assetKey = key;
      const token = ++this.assetToken;
      void this.def.assets(values).then(
        (assets) => {
          if (token !== this.assetToken) return;
          this.assets = assets;
          this.def.bind(this.values, this.a, this.b, this.assets);
          for (const p of this.prints.values()) p.key = '';
          this.ready_ = true;
        },
        (e) => console.warn(`[covers] ${this.def.id}: its assets did not load`, e),
      );
    }
    this.def.bind(values, this.a, this.b, this.assets);
  }

  warm() {
    this.gl.compile(this.sceneA, this.camera);
    this.gl.compile(this.sceneB, this.camera);
  }

  async compileAsync() {
    await this.gl.compileAsync(this.sceneA, this.camera);
    await this.gl.compileAsync(this.sceneB, this.camera);
  }

  async warmAsync() {
    await this.gl.compileAsync(this.sceneA, this.camera);
    await this.gl.compileAsync(this.sceneB, this.camera);
    while (!this.ready_) await new Promise((r) => setTimeout(r, 50));
    const rt = CoverRenderer.outputTarget(8, 10);
    const crop = coverCropOf(this.def.frame.w, this.def.frame.h, 8, 10, { x0: 0, y0: 0, w: 1, h: 1 });
    this.draw(rt, { t: 0, crop, pxW: 8, pxH: 10, dome: { x: 0, y: 0, amp: 0 }, backdrop: null });
    rt.dispose();
  }

  /** The print a draw of `crop` `pxW` wide will read: allocated, and rendered
   *  if the assets are in — now, a frame ahead, rather than on that draw. */
  prepare(crop: Crop, pxW: number) {
    const pxH = Math.round((pxW * crop.h) / crop.w);
    const g = printGeometry(this.def.frame.w, this.def.frame.h, crop, pxW, pxH, this.geo);
    const p = this.print(g);
    this.gl.initRenderTarget(p.rt);
    if (this.ready_ && p.key !== this.key) this.renderPrint(p, g);
  }

  /** Draw one instance: its print (rendered first if it is stale or new), then
   *  pass B over it. Leaves the renderer's target as it found it. */
  draw(target: WebGLRenderTarget | null, d: DrawInput) {
    if (!this.ready_) return false;
    const g = printGeometry(this.def.frame.w, this.def.frame.h, d.crop, d.pxW, d.pxH, this.geo);
    const p = this.print(g);
    if (p.key !== this.key && !this.renderPrint(p, g)) return false;

    const fr = this.frame;
    fr.t = d.t;
    fr.crop = d.crop;
    fr.pxW = d.pxW;
    fr.pxH = d.pxH;
    fr.flipY = target === null;
    fr.dome = d.dome;
    fr.backdrop = d.backdrop;
    fr.rtX0 = 0;
    fr.rtY0 = 0;
    fr.rtUnits = 1 / g.s;
    fr.rtW = g.w;
    fr.rtH = g.h;
    const b = this.b;
    b.uTex.value = p.rt.texture;
    (b.uDims.value as Vector2).set(g.w, g.h);
    (b.uOrigin.value as Vector2).set(g.ox, g.oy);
    (b.uOut.value as Vector2).set(d.pxW, d.pxH);
    b.uFlip.value = fr.flipY ? 1 : 0;
    this.def.frameUniforms(this.values, this.a, b, fr, this.assets);

    const gl = this.gl;
    const prev = gl.getRenderTarget();
    const autoClear = gl.autoClear;
    gl.autoClear = false; // every pixel is written
    gl.setRenderTarget(target);
    if (!target) gl.setViewport(0, 0, d.pxW / gl.getPixelRatio(), d.pxH / gl.getPixelRatio());
    gl.render(this.sceneB, this.camera);
    gl.setRenderTarget(prev);
    gl.autoClear = autoClear;
    this.draws++;
    return true;
  }

  /** Pass A into `p`: the input picture at the print's size, uploaded, drawn
   *  through, and let go. */
  private renderPrint(p: Print, g: PrintGeometry): boolean {
    const t0 = performance.now();
    const source = this.def.printInput(this.values, g.w, g.h, this.assets);
    if (!source) return false;
    const input = new CanvasTexture(source as HTMLCanvasElement);
    // drexCover.js's upload: FLIP_Y false (t = 0 is the top row), premultiplied.
    input.flipY = false;
    input.premultiplyAlpha = true;
    input.colorSpace = NoColorSpace;
    input.minFilter = input.magFilter = LinearFilter;
    input.wrapS = input.wrapT = ClampToEdgeWrapping;
    input.generateMipmaps = false;
    this.a.uInput.value = input;
    this.def.printUniforms(this.values, this.a, g.w, g.h, g.s);
    const gl = this.gl;
    const prev = gl.getRenderTarget();
    const autoClear = gl.autoClear;
    gl.autoClear = false;
    gl.setRenderTarget(p.rt);
    gl.render(this.sceneA, this.camera);
    gl.setRenderTarget(prev);
    gl.autoClear = autoClear;
    this.a.uInput.value = null;
    input.dispose();
    p.key = this.key;
    this.printsRendered++;
    this.printMs = performance.now() - t0;
    return true;
  }

  private print(g: PrintGeometry): Print {
    const size = `${g.w}x${g.h}`;
    const now = performance.now();
    let p = this.prints.get(size);
    if (!p) {
      for (const [k, q] of this.prints) {
        if (now - q.used > KEEP_MS) {
          q.rt.dispose();
          this.prints.delete(k);
        }
      }
      while (this.prints.size >= KEEP_N) {
        let oldest: string | null = null;
        for (const [k, q] of this.prints) if (!oldest || q.used < this.prints.get(oldest)!.used) oldest = k;
        this.prints.get(oldest!)!.rt.dispose();
        this.prints.delete(oldest!);
      }
      const rt = new WebGLRenderTarget(g.w, g.h, {
        type: UnsignedByteType,
        minFilter: LinearFilter,
        magFilter: LinearFilter,
        depthBuffer: false,
        stencilBuffer: false,
        generateMipmaps: false,
      });
      rt.texture.colorSpace = NoColorSpace;
      p = { rt, key: '', used: now };
      this.prints.set(size, p);
    }
    p.used = now;
    return p;
  }

  /** DEV: the benchmark's floor — one pass into the output drawing nothing
   *  (pass A is not a per-frame cost here, so the floor has no pass A either). */
  drawFloor(target: WebGLRenderTarget | null, d: DrawInput) {
    if (!this.floorScene) {
      this.floorMat = new RawShaderMaterial({
        glslVersion: GLSL3,
        vertexShader: VERTEX,
        fragmentShader: 'precision highp float;\nout vec4 o;\nvoid main() { o = vec4(0.0); }',
        blending: NoBlending,
        depthTest: false,
        depthWrite: false,
      });
      const mesh = new Mesh(this.geometry, this.floorMat);
      mesh.frustumCulled = false;
      this.floorScene = new Scene().add(mesh);
    }
    const gl = this.gl;
    const prev = gl.getRenderTarget();
    const autoClear = gl.autoClear;
    gl.autoClear = false;
    gl.setRenderTarget(target);
    if (!target) gl.setViewport(0, 0, d.pxW / gl.getPixelRatio(), d.pxH / gl.getPixelRatio());
    gl.render(this.floorScene, this.camera);
    gl.setRenderTarget(prev);
    gl.autoClear = autoClear;
  }

  drawCount() {
    return this.draws;
  }

  /** DEV / verify: pass A's renders so far, the last one's main-thread ms (the
   *  input picture and the submit; the GPU's work is not in it), and the
   *  prints kept. */
  printStats() {
    return { renders: this.printsRendered, lastMs: this.printMs, kept: [...this.prints.keys()] };
  }

  /** DEV / verify: re-render one print at `crop` / `pxW × pxH` and time it on
   *  the GPU (closed by a one-pixel read), ms. */
  benchPrint(crop: Crop, pxW: number, pxH: number, n = 5): number | null {
    if (!this.ready_) return null;
    const g = printGeometry(this.def.frame.w, this.def.frame.h, crop, pxW, pxH, this.geo);
    const p = this.print(g);
    const px = new Uint8Array(4);
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      const t0 = performance.now();
      this.renderPrint(p, g);
      this.gl.readRenderTargetPixels(p.rt, 0, 0, 1, 1, px);
      out.push(performance.now() - t0);
    }
    out.sort((x, y) => x - y);
    return out[out.length >> 1];
  }

  /** DEV / verify: both programs linked (with their logs if not), and the
   *  context's GL error after a draw of each pass, which must be NO_ERROR. */
  diagnose(): { linked: boolean; log: string; glError: number } {
    const ctx = this.gl.getContext();
    ctx.getError(); // clear what came before
    this.warm();
    const crop = coverCropOf(this.def.frame.w, this.def.frame.h, 80, 104, { x0: 0, y0: 0, w: 1, h: 1 });
    const rt = CoverRenderer.outputTarget(80, 104);
    if (this.ready_) this.print(printGeometry(this.def.frame.w, this.def.frame.h, crop, 80, 104, this.geo)).key = ''; // pass A too
    const drawn = this.draw(rt, { t: 1, crop, pxW: 80, pxH: 104, dome: { x: 500, y: 650, amp: 1 }, backdrop: null });
    const glError = ctx.getError();
    rt.dispose();
    let linked = drawn;
    let log = drawn ? '' : 'not drawn (assets not in)';
    for (const m of [this.matA, this.matB] as Material[]) {
      const prog = (this.gl.properties.get(m) as { currentProgram?: { program: WebGLProgram; diagnostics?: unknown } }).currentProgram;
      const ok = !!prog && ctx.getProgramParameter(prog.program, ctx.LINK_STATUS) === true;
      if (!ok) {
        linked = false;
        log += prog ? ctx.getProgramInfoLog(prog.program) ?? '' : ' no program';
        if (prog?.diagnostics) log += JSON.stringify(prog.diagnostics);
      }
    }
    return { linked, log, glError };
  }

  dispose() {
    this.assetToken++;
    for (const p of this.prints.values()) p.rt.dispose();
    this.prints.clear();
    for (const t of Object.values(this.assets)) t.dispose();
    this.matA.dispose();
    this.matB.dispose();
    this.floorMat?.dispose();
    this.geometry.dispose();
  }
}

/** The renderer for a shader cover, whichever way its pass A runs. */
export function makeCoverRenderer(renderer: WebGLRenderer, def: CoverDef, values: DialValues): CoverDrawer {
  return def.passA === 'cached' ? new CachedCoverRenderer(renderer, def, values) : new CoverRenderer(renderer, def, values);
}
