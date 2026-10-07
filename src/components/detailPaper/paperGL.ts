import { qualityDprCap } from '../../quality';
import {
  CanvasTexture,
  ClampToEdgeWrapping,
  ColorManagement,
  LinearFilter,
  LinearSRGBColorSpace,
  Mesh,
  NoColorSpace,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  Texture,
  WebGLRenderer,
} from 'three';
import type { WebGLRenderTarget } from 'three';
import { makeCoverRenderer } from '../../covers/cachedCoverRenderer';
import type { CoverDrawer } from '../../covers/coverRenderer';
import { COVERS, shaderCover } from '../../covers/covers';
import { coverDialsVersion, coverValues } from '../../covers/coverDials';
import { CONTENT, itemHeroFace } from '../../content';
import { config } from '../../config';
import { computeHeroRect } from '../../layout/hero';
import { faceOf, loadCoverAnims } from '../../reader/coverAnims';
import { issueAnims } from '../../reader/issue-01';
import { createPaperMaterial, createShadowMaterial } from './paperMaterial';
import { coverCrop } from './paperMath';
import { span } from './span';
import type { FaceJob, FaceReply } from './faceWorker';

/**
 * THE PAPER'S GL, MADE ONCE — the renderer, its canvas, its programs, the
 * crease map, the live covers' renderers and every face texture, shared by
 * every mount of the detail view and never destroyed.
 *
 * Until 2026-09-28 DetailPaperLayer made all of this as it mounted, which is
 * on the tile click (the detail view mounts with the grid→detail morph) and
 * on a direct load, and destroyed it on close. The arrival paid for a WebGL
 * context, its drawing buffer, the shader programs, the crease map and every
 * face's upload, on every card, every time: 120–480 ms frames for ~1.5 s
 * (docs/detail-paper.md, "The arrival"). Now:
 *
 *   warm-up    after load, in idle callbacks, gated on a visible tab and
 *              nothing moving (src/warmup.ts) — or on demand, at once, on
 *              the first hover of a grid card (or the first mount, for a
 *              direct load or a keyboard open), if that comes first; one
 *              step a callback: the context and its drawing buffer; the programs,
 *              compiled without blocking (KHR_parallel_shader_compile) and
 *              then drawn once; the crease map; each shader cover's renderer.
 *   faces      every card's, wanted as the last warm-up step (and again by
 *              the mounted layer, which is a no-op when they are in):
 *              decoded off the main thread, UPLOADED one at a time, a few ms
 *              a frame (`pumpUploads`), and kept: an arrival at the same
 *              size uploads nothing. A click before they are in leaves the
 *              rest to the morph, which is 400+ ms of runway.
 *   the canvas moved into each mount's host and out again; its context lives
 *              as long as the page. One context, ever (`paperContexts`).
 */

/** Hard cap on the canvas's backing store — the portfolio sheet's rule. */
export const MAX_DPR = 2;
/** The paper's DPR cap now: MAX_DPR, or adaptive quality's tier-2 cap. */
export const paperMaxDpr = (): number => Math.min(MAX_DPR, qualityDprCap());

export interface PaperGL {
  canvas: HTMLCanvasElement;
  renderer: WebGLRenderer;
}

let gl: PaperGL | null = null;
let contexts = 0;
let creases: Texture | null = null;
let programsReady = false;
let warmStarted = false;
const readyListeners = new Set<() => void>();

/** WebGL contexts this module has ever made: 1 after the first warm-up, and
 *  it never goes up (verify:detail `arrival`). */
export const paperContexts = () => contexts;

/** The GL, once the warm-up has made it (null before). */
export const paperGL = (): PaperGL | null => gl;

/** Context, programs and crease map all ready: the layer may hand in. */
export const paperReady = () => !!gl && programsReady && !!creases;

export const paperCreases = () => creases;

/** Called whenever a warm-up step completes. */
export function onPaperProgress(fn: () => void): () => void {
  readyListeners.add(fn);
  return () => readyListeners.delete(fn);
}
const progress = () => {
  for (const fn of readyListeners) fn();
};

const idle = (fn: () => void) =>
  window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout: 150 }) : window.setTimeout(fn, 16);

export function flatTexture(source: TexImageSource | HTMLCanvasElement): Texture {
  const tex = source instanceof HTMLCanvasElement ? new CanvasTexture(source) : new Texture(source);
  tex.flipY = false; // read downward in the shader
  tex.colorSpace = NoColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

async function decode(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

/** An image's natural size, WITHOUT decoding it: an <img> that is not in the
 *  document fires `load` with its size known and its pixels still undecoded.
 *  (`decode()` here was nine full decodes of 2000×2600 files, for two numbers
 *  each, on the same workers the morph's own images decode on.) */
function naturalSize(url: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error(`no image: ${url}`));
    img.src = url;
  });
}

