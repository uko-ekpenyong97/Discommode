import type {
  Artboard,
  File as RiveFile,
  RiveCanvas,
  StateMachineInstance,
  ViewModelInstance,
  WrappedRenderer,
} from '@rive-app/canvas/rive_advanced.mjs';
import wasmUrl from '@rive-app/canvas/rive.wasm?url';
import { CONTENT } from '../../content';
import { coverCropOf } from '../coverRenderer';
import { siteCoverDials } from '../coverDials';
import { riveCover } from '../covers';
import type { Crop, RiveCoverRef } from '../types';

/**
 * RIVE COVERS — card 04's cover is a .riv, not a shader (docs/covers.md,
 * "Rive covers"). This module holds everything Rive: the runtime and the file,
 * each loaded ONCE, and one PLAYER per artboard role:
 *
 *   grid  the manifest's `artboard.grid` ("Main"): every grid tile of the card
 *         and the grid→detail morph card. ONE instance for all of them, drawn
 *         once per frame into its canvas and copied into each tile by the cover
 *         stage (coverStage.ts), exactly as card 02's shared draw is.
 *   hero  `artboard.detail` ("Main Bounce"): the detail hero. The DOM hero face
 *         (a stage presenter) and the paper plane (DetailPaperLayer, a
 *         CanvasTexture of this player's canvas) both show THIS instance, so
 *         the DOM → paper hand-off is one picture. A fresh instance each time
 *         the hero is entered (see `HERO_GRACE_MS`), so the bounce starts from
 *         the layout the grid shows.
 *
 * The runtime is @rive-app/canvas (Canvas 2D): it adds no WebGL context. The
 * low-level API, not the `Rive` class, because the cover draws on the SHARED
 * cover clock into canvases it owns, once per frame for however many instances
 * show it — the `Rive` class runs its own rAF loop into one DOM canvas. The
 * one thing the `Rive` class did for us is `autoBind`: here that is binding
 * each state machine to its artboard's default view model instance (and the
 * globals', if any) — without it the view-model-driven behaviour (the
 * pointer-follow, the headset's colour, Main Bounce's physics) never runs.
 *
 * A player advances by the cover clock's delta since its last draw (capped:
 * a player nobody drew for a while resumes, it does not fast-forward), so a
 * pinned clock holds it still and reduced motion never gets here (the tiles
 * and the paper show the still, and nothing loads the runtime).
 */

export type { RivePlayerRole } from './swap';
import type { RivePlayerRole } from './swap';
export type RivePointerKind = 'move' | 'down' | 'up' | 'exit';

/** A player's step is capped at this: a hidden grid resumes, not replays. */
const MAX_STEP_S = 0.1;

/**
 * A hero player not drawn for this long is dropped, and the next hero is a
 * fresh instance of the artboard — the bounce starts again. Long enough that
 * the hand-offs between the hero's surfaces (morph card → DOM face → paper,
 * and back) never drop it: each is the same frame or the next.
 */
const HERO_GRACE_MS = 400;

/**
 * THE ONE-OFF WORK WAITS FOR A QUIET MOMENT. Importing card 04's file is one
 * ~60–100 ms main-thread task (Main's scripts and nested artboards; the Editor
 * export without them imported in 8), making the grid's instance 10 ms and a
 * hero's 3–4 (docs/covers.md, "Frame time"). Any of them inside a slide, a
 * morph or a drag is a dropped frame — verify:detail's Prev slide caught the
 * import doing exactly that. So each waits for an idle callback with no input
 * for `QUIET_MS` and no animation running, and runs anyway after `QUIET_MAX_MS`.
 * Until then the tiles show the still, as they do before any first frame.
 */
const QUIET_MS = 1200;
const QUIET_MAX_MS = 10_000;
let lastInput = -Infinity;
for (const ev of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const) {
  window.addEventListener(ev, () => (lastInput = performance.now()), { capture: true, passive: true });
}

