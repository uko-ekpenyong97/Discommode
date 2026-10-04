/**
 * The inside pages' animations, on the open spread (docs/reader.md,
 * "Inside-page animations"). Plain TS, no React, like the flip engine.
 *
 * Each animated page's static slot carries, over its baked `<img>`, a wrapper
 * FlipBook renders: the page's PLATE (the drawing hidden) and ONE 2D canvas
 * that draws every sprite on that page from its atlas. The wrapper is hidden
 * whenever a turn layer is up — `setTurning(true)` comes synchronously from the
 * engine's `onTurnActive`, which fires before the strips first move, so the
 * static slot shows the baked page in the very frames the curl's face (the
 * same baked page) is rasterising. The strips never see a plate.
 *
 * When the book settles (the turn layer has come down, after the landing
 * plate's crossfade and the handoff), each animated page fades its wrapper in
 * over SETTLE_FADE_MS, holding every sprite on its REST frame for the length of
 * the fade, and only then starts the loops. So the fade dissolves the plate and
 * the rest frame in over the baked art they were registered against, rather
 * than a sprite mid-motion over the printed object. Each page has its own time
 * ORIGIN on top of the shared cover clock (`coverTime`, which already stops in
 * a hidden tab and is 0 under reduced motion, so reduced motion is the rest
 * frame for good); the shared clock itself is untouched.
 *
 * Frames step on the boil's clock (`stepsIn`, coverLife.ts), each held its
 * manifest `holds` (Procreate's frame holds, from the folder's APNG). There is
 * no boil wobble on inside pages: only the stepping.
 *
 * Atlases are fetched for the open spread and the spreads either side; each
 * spread's are decoded off the main thread (`createImageBitmap` from the blob)
 * at its own settle (see keepWindow); anything further is dropped. Neighbours'
 * plates are fetched, not decoded.
 */
import { coverStill, coverTime } from '../covers/coverClock';
import { cellRect, frameAt, pagesNear, restOf } from './pageAnimGeometry';
import type { PageAnimManifest } from './pageAnimGeometry';
import type { Page, Spread } from './issue-01';
import { PAGE_ANIMS, PAGE_W, animsOnPage } from './pageAnims';
import type { PageAnim } from './pageAnims';

export type { AtlasEntry, PageAnimManifest } from './pageAnimGeometry';

/** The wrapper's fade-in on a settle, and how long the rest frame is held. */
export const SETTLE_FADE_MS = 80;
/** Backing-store DPR cap for the sprite canvases. */
const MAX_DPR = 2;

// ── the align tool's rows (dev) ─────────────────────────────────────────

const overrides = new Map<string, PageAnim>();
const rowListeners = new Set<() => void>();

/** The row a sprite is drawn with: the align tool's, else pageAnims.ts's. */
export function rowOf(id: string): PageAnim | undefined {
  return overrides.get(id) ?? PAGE_ANIMS.find((r) => r.id === id);
}

/** DEV: draw `id` with `row` instead of the file's (null: back to the file). */
export function setRowOverride(id: string, row: PageAnim | null): void {
  if (row) overrides.set(id, row);
  else overrides.delete(id);
  for (const fn of rowListeners) fn();
}

export interface AlignState {
  id: string;
  /** `difference`: the rest frame over the BAKED page, difference-blended
   *  (misregistration shows as bright edges). `plate`: over the plate, as it
   *  ships. Either way the loop is held on the rest frame. */
  view: 'difference' | 'plate';
}

let align: AlignState | null = null;

/** DEV: the align tool's pick, or null. */
export function setAlign(next: AlignState | null): void {
  align = next;
  for (const fn of rowListeners) fn();
}

export const alignState = (): AlignState | null => align;

// ── the look (PAGE ANIM, the READER NAV dock) ───────────────────────────

