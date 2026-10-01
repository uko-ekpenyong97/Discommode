import { WebGLRenderer } from 'three';
import { CoverRenderer, coverCropOf } from './coverRenderer';
import { riveCover, shaderCover } from './covers';
import { coverTime } from './coverClock';
import { coverBackdrop, coverDialsVersion, coverValues, siteCoverDials, subscribeCoverDials } from './coverDials';
import { ensureRive, onRiveReady, riveAvailable, riveCost, riveDomRoles, riveFrame, rivePlayer } from './rive/riveCover';
import type { RivePlayerRole } from './rive/riveCover';
import { cssRgb } from './color';
import { DomeSpring } from './dome';
import type { Crop } from './types';

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
 *   2. each instance with its own dome up (the hovered tile, the hero) is
 *      drawn once more, for itself;
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
  /** The instance's own canvas, device px. */
  pxW: number;
  pxH: number;
  /** What its cover is RENDERED at: the same, or for a grid tile no more than
   *  `coverRenderMax` on the long edge — the copy upscales the rest. */
  drawW: number;
  drawH: number;
  /** A grid tile: its render is capped (set once, when it is added). */
  capped: boolean;
  drawn: boolean;
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
let failed = false;
const covers = new Map<string, CoverRenderer>();
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

const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      for (const p of presenters) if (p.host === e.target) p.onScreen = e.isIntersecting;
    }
    kick();
  },
  { rootMargin: '64px' },
);

/** False if this browser cannot give the stage a WebGL2 context. */
export function coverStageAvailable(): boolean {
  if (failed) return false;
  if (renderer) return true;
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
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      failed = true;
    });
  } catch {
    renderer = null;
    failed = true;
  }
  return !failed;
}

function coverFor(id: string): CoverRenderer | null {
  let c = covers.get(id);
  if (!c && renderer) {
    const def = shaderCover(id);
    if (!def) return null;
    c = new CoverRenderer(renderer, def, coverValues(id));
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

export function addPresenter(p: Presenter): () => void {
  const rive = !!riveCover(p.coverId);
  if (!coverLiveAvailable(p.coverId)) return () => {};
  p.ctx = p.canvas.getContext('2d');
  // Only the grid's tiles are capped: the detail hero and the morph card that
  // lands on it draw at their full size.
  p.capped = !!p.host.closest('.grid-stage');
  presenters.add(p);
  io.observe(p.host);
  if (rive) ensureRive(p.coverId);
  else coverFor(p.coverId);
  kick();
  return () => {
    presenters.delete(p);
    io.unobserve(p.host);
  };
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

  // 1. what is on screen, and at what size
  nGroups = 0;
  let any = false;
  let onScreen = false;
  for (const p of presenters) {
    p.visible = false;
    if (!p.onScreen || !p.host.isConnected) continue;
    const rive = !!riveCover(p.coverId);
    // A shader instance with no stage (its context lost) keeps its last frame.
    if (!rive && (failed || !renderer)) continue;
    onScreen = true;
    // (checkVisibility: Safari 17.4+; without it, CSS-hidden instances draw too.)
    // Opacity counts: the grid under the detail view is `opacity: 0`
    // (.grid-stage--hidden), not `visibility: hidden`, and was drawn — every
    // frame, behind the hero — while only visibility was checked.
    if (p.host.checkVisibility && !p.host.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
    if (p.drawn && p.host.closest(HOLD)) continue;
    const r = p.host.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    p.visible = true;
    any = true;
    p.pxW = Math.max(1, Math.round(r.width * dpr));
    p.pxH = Math.max(1, Math.round(r.height * dpr));
    if (rive) {
      // Its own cap on the backing store (a CPU draw; riveMaxDpr, nosey.json),
      // and its LAYOUT box's aspect, not its bounding box's: the hovered tile
      // tilts, and a tilted tile's bounding box is a different shape — which
      // for a shader is a draw of its own anyway (its dome), and for Rive would
      // be a second draw of the one instance, for nothing.
      const rdpr = Math.min(window.devicePixelRatio || 1, riveMaxDpr(p.coverId));
      const lw = p.host.offsetWidth || r.width;
      const lh = p.host.offsetHeight || r.height;
      p.pxW = Math.max(1, Math.round(r.width * rdpr));
      p.pxH = Math.max(1, Math.round((p.pxW * lh) / lw));
    } else if (p.dome) {
      const spring = shaderCover(p.coverId)!.domeSpring(coverValues(p.coverId));
      p.dome.step(now, spring.spring, spring.damping);
    }
    // THE RENDER CAP (coverRenderMax): a grid tile's cover is rendered no
    // bigger than the tile was at the old cardWidth, and its 2D copy upscales
    // it into the tile's full-size canvas. The cost of a cover is its pixels;
    // the 480-wide tile was 2.56× them for no more cover.
    const cap = p.capped ? site.coverRenderMax / Math.max(p.pxW, p.pxH) : 1;
    if (cap < 1) {
      p.drawW = Math.max(1, Math.round(p.pxW * cap));
      p.drawH = Math.max(1, Math.round(p.pxH * cap));
    } else {
      p.drawW = p.pxW;
      p.drawH = p.pxH;
    }
    if (!rive && p.dome && p.dome.state.amp !== 0) continue; // drawn for itself below
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
      if (!p.visible || p.coverId !== g.coverId || (p.dome && p.dome.state.amp !== 0)) continue;
      if (p.capped !== g.capped || Math.round((p.pxW / p.pxH) * 100) / 100 !== g.aspect) continue;
      present(p, g.pxW, g.pxH);
    }
  }
  for (const p of presenters) {
    if (!p.visible || !p.dome || p.dome.state.amp === 0 || riveCover(p.coverId)) continue;
    const cover = coverFor(p.coverId);
    if (cover && draw(cover, p.drawW, p.drawH, t, p.dome.state, coverBackdrop(p.coverId) === 'solid' ? null : backdrop)) present(p, p.drawW, p.drawH);
  }

  frames++;
  lastMs = performance.now() - t0;
  raf = requestAnimationFrame(tick);
}

function draw(
  cover: CoverRenderer,
  pxW: number,
  pxH: number,
  t: number,
  dome: { x: number; y: number; amp: number },
  backdrop: [number, number, number] | null,
): boolean {
  if (!renderer || !cover.ready()) return false;
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
  riveCost('copy', performance.now() - t0);
}

/** DEV / verify: the stage's renderer (for benchmarks) and counters. */
export function coverStageProbe() {
  return {
    renderer,
    frames: () => frames,
    lastMs: () => lastMs,
    presenters: () =>
      [...presenters].map((p) => ({
        cover: p.coverId,
        role: p.role,
        visible: p.visible,
        pxW: p.pxW,
        pxH: p.pxH,
        drawW: p.drawW,
        drawH: p.drawH,
        capped: p.capped,
        domed: !!p.dome && p.dome.state.amp !== 0,
      })),
    cover: (id: string) => coverFor(id),
    draw: (id: string, pxW: number, pxH: number, t: number) => {
      const c = coverFor(id);
      return c ? draw(c, pxW, pxH, t, restDome, null) : false;
    },
  };
}
