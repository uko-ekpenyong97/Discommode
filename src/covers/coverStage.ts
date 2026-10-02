import { WebGLRenderer } from 'three';
import { coverCropOf } from './coverRenderer';
import type { CoverDrawer } from './coverRenderer';
import { makeCoverRenderer } from './cachedCoverRenderer';
import { riveCover, shaderCover } from './covers';
import { coverStill, coverTime } from './coverClock';
import { coverBackdrop, coverDialsVersion, coverValues, siteCoverDials, subscribeCoverDials } from './coverDials';
import { ensureRive, onRiveReady, peekRivePlayer, riveAvailable, riveCost, riveDomRoles, riveFrame, rivePlayer } from './rive/riveCover';
import type { RivePlayerRole } from './rive/riveCover';
import { cssRgb } from './color';
import { computeHeroRect } from '../layout/hero';
import { config } from '../config';
import { isBusy } from '../activity';
import { afterFirstPaint } from '../firstPaint';
import { DomeSpring, advanceDome, domeUp } from './dome';
import type { Crop, Dome } from './types';

/**
 * THE COVER STAGE — the DOM instances' one renderer.
 *
 * Card 02 is on screen several times in the grid (the row repeats), again as
 * the morph card, and as the hero's DOM face until the paper takes it over. None
 * of them gets a context. There is ONE — this stage's, an offscreen canvas, the
 * page's only WebGL context beyond main's (docs/covers.md) — and every frame:
 *
 *   1. each cover with an instance on screen is drawn ONCE for all the
 *      instances that show it at rest, at the largest of their sizes (capped
 *      by coverMaxDpr — and a grid tile's by coverRenderMax, its canvas
 *      upscaled by CSS), per aspect (tiles are 3:4, the hero 10:13);
 *   2. each instance with its own dome up (the hovered tile, the hero) — or
 *      its cover's per-instance state not yet back at rest (card 02's lava
 *      warmth, easing out) — is drawn once more, for itself;
 *   3. each draw is copied, in this same task, into the instances' own 2D
 *      canvases with drawImage — so no preserveDrawingBuffer: the buffer is
 *      read before the frame it was drawn for is presented.
 *
 * The 2D canvases are DOM over the SkyLayer, so they composite over the sky
 * with their alpha and nothing else. Nothing renders while no instance is on
 * screen; the loop stops and restarts itself. No per-frame allocation.
 *
 * A RIVE cover (card 04) goes through the same loop, grouped the same way, but
 * its draw is its player's (src/covers/rive/riveCover.ts): one instance of the
 * artboard, drawn once per frame on the CPU into a 2D canvas, and copied into
 * each instance from there. It needs no WebGL — not this stage's context, nor
 * any other — so a browser without WebGL still gets card 04 live.
 */

export interface Presenter {
  coverId: string;
  /** A Rive cover's: which player it shows (the grid's artboard or the hero's). */
  role: RivePlayerRole;
  /** The element whose box IS the instance (its rect sizes the draw). */
  host: HTMLElement;
  canvas: HTMLCanvasElement;
  /** Its own dome: the pointer over `host` drives it (null: always at rest). */
  dome: DomeSpring | null;
  /** First frame is on the canvas (the still under it can go). */
  onDrawn: () => void;
  // ── per frame, owned by the stage ──
  ctx: CanvasRenderingContext2D | null;
  visible: boolean;
  onScreen: boolean;
  /** The instance's size, device px, from its LAYOUT box (`size`, below). */
  pxW: number;
  pxH: number;
  /** What its cover is RENDERED at, and its canvas's backing store: the same,
   *  or for a grid tile no more than `coverRenderMax` on the long edge — CSS
   *  upscales the rest. */
  drawW: number;
  drawH: number;
  /** A grid tile: its render is capped (set once, when it is added). */
  capped: boolean;
  drawn: boolean;
  /** Its box on screen last frame (CSS px): a change is the page moving. */
  rx: number;
  ry: number;
  rw: number;
  /** The stage frame its canvas was last copied in. */
  copied: number;
}

interface Group {
  coverId: string;
  role: RivePlayerRole;
  capped: boolean;
  aspect: number;
  pxW: number;
  pxH: number;
  n: number;
}

