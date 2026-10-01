import type { WebGLRenderTarget, WebGLRenderer } from 'three';
import type { CoverDrawer, DrawInput } from './coverRenderer';
import { coverValues } from './coverDials';
import { DomeSpring, advanceDome } from './dome';
import type { CoverDef, Dome } from './types';

export interface DrawCost {
  /** Shading: the draw minus the floor — the prototype's number, and the budget's. */
  ms: number;
  /** The floor on its own: two do-nothing passes into the same targets. */
  floor: number;
  /** ms + floor: everything one draw puts on the GPU. */
  total: number;
}

/**
 * DEV / verify:cover — what one draw of a cover costs on the GPU, exactly as
 * the tuning bench measured it when the budgets were set (and as the sky
 * measures itself, docs/sky.md "Frame time"): batches of draws closed by a
 * one-pixel readPixels the driver cannot answer early, and the same batches of
 * the FLOOR — two passes into the same targets that draw nothing — subtracted.
 * Each draw is its own render passes (pass A's target, then the output), so a
 * tile-based GPU shades every one. Median of the batches, ms per draw.
 */
export function benchCoverDraw(
  gl: WebGLRenderer,
  cover: CoverDrawer,
  target: WebGLRenderTarget | null,
  input: DrawInput,
  batches = 12,
  batch = 20,
): DrawCost {
  const ctx = gl.getContext();
  const px = new Uint8Array(4);
  const sync = () => {
    if (target) gl.readRenderTargetPixels(target, 0, 0, 1, 1, px);
    else ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, px);
  };
  cover.draw(target, input);
  sync();
  const t = input.t;
  const run = (floor: boolean) => {
    const out: number[] = [];
    for (let r = 0; r < batches; r++) {
      const t0 = performance.now();
      for (let i = 0; i < batch; i++) {
        if (floor) cover.drawFloor(target, input);
        else cover.draw(target, { ...input, t: t + (r * batch + i) / 60 });
      }
      sync();
      out.push((performance.now() - t0) / batch);
    }
    out.sort((a, b) => a - b);
    return out[out.length >> 1];
  };
  // Interleaved rounds, so a drifting clock drifts both the same way.
  const fl: number[] = [];
  const full: number[] = [];
  for (let k = 0; k < 3; k++) {
    fl.push(run(true));
    full.push(run(false));
  }
  const med = (a: number[]) => a.sort((x, y) => x - y)[1];
  const floor = med(fl);
  const total = med(full);
  return { ms: Math.max(0, total - floor), floor, total };
}

/** DEV: the per-instance copy — `n` drawImages of `src` into a 2D canvas, ms each. */
export function benchPresent(src: CanvasImageSource, w: number, h: number, n = 40): number {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const once = () => ctx.getImageData(0, 0, 1, 1);
  ctx.drawImage(src, 0, 0, w, h);
  once();
  const out: number[] = [];
  for (let r = 0; r < 9; r++) {
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(src, 0, 0, w, h);
    }
    once();
    const t1 = performance.now();
    once();
    const t2 = performance.now();
    out.push((t1 - t0 - (t2 - t1)) / n);
  }
  out.sort((a, b) => a - b);
  return Math.max(0, out[4]);
}

/**
 * DEV: the dome a benchmark draws under — at rest, or WARM: the pointer near
 * the frame's centre, the dome up and the cover's per-instance state (card
 * 02's lava warmth) full on, as on a hovered tile or the hero under the
 * pointer. Two seconds of 60 Hz frames, stepped here, get it there.
 */
export function benchDome(def: CoverDef, warm: boolean): Dome {
  const x = def.frame.w / 2;
  const y = def.frame.h * 0.45;
  if (!warm) return { x, y, amp: 0 };
  const d = new DomeSpring();
  d.point(x, y);
  const v = coverValues(def.id);
  for (let i = 1; i <= 120; i++) advanceDome(d, 1000 + (i * 1000) / 60, def, v, 1 + i / 60);
  return d.state;
}