const nextIdle = () => new Promise<void>((r) => idle(() => r()));

/** The face at exactly `w × h` device pixels, cropped as `object-fit: cover`.
 *  `premultiply` for a live cover's still, which is not opaque: the plane
 *  samples it as it samples the live cover (premultiplied).
 *
 *  From the file's BLOB, not the decoded <img>: from an image element Chrome
 *  crops and resizes on the main thread, and the eight-odd faces the layer
 *  builds as the detail view mounts — during the grid→detail morph — were
 *  ~1 s of it (createImageBitmap, 981 ms in one real-Chrome profile), a run
 *  of 60–500 ms frames over the morph and the landing, on every card.
 *
 *  And from a WORKER (faceWorker.ts): from a blob the decode is off the main
 *  thread, but the crop and the resize run where the bitmap resolves — 18–50
 *  ms a face on the main thread, several in one frame (docs/perf/
 *  first-second.md). The same call, made in the worker, resolves there.
 *  Without a worker (or if it fails) it is made here, as before. */
async function resized(url: string, w: number, h: number, premultiply = false): Promise<ImageBitmap> {
  const n = await naturalSize(url);
  const c = coverCrop(n.w, n.h, w, h);
  const job = { url: new URL(url, location.href).href, sx: c.sx, sy: c.sy, sw: c.sw, sh: c.sh, w, h, premultiply };
  const fromWorker = await inWorker(job).catch(() => null);
  if (fromWorker) return fromWorker;
  const blob = await fetch(url).then((r) => r.blob());
  return createImageBitmap(blob, c.sx, c.sy, c.sw, c.sh, {
    resizeWidth: w,
    resizeHeight: h,
    resizeQuality: 'high',
    premultiplyAlpha: premultiply ? 'premultiply' : 'default',
  });
}

let worker: Worker | null | undefined;
let jobId = 0;
const jobs = new Map<number, { resolve: (b: ImageBitmap) => void; reject: (e: Error) => void }>();

/** The face made in the worker; rejects (and the caller makes it here) if
 *  there is no worker or it fails. */