let renderer: WebGLRenderer | null = null;
/** Making the stage's context failed: no shader cover can be live here. */
let failed = false;
/** The context is lost (until it is restored): instances keep their last frame. */
let lost = false;
/** The page's first paint is out: the covers may compile and draw. */
let painted = false;
const stageListeners = new Set<() => void>();
const covers = new Map<string, CoverDrawer>();
const presenters = new Set<Presenter>();
let raf = 0;
let running = false;
let boundVersion = -1;
// Reused every frame: `groups` is the first `nGroups` of a pool that only grows.
const groups: Group[] = [];
let nGroups = 0;
const crop: Crop = { x0: 0, y0: 0, w: 1, h: 1 };
const restDome = { x: 0, y: 0, amp: 0 };
let stageW = 0;
let stageH = 0;
let frames = 0;
let lastMs = 0;
/** Grid tiles never drawn, off screen, given the shared draw this frame. */
const UNDRAWN_PER_FRAME = 4;
const undrawn: Presenter[] = [];
let nUndrawn = 0;
/** The last frame's draws of an instance for itself (its dome up), per cover. */
const ownDraws = new Map<string, number>();

/**
 * Where an instance HOLDS its last frame instead of drawing: somewhere a second
 * instance is showing the same cover bigger and live, so drawing both would pay
 * twice for one moment (the total per frame is the budget, docs/covers.md).
 *
 *   the grid while it fades under the grid→detail morph (either way) — the
 *     morph card is the live one, and the receding tiles are fading out;
 *   the hero's DOM face while the paper hands IN (120ms) — it is dissolving
 *     off the paper, which is drawing the same cover at the same size.
 *
 * (The paper holds its own frame while it hands OUT, for the same reason.)
 */
const HOLD = '.grid-stage--fading, .grid-stage--fading-in, .detail[data-paper="in"]';

/**
 * At most this many GRID TILES of a cover that keeps per-instance state (card
 * 02's lava warmth, which eases out for ~2 s after the pointer leaves) are
 * drawn for themselves at once. A pointer swept across the grid in a second
 * left three of card 02's tiles easing together: 1.46–1.66 ms of cover work in
 * one frame at 1728×996 @2×, over the grid's 1.2 (`lsweep`). The tile under the
 * pointer keeps its draw, then the one it left most recently; the one easing
 * longest goes back to the shared draw — at rest, on the shared timeline —
 * and the two that keep theirs ease out in full.
 */
const MAX_OWN_TILES = 2;
const easing: Presenter[] = [];
const byPriority = (a: Presenter, b: Presenter) => b.dome!.priority() - a.dome!.priority();

function capEasingTiles() {
  easing.length = 0;
  for (const p of presenters) {
    // active(): up, or under the pointer — about to be up this very frame
    if (p.capped && p.onScreen && p.dome?.active() && shaderCover(p.coverId)?.instanceExtra) easing.push(p);
  }
  if (easing.length <= MAX_OWN_TILES) return;
  easing.sort(byPriority);
  for (let i = MAX_OWN_TILES; i < easing.length; i++) easing[i].dome!.reset();
}

/**
 * How far past the viewport an instance counts as on screen, a fraction of the
 * viewport: in the band it is copied every frame, so a grid tile arrives in
 * view current. Measured by the tick from the box it reads anyway, not by an
 * IntersectionObserver: the observer clips the target by the grid's
 * viewport-sized `overflow: hidden` BEFORE it applies its root margin, so no
 * margin can see past the viewport, and it reports a frame late — tiles came
 * into view a frame or two after their last copy, holding whatever they had.
 */
const ON_SCREEN_MARGIN = 0.25;

/** Only to wake the loop when something comes on screen while it sleeps. */
const io = new IntersectionObserver(() => kick(), { rootMargin: '64px' });

/** The untransformed size of each instance's host, CSS px (`size`, below). */
const layoutBox = new WeakMap<Element, { w: number; h: number }>();
const ro = new ResizeObserver((entries) => {
  for (const e of entries) {
    const b = e.contentBoxSize[0];
    layoutBox.set(e.target, { w: b.inlineSize, h: b.blockSize });
  }
  kick();
});

/**
 * False if this browser cannot give the stage a WebGL2 context. Before the
 * stage is made this is the browser's word for it (WebGL2 exists); if making
 * it then fails, {@link subscribeStage}'s listeners hear it and the tiles drop
 * their canvases for the still.
 */
export function coverStageAvailable(): boolean {
  if (failed) return false;
  return !!renderer || typeof WebGL2RenderingContext !== 'undefined';
}

/** Called when the stage's availability changes (making it failed). */
export function subscribeStage(fn: () => void): () => void {
  stageListeners.add(fn);
  return () => stageListeners.delete(fn);
}

