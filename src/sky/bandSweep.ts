/**
 * DEV: the brightest pixel of a band of the sky, for thousands of skies at
 * once, on the GPU.
 *
 * `sampleBand` answers "what is the brightest pixel under the letterhead" for
 * ONE sky: it draws the frame and reads the band back, 1.3 MB at 1440×900 @2x,
 * and walks it on the CPU. The sweep asks the same question of every
 * condition, every five minutes of a day, two moons and a wake at every phase
 * of a swipe — tens of thousands of skies — and at that count the read-back is
 * the whole cost. So the question is answered where the pixels already are:
 *
 *   1. ATLAS. K skies' bands are drawn, one above the other, into one RGBA8
 *      target — the same 8 bits the canvas has, so a pixel here is the pixel
 *      the screen would have had. Each is drawn with the full-frame viewport
 *      shifted so its band lands in its slot, and scissored to the slot.
 *   2. COLUMNS. One pass takes the brightest pixel of every 8-column block of
 *      every slot (luma by the same weights `sampleBand` uses).
 *   3. ROW. One pass takes the brightest of those per slot, into one pixel
 *      per sky of a small results target — one row of it per batch of K.
 *
 * And only the results are read back, once per call: four bytes a sky. A
 * read-back is a stall, so it is not done per batch. Only ever built in
 * dev, by `skyEngine`'s `sweepBand`.
 */

const REDUCE_VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/** Brightest pixel of each BLOCK×bandH block of each slot. */
const COLUMNS_FRAG = `#version 300 es
precision highp float;
uniform sampler2D tIn;
uniform int uBlock;
uniform int uBandH;
out vec4 o;
void main() {
  int w = textureSize(tIn, 0).x;
  int x0 = int(gl_FragCoord.x) * uBlock;
  int y0 = int(gl_FragCoord.y) * uBandH;
  vec3 best = vec3(0.0);
  float bl = -1.0;
  for (int x = x0; x < min(x0 + uBlock, w); x++) {
    for (int y = y0; y < y0 + uBandH; y++) {
      vec3 c = texelFetch(tIn, ivec2(x, y), 0).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      if (l > bl) { bl = l; best = c; }
    }
  }
  o = vec4(best, 1.0);
}`;

/** Brightest of a slot's blocks, written to that slot's pixel of the row. */
const ROW_FRAG = `#version 300 es
precision highp float;
uniform sampler2D tIn;
out vec4 o;
void main() {
  int n = textureSize(tIn, 0).x;
  int k = int(gl_FragCoord.x);
  vec3 best = vec3(0.0);
  float bl = -1.0;
  for (int x = 0; x < n; x++) {
    vec3 c = texelFetch(tIn, ivec2(x, k), 0).rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    if (l > bl) { bl = l; best = c; }
  }
  o = vec4(best, 1.0);
}`;

const BLOCK = 8;
/** The atlas is kept under this many rows. */
const ATLAS_MAX_H = 2048;