function inWorker(job: Omit<FaceJob, 'id'>): Promise<ImageBitmap> {
  if (worker === undefined) {
    try {
      worker = new Worker(new URL('./faceWorker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<FaceReply>) => {
        const j = jobs.get(e.data.id);
        if (!j) return;
        jobs.delete(e.data.id);
        if ('bitmap' in e.data) j.resolve(e.data.bitmap);
        else j.reject(new Error(e.data.error));
      };
      // The worker itself failed (it could not load): every job, and every
      // later one, is made on the main thread.
      worker.onerror = () => {
        worker?.terminate();
        worker = null;
        for (const j of jobs.values()) j.reject(new Error('face worker failed'));
        jobs.clear();
      };
    } catch {
      worker = null;
    }
  }
  const w = worker;
  if (!w) return Promise.reject(new Error('no face worker'));
  return new Promise((resolve, reject) => {
    const id = ++jobId;
    jobs.set(id, { resolve, reject });
    w.postMessage({ ...job, id } satisfies FaceJob);
  });
}

// ── the canvas's size ───────────────────────────────────────────────────

let size = { dpr: 0, vw: 0, vh: 0 };

/** Size the drawing buffer to the viewport — a no-op when it already is.
 *  Every change reallocates the buffer (4× multisampled): ~10 ms of GPU work
 *  at 3456×1992 on an idle GPU, 50–280 ms behind a busy one. */
export function sizePaper(): boolean {
  if (!gl) return false;
  const dpr = Math.min(window.devicePixelRatio || 1, paperMaxDpr());
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (dpr === size.dpr && vw === size.vw && vh === size.vh) return false;
  size = { dpr, vw, vh };
  const r = gl.renderer;
  span('size', () => {
    r.setPixelRatio(dpr);
    r.setSize(vw, vh, false);
  });
  return true;
}

// ── the warm-up ─────────────────────────────────────────────────────────

// A card and its shadow, never drawn visibly and never disposed: they hold
// the two programs, so no card's material ever compiles or links again (three
// frees a program when its last material goes).
const warmScene = new Scene();
const warmCamera = new OrthographicCamera(0, 1, 0, -1, -10, 10);

let warmActive = 0;

/**
 * Who paces the warm-up. `null`: today's pace — each step in an idle callback
 * with a 150 ms timeout, under the morph as well as before it (the first
 * hover, a press, a mount). A gate: the page's idle warm-up (src/warmup.ts),
 * which runs a step only when it says so — `gate(go)` calls `go` when the tab
 * is visible and nothing is moving, and returns a cancel.
 */
export type WarmGate = (go: () => void) => () => void;
let gate: WarmGate | null = null;
/** The step waiting on the gate, so a hover can run it at once. */
let gated: { go: () => void; cancel: () => void } | null = null;
let warmSteps = 0;
let warmStepsDone = 0;
let warmFaceKeys: string[] | null = null;

/** Every warm-up step has run and every face it asked for is uploaded (or
 *  given up on): the page's idle warm-up can say it is done. */
export function paperWarmComplete(): boolean {
  return warmStarted && warmStepsDone === warmSteps && !!warmFaceKeys && warmFaceKeys.every(faceSettled);
}

/**
 * Start the warm-up (idempotent). Each step is its own idle callback, so none
 * of it is a long task, and it runs under the morph as well as before it.
 * `active`: the card most likely to open, whose faces come first.
 *
 * Called with a `gate` by the idle warm-up after load; called without one
 * (the first hover, a press, a mount) it is on demand, exactly as before: a
 * warm-up the idle chain already started goes on from the step it is at, at
 * today's pace, its waiting step run now — nothing done twice, nothing
 * waiting on the chain.
 */
export function warmPaper(active = 0, opts: { gate?: WarmGate } = {}) {
  if (warmStarted) {
    if (!opts.gate && gate) {
      gate = null;
      const g = gated;
      gated = null;
      if (g) {
        g.cancel();
        g.go();
      }
    }
    return;
  }
  gate = opts.gate ?? null;
  warmActive = active;
  warmStarted = true;
  const steps: (() => void | Promise<void>)[] = [
    () => {
      const canvas = document.createElement('canvas');
      canvas.className = 'detail__paper';
      canvas.setAttribute('aria-hidden', 'true');
      // 1×1 until sized: the default 300×150, then 600×300 at 2×, then the
      // viewport was three drawing buffers where one is needed.
      canvas.width = canvas.height = 1;
      const renderer = span('context', () => new WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: true }));
      contexts++;
      // No colour management, as on the portfolio sheet: the faces' sRGB bytes
      // go in and come out untouched, which is what makes the plane match the
      // <img>.
      renderer.outputColorSpace = LinearSRGBColorSpace;
      ColorManagement.enabled = false;
      renderer.setClearColor(0x000000, 0);
      gl = { canvas, renderer };
    },
    () => void sizePaper(),
    async () => {
      const geo = new PlaneGeometry(1, 1, 1, 1);
      const paper = createPaperMaterial(null);
      paper.uniforms.uAlpha.value = 0;
      const shadow = createShadowMaterial();
      shadow.uniforms.uAlpha.value = 0;
      const a = new Mesh(geo, shadow);
      const b = new Mesh(geo, paper);
      a.frustumCulled = b.frustumCulled = false;
      warmScene.add(a, b);
      await gl!.renderer.compileAsync(warmScene, warmCamera);
    },
    () => {
      // One draw, invisible (alpha 0, the canvas hidden and detached): the
      // first draw of a program is where the driver builds its pipeline.
      span('warm draw', () => gl!.renderer.render(warmScene, warmCamera));
      programsReady = true;
    },
    async () => {
      const img = await decode('/textures/paper-creases.webp');
      await new Promise<void>((r) => idle(() => r()));
      const tex = flatTexture(img);
      span('upload creases', () => gl!.renderer.initTexture(tex));
      creases = tex;
    },
    // Every face, for the viewport as it is: the ones any arrival needs (the
    // strip shows every card). Decoded and uploaded while the pointer is
    // still on the grid, so a first arrival uploads nothing, like a second.
    () => {
      warmFaceKeys = wantFaces(warmActive);
    },
    ...Object.keys(COVERS)
      .filter((id) => shaderCover(id))
      .map((id) => async () => {
        const c = liveCover(id);
        if (c) await c.r.warmAsync();
      }),
  ];
  warmSteps = steps.length;
  const run = (i: number) => {
    if (i >= steps.length) return;
    const step = () => {
      let ran = false;
      const go = () => {
        if (ran) return;
        ran = true;
        gated = null;
        Promise.resolve(steps[i]())
          .catch((e) => console.warn('[paper] warm-up step failed', e))
          .then(() => {
            warmStepsDone++;
            progress();
            run(i + 1);
          });
      };
      if (!gate) return go();
      const cancel = gate(go);
      if (!ran) gated = { go, cancel };
    };
    // Gated: the gate waits for its own idle moment; on demand: today's.
    if (gate) step();
    else idle(step);
  };
  run(0);
}