/**
 * THE BOOT. The stage's context, its programs and its first draws were all
 * in React's first commit (a tile asking if it could be live made the
 * context during render): the boot's longest task, and the sky's context,
 * made a moment later, waited behind it in the GPU process. Now:
 *
 *   the context   made before React's first render (`prepareCoverStage`,
 *                 main.tsx), right after the sky's, while the GPU process has
 *                 nothing else to do. Made any later, the context's set-up
 *                 calls (three's extension and parameter queries, each a
 *                 round trip) wait behind the raster and the image uploads of
 *                 the first frames: 30–40 ms after the first paint;
 *   the covers    their programs compiled, and drawn, only after the first
 *                 paint (`firstPaint.ts`). Nothing of a live cover shows
 *                 before its first draw lands anyway: each tile shows its
 *                 still until then (CoverTile).
 *
 * Under reduced motion no tile is live and nothing is made, as before.
 */
export function prepareCoverStage(): void {
  if (!coverStill()) makeStage();
}

afterFirstPaint(() => {
  painted = true;
  if (![...presenters].some((p) => !riveCover(p.coverId))) return;
  makeStage();
  for (const p of presenters) if (!riveCover(p.coverId)) coverFor(p.coverId);
  kick();
});

function makeStage() {
  if (renderer || failed) return;
  try {
    const canvas = document.createElement('canvas');
    renderer = new WebGLRenderer({
      canvas,
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    if (!renderer.capabilities.isWebGL2) throw new Error('no WebGL2');
    renderer.setPixelRatio(1);
    renderer.autoClear = false;
    // Lost: every instance keeps its last frame. Restored (three has rebuilt
    // its own state by then — its listener was added first): the covers'
    // programs and textures are made again, and the loop goes on.
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      lost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      for (const c of covers.values()) c.dispose();
      covers.clear();
      stageW = stageH = 0;
      boundVersion = -1;
      lost = false;
      heroWarm.clear();
      kick();
    });
  } catch {
    renderer = null;
    failed = true;
    for (const fn of stageListeners) fn();
  }
}

function coverFor(id: string): CoverDrawer | null {
  let c = covers.get(id);
  if (!c && painted && renderer && !lost) {
    const def = shaderCover(id);
    if (!def) return null;
    c = makeCoverRenderer(renderer, def, coverValues(id));
    c.warm();
    covers.set(id, c);
  }
  return c ?? null;
}

subscribeCoverDials(() => kick());
onRiveReady(() => kick());

if (import.meta.env.DEV) void import('./devHooks').then((m) => m.installCoverDevHooks());

/** Can an instance of this cover be live here? A shader needs the stage's
 *  WebGL2; a Rive cover only its runtime and file (until either fails). */
export function coverLiveAvailable(id: string): boolean {
  return riveCover(id) ? riveAvailable(id) : coverStageAvailable();
}

/**
 * Add an instance, and PRIME it: its canvas gets the cover's current frame
 * before the browser paints it (flushPrimes, below) — so a tile the grid
 * recycles to another cover mid-drag never shows a blank canvas, the cover it
 * had, or its still and then a jump to the live frame.
 */
export function addPresenter(p: Presenter): () => void {
  const rive = !!riveCover(p.coverId);
  if (!coverLiveAvailable(p.coverId)) return () => {};
  p.ctx = p.canvas.getContext('2d');
  // Only the grid's tiles are capped: the detail hero and the morph card that
  // lands on it draw at their full size.
  p.capped = !!p.host.closest('.grid-stage');
  presenters.add(p);
  io.observe(p.host);
  ro.observe(p.host);
  // Until the ResizeObserver reports (a frame or more later), the layout as
  // it is now: fractional CSS px (offsetWidth rounds).
  layoutBox.set(p.host, layoutNow(p.host));
  if (rive) ensureRive(p.coverId);
  else if (painted) {
    makeStage();
    coverFor(p.coverId);
  }
  pending.push(p);
  if (!flushQueued) {
    flushQueued = true;
    queueMicrotask(flushPrimes);
  }
  kick();
  return () => {
    // Its canvas holds the cover's latest frame: an instance the same commit
    // gives this cover can take it from here (flushPrimes).
    if (p.drawn && p.copied >= frames - 1 && !(p.dome && domeUp(p.dome.state))) {
      retired.push({ canvas: p.canvas, coverId: p.coverId, role: p.role, w: p.canvas.width, h: p.canvas.height });
    }
    presenters.delete(p);
    const i = pending.indexOf(p);
    if (i >= 0) pending.splice(i, 1);
    io.unobserve(p.host);
    ro.unobserve(p.host);
  };
}

/**
 * When the page last moved under the stage: any visible instance's box
 * changed (a drag, its settle, the morph, a slide, a hover's tilt).
 */
let lastMotion = 0;
const QUIET_MS = 200;
const moving = () => performance.now() - lastMotion < QUIET_MS;