function whenQuiet(fn: () => void) {
  const since = performance.now();
  const idle: (cb: () => void) => void = window.requestIdleCallback
    ? (cb) => window.requestIdleCallback(cb, { timeout: 500 })
    : (cb) => window.setTimeout(cb, 100);
  const attempt = () => {
    const now = performance.now();
    const quiet = now - lastInput > QUIET_MS && !document.getAnimations().some((a) => a.playState === 'running');
    if (quiet || now - since > QUIET_MAX_MS) fn();
    else idle(attempt);
  };
  idle(attempt);
}

let runtime: RiveCanvas | null = null;
let runtimeLoad: Promise<RiveCanvas | null> | null = null;
const files = new Map<string, { file: RiveFile | null; failed: boolean; load: Promise<void> }>();
const players = new Map<string, RivePlayer>();
/** A fresh hero instance per cover, made ahead (it is a few ms of work), so the
 *  swap itself never pays for one. */
const spares = new Map<string, RivePlayer>();
const listeners = new Set<() => void>();
/** DEV / verify: main-thread ms of the one-off work — the file's import, and
 *  each instance made (the grid's, each hero). */
const oneOff = { importMs: 0, instances: [] as { role: RivePlayerRole; ms: number; idle: boolean }[] };

/** The manifest's ref for a Rive cover id. */
export function riveRef(id: string): RiveCoverRef | undefined {
  for (const item of CONTENT) if (item.cover?.kind === 'rive' && item.cover.id === id) return item.cover;
  return undefined;
}

/** False once the runtime or the cover's file has failed to load: show the still. */
export function riveAvailable(id: string): boolean {
  return !files.get(id)?.failed;
}

/** Called when a file has loaded (the stage kicks its loop). */
export function onRiveReady(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * NO WEBGL CONTEXT FOR THE RUNTIME. @rive-app/canvas draws with Canvas 2D, but
 * its init also opens a WebGL context of its own, unconditionally, kept for
 * IMAGE MESHES (vertex-deformed images) — one more context on every page that
 * loads it. Card 04's file draws none (its one image is a hidden reference
 * screenshot), and with that context withheld its frames are byte-identical
 * (both artboards, 150 frames, a pointer; docs/covers.md). So while the
 * runtime initialises, a request for a context with Emscripten's own
 * `renderViaOffscreenBackBuffer` attribute — the runtime's, and nothing else
 * on the site asks for one — gets null; the runtime logs "Image mesh will not
 * be drawn" and carries on. A .riv that deforms images would need this lifted
 * (and would cost that context back).
 *
 * Decoding an IMAGE asset retries that context (on the image's load), so the
 * file is imported with an asset loader that declines images: card 04's four
 * are reference screenshots its artboards never show (one is placed, hidden),
 * and they are 521 KB of its 872 KB. An artboard that SHOWS an image would draw
 * nothing where it is until this is lifted too.
 */
function withoutMeshContext<T>(run: () => Promise<T>): Promise<T> {
  const proto = HTMLCanvasElement.prototype;
  const getContext = proto.getContext;
  proto.getContext = function (this: HTMLCanvasElement, type: string, attrs?: unknown) {
    if (/webgl/.test(type) && attrs && typeof attrs === 'object' && 'renderViaOffscreenBackBuffer' in attrs) return null;
    return (getContext as (type: string, attrs?: unknown) => RenderingContext | null).call(this, type, attrs);
  } as typeof getContext;
  return run().finally(() => {
    proto.getContext = getContext;
  });
}

async function loadRuntime(): Promise<RiveCanvas | null> {
  runtimeLoad ??= (async () => {
    try {
      const { RuntimeLoader } = await import('@rive-app/canvas');
      // The bundled wasm, not the CDN's. The portfolio's Rive blocks share this
      // loader; whichever asks first sets where it comes from.
      RuntimeLoader.setWasmUrl(wasmUrl);
      runtime = await withoutMeshContext(() => RuntimeLoader.awaitInstance());
      return runtime;
    } catch {
      return null;
    }
  })();
  return runtimeLoad;
}

/** Start loading a cover's runtime and file (once). */
export function ensureRive(id: string) {
  if (files.has(id)) return;
  const ref = riveRef(id);
  const entry: { file: RiveFile | null; failed: boolean; load: Promise<void> } = {
    file: null,
    failed: !ref,
    load: Promise.resolve(),
  };
  files.set(id, entry);
  if (!ref) return;
  entry.load = (async () => {
    try {
      const [rt, bytes] = await Promise.all([
        loadRuntime(),
        fetch(ref.src).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status))))),
      ]);
      if (!rt) throw new Error('no Rive runtime');
      const buf = new Uint8Array(bytes);
      // The dev server answers a missing file with index.html: a .riv starts "RIVE".
      if (buf[0] !== 0x52 || buf[1] !== 0x49 || buf[2] !== 0x56 || buf[3] !== 0x45) throw new Error(`${ref.src} is not a .riv`);
      await new Promise<void>((r) => whenQuiet(r));
      const t0 = performance.now();
      const skipped: string[] = [];
      const images = new rt.CustomFileAssetLoader({
        loadContents: (asset: { isImage: boolean; name: string }) => {
          if (!asset.isImage) return false; // the runtime's own handling (scripts)
          skipped.push(asset.name);
          return true;
        },
      });
      const file = await rt.load(buf, images, false);
      if (import.meta.env.DEV && skipped.length) {
        console.info(`[covers] ${id}: ${skipped.length} image asset(s) not decoded (none is shown): ${skipped.join(', ')}`);
      }
      oneOff.importMs = performance.now() - t0;
      if (import.meta.env.DEV) whenQuiet(() => introspect(id, rt, file, ref));
      await new Promise<void>((r) => whenQuiet(r));
      entry.file = file;
      // The grid's instance now, not inside the first frame that draws it.
      const grid = makePlayer(id, 'grid', true);
      if (grid) players.set(`${id}/grid`, grid);
      for (const l of listeners) l();
      scheduleSpare(id);
    } catch (e) {
      entry.failed = true;
      console.warn(`[covers] ${id}: the Rive cover could not load; its still stands in.`, e);
      for (const l of listeners) l();
    }
  })();
}