/**
 * Warm up ON DEMAND on the first hover of a grid card — the earliest sign
 * that the detail view is coming — or the first press, if the page's idle
 * warm-up (src/warmup.ts) has not already done it: since 2026-10-01 that runs
 * after load, gated, so a first hover normally finds the context made. A
 * hover before then takes the warm-up over at today's pace. A keyboard open
 * (Enter) warms up as the view mounts, and the morph is its runway.
 */
export function armPaperWarmup(): () => void {
  const EVENTS = ['pointerover', 'pointerdown'] as const;
  const on = (e: Event) => {
    const t = e.target as Element | null;
    if (e.type === 'pointerover' && !t?.closest?.('.grid-card')) return;
    off();
    warmPaper();
  };
  const off = () => {
    for (const ev of EVENTS) document.removeEventListener(ev, on, true);
  };
  for (const ev of EVENTS) document.addEventListener(ev, on, true);
  return off;
}

// ── the live covers' renderers ───────────────────────────────────────────

export interface LiveCover {
  r: CoverDrawer;
  rt: WebGLRenderTarget | null;
  bound: number;
}
const liveCovers = new Map<string, LiveCover>();

/** A shader cover's renderer in the paper's context: made once (at the
 *  warm-up), kept. Null before the context exists or for any other kind. */
export function liveCover(id: string): LiveCover | null {
  if (!gl) return null;
  let c = liveCovers.get(id);
  if (!c) {
    const def = shaderCover(id);
    if (!def) return null;
    const r = span(`cover ${id}`, () => makeCoverRenderer(gl!.renderer, def, coverValues(id)));
    c = { r, rt: null, bound: coverDialsVersion() };
    liveCovers.set(id, c);
  }
  return c;
}
export const liveCoverEntries = () => liveCovers.entries();

// ── faces ───────────────────────────────────────────────────────────────

interface Face {
  state: 'loading' | 'decoded' | 'ready' | 'failed';
  tex: Texture | null;
  source: TexImageSource | HTMLCanvasElement | null;
  prio: number;
}
const faces = new Map<string, Face>();
/** The set the last `wantFaces` asked for: once it has all arrived, every
 *  other face is dropped (a new size makes the old set useless). */
let wantedSet: Set<string> | null = null;

export const texKey = (src: string, w: number, h: number) => `${src}@${w}x${h}`;
export const faceKey = (idx: number, w: number, h: number) => {
  const item = CONTENT[idx];
  return texKey(itemHeroFace(item) ?? `hue:${item.hue}`, w, h);
};
export const plateKey = (idx: number, w: number, h: number) => texKey(`plate:${idx}`, w, h);

export interface FaceDims {
  heroW: number;
  heroH: number;
  sideW: number;
  sideH: number;
}

/** The faces' device sizes for the viewport as it is now — the numbers the
 *  mounted layer computes from its props (hero.ts, the side scale dial). */
export function faceDims(): FaceDims {
  const dpr = Math.min(window.devicePixelRatio || 1, paperMaxDpr());
  const h = computeHeroRect(window.innerWidth, window.innerHeight);
  const s = config.detailSideScale;
  return {
    heroW: Math.round(h.w * dpr),
    heroH: Math.round(h.h * dpr),
    sideW: Math.round(h.w * s * dpr),
    sideH: Math.round(h.h * s * dpr),
  };
}

const hueFill = (hue: number): string => `hsl(${hue}, 28%, 32%)`;

function makeFace(idx: number, w: number, h: number): () => Promise<TexImageSource | HTMLCanvasElement> {
  return async () => {
    const item = CONTENT[idx];
    const url = itemHeroFace(item);
    if (!url) {
      const c = document.createElement('canvas');
      c.width = 2;
      c.height = 2;
      const g = c.getContext('2d')!;
      g.fillStyle = hueFill(item.hue);
      g.fillRect(0, 0, 2, 2);
      return c;
    }
    // Handed to the browser in an idle moment: the decode and resize run off
    // the main thread, but starting nine of them in one task is not free.
    await nextIdle();
    return resized(url, w, h, !!item.cover);
  };
}

/**
 * Ask for every face a size needs: every card at the hero's size and at the
 * neighbours', and each issue's plate at the hero's. The `active` card's
 * first, then its neighbours', so the likeliest to be needed land first.
 * Returns the keys, for {@link faceSettled}.
 */