/** Instances added in this commit, to prime when it is done. */
const pending: Presenter[] = [];
let flushQueued = false;
/** The canvases of instances removed in this commit, and what they hold. */
const retired: { canvas: HTMLCanvasElement; coverId: string; role: RivePlayerRole; w: number; h: number }[] = [];
/** Per cover (and Rive role): where a retired canvas's frame is kept while
 *  its own tile is primed with another cover. Made, at the tile's size, when
 *  the cover's first grid tile is primed — at load, not mid-drag. */
const scratch = new Map<string, HTMLCanvasElement>();

function scratchFor(p: Presenter): HTMLCanvasElement {
  const key = `${p.coverId}|${p.role}`;
  let c = scratch.get(key);
  if (!c) scratch.set(key, (c = document.createElement('canvas')));
  if (c.width !== p.drawW || c.height !== p.drawH) {
    c.width = p.drawW;
    c.height = p.drawH;
  }
  return c;
}

/**
 * THE PRIME, once a commit has added its instances (a microtask: after
 * React's layout effects, before the browser paints). A wrap of the grid
 * recycles EVERY slot in one commit, so the instance that showed a cover a
 * moment ago is gone and its canvas is about to take another cover: each
 * cover's frame is gathered first, then copied in.
 *
 *   1. each instance is sized from its layout box (`size`); only a new
 *      canvas gets a backing store — a recycled grid tile's is the size
 *      already;
 *   2. one source per cover and shape, before any canvas is written: a
 *      sibling still on the page (copied last frame, at rest — not its own
 *      dome's draw), or else a canvas this commit retired, kept in the
 *      cover's scratch canvas;
 *   3. each instance copied from it; a Rive cover's from its player's last
 *      draw if there was no sibling. With neither: a draw of its own, but only
 *      while nothing on the page moves — a drag, its settle, a morph or a
 *      slide never pays for one, nor for a compile (only a cover the stage
 *      already has). Without even that the canvas is cleared, no size write,
 *      and CoverTile shows the still until the next regular copy lands.
 */
function flushPrimes() {
  flushQueued = false;
  if (!pending.length) {
    retired.length = 0;
    return;
  }
  const site = siteCoverDials();
  const dpr = Math.min(window.devicePixelRatio || 1, Math.max(0.5, site.coverMaxDpr));
  for (const p of pending) {
    size(p, layoutBox.get(p.host) ?? layoutNow(p.host), dpr, site.coverRenderMax);
    p.drawn = false;
    if (p.capped) scratchFor(p);
  }
  const sources = new Map<string, { canvas: HTMLCanvasElement; w: number; h: number }>();
  const keyOf = (p: Presenter) => `${p.coverId}|${p.role}|${p.drawW}x${p.drawH}`;
  for (const p of pending) {
    const key = keyOf(p);
    if (sources.has(key)) continue;
    let q: Presenter | null = null;
    for (const o of presenters) {
      if (o.coverId !== p.coverId || o.role !== p.role || !o.drawn || o.copied < frames - 1 || pending.includes(o)) continue;
      if (o.canvas.width !== p.drawW || o.canvas.height !== p.drawH || (o.dome && domeUp(o.dome.state))) continue;
      if (!q || o.copied > q.copied) q = o;
    }
    if (q) {
      sources.set(key, { canvas: q.canvas, w: q.drawW, h: q.drawH });
      continue;
    }
    const r = retired.find((x) => x.coverId === p.coverId && x.role === p.role && x.w === p.drawW && x.h === p.drawH);
    const keep = r && p.capped ? scratchFor(p) : null;
    const ctx = keep?.getContext('2d');
    if (r && keep && ctx) {
      ctx.clearRect(0, 0, keep.width, keep.height);
      ctx.drawImage(r.canvas, 0, 0);
      sources.set(key, { canvas: keep, w: r.w, h: r.h });
    }
  }
  for (const p of pending) {
    const src = sources.get(keyOf(p));
    if (src) {
      copy(p, src.canvas, 0, src.w, src.h);
      continue;
    }
    const rive = !!riveCover(p.coverId);
    const player = rive ? peekRivePlayer(p.coverId, p.role) : null;
    if (player && player.version > 0 && Math.abs(player.pxW / player.pxH - p.drawW / p.drawH) < 0.01) {
      copy(p, player.canvas, 0, player.pxW, player.pxH);
      continue;
    }
    if (!moving()) {
      const t = coverTime(performance.now());
      if (player) {
        player.draw(t, p.drawW, p.drawH);
        if (player.version > 0) {
          copy(p, player.canvas, 0, p.drawW, p.drawH);
          continue;
        }
      } else if (!rive) {
        const cover = covers.get(p.coverId);
        if (cover && draw(cover, p.drawW, p.drawH, t, restDome, backdropFor(p.coverId, site))) {
          present(p, p.drawW, p.drawH);
          continue;
        }
      }
    }
    const c = p.canvas;
    if (c.width !== p.drawW || c.height !== p.drawH) {
      c.width = p.drawW;
      c.height = p.drawH;
    } else p.ctx?.clearRect(0, 0, c.width, c.height);
  }
  pending.length = 0;
  retired.length = 0;
}