/** DEV: what the file holds — the first thing to read when a cover does not react. */
function introspect(id: string, rt: RiveCanvas, file: RiveFile, ref: RiveCoverRef) {
  const artboards = [];
  for (let i = 0; i < file.artboardCount(); i++) {
    const ab = file.artboardByIndex(i);
    const sms = [];
    for (let j = 0; j < ab.stateMachineCount(); j++) {
      const smi = new rt.StateMachineInstance(ab.stateMachineByIndex(j), ab);
      const inputs = [];
      for (let k = 0; k < smi.inputCount(); k++) inputs.push(smi.input(k).name);
      sms.push({ name: smi.name, inputs, listeners: rt.hasListeners(smi) });
      smi.delete();
    }
    const vm = file.defaultArtboardViewModel(ab);
    artboards.push({ name: ab.name, w: ab.width, h: ab.height, stateMachines: sms, viewModel: vm ? vm.name : null });
    ab.delete();
  }
  const viewModels = [];
  for (let i = 0; i < file.viewModelCount(); i++) {
    const vm = file.viewModelByIndex(i);
    viewModels.push({ name: vm.name, properties: vm.getProperties().map((p) => `${p.name}: ${p.type}`) });
  }
  const names = artboards.map((a) => a.name);
  const missing = [ref.artboard.grid, ref.artboard.detail].filter((n) => !names.includes(n));
  console.info(`[covers] ${id} (${ref.src})`, { artboards, viewModels, globals: file.globalViewModelNames() });
  if (missing.length) {
    console.warn(
      `[covers] ${id}: ${missing.join(', ')} not in the file (docs/covers.md, "The .riv": the Editor's export of this file left its scripted artboards out; the CLI's signed build has them).`,
    );
  }
}