export function wantFaces(active: number, d: FaceDims = faceDims()): string[] {
  const n = CONTENT.length;
  const keys: string[] = [];
  const want = (k: string, make: () => Promise<TexImageSource | HTMLCanvasElement>, prio: number) => {
    keys.push(k);
    requestFace(k, make, prio);
  };
  for (let idx = 0; idx < n; idx++) {
    const near = idx === active ? 0 : idx === (active + 1) % n || idx === (active + n - 1) % n ? 1 : 2;
    want(faceKey(idx, d.heroW, d.heroH), makeFace(idx, d.heroW, d.heroH), near === 0 ? 0 : 4 + near);
    want(faceKey(idx, d.sideW, d.sideH), makeFace(idx, d.sideW, d.sideH), near === 1 ? 2 : 5 + near);
    const anims = CONTENT[idx].issue ? issueAnims(CONTENT[idx].issue!) : undefined;
    if (anims) {
      want(
        plateKey(idx, d.heroW, d.heroH),
        async () => {
          const m = await loadCoverAnims(anims);
          const plate = faceOf(m, 'cover')?.plate;
          if (!plate) throw new Error('no plate');
          await nextIdle();
          return resized(plate, d.heroW, d.heroH);
        },
        near === 0 ? 1 : 5 + near,
      );
    }
  }
  wantedSet = new Set(keys);
  return keys;
}

/**
 * Ask for a face texture by key; `make` decodes it (off the main thread). It
 * is uploaded by {@link pumpUploads}, lowest `prio` first, and kept until
 * {@link retainFaces} drops it.
 */
export function requestFace(key: string, make: () => Promise<TexImageSource | HTMLCanvasElement>, prio: number) {
  const f = faces.get(key);
  if (f) {
    f.prio = Math.min(f.prio, prio);
    return;
  }
  const face: Face = { state: 'loading', tex: null, source: null, prio };
  faces.set(key, face);
  make().then(
    (src) => {
      if (faces.get(key) !== face) return;
      face.source = src;
      face.state = 'decoded';
      pump();
    },
    () => {
      if (faces.get(key) === face) face.state = 'failed';
    },
  );
}

/** The uploaded texture for `key`, or null. */
export const faceTexture = (key: string): Texture | null => faces.get(key)?.tex ?? null;

/** Uploaded, or given up on (a missing file): nothing more will come. */
export function faceSettled(key: string): boolean {
  const s = faces.get(key)?.state;
  return s === 'ready' || s === 'failed';
}

/** Anything decoded and waiting for its upload. */
function uploadsPending(): boolean {
  for (const f of faces.values()) if (f.state === 'decoded') return true;
  return false;
}

// Uploads run in their own rAF callback, grid or detail view, while any
// decoded face is waiting.
let pumping = false;
function pump() {
  if (pumping) return;
  pumping = true;
  const tick = () => {
    pumpUploads();
    settle();
    if (uploadsPending()) requestAnimationFrame(tick);
    else pumping = false;
  };
  requestAnimationFrame(tick);
}

/** Once the wanted set is all in, drop everything else. */
function settle() {
  if (!wantedSet) return;
  for (const k of wantedSet) if (!faceSettled(k)) return;
  retainFaces(wantedSet);
  wantedSet = null;
}

/**
 * Upload decoded faces, one at a time, until `budgetMs` of this frame is
 * spent (at least one). A face at the hero's device size is ~8 MB, 1.5–5 ms
 * of main thread in texImage2D; nine of them in one task were a 20–25 ms
 * frame on their own.
 */
function pumpUploads(budgetMs = 4): number {
  if (!gl) return 0;
  const t0 = performance.now();
  let n = 0;
  for (;;) {
    let next: [string, Face] | null = null;
    for (const e of faces) if (e[1].state === 'decoded' && (!next || e[1].prio < next[1].prio)) next = e;
    if (!next) break;
    const [key, f] = next;
    const tex = flatTexture(f.source!);
    span(`upload ${key.split('/').pop()}`, () => gl!.renderer.initTexture(tex));
    f.tex = tex;
    f.state = 'ready';
    n++;
    if (performance.now() - t0 >= budgetMs) break;
  }
  return n;
}

/** Drop every face not in `keys`. */
function retainFaces(keys: Set<string>) {
  for (const [k, f] of faces) {
    if (keys.has(k)) continue;
    f.tex?.dispose();
    faces.delete(k);
  }
}

/** DEV: what is resident. */
export const faceKeys = () => [...faces].map(([k, f]) => `${k} ${f.state}`);