/**
 * An instance's size, device px, from its LAYOUT box × its DPR — never its
 * bounding box. The grid's tilt and focus scale, the morph's travel and a
 * slide's scale are transforms: sized from the bounding box, every frame of
 * one was a new backing store (each write clears the canvas: the tiles
 * flickered while the grid was dragged), a new pass-A target, and — the
 * groups keyed on its aspect — tiles of one cover split into draws of their
 * own. CSS scales the canvas through the transform for nothing.
 *
 * A grid tile is sized at the focus scale, the largest it is shown at rest,
 * then capped by `coverRenderMax` (at 2× it always is: 672 × 896). A Rive
 * cover has its own cap on the DPR (`riveMaxDpr`: a CPU draw).
 */
function size(p: Presenter, box: { w: number; h: number }, dpr: number, renderMax: number) {
  const d = riveCover(p.coverId) ? Math.min(window.devicePixelRatio || 1, riveMaxDpr(p.coverId)) : dpr;
  const k = d * (p.capped ? Math.max(1, config.focusScale) : 1);
  p.pxW = Math.max(1, Math.round(box.w * k));
  p.pxH = Math.max(1, Math.round(box.h * k));
  // THE RENDER CAP (coverRenderMax): a grid tile's cover is rendered no
  // bigger than the tile was at the old cardWidth, and CSS upscales its
  // canvas over the tile. The cost of a cover is its pixels; the 480-wide
  // tile was 2.56× them for no more cover.
  const cap = p.capped ? renderMax / Math.max(p.pxW, p.pxH) : 1;
  if (cap < 1) {
    p.drawW = Math.max(1, Math.round(p.pxW * cap));
    p.drawH = Math.max(1, Math.round(p.pxH * cap));
  } else {
    p.drawW = p.pxW;
    p.drawH = p.pxH;
  }
}

/** A host's layout box as it is now, CSS px, fractional. */
function layoutNow(host: HTMLElement): { w: number; h: number } {
  const cs = getComputedStyle(host);
  return { w: parseFloat(cs.width) || 0, h: parseFloat(cs.height) || 0 };
}

/** The site's backdrop under a cover, or null (none, or the cover's own). */
function backdropFor(id: string, site: ReturnType<typeof siteCoverDials>): [number, number, number] | null {
  return site.coverBackdrop === 'solid' && coverBackdrop(id) !== 'solid' ? cssRgb(site.coverBackdropColor) : null;
}

/**
 * A grid tile's canvas with no cover in it yet (CoverTile, a slot showing
 * card 01): sized now as a tile's would be, so that when the grid recycles a
 * cover into it — mid-drag — there is no backing store to make.
 */
export function sizeIdleTile(canvas: HTMLCanvasElement, host: HTMLElement) {
  const site = siteCoverDials();
  const dpr = Math.min(window.devicePixelRatio || 1, Math.max(0.5, site.coverMaxDpr));
  const probe = { host, coverId: '', capped: true, pxW: 0, pxH: 0, drawW: 0, drawH: 0 } as unknown as Presenter;
  size(probe, layoutNow(host), dpr, site.coverRenderMax);
  if (canvas.width !== probe.drawW || canvas.height !== probe.drawH) {
    canvas.width = probe.drawW;
    canvas.height = probe.drawH;
  }
}

/**
 * A hovered grid tile of a cached-pass cover (card 03) is the likeliest sign
 * the hero is next. Its print at the hero's size is pass A's one-off cost
 * (8–11 ms at 1256 × 1633), and the morph card would otherwise pay it on the
 * click's first frame — so it is rendered now, in an idle moment, once per
 * hero size. (The paper renders its own a frame ahead of its hand-in.)
 */