/**
 * How a page's sprites sit on it. Off (the default, what ships): the canvas
 * draws them over the plate, as the layer on top of the paper they are. In
 * paper: the canvas is multiplied into the plate (`mix-blend-mode`,
 * flipbook.css), so the paper's tone shows through the ink as it does through
 * the print, and the ink takes the paper's TOOTH — a fine speckle fixed to the
 * page, not to the drawing, stamped into it with `source-atop` (the sprites'
 * own alpha, edges included, is untouched). `tooth` is how strong (0–1); the
 * default is badges' print, the one page that carries it (about 3% of its
 * light ink speckled dark, docs/reader.md "In paper"). Which frame shows when
 * — the holds — is not touched: only how a frame is drawn.
 */
export interface PageAnimLook {
  inPaper: boolean;
  tooth: number;
}
export const PAGE_ANIM_LOOK: PageAnimLook = { inPaper: false, tooth: 0.35 };

/** DEV: the PAGE ANIM dials. Every shown page redraws with the new look. */
export function setPageAnimLook(next: Partial<PageAnimLook>): void {
  Object.assign(PAGE_ANIM_LOOK, next);
  for (const fn of rowListeners) fn();
}

/** The tooth: TOOTH_TILE² cells of TOOTH_CELL page px, each dark with
 *  probability TOOTH_DENSITY. Made once, drawn as a pattern in page space. */
const TOOTH_TILE = 512;
const TOOTH_CELL = 2;
const TOOTH_DENSITY = 0.033;
let toothTile: HTMLCanvasElement | null = null;
function toothPattern(ctx: CanvasRenderingContext2D, k: number): CanvasPattern | null {
  if (!toothTile) {
    toothTile = document.createElement('canvas');
    toothTile.width = toothTile.height = TOOTH_TILE;
    const t = toothTile.getContext('2d')!;
    const img = t.createImageData(TOOTH_TILE, TOOTH_TILE);
    // A fixed hash: the same speckle on every load, every page.
    let h = 0x9e3779b9;
    for (let i = 0; i < TOOTH_TILE * TOOTH_TILE; i++) {
      h ^= h << 13;
      h ^= h >>> 17;
      h ^= h << 5;
      const u = (h >>> 0) / 4294967296;
      if (u < TOOTH_DENSITY) img.data[i * 4 + 3] = Math.round(255 * (0.55 + 0.45 * (u / TOOTH_DENSITY)));
    }
    t.putImageData(img, 0, 0);
  }
  const p = ctx.createPattern(toothTile, 'repeat');
  p?.setTransform(new DOMMatrix().scale(k * TOOTH_CELL));
  return p;
}

// ── manifest ───────────────────────────────────────────────────────────

const manifests = new Map<string, Promise<PageAnimManifest | null>>();

/** The atlas manifest, fetched once per URL. */
export function loadPageAnimManifest(url: string): Promise<PageAnimManifest | null> {
  let p = manifests.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? (r.json() as Promise<PageAnimManifest>) : null))
      .catch(() => null);
    manifests.set(url, p);
  }
  return p;
}

// ── the player ─────────────────────────────────────────────────────────

interface Slot {
  page: Page;
  wrap: HTMLDivElement;
  plate: HTMLImageElement;
  canvas: HTMLCanvasElement;
  ids: string[];
  shown: boolean;
  /** coverTime() at which this page's loops start (s). */
  origin: number;
  /** The frame each sprite was last drawn on (-1: never). */
  last: number[];
  /** The frames of this showing's first draw, for the verify suite. */
  first: number[] | null;
  draws: number;
  fade: Animation | null;
}

interface Cached {
  blob: Promise<Blob | null>;
  decoded: Promise<ImageBitmap | null> | null;
  bitmap: ImageBitmap | null;
  closed: boolean;
}

export interface PageAnimPlayer {
  /** The open spread's animated pages: each page's wrapper (`.page-anim`) as
   *  FlipBook rendered it, or null. Called after every committed spread. */
  setSlots: (spread: number, spreads: Spread[], wraps: (HTMLDivElement | null)[]) => void;
  /** From the engine's `onTurnActive`, synchronously. */
  setTurning: (active: boolean) => void;
  destroy: () => void;
}