/**
 * One instance of one artboard, its state machine and its view model, drawing
 * into its own 2D canvas.
 */
export class RivePlayer {
  readonly id: string;
  readonly role: RivePlayerRole;
  readonly canvas = document.createElement('canvas');
  /** The last draw's size: its top-left `pxW × pxH` of `canvas`. */
  pxW = 0;
  pxH = 0;
  /** Bumped whenever the canvas holds a new picture. */
  version = 0;
  /** Main-thread ms of this player's last advance + draw. */
  lastMs = 0;
  lastUsed = performance.now();
  private readonly rt: RiveCanvas;
  private readonly artboard: Artboard;
  private readonly sm: StateMachineInstance;
  private readonly vmi: ViewModelInstance | null;
  private readonly renderer: WrappedRenderer;
  private readonly frame = { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  private readonly crop: Crop = { x0: 0, y0: 0, w: 1, h: 1 };
  private lastT = -1;
  private drawnT = -1;
  /** The backdrop the canvas was last drawn over ('' = none, the sky). */
  private drawnBg = '';
  private exact: boolean;
  private disposed = false;

  constructor(rt: RiveCanvas, file: RiveFile, id: string, ref: RiveCoverRef, role: RivePlayerRole) {
    this.rt = rt;
    this.id = id;
    this.role = role;
    // The hero's canvas IS the paper plane's texture, which has to be its exact
    // size; the grid's grows only (the focused tile scales every frame of its
    // tween) and draws into its top-left.
    this.exact = role === 'hero';
    const name = role === 'grid' ? ref.artboard.grid : ref.artboard.detail;
    const ab = file.artboardByName(name);
    if (!ab) throw new Error(`no artboard "${name}"`);
    this.artboard = ab;
    this.sm = new rt.StateMachineInstance(ab.stateMachineByName(ref.stateMachine), ab);
    // autoBind: the artboard's default view model instance, and the globals'.
    const vm = file.defaultArtboardViewModel(ab);
    this.vmi = vm ? vm.defaultInstance() : null;
    if (this.vmi) this.sm.bindViewModelInstance(this.vmi);
    for (const g of file.globalViewModelNames()) {
      const inst = file.viewModelByName(g)?.defaultInstance();
      if (inst) this.sm.setGlobalViewModelInstance(g, inst);
    }
    this.sm.bind();
    this.sm.advanceAndApply(0);
    this.canvas.width = this.canvas.height = 1;
    this.renderer = rt.makeRenderer(this.canvas);
  }

  /**
   * Advance to cover time `t` and draw at `pxW × pxH` (an `object-fit: cover`
   * crop of the artboard). Called by every surface that shows this player, in
   * any order, any number of times a frame: the clock only moves forward, and a
   * second call for the same moment and size draws nothing. Returns the
   * main-thread ms THIS call spent (0 when it had nothing to do).
   */
  draw(t: number, pxW: number, pxH: number): number {
    if (this.disposed) return 0;
    this.lastUsed = performance.now();
    const t0 = performance.now();
    let advanced = false;
    if (t > this.lastT) {
      const dt = this.lastT < 0 ? 0 : Math.min(MAX_STEP_S, t - this.lastT);
      this.lastT = t;
      this.sm.advanceAndApply(dt);
      advanced = true;
    }
    // coverBackdrop (a site dial, as for card 02): 'sky' draws nothing behind
    // the artboard; 'solid' lays its colour under it.
    const site = siteCoverDials();
    const bg = site.coverBackdrop === 'solid' ? site.coverBackdropColor : '';
    const resized = this.size(pxW, pxH) || bg !== this.drawnBg;
    this.drawnBg = bg;
    if (!resized && this.drawnT === this.lastT) return 0;
    if (!resized && advanced && !this.artboard.didChange() && this.version > 0) {
      this.drawnT = this.lastT;
      this.lastMs = performance.now() - t0;
      return this.lastMs;
    }
    const r = this.renderer;
    r.clear();
    r.save();
    this.frame.maxX = pxW;
    this.frame.maxY = pxH;
    r.align(this.rt.Fit.cover, this.rt.Alignment.center, this.frame, this.artboard.bounds);
    this.artboard.draw(r);
    r.restore();
    r.flush();
    this.rt.resolveAnimationFrame();
    if (bg) {
      // Under the drawing, not before it: the renderer's clear lands at flush.
      const ctx = this.canvas.getContext('2d')!;
      ctx.save();
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, pxW, pxH);
      ctx.restore();
    }
    this.drawnT = this.lastT;
    this.version++;
    this.lastMs = performance.now() - t0;
    return this.lastMs;
  }