const heroWarm = new Map<string, { vw: number; vh: number; dpr: number; v: number }>();
function warmHeroPrint(id: string, dpr: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const v = coverDialsVersion();
  const last = heroWarm.get(id);
  if (last && last.vw === vw && last.vh === vh && last.dpr === dpr && last.v === v) return; // every hovered frame: no allocation
  heroWarm.set(id, { vw, vh, dpr, v });
  const hero = computeHeroRect(vw, vh);
  const pxW = Math.max(1, Math.round(hero.w * dpr));
  const pxH = Math.max(1, Math.round(hero.h * dpr));
  const run = () => {
    const c = coverFor(id);
    // Not while the page moves (a drag over the tile, its settle): the print
    // is a new backing store or two, and it is the idle moment it is waiting
    // for. isBusy: the drag is known from its pointerdown, a frame before any
    // instance has moved.
    if (!c?.ready() || moving() || isBusy()) {
      heroWarm.delete(id); // try again on a later hover frame
      return;
    }
    c.prepare(coverCropOf(c.def.frame.w, c.def.frame.h, pxW, pxH, { x0: 0, y0: 0, w: 1, h: 1 }), pxW);
  };
  if (window.requestIdleCallback) window.requestIdleCallback(run, { timeout: 500 });
  else window.setTimeout(run, 50);
}

function kick() {
  if (running) return;
  running = true;
  raf = requestAnimationFrame(tick);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelAnimationFrame(raf);
    running = false;
  } else kick();
});

