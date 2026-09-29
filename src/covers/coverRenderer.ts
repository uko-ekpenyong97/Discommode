import {
  BufferAttribute,
  BufferGeometry,
  GLSL3,
  HalfFloatType,
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
import type { Texture, WebGLRenderer } from 'three';
import { splitCoverGlsl } from './glsl';
import type { DialValues } from './dialValues';
import type { CoverDef, Crop, Dome, InstanceFrame, Uniforms } from './types';

/**
 * ONE COVER ON ONE three.js RENDERER — the prototype's two passes as raw
 * GLSL 3 materials:
 *
 *   pass A   into a two-target half-float RT at `rtScale` of the output,
 *            covering the crop plus `rtMargin` (the picture as distances, and
 *            stage 5's lens field)
 *   pass B   into the output: a canvas's own framebuffer (the grid's stage) or
 *            an RT whose texture a paper plane samples directly (the hero)
 *
 * It does not care WHICH renderer: the grid's shared stage and the detail
 * paper's renderer each hold one of these, for the same cover, with the same
 * dials and the same clock — a texture cannot cross contexts, so the hero's
 * cover is drawn in the paper's own context and bound to its plane as is.
 *
 * Pass A's targets are pooled by size (an instance of each size that is on
 * screen keeps one); nothing is allocated per draw.
 */
const VERTEX = `
in vec3 position;
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/** A pass-A target and when it was last used, for trimming. */
interface PoolRT {
  rt: WebGLRenderTarget;
  used: number;
}

export interface DrawInput {
  t: number;
  crop: Crop;
  pxW: number;
  pxH: number;
  dome: Dome;
  backdrop: [number, number, number] | null;
}

export class CoverRenderer {
  readonly def: CoverDef;
  private readonly gl: WebGLRenderer;
  private readonly a: Uniforms;
  private readonly b: Uniforms;
  private readonly matA: RawShaderMaterial;
  private readonly matB: RawShaderMaterial;
  private readonly sceneA = new Scene();
  private readonly sceneB = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly geometry = new BufferGeometry();
  private readonly pool = new Map<string, PoolRT>();
  private values: DialValues;
  private assets: Record<string, Texture> = {};
  private assetKey = '';
  private assetToken = 0;
  private ready_ = false;
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
  // The benchmark's floor (bench.ts): the same two passes into the same
  // targets, with a shader that does nothing.
  private floorScene: Scene | null = null;
  private floorScene2: Scene | null = null;

  constructor(renderer: WebGLRenderer, def: CoverDef, values: DialValues) {
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
    // one triangle over the whole target
    this.geometry.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const meshA = new Mesh(this.geometry, this.matA);
    const meshB = new Mesh(this.geometry, this.matB);
    meshA.frustumCulled = meshB.frustumCulled = false;
    this.sceneA.add(meshA);
    this.sceneB.add(meshB);
    this.setValues(values);
  }

  /** The textures have loaded and the programs can draw. */
  ready(): boolean {
    return this.ready_;
  }

  /** New dial values: rebind, and rebuild the assets if their key moved. */
  setValues(values: DialValues) {
    this.values = values;
    const key = this.def.assetKey(values);
    if (key !== this.assetKey) {
      this.assetKey = key;
      const token = ++this.assetToken;
      void this.def.assets(values).then((assets) => {
        if (token !== this.assetToken) {
          for (const t of Object.values(assets)) t.dispose();
          return;
        }
        for (const t of Object.values(this.assets)) t.dispose();
        this.assets = assets;
        for (const t of Object.values(assets)) this.gl.initTexture(t);
        this.def.bind(this.values, this.a, this.b, this.assets);
        this.ready_ = true;
      });
    }
    this.def.bind(values, this.a, this.b, this.assets);
  }

  /** Compile both programs now rather than on the first visible frame. */
  warm() {
    this.gl.compile(this.sceneA, this.camera);
    this.gl.compile(this.sceneB, this.camera);
  }

  /**
   * Compile both programs WITHOUT blocking the main thread (three polls
   * KHR_parallel_shader_compile), then, once the assets are in, draw once
   * into a throwaway 8×10 target: the first draw of a program is where the
   * driver builds its pipeline. The detail paper's warm-up (paperGL.ts).
   */
  async warmAsync() {
    await this.gl.compileAsync(this.sceneA, this.camera);
    await this.gl.compileAsync(this.sceneB, this.camera);
    while (!this.ready_) await new Promise((r) => setTimeout(r, 50));
    const rt = CoverRenderer.outputTarget(8, 10);
    const crop = coverCropOf(this.def.frame.w, this.def.frame.h, 8, 10, { x0: 0, y0: 0, w: 1, h: 1 });
    this.draw(rt, { t: 0, crop, pxW: 8, pxH: 10, dome: { x: 0, y: 0, amp: 0 }, backdrop: null });
    rt.dispose();
  }

  /** Allocate (and clear) the pass-A target a draw of `crop` `pxW` wide will
   *  use, now rather than on that draw. */
  prepare(crop: Crop, pxW: number) {
    const m = this.def.rtMargin;
    const units = crop.w / pxW / Math.max(0.05, this.def.rtScale(this.values));
    this.gl.initRenderTarget(this.passTarget(Math.ceil((crop.w + 2 * m) / units), Math.ceil((crop.h + 2 * m) / units)));
  }

  /**
   * Draw one instance. `target` null draws into the renderer's canvas at
   * (0, 0, pxW, pxH) of its framebuffer (the caller sizes the canvas); an RT
   * is drawn whole. Leaves the renderer's target as it found it.
   */
  draw(target: WebGLRenderTarget | null, d: DrawInput) {
    if (!this.ready_) return false;
    const fr = this.frame;
    fr.t = d.t;
    fr.crop = d.crop;
    fr.pxW = d.pxW;
    fr.pxH = d.pxH;
    fr.flipY = target === null;
    fr.dome = d.dome;
    fr.backdrop = d.backdrop;
    // pass A: the crop plus a margin, at rtScale of the output
    const m = this.def.rtMargin;
    const units = d.crop.w / d.pxW / Math.max(0.05, this.def.rtScale(this.values));
    fr.rtUnits = units;
    fr.rtW = Math.ceil((d.crop.w + 2 * m) / units);
    fr.rtH = Math.ceil((d.crop.h + 2 * m) / units);
    fr.rtX0 = d.crop.x0 - m;
    fr.rtY0 = d.crop.y0 - m;
    const rtA = this.passTarget(fr.rtW, fr.rtH);
    this.def.frameUniforms(this.values, this.a, this.b, fr, this.assets);
    this.b.uRT.value = rtA.textures[0];
    this.b.uRT2.value = rtA.textures[1];

    const gl = this.gl;
    const prev = gl.getRenderTarget();
    const autoClear = gl.autoClear;
    gl.autoClear = false; // every pixel is written; a clear is a wasted pass
    gl.setRenderTarget(rtA);
    gl.render(this.sceneA, this.camera);
    gl.setRenderTarget(target);
    if (!target) {
      gl.setViewport(0, 0, d.pxW / gl.getPixelRatio(), d.pxH / gl.getPixelRatio());
    }
    gl.render(this.sceneB, this.camera);
    gl.setRenderTarget(prev);
    gl.autoClear = autoClear;
    this.draws++;
    return true;
  }

  /**
   * DEV: the benchmark's FLOOR — what a draw costs before any shading: the
   * same two passes, into the same targets, at the same size, drawing nothing.
   */
  drawFloor(target: WebGLRenderTarget | null, d: DrawInput) {
    if (!this.floorScene || !this.floorScene2) {
      const flat = (fragmentShader: string) => {
        const mesh = new Mesh(
          this.geometry,
          new RawShaderMaterial({
            glslVersion: GLSL3,
            vertexShader: VERTEX,
            fragmentShader,
            blending: NoBlending,
            depthTest: false,
            depthWrite: false,
          }),
        );
        mesh.frustumCulled = false;
        return new Scene().add(mesh);
      };
      this.floorScene = flat(
        'precision highp float;\nlayout(location = 0) out vec4 o;\nlayout(location = 1) out vec4 o2;\nvoid main() { o = vec4(0.0); o2 = vec4(0.0); }',
      );
      this.floorScene2 = flat('precision highp float;\nout vec4 o;\nvoid main() { o = vec4(0.0); }');
    }
    const m = this.def.rtMargin;
    const units = d.crop.w / d.pxW / Math.max(0.05, this.def.rtScale(this.values));
    const rtA = this.passTarget(Math.ceil((d.crop.w + 2 * m) / units), Math.ceil((d.crop.h + 2 * m) / units));
    const gl = this.gl;
    const prev = gl.getRenderTarget();
    const autoClear = gl.autoClear;
    gl.autoClear = false;
    gl.setRenderTarget(rtA);
    gl.render(this.floorScene, this.camera);
    gl.setRenderTarget(target);
    if (!target) gl.setViewport(0, 0, d.pxW / gl.getPixelRatio(), d.pxH / gl.getPixelRatio());
    gl.render(this.floorScene2, this.camera);
    gl.setRenderTarget(prev);
    gl.autoClear = autoClear;
  }

  /** An output RT for a paper plane: premultiplied RGBA8, sampled as is. */
  static outputTarget(w: number, h: number): WebGLRenderTarget {
    const rt = new WebGLRenderTarget(w, h, {
      type: UnsignedByteType,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    });
    rt.texture.colorSpace = NoColorSpace;
    return rt;
  }

  private passTarget(w: number, h: number): WebGLRenderTarget {
    const key = `${w}x${h}`;
    const now = performance.now();
    let p = this.pool.get(key);
    if (!p) {
      const rt = new WebGLRenderTarget(w, h, {
        count: 2,
        type: HalfFloatType,
        minFilter: LinearFilter,
        magFilter: LinearFilter,
        depthBuffer: false,
        stencilBuffer: false,
        generateMipmaps: false,
      });
      for (const t of rt.textures) t.colorSpace = NoColorSpace;
      p = { rt, used: now };
      this.pool.set(key, p);
      // An instance that stopped drawing gives its target back after a while.
      for (const [k, q] of this.pool) {
        if (now - q.used > 5000) {
          q.rt.dispose();
          this.pool.delete(k);
        }
      }
    }
    p.used = now;
    return p.rt;
  }

  /** DEV: draws issued so far. */
  drawCount() {
    return this.draws;
  }

  dispose() {
    this.assetToken++;
    for (const p of this.pool.values()) p.rt.dispose();
    this.pool.clear();
    for (const t of Object.values(this.assets)) t.dispose();
    this.matA.dispose();
    this.matB.dispose();
    this.geometry.dispose();
  }
}

/** The part of a `fw × fh` frame an `object-fit: cover` box of this aspect shows. */
export function coverCropOf(fw: number, fh: number, boxW: number, boxH: number, out: Crop): Crop {
  const box = boxW / boxH;
  const img = fw / fh;
  if (img > box) {
    out.h = fh;
    out.w = fh * box;
    out.x0 = (fw - out.w) / 2;
    out.y0 = 0;
  } else {
    out.w = fw;
    out.h = fw / box;
    out.x0 = 0;
    out.y0 = (fh - out.h) / 2;
  }
  return out;
}