  private size(pxW: number, pxH: number): boolean {
    const c = this.canvas;
    const changed = pxW !== this.pxW || pxH !== this.pxH;
    this.pxW = pxW;
    this.pxH = pxH;
    if (this.exact ? c.width !== pxW || c.height !== pxH : pxW > c.width || pxH > c.height) {
      c.width = this.exact ? pxW : Math.max(c.width, pxW);
      c.height = this.exact ? pxH : Math.max(c.height, pxH);
    }
    return changed;
  }

  /** A pointer event at (u, v) across a `w × h` instance box (0..1 each). */
  pointer(kind: RivePointerKind, u: number, v: number, w: number, h: number) {
    if (this.disposed) return;
    const b = this.artboard.bounds;
    coverCropOf(b.maxX - b.minX, b.maxY - b.minY, w, h, this.crop);
    const x = b.minX + this.crop.x0 + u * this.crop.w;
    const y = b.minY + this.crop.y0 + v * this.crop.h;
    if (kind === 'move') this.sm.pointerMove(x, y, 0);
    else if (kind === 'down') this.sm.pointerDown(x, y, 0);
    else if (kind === 'up') this.sm.pointerUp(x, y, 0);
    else this.sm.pointerExit(x, y, 0);
  }

  /** DEV / verify: the bound view model's values, flattened (`nosey/lookX`…). */
  viewModel(): Record<string, number | boolean | string> {
    const out: Record<string, number | boolean | string> = {};
    const walk = (vmi: ViewModelInstance, prefix: string, depth: number) => {
      for (const p of vmi.getProperties()) {
        const key = prefix + p.name;
        if (p.type === 'number') out[key] = vmi.number(p.name).value;
        else if (p.type === 'boolean') out[key] = vmi.boolean(p.name).value;
        else if (p.type === 'string') out[key] = vmi.string(p.name).value;
        else if (p.type === 'viewModel' && depth < 3) {
          const child = vmi.viewModel(p.name);
          if (child) walk(child, `${key}/`, depth + 1);
        }
      }
    };
    if (this.vmi) walk(this.vmi, '', 0);
    return out;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.renderer.delete();
    this.sm.delete();
    this.artboard.delete();
    this.canvas.width = this.canvas.height = 0;
  }
}

function makePlayer(id: string, role: RivePlayerRole, idle = false): RivePlayer | null {
  const f = files.get(id);
  const ref = riveRef(id);
  if (!runtime || !f?.file || !ref) return null;
  try {
    const t0 = performance.now();
    const p = new RivePlayer(runtime, f.file, id, ref, role);
    oneOff.instances.push({ role, ms: performance.now() - t0, idle });
    return p;
  } catch (e) {
    f.failed = true;
    console.warn(`[covers] ${id}: no ${role} player —`, e);
    return null;
  }
}

function scheduleSpare(id: string) {
  if (spares.has(id)) return;
  whenQuiet(() => {
    if (spares.has(id)) return;
    const p = makePlayer(id, 'hero', true);
    if (p) spares.set(id, p);
  });
}

/**
 * The player for a cover's role, or null until its file has loaded. The hero
 * is a fresh instance when it has not been drawn for `HERO_GRACE_MS`: every
 * entry into the detail view (or slide into the hero slot) starts the bounce.
 */