function program(gl: WebGL2RenderingContext, frag: string): WebGLProgram {
  const make = (type: number, src: string) => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'compile');
    return sh;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, make(gl.VERTEX_SHADER, REDUCE_VERT));
  gl.attachShader(p, make(gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
  return p;
}

function target(gl: WebGL2RenderingContext, w: number, h: number) {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return { tex, fbo, w, h };
}

export interface BandSweep {
  /**
   * The brightest pixel of the band for every sky in `count`, as RGB bytes,
   * three per sky. `draw(i)` must draw sky `i` full-frame into whatever
   * framebuffer and viewport it finds bound — the sweep binds the atlas and
   * shifts the viewport so the band lands in its slot.
   */
  run(count: number, draw: (i: number) => void): Uint8Array;
  dispose(): void;
}

/**
 * A sweeper for one band of one backing store: rows `glY0 … glY0 + bandH` of
 * a `width × height` frame, measured from the BOTTOM as GL does.
 */
export function createBandSweep(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  glY0: number,
  bandH: number,
): BandSweep {
  const K = Math.max(1, Math.floor(ATLAS_MAX_H / bandH));
  const cols = Math.ceil(width / BLOCK);
  const atlas = target(gl, width, K * bandH);
  const blocks = target(gl, cols, K);
  let rows: ReturnType<typeof target> | null = null;
  const pCols = program(gl, COLUMNS_FRAG);
  const pRow = program(gl, ROW_FRAG);
  const uCols = {
    tIn: gl.getUniformLocation(pCols, 'tIn'),
    block: gl.getUniformLocation(pCols, 'uBlock'),
    bandH: gl.getUniformLocation(pCols, 'uBandH'),
  };
  const uRow = gl.getUniformLocation(pRow, 'tIn');

  return {
    run(count, draw) {
      const batches = Math.ceil(count / K);
      if (!rows || rows.h !== batches) {
        if (rows) {
          gl.deleteFramebuffer(rows.fbo);
          gl.deleteTexture(rows.tex);
        }
        rows = target(gl, K, batches);
      }
      for (let base = 0; base < count; base += K) {
        const n = Math.min(K, count - base);
        // 1. the atlas: each sky's band in its own slot
        gl.bindFramebuffer(gl.FRAMEBUFFER, atlas.fbo);
        gl.enable(gl.SCISSOR_TEST);
        for (let k = 0; k < n; k++) {
          gl.viewport(0, k * bandH - glY0, width, height);
          gl.scissor(0, k * bandH, width, bandH);
          draw(base + k);
        }
        gl.disable(gl.SCISSOR_TEST);
        // 2. blocks
        gl.bindFramebuffer(gl.FRAMEBUFFER, blocks.fbo);
        gl.viewport(0, 0, cols, K);
        gl.useProgram(pCols);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, atlas.tex);
        gl.uniform1i(uCols.tIn, 0);
        gl.uniform1i(uCols.block, BLOCK);
        gl.uniform1i(uCols.bandH, bandH);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        // 3. one pixel per sky, one row per batch
        gl.bindFramebuffer(gl.FRAMEBUFFER, rows.fbo);
        gl.viewport(0, base / K, K, 1);
        gl.useProgram(pRow);
        gl.bindTexture(gl.TEXTURE_2D, blocks.tex);
        gl.uniform1i(uRow, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      const px = new Uint8Array(K * batches * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, rows.fbo);
      gl.readPixels(0, 0, K, batches, gl.RGBA, gl.UNSIGNED_BYTE, px);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const out = new Uint8Array(count * 3);
      for (let i = 0; i < count; i++) {
        out[i * 3] = px[i * 4];
        out[i * 3 + 1] = px[i * 4 + 1];
        out[i * 3 + 2] = px[i * 4 + 2];
      }
      return out;
    },
    dispose() {
      for (const t of [atlas, blocks, rows]) {
        if (!t) continue;
        gl.deleteFramebuffer(t.fbo);
        gl.deleteTexture(t.tex);
      }
      gl.deleteProgram(pCols);
      gl.deleteProgram(pRow);
    },
  };
}

/** Mean of each row of each slot: one texel per atlas row. */
const ROW_MEAN_FRAG = `#version 300 es
precision highp float;
uniform sampler2D tIn;
out vec4 o;
void main() {
  int w = textureSize(tIn, 0).x;
  int y = int(gl_FragCoord.y);
  vec3 sum = vec3(0.0);
  for (int x = 0; x < w; x++) sum += texelFetch(tIn, ivec2(x, y), 0).rgb;
  o = vec4(sum / float(w), 1.0);
}`;

/** Mean of a slot's rows, written to that slot's pixel of the batch's row. */
const SLOT_MEAN_FRAG = `#version 300 es
precision highp float;
uniform sampler2D tIn;
uniform int uBandH;
out vec4 o;
void main() {
  int k = int(gl_FragCoord.x);
  vec3 sum = vec3(0.0);
  for (int y = 0; y < uBandH; y++) sum += texelFetch(tIn, ivec2(0, k * uBandH + y), 0).rgb;
  o = vec4(sum / float(uBandH), 1.0);
}`;

/**
 * DEV: the MEAN colour of one rect of the sky, for thousands of skies at once —
 * what the chrome's paper takes its colour from (src/chrome/chromeColor.ts),
 * as {@link createBandSweep} is what the letterhead is measured against. The
 * same three steps, with a mean where that has a max: the rect of each sky is
 * drawn into its slot of an atlas only as wide as the rect, each atlas row is
 * averaged, then each slot's rows. The rect is `x0 … x0 + w` × `glY0 … glY0 +
 * h` of a `width × height` frame, measured from the BOTTOM as GL does.
 */
export function createRectMeans(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  x0: number,
  w: number,
  glY0: number,
  h: number,
): BandSweep {
  const K = Math.max(1, Math.floor(ATLAS_MAX_H / h));
  const atlas = target(gl, w, K * h);
  const rowMeans = target(gl, 1, K * h);
  let rows: ReturnType<typeof target> | null = null;
  const pRow = program(gl, ROW_MEAN_FRAG);
  const pSlot = program(gl, SLOT_MEAN_FRAG);
  const uRow = gl.getUniformLocation(pRow, 'tIn');
  const uSlot = { tIn: gl.getUniformLocation(pSlot, 'tIn'), bandH: gl.getUniformLocation(pSlot, 'uBandH') };

  return {
    run(count, draw) {
      const batches = Math.ceil(count / K);
      if (!rows || rows.h !== batches) {
        if (rows) {
          gl.deleteFramebuffer(rows.fbo);
          gl.deleteTexture(rows.tex);
        }
        rows = target(gl, K, batches);
      }
      for (let base = 0; base < count; base += K) {
        const n = Math.min(K, count - base);
        gl.bindFramebuffer(gl.FRAMEBUFFER, atlas.fbo);
        gl.enable(gl.SCISSOR_TEST);
        for (let k = 0; k < n; k++) {
          gl.viewport(-x0, k * h - glY0, width, height);
          gl.scissor(0, k * h, w, h);
          draw(base + k);
        }
        gl.disable(gl.SCISSOR_TEST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, rowMeans.fbo);
        gl.viewport(0, 0, 1, K * h);
        gl.useProgram(pRow);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, atlas.tex);
        gl.uniform1i(uRow, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindFramebuffer(gl.FRAMEBUFFER, rows.fbo);
        gl.viewport(0, base / K, K, 1);
        gl.useProgram(pSlot);
        gl.bindTexture(gl.TEXTURE_2D, rowMeans.tex);
        gl.uniform1i(uSlot.tIn, 0);
        gl.uniform1i(uSlot.bandH, h);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      const px = new Uint8Array(K * batches * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, rows.fbo);
      gl.readPixels(0, 0, K, batches, gl.RGBA, gl.UNSIGNED_BYTE, px);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const out = new Uint8Array(count * 3);
      for (let i = 0; i < count; i++) {
        out[i * 3] = px[i * 4];
        out[i * 3 + 1] = px[i * 4 + 1];
        out[i * 3 + 2] = px[i * 4 + 2];
      }
      return out;
    },
    dispose() {
      for (const t of [atlas, rowMeans, rows]) {
        if (!t) continue;
        gl.deleteFramebuffer(t.fbo);
        gl.deleteTexture(t.tex);
      }
      gl.deleteProgram(pRow);
      gl.deleteProgram(pSlot);
    },
  };
}