/** What the dev handle reports per shown page. */
export interface PageAnimSlotState {
  page: number;
  ids: string[];
  shown: boolean;
  draws: number;
  first: number[] | null;
  last: number[];
  rest: number[];
}

export function createPageAnimPlayer(manifestUrl: string): PageAnimPlayer {
  const manifestP = loadPageAnimManifest(manifestUrl);
  let manifest: PageAnimManifest | null = null;
  void manifestP.then((m) => {
    manifest = m;
  });

  const cache = new Map<string, Cached>();
  const platePrefetch = new Map<number, HTMLImageElement>();
  let slots: Slot[] = [];
  let spreadIndex = 0;
  let spreadList: Spread[] = [];
  let turning = false;
  let destroyed = false;
  let raf = 0;
  /** Bumped by everything that invalidates a reveal in flight. */
  let epoch = 0;

  const ro = new ResizeObserver((entries) => {
    for (const en of entries) {
      const s = slots.find((x) => x.wrap === en.target);
      if (s?.shown && sizeCanvas(s)) draw(s, s.last, true);
    }
  });

  /** An atlas's bytes, fetched once. */
  function fetchAtlas(id: string): Cached | null {
    const e = manifest?.anims[id];
    if (!e) return null;
    let c = cache.get(id);
    if (!c) {
      c = {
        blob: fetch(e.src)
          .then((r) => (r.ok ? r.blob() : null))
          .catch(() => null),
        decoded: null,
        bitmap: null,
        closed: false,
      };
      cache.set(id, c);
    }
    return c;
  }

  /** An atlas decoded (off the main thread), once. */
  function decodeAtlas(id: string): Promise<ImageBitmap | null> {
    const c = fetchAtlas(id);
    if (!c) return Promise.resolve(null);
    c.decoded ??= c.blob
      .then((b) => (b && !c.closed ? createImageBitmap(b) : null))
      .then((bmp) => {
        if (bmp && c.closed) {
          bmp.close();
          return null;
        }
        c.bitmap = bmp;
        return bmp;
      })
      .catch(() => null);
    return c.decoded;
  }

  /**
   * The open spread's atlases decoded now (its pages are about to show); its
   * neighbours' only FETCHED — each spread decodes its own at its own settle,
   * and the fade waits for it. Decoding the neighbours ahead, even in idle time
   * long before, made the next lift drop a frame about twice as often as `main`
   * (docs/reader.md): it is a decoded atlas being resident at a lift that costs
   * it. Anything beyond ±1 spread is dropped.
   */
  function keepWindow(): void {
    if (!manifest) return;
    const pages = pagesNear(spreadList, spreadIndex, 1);
    const want = new Set(PAGE_ANIMS.filter((r) => pages.has(r.page)).map((r) => r.id));
    const open = new Set(slots.flatMap((sl) => sl.ids));
    for (const id of want) {
      if (open.has(id)) void decodeAtlas(id);
      else fetchAtlas(id);
    }
    for (const [id, c] of cache) {
      if (want.has(id)) continue;
      c.closed = true;
      c.bitmap?.close();
      cache.delete(id);
    }
    // Neighbours' plates: fetched now, decoded when their page opens.
    for (const p of pages) {
      const page = spreadList.flat().find((x) => x?.n === p);
      if (page?.plate && !platePrefetch.has(p) && !slots.some((sl) => sl.page.n === p)) {
        const img = new Image();
        img.src = page.plate;
        platePrefetch.set(p, img);
      }
    }
    for (const p of platePrefetch.keys()) if (!pages.has(p)) platePrefetch.delete(p);
  }

  /** The align tool's view on this page's wrapper (CSS: flipbook.css). */
  function applyAlign(s: Slot): void {
    if (align !== null && s.ids.includes(align.id)) s.wrap.dataset.align = align.view;
    else delete s.wrap.dataset.align;
  }

  function hide(s: Slot): void {
    s.fade?.cancel();
    s.fade = null;
    s.shown = false;
    delete s.wrap.dataset.state;
  }

  /** Backing store to the wrapper's size × DPR. True if it changed. */
  function sizeCanvas(s: Slot): boolean {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const w = Math.max(1, Math.round(s.wrap.clientWidth * dpr));
    const h = Math.max(1, Math.round(s.wrap.clientHeight * dpr));
    if (s.canvas.width === w && s.canvas.height === h) return false;
    s.canvas.width = w;
    s.canvas.height = h;
    return true;
  }

  function framesFor(s: Slot, now: number): number[] {
    const aligning = align !== null && s.ids.includes(align.id);
    return s.ids.map((id) => {
      const e = manifest?.anims[id];
      if (!e) return 0;
      const rest = restOf(e, rowOf(id)?.rest);
      if (aligning) return rest;
      return frameAt(e, (now - s.origin) * 1000, rest);
    });
  }

  function draw(s: Slot, frames: number[], force = false): void {
    if (!force && frames.every((f, i) => f === s.last[i])) return;
    const ctx = s.canvas.getContext('2d');
    if (!ctx || !manifest) return;
    const k = s.canvas.width / PAGE_W;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, s.canvas.width, s.canvas.height);
    ctx.imageSmoothingQuality = 'high';
    const inPaper = PAGE_ANIM_LOOK.inPaper && !(align !== null && s.ids.includes(align.id));
    s.ids.forEach((id, i) => {
      const e = manifest!.anims[id];
      const bmp = cache.get(id)?.bitmap;
      const row = rowOf(id);
      if (!e || !bmp || !row) return;
      const c = cellRect(e, frames[i]);
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.translate(row.x + row.w / 2, row.y + row.h / 2);
      if (row.rotation) ctx.rotate((row.rotation * Math.PI) / 180);
      if (row.flipX) ctx.scale(-1, 1);
      ctx.drawImage(bmp, c.sx, c.sy, c.sw, c.sh, -row.w / 2, -row.h / 2, row.w, row.h);
    });
    if (inPaper && PAGE_ANIM_LOOK.tooth > 0) {
      const tooth = toothPattern(ctx, k);
      if (tooth) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = 'source-atop';
        ctx.globalAlpha = Math.min(1, PAGE_ANIM_LOOK.tooth);
        ctx.fillStyle = tooth;
        ctx.fillRect(0, 0, s.canvas.width, s.canvas.height);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    if (inPaper) s.wrap.dataset.look = 'paper';
    else delete s.wrap.dataset.look;
    s.last = frames.slice();
    s.first ??= frames.slice();
    s.draws++;
  }

  async function reveal(s: Slot): Promise<void> {
    const at = epoch;
    const m = await manifestP;
    if (!m || at !== epoch || destroyed) return;
    const bmps = await Promise.all(s.ids.map((id) => decodeAtlas(id)));
    if (!s.plate.getAttribute('src') && s.plate.dataset.src) s.plate.src = s.plate.dataset.src;
    await s.plate.decode().catch(() => {});
    if (at !== epoch || destroyed || turning || !slots.includes(s)) return;
    if (bmps.some((b) => !b)) return; // the baked page stays: it is the same picture
    sizeCanvas(s);
    // The loops start once the fade has landed; until then, the rest frames.
    s.origin = coverTime() + SETTLE_FADE_MS / 1000;
    s.first = null;
    s.last = s.ids.map(() => -1);
    draw(s, framesFor(s, coverTime()), true);
    s.shown = true;
    applyAlign(s);
    s.wrap.dataset.state = 'shown';
    s.fade = s.wrap.animate([{ opacity: 0 }, { opacity: 1 }], { duration: SETTLE_FADE_MS, easing: 'linear' });
    loop();
  }

  function tick(): void {
    raf = 0;
    if (destroyed || turning) return;
    const now = coverTime();
    let any = false;
    for (const s of slots) {
      if (!s.shown) continue;
      any = true;
      draw(s, framesFor(s, now));
    }
    if (any && !coverStill()) raf = requestAnimationFrame(tick);
  }

  function loop(): void {
    if (!raf && !turning && !destroyed) raf = requestAnimationFrame(tick);
  }

  function stop(): void {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  const onRows = () => {
    for (const s of slots) {
      if (!s.shown) continue;
      applyAlign(s);
      draw(s, framesFor(s, coverTime()), true);
    }
    loop();
  };
  rowListeners.add(onRows);

  const player: PageAnimPlayer = {
    setSlots(spread, spreads, wraps) {
      spreadIndex = spread;
      spreadList = spreads;
      const next: Slot[] = [];
      for (const wrap of wraps) {
        if (!wrap) continue;
        const kept = slots.find((s) => s.wrap === wrap);
        if (kept) {
          next.push(kept);
          continue;
        }
        const n = Number(wrap.dataset.page);
        const page = spreads[spread]?.find((p) => p?.n === n);
        const plate = wrap.querySelector('img');
        const canvas = wrap.querySelector('canvas');
        if (!page || !plate || !canvas) continue;
        const s: Slot = {
          page,
          wrap,
          plate,
          canvas,
          ids: animsOnPage(n).map((r) => r.id),
          shown: false,
          origin: 0,
          last: [],
          first: null,
          draws: 0,
          fade: null,
        };
        hide(s);
        ro.observe(wrap);
        next.push(s);
      }
      for (const s of slots) if (!next.includes(s)) ro.unobserve(s.wrap);
      slots = next;
      if (turning) return; // a riffle's inner landing: wait for the book to settle
      epoch++;
      void manifestP.then(() => {
        if (!destroyed && !turning) keepWindow();
      });
      for (const s of slots) if (!s.shown) void reveal(s);
    },

    setTurning(active) {
      if (active === turning) return;
      turning = active;
      epoch++;
      if (active) {
        // Synchronously, before the strips' first frame: the baked page is back.
        stop();
        for (const s of slots) hide(s);
        return;
      }
      void manifestP.then(() => {
        if (!destroyed && !turning) keepWindow();
      });
      for (const s of slots) void reveal(s);
    },

    destroy() {
      destroyed = true;
      epoch++;
      stop();
      ro.disconnect();
      rowListeners.delete(onRows);
      for (const c of cache.values()) {
        c.closed = true;
        c.bitmap?.close();
      }
      cache.clear();
      platePrefetch.clear();
      if (import.meta.env.DEV && devHandle.player === player) devHandle.player = null;
    },
  };

  if (import.meta.env.DEV) devHandle.player = player;
  if (import.meta.env.DEV) {
    devHandle.state = () =>
      slots.map((s) => ({
        page: s.page.n,
        ids: s.ids.slice(),
        shown: s.shown,
        draws: s.draws,
        first: s.first?.slice() ?? null,
        last: s.last.slice(),
        rest: s.ids.map((id) => {
          const e = manifest?.anims[id];
          return e ? restOf(e, rowOf(id)?.rest) : 0;
        }),
      }));
    devHandle.cached = () => [...cache.entries()].filter(([, c]) => c.bitmap).map(([id]) => id);
    devHandle.fetched = () => [...cache.keys()];
  }
  return player;
}

/** DEV: `window.__pageAnims` — the verify suite's and the align tool's view in. */
const devHandle: {
  player: PageAnimPlayer | null;
  state: () => PageAnimSlotState[];
  cached: () => string[];
  fetched: () => string[];
  rowOf: typeof rowOf;
  setRowOverride: typeof setRowOverride;
  setAlign: typeof setAlign;
  setLook: typeof setPageAnimLook;
} = {
  player: null,
  state: () => [],
  cached: () => [],
  fetched: () => [],
  rowOf,
  setRowOverride,
  setAlign,
  setLook: setPageAnimLook,
};

if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __pageAnims?: typeof devHandle }).__pageAnims = devHandle;
}
