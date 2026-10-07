/**
 * THE DRAW PRINT — has a Rive surface's picture changed since its last draw?
 *
 * The paper uploads card 04's canvas whenever the artboard reports a change,
 * and the artboard reports one on nearly every frame: the file keeps animating
 * geometry nobody sees — parked far off the artboard, or at zero alpha. The
 * picture itself changes about one frame in five (the face steps at ~12 fps):
 * 972 of 1,196 uploads of the side card were byte-identical to the one before
 * (Chrome, 20 s, docs/perf/thirty-fps.md). In WebKit each upload is ~8 ms.
 *
 * So, while a surface paints, its context's VISIBLE draws are folded into one
 * number: for each fill, stroke and clip, the transform, the paint (style,
 * alpha, composite, line width, cap, join, miter) and the path's geometry —
 * skipping draws whose path, transformed and padded by the stroke (miter
 * spikes included), misses the canvas, or that paint nothing (alpha 0). Equal
 * prints, equal pictures: checked against exact pixel diffs over ~7,200
 * uploads of the hero, the side card and card 01's neighbour, with 0 equal
 * prints over changed pixels.
 *
 * Conservative wherever it cannot see: a path it did not build (a Path2D made
 * from another, or from SVG), a gradient or pattern, an image, text — each
 * makes the print new, so the picture counts as changed.
 */

const FNV = 0x811c9dc5;
const foldN = (h: number, n: number): number => (Math.imul(h, 16777619) ^ Math.round(n * 256)) | 0;
const foldS = (h: number, s: string): number => {
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 16777619) ^ s.charCodeAt(i)) | 0;
  return h;
};

type Tracked = Path2D & { __fp?: number; __bb?: [number, number, number, number] };

/** How many coordinates of each op are points (x, y pairs) for the bounds. */
const POINT_ARGS: Record<string, number> = { moveTo: 2, lineTo: 2, bezierCurveTo: 6, quadraticCurveTo: 4 };

let installed = false;
let nonce = 0;

/** Track every Path2D's geometry (a fold of its ops) and bounds. Once. */
function installPaths(): void {
  if (installed || typeof Path2D === 'undefined') return;
  installed = true;
  const P = Path2D.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  for (const m of ['moveTo', 'lineTo', 'bezierCurveTo', 'quadraticCurveTo', 'closePath', 'rect', 'arc', 'arcTo', 'ellipse', 'roundRect', 'addPath']) {
    const o = P[m];
    if (typeof o !== 'function') continue;
    P[m] = function (this: Tracked, ...a: unknown[]) {
      let h = foldS(this.__fp ?? FNV, m);
      for (const x of a) h = typeof x === 'number' ? foldN(h, x) : x instanceof Path2D ? foldN(h, (x as Tracked).__fp ?? ++nonce) : foldN(h, ++nonce);
      this.__fp = h;
      const bb = (this.__bb ??= [Infinity, Infinity, -Infinity, -Infinity]);
      const n = POINT_ARGS[m];
      if (n !== undefined) {
        for (let i = 0; i + 1 < n; i += 2) {
          const x = a[i] as number;
          const y = a[i + 1] as number;
          if (x < bb[0]) bb[0] = x;
          if (y < bb[1]) bb[1] = y;
          if (x > bb[2]) bb[2] = x;
          if (y > bb[3]) bb[3] = y;
        }
      } else if (m !== 'closePath') {
        // Arcs, rects, an added path: not bounded here — never culled.
        bb[0] = bb[1] = -Infinity;
        bb[2] = bb[3] = Infinity;
      }
      return o.apply(this, a);
    };
  }
}

const alphaOf = (style: unknown): number => {
  if (typeof style !== 'string') return 1;
  const m = /rgba?\(([^)]*)\)/.exec(style);
  if (!m) return 1;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean);
  return parts.length > 3 ? Number(parts[3]) : 1;
};

/** One surface's print: attach to its 2D context once, then begin / end
 *  around each paint. */
export class DrawPrint {
  /** The fold so far, whether a paint is on, and the fills and strokes seen
   *  this paint, visible or not: 0 means the print saw nothing (a renderer
   *  that got past it), and the picture counts as new. */
  private readonly st = { h: FNV, on: false, seen: 0 };