export function rivePlayer(id: string, role: RivePlayerRole): RivePlayer | null {
  ensureRive(id);
  const key = `${id}/${role}`;
  let p = players.get(key);
  if (p && role === 'hero' && performance.now() - p.lastUsed > HERO_GRACE_MS) {
    p.dispose();
    players.delete(key);
    p = undefined;
  }
  if (!p) {
    const spare = role === 'hero' ? spares.get(id) : undefined;
    if (spare) {
      spares.delete(id);
      spare.lastUsed = performance.now();
      p = spare;
      scheduleSpare(id);
    } else {
      p = makePlayer(id, role) ?? undefined;
    }
    if (!p) return null;
    players.set(key, p);
  }
  return p;
}

/** The player a role would draw with right now, without creating one. */
export function peekRivePlayer(id: string, role: RivePlayerRole): RivePlayer | null {
  return players.get(`${id}/${role}`) ?? null;
}

// ── cost, per frame ──────────────────────────────────────────────────────
// Every piece of main-thread work a Rive cover does in a frame — each player's
// advance + draw, each tile's copy, the paper's texture upload — is added to
// the frame's bucket (keyed by the frame's time), for verify:cover's budget.

const COST_FRAMES = 240;
const cost = { key: -1, ms: 0, parts: { draw: 0, copy: 0, upload: 0 } };
const history: { ms: number; draw: number; copy: number; upload: number }[] = [];

function frameKey(): number {
  const t = document.timeline.currentTime;
  return typeof t === 'number' ? t : performance.now();
}

export function riveCost(part: 'draw' | 'copy' | 'upload', ms: number) {
  const k = frameKey();
  if (k !== cost.key) {
    if (cost.key >= 0) {
      history.push({ ms: cost.ms, ...cost.parts });
      if (history.length > COST_FRAMES) history.shift();
    }
    cost.key = k;
    cost.ms = 0;
    cost.parts.draw = cost.parts.copy = cost.parts.upload = 0;
  }
  cost.ms += ms;
  cost.parts[part] += ms;
}

/** DEV / verify: the per-frame totals of the last frames, and the players. */
export function riveProbe() {
  return {
    ready: (id: string) => !!files.get(id)?.file,
    failed: (id: string) => !!files.get(id)?.failed,
    costs: () => history.slice(),
    clearCosts: () => {
      history.length = 0;
    },
    players: () =>
      [...players.values()].map((p) => ({ id: p.id, role: p.role, pxW: p.pxW, pxH: p.pxH, version: p.version, lastMs: p.lastMs })),
    player: (id: string, role: RivePlayerRole) => peekRivePlayer(id, role),
    viewModel: (id: string, role: RivePlayerRole) => peekRivePlayer(id, role)?.viewModel() ?? null,
    /** Drop both players (and the spare): the next draw of each is a fresh
     *  instance at its artboard's start. */
    reset: (id: string) => {
      for (const role of ['grid', 'hero'] as const) {
        players.get(`${id}/${role}`)?.dispose();
        players.delete(`${id}/${role}`);
      }
    },
    def: (id: string) => riveCover(id),
    /** The one-off costs: the file's import, each instance made. */
    oneOff: () => ({ importMs: oneOff.importMs, instances: oneOff.instances.slice() }),
    /** Main-thread ms per draw of a THROWAWAY instance of `role` at `w × h`,
     *  `n` frames of 1/60 s, its pointer circling — the live ones untouched. */
    bench: (id: string, role: RivePlayerRole, w: number, h: number, n = 120) => {
      const p = makePlayer(id, role);
      if (!p) return null;
      p.draw(0, w, h);
      const t0 = performance.now();
      for (let i = 1; i <= n; i++) {
        const a = (i / n) * Math.PI * 4;
        p.pointer('move', 0.5 + 0.4 * Math.cos(a), 0.5 + 0.4 * Math.sin(a), w, h);
        p.draw(i / 60, w, h);
      }
      const ms = (performance.now() - t0) / n;
      p.dispose();
      oneOff.instances.pop();
      return ms;
    },
  };
}