function tick(now: number) {
  raf = 0;
  if (document.hidden) {
    running = false;
    return;
  }
  const t0 = performance.now();
  riveFrame(); // a frame of cover work, for the Rive hero's "left" test
  const site = siteCoverDials();
  const dprCap = Math.max(0.5, site.coverMaxDpr);
  const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
  if (boundVersion !== coverDialsVersion()) {
    boundVersion = coverDialsVersion();
    for (const [id, c] of covers) c.setValues(coverValues(id));
  }
  const backdrop = site.coverBackdrop === 'solid' ? cssRgb(site.coverBackdropColor) : null;
  const t = coverTime(now);
  capEasingTiles();
  retired.length = 0; // a commit's, primed by now (flushPrimes)

  // 1. what is on screen, and at what size
  nGroups = 0;
  let any = false;
  let onScreen = false;
  nUndrawn = 0;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const mx = vw * ON_SCREEN_MARGIN;
  const my = vh * ON_SCREEN_MARGIN;
  for (const p of presenters) {
    p.visible = false;
    if (!p.host.isConnected) {
      p.onScreen = false;
      continue;
    }
    const r = p.host.getBoundingClientRect();
    p.onScreen = r.width >= 2 && r.height >= 2 && r.right > -mx && r.left < vw + mx && r.bottom > -my && r.top < vh + my;
    if (!p.onScreen) {
      if (!p.drawn && p.capped && nUndrawn < UNDRAWN_PER_FRAME) {
        // A grid tile that has never had a frame (outside the band since it
        // was added): it gets the shared draw's copy below, off screen, so it
        // never comes into view on its still.
        size(p, layoutBox.get(p.host) ?? layoutNow(p.host), dpr, site.coverRenderMax);
        undrawn[nUndrawn++] = p;
      }
      continue;
    }
    const rive = !!riveCover(p.coverId);
    // A shader instance with no stage (not made yet, or its context lost)
    // keeps its last frame (or its still).
    if (!rive && (failed || lost || !renderer)) continue;
    onScreen = true;
    // (checkVisibility: Safari 17.4+; without it, CSS-hidden instances draw too.)
    // Opacity counts: the grid under the detail view is `opacity: 0`
    // (.grid-stage--hidden), not `visibility: hidden`, and was drawn — every
    // frame, behind the hero — while only visibility was checked.
    if (p.host.checkVisibility && !p.host.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
    if (p.drawn && p.host.closest(HOLD)) continue;
    p.visible = true;
    any = true;
    // Its box on screen only says whether the page is moving (prime, above);
    // its size is its layout box's, as the ResizeObserver last saw it.
    if (Math.abs(r.left - p.rx) > 0.5 || Math.abs(r.top - p.ry) > 0.5 || Math.abs(r.width - p.rw) > 0.5) lastMotion = now;
    p.rx = r.left;
    p.ry = r.top;
    p.rw = r.width;
    size(p, layoutBox.get(p.host) ?? layoutNow(p.host), dpr, site.coverRenderMax);
    if (!rive) {
      const def = shaderCover(p.coverId)!;
      if (p.dome) advanceDome(p.dome, now, def, coverValues(p.coverId), t);
      if (def.passA === 'cached' && p.capped && p.dome && p.dome.state.amp > 0) warmHeroPrint(p.coverId, dpr);
    }
    if (!rive && p.dome && domeUp(p.dome.state)) continue; // drawn for itself below
    const aspect = Math.round((p.pxW / p.pxH) * 100) / 100;
    const role: RivePlayerRole = rive ? p.role : 'grid';
    let g: Group | undefined;
    for (let i = 0; i < nGroups; i++) {
      const c = groups[i];
      if (c.coverId === p.coverId && c.aspect === aspect && c.role === role && c.capped === p.capped) g = c;
    }
    if (!g) {
      if (nGroups === groups.length) groups.push({ coverId: '', role: 'grid', capped: false, aspect: 0, pxW: 0, pxH: 0, n: 0 });
      g = groups[nGroups++];
      g.coverId = p.coverId;
      g.role = role;
      g.capped = p.capped;
      g.aspect = aspect;
      g.pxW = g.pxH = g.n = 0;
    }
    if (p.drawW > g.pxW) {
      g.pxW = p.drawW;
      g.pxH = p.drawH;
    }
    g.n++;
  }
  reportRiveRoles();
  if (!any) {
    // Nothing visible. Hidden by CSS (the grid under the detail view, the
    // hero's DOM face under the paper) is still on screen as far as the
    // IntersectionObserver knows, and it will not tell us when that changes:
    // keep looking, without drawing. Off screen altogether: sleep until the
    // observer wakes us.
    if (onScreen) raf = requestAnimationFrame(tick);
    else running = false;
    return;
  }

  // 2. the shared rest draws, then each domed instance's own
  for (let i = 0; i < nGroups; i++) {
    const g = groups[i];
    if (riveCover(g.coverId)) {
      drawRive(g, t);
      continue;
    }
    const cover = coverFor(g.coverId);
    if (!cover || !draw(cover, g.pxW, g.pxH, t, restDome, coverBackdrop(g.coverId) === 'solid' ? null : backdrop)) continue;
    for (const p of presenters) {
      if (!p.visible || p.coverId !== g.coverId || (p.dome && domeUp(p.dome.state))) continue;
      if (p.capped !== g.capped || Math.round((p.pxW / p.pxH) * 100) / 100 !== g.aspect) continue;
      present(p, g.pxW, g.pxH);
    }
    for (let i = 0; i < nUndrawn; i++) {
      const p = undrawn[i];
      if (p.coverId === g.coverId && g.capped && p.drawW === g.pxW && p.drawH === g.pxH) present(p, g.pxW, g.pxH);
    }
  }
  for (const k of ownDraws.keys()) ownDraws.set(k, 0); // reused: no allocation once each cover has a key
  for (const p of presenters) {
    if (!p.visible || !p.dome || !domeUp(p.dome.state) || riveCover(p.coverId)) continue;
    const cover = coverFor(p.coverId);
    if (cover && draw(cover, p.drawW, p.drawH, t, p.dome.state, coverBackdrop(p.coverId) === 'solid' ? null : backdrop)) {
      present(p, p.drawW, p.drawH);
      ownDraws.set(p.coverId, (ownDraws.get(p.coverId) ?? 0) + 1);
    }
  }

  frames++;
  lastMs = performance.now() - t0;
  raf = requestAnimationFrame(tick);
}

function draw(
  cover: CoverDrawer,
  pxW: number,
  pxH: number,
  t: number,
  dome: Dome,
  backdrop: [number, number, number] | null,
): boolean {
  if (!renderer || lost || !cover.ready()) return false;
  // Grow-only: a drawing buffer resized every frame would be reallocated every
  // frame. Draws use its bottom-left pxW × pxH.
  if (pxW > stageW || pxH > stageH) {
    stageW = Math.max(stageW, pxW);
    stageH = Math.max(stageH, pxH);
    renderer.setSize(stageW, stageH, false);
  }
  coverCropOf(cover.def.frame.w, cover.def.frame.h, pxW, pxH, crop);
  return cover.draw(null, { t, crop, pxW, pxH, dome, backdrop });
}

function present(p: Presenter, pxW: number, pxH: number) {
  // The draw sits at the framebuffer's bottom-left; in image rows that is the
  // last pxH rows.
  if (renderer) copy(p, renderer.domElement, stageH - pxH, pxW, pxH);
}

/**
 * A copy of the draw at `(0, sy, pxW, pxH)` of `src` into one instance's
 * canvas. The canvas's backing store is the instance's RENDER size (`drawW` ×
 * `drawH`: its device size, or under `coverRenderMax` for a grid tile), and
 * CSS stretches the element over the tile — so a capped tile's copy is 1:1 and
 * the compositor does the upscaling, for nothing.
 *
 * The backing store follows the layout box (`size`), so it is written only
 * when that really changes — a resize, a DPR change, a layout dial — and then
 * here, right before the copy, in the same task: a cleared canvas is never
 * presented.
 */
function copy(p: Presenter, src: CanvasImageSource, sy: number, pxW: number, pxH: number) {
  const ctx = p.ctx;
  if (!ctx) return;
  if (p.canvas.width !== p.drawW || p.canvas.height !== p.drawH) {
    p.canvas.width = p.drawW;
    p.canvas.height = p.drawH;
  }
  ctx.clearRect(0, 0, p.drawW, p.drawH);
  ctx.drawImage(src, 0, sy, pxW, pxH, 0, 0, p.drawW, p.drawH);
  p.copied = frames;
  if (!p.drawn) {
    p.drawn = true;
    p.onDrawn();
  }
}

/** Each Rive cover's visible instances, as a mask, for its status
 *  (riveDomRoles: 1 grid tiles, 2 the morph card as Main, 4 the morph card as
 *  Main Bounce, 8 the hero's DOM face). No allocation. */
const riveMasks = new Map<string, number>();
function reportRiveRoles() {
  for (const id of riveMasks.keys()) riveMasks.set(id, 0);
  for (const p of presenters) {
    if (!riveCover(p.coverId)) continue;
    let m = riveMasks.get(p.coverId) ?? 0;
    if (p.visible) {
      const morph = !!p.host.closest('.detail-morph');
      m |= morph ? (p.role === 'hero' ? 4 : 2) : p.role === 'hero' ? 8 : 1;
    }
    riveMasks.set(p.coverId, m);
  }
  for (const [id, m] of riveMasks) riveDomRoles(id, m);
}

/** The cap on a Rive cover's backing store (its riveMaxDpr dial). */
function riveMaxDpr(id: string): number {
  const v = coverValues(id) as { rive?: { riveMaxDpr?: number } };
  return Math.max(0.5, v.rive?.riveMaxDpr ?? 2);
}

/**
 * A Rive group: its player draws once, at the group's largest size, into its
 * own canvas (top-left), and each instance copies it — the grid's tiles all
 * share one draw of "Main", as card 02's share one draw of the shader.
 */
function drawRive(g: Group, t: number) {
  const player = rivePlayer(g.coverId, g.role);
  if (!player) return;
  const ms = player.draw(t, g.pxW, g.pxH);
  if (player.version === 0) return;
  riveCost('draw', ms);
  const t0 = performance.now();
  for (const p of presenters) {
    if (!p.visible || p.coverId !== g.coverId || p.role !== g.role || p.capped !== g.capped) continue;
    if (Math.round((p.pxW / p.pxH) * 100) / 100 !== g.aspect) continue;
    copy(p, player.canvas, 0, g.pxW, g.pxH);
  }
  for (let i = 0; i < nUndrawn; i++) {
    const p = undrawn[i];
    if (p.coverId === g.coverId && p.role === g.role && g.capped && p.drawW === g.pxW && p.drawH === g.pxH) copy(p, player.canvas, 0, g.pxW, g.pxH);
  }
  riveCost('copy', performance.now() - t0);
}

/** DEV / verify: the stage's renderer (for benchmarks) and counters. */
export function coverStageProbe() {
  return {
    get renderer() {
      return renderer;
    },
    frames: () => frames,
    lastMs: () => lastMs,
    /** How many instances of cover `id` drew for themselves last frame. */
    ownDraws: (id: string) => ownDraws.get(id) ?? 0,
    presenters: () =>
      [...presenters].map((p) => ({
        cover: p.coverId,
        role: p.role,
        visible: p.visible,
        onScreen: p.onScreen,
        pxW: p.pxW,
        pxH: p.pxH,
        drawW: p.drawW,
        drawH: p.drawH,
        capped: p.capped,
        domed: !!p.dome && domeUp(p.dome.state),
        /** Its box on screen, CSS px. */
        rect: (({ x, y, width, height }) => ({ x, y, w: width, h: height }))(p.host.getBoundingClientRect()),
        /** Its cover's per-instance state (card 02's lava warmth), if any. */
        warmth: p.dome?.state.ext && 'heat' in p.dome.state.ext ? (p.dome.state.ext.heat as number) : null,
      })),
    cover: (id: string) => coverFor(id),
    /** The `i`-th presenter's dome state (as `presenters()` lists them). */
    domeOf: (i: number) => [...presenters][i]?.dome?.state ?? null,
    /** Draw cover `id` into the stage's canvas at pxW × pxH (its bottom-left),
     *  at `t`, under `dome` (at rest when omitted). */
    draw: (id: string, pxW: number, pxH: number, t: number, dome: { x: number; y: number; amp: number } = restDome) => {
      const c = coverFor(id);
      return c ? draw(c, pxW, pxH, t, dome, null) : false;
    },
    /** The stage canvas's size (draws sit at its bottom-left). */
    size: () => ({ w: stageW, h: stageH }),
  };
}
