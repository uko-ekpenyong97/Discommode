import { WebGLRenderer } from 'three';
import { CoverRenderer, coverCropOf } from './coverRenderer';
import { COVERS } from './covers';
import { coverTime } from './coverClock';
import { coverDialsVersion, coverValues, siteCoverDials, subscribeCoverDials } from './coverDials';
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
 *      by coverMaxDpr), per aspect (tiles are 3:4, the hero 10:13);
 *   2. each instance with its own dome up (the hovered tile, the hero) is
 *      drawn once more, for itself;
 *   3. each draw is copied, in this same task, into the instances' own 2D
 *      canvases with drawImage — so no preserveDrawingBuffer: the buffer is
 *      read before the frame it was drawn for is presented.
 *
 * The 2D canvases are DOM over the SkyLayer, so they composite over the sky
 * with their alpha and nothing else. Nothing renders while no instance is on
 * screen; the loop stops and restarts itself. No per-frame allocation.
 */

export interface Presenter {
  coverId: string;
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
  pxW: number;
  pxH: number;
  drawn: boolean;
}

interface Group {
  coverId: string;
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
    const def = COVERS[id];
    if (!def) return null;
    c = new CoverRenderer(renderer, def, coverValues(id));
    c.warm();
    covers.set(id, c);
  }
  return c ?? null;
}

subscribeCoverDials(() => kick());

if (import.meta.env.DEV) void import('./devHooks').then((m) => m.installCoverDevHooks());

export function addPresenter(p: Presenter): () => void {
  if (!coverStageAvailable()) return () => {};
  p.ctx = p.canvas.getContext('2d');
  presenters.add(p);
  io.observe(p.host);
  coverFor(p.coverId);
  kick();
  return () => {
    presenters.delete(p);
    io.unobserve(p.host);
  };
}

function kick() {
  if (running || failed) return;
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
  if (document.hidden || !renderer) {
    running = false;
    return;
  }
  const t0 = performance.now();
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
    onScreen = true;
    // (checkVisibility: Safari 17.4+; without it, CSS-hidden instances draw too)
    if (p.host.checkVisibility && !p.host.checkVisibility({ visibilityProperty: true })) continue;
    if (p.drawn && p.host.closest(HOLD)) continue;
    const r = p.host.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    p.visible = true;
    any = true;
    p.pxW = Math.max(1, Math.round(r.width * dpr));
    p.pxH = Math.max(1, Math.round(r.height * dpr));
    if (p.dome) {
      const spring = COVERS[p.coverId].domeSpring(coverValues(p.coverId));
      p.dome.step(now, spring.spring, spring.damping);
    }
    if (p.dome && p.dome.state.amp !== 0) continue; // drawn for itself below
    const aspect = Math.round((p.pxW / p.pxH) * 100) / 100;
    let g: Group | undefined;
    for (let i = 0; i < nGroups; i++) if (groups[i].coverId === p.coverId && groups[i].aspect === aspect) g = groups[i];
    if (!g) {
      if (nGroups === groups.length) groups.push({ coverId: '', aspect: 0, pxW: 0, pxH: 0, n: 0 });
      g = groups[nGroups++];
      g.coverId = p.coverId;
      g.aspect = aspect;
      g.pxW = g.pxH = g.n = 0;
    }
    if (p.pxW > g.pxW) {
      g.pxW = p.pxW;
      g.pxH = p.pxH;
    }
    g.n++;
  }
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
    const cover = coverFor(g.coverId);
    if (!cover || !draw(cover, g.pxW, g.pxH, t, restDome, backdrop)) continue;
    for (const p of presenters) {
      if (!p.visible || p.coverId !== g.coverId || (p.dome && p.dome.state.amp !== 0)) continue;
      if (Math.round((p.pxW / p.pxH) * 100) / 100 !== g.aspect) continue;
      present(p, g.pxW, g.pxH);
    }
  }
  for (const p of presenters) {
    if (!p.visible || !p.dome || p.dome.state.amp === 0) continue;
    const cover = coverFor(p.coverId);
    if (cover && draw(cover, p.pxW, p.pxH, t, p.dome.state, backdrop)) present(p, p.pxW, p.pxH);
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
  const ctx = p.ctx;
  if (!ctx || !renderer) return;
  if (p.canvas.width !== p.pxW || p.canvas.height !== p.pxH) {
    p.canvas.width = p.pxW;
    p.canvas.height = p.pxH;
  }
  ctx.clearRect(0, 0, p.pxW, p.pxH);
  // The draw sits at the framebuffer's bottom-left; in image rows that is the
  // last pxH rows.
  ctx.drawImage(renderer.domElement, 0, stageH - pxH, pxW, pxH, 0, 0, p.pxW, p.pxH);
  if (!p.drawn) {
    p.drawn = true;
    p.onDrawn();
  }
}

/** DEV / verify: the stage's renderer (for benchmarks) and counters. */
export function coverStageProbe() {
  return {
    renderer,
    frames: () => frames,
    lastMs: () => lastMs,
    presenters: () =>
      [...presenters].map((p) => ({ cover: p.coverId, visible: p.visible, pxW: p.pxW, pxH: p.pxH, domed: !!p.dome && p.dome.state.amp !== 0 })),
    cover: (id: string) => coverFor(id),
    draw: (id: string, pxW: number, pxH: number, t: number) => {
      const c = coverFor(id);
      return c ? draw(c, pxW, pxH, t, restDome, null) : false;
    },
  };
}