  constructor(ctx: CanvasRenderingContext2D) {
    installPaths();
    const st = this.st;
    const c = ctx as unknown as Record<string, (...a: unknown[]) => unknown>;
    const wrap = (name: string, fold: (ctx: CanvasRenderingContext2D, a: unknown[]) => void) => {
      const o = c[name];
      if (typeof o !== 'function') return;
      c[name] = function (this: CanvasRenderingContext2D, ...a: unknown[]) {
        if (st.on) fold(this, a);
        return o.apply(this, a);
      };
    };
    const drawn = (kind: 'fill' | 'stroke' | 'clip') => (x: CanvasRenderingContext2D, a: unknown[]) => {
      const path = a.find((v) => v instanceof Path2D) as Tracked | undefined;
      if (kind !== 'clip') st.seen++;
      const t = x.getTransform();
      const style = kind === 'stroke' ? x.strokeStyle : x.fillStyle;
      if (kind !== 'clip') {
        if (!(x.globalAlpha > 0) || !(alphaOf(style) > 0)) return;
        if (path?.__bb && isFinite(path.__bb[0])) {
          const [x0, y0, x1, y1] = path.__bb;
          const pad =
            kind === 'stroke'
              ? x.lineWidth * Math.max(Math.hypot(t.a, t.b), Math.hypot(t.c, t.d)) * (x.lineJoin === 'miter' ? Math.max(1, x.miterLimit) : 1)
              : 0;
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const [px, py] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
            const sx = t.a * px + t.c * py + t.e;
            const sy = t.b * px + t.d * py + t.f;
            if (sx < minX) minX = sx;
            if (sy < minY) minY = sy;
            if (sx > maxX) maxX = sx;
            if (sy > maxY) maxY = sy;
          }
          const w = x.canvas.width;
          const hgt = x.canvas.height;
          if (maxX + pad < 0 || minX - pad > w || maxY + pad < 0 || minY - pad > hgt) return; // off the canvas
        }
      }
      let h = foldS(st.h, kind);
      for (const v of [t.a, t.b, t.c, t.d, t.e, t.f]) h = foldN(h, v);
      if (kind !== 'clip') {
        h = typeof style === 'string' ? foldS(h, style) : foldN(h, ++nonce);
        h = foldN(h, x.globalAlpha);
        h = foldS(h, x.globalCompositeOperation);
        if (kind === 'stroke') {
          h = foldN(h, x.lineWidth);
          h = foldS(h, x.lineCap + x.lineJoin);
          h = foldN(h, x.miterLimit);
        }
      }
      h = foldN(h, path ? (path.__fp ?? ++nonce) : -1);
      for (const v of a) if (typeof v === 'string') h = foldS(h, v);
      st.h = h;
    };
    wrap('fill', drawn('fill'));
    wrap('stroke', drawn('stroke'));
    wrap('clip', drawn('clip'));
    const rect = (name: string) => (x: CanvasRenderingContext2D, a: unknown[]) => {
      let h = foldS(st.h, name);
      for (const v of a) h = typeof v === 'number' ? foldN(h, v) : foldN(h, ++nonce);
      const t = x.getTransform();
      for (const v of [t.a, t.b, t.c, t.d, t.e, t.f]) h = foldN(h, v);
      if (name !== 'clearRect') {
        const style = name === 'strokeRect' ? x.strokeStyle : x.fillStyle;
        h = typeof style === 'string' ? foldS(h, style) : foldN(h, ++nonce);
        h = foldN(h, x.globalAlpha);
        h = foldS(h, x.globalCompositeOperation);
      }
      st.h = h;
    };
    for (const name of ['fillRect', 'strokeRect', 'clearRect']) wrap(name, rect(name));
    // Anything else that paints is beyond the print: always new.
    for (const name of ['drawImage', 'putImageData', 'fillText', 'strokeText']) {
      wrap(name, () => {
        st.h = foldN(st.h, ++nonce);
      });
    }
  }

  begin(): void {
    this.st.h = FNV;
    this.st.seen = 0;
    this.st.on = true;
  }

  /** The paint's print, or null when it saw no fill or stroke at all. */
  end(): number | null {
    this.st.on = false;
    return this.st.seen > 0 ? this.st.h : null;
  }
}
