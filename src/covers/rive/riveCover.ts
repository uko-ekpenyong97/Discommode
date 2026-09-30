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
import { backdropUnder } from '../coverDials';
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
 *         the hero is entered (see `HERO_GRACE_FRAMES`), so the bounce starts from
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
 * A hero player not drawn for this many FRAMES of cover work — and this long —
 * has been left (the detail view closed, the card slid away): it is dropped,
 * and the next hero is a fresh instance, so the bounce starts again. The
 * hand-offs between the hero's surfaces (morph card → DOM face → paper, and
 * back) are the same frame or the next.
 *
 * Frames, not only time: it was 400 ms of wall time, and ONE long frame — the
 * detail view's arrival gives 150–500 ms frames on a loaded machine, more in a
 * dev build — looked like leaving. Five 450 ms frames made five fresh heroes:
 * the bounce kept restarting from rest and the tracking kept dropping, which
 * is a hero that looks dead. Frames are counted by the cover work itself
 * (`riveFrame`: the stage's loop, the paper's), so a stall counts once.
 */
const HERO_GRACE_FRAMES = 30;
const HERO_GRACE_MS = 400;
let frameSerial = 0;
let frameSerialKey = -1;
/** Count this frame (once per frame, whoever calls). */
export function riveFrame(): number {
  const t = document.timeline.currentTime;
  const k = typeof t === 'number' ? t : performance.now();
  if (k !== frameSerialKey) {
    frameSerialKey = k;
    frameSerial++;
  }
  return frameSerial;
}

/**
 * THE ONE-OFF WORK PREFERS A QUIET MOMENT, AND WAITS AT MOST A SECOND FOR ONE.
 * (A quiet moment: no press, key, wheel, touch or drag for `QUIET_MS`, and no
 * animation running. A HOVER is not input here: slides and morphs start from
 * presses, keys and wheels, never from the pointer merely moving, and counting
 * it made every arrival wait the whole deadline — a direct load of #item-04
 * showed the still for 2.1–2.7 s while nothing at all was animating.)
 * Importing card 04's file is one ~60–100 ms main-thread task (Main's scripts
 * and nested artboards; the Editor export without them imported in 8), making
 * the grid's instance 10 ms and a hero's 3–4 (docs/covers.md, "Frame time").
 * Inside a slide or a morph that is a dropped frame — verify:detail's Prev
 * slide caught the import doing exactly that — so it waits for an idle
 * callback with no input for `QUIET_MS` and no animation running.
 *
 * But a person's pointer is always moving, and a moving pointer is input: with
 * a 10 s fallback, run twice in a row (the import, then the grid's instance),
 * card 04 stayed its still for 20.8 s in a real Chrome session with the mouse
 * moving, and every hover in that time went nowhere. So the wait has a
 * DEADLINE, `QUIET_MAX_MS` from the bytes being ready, and the grid's
 * instance is made in the same task as the import, not after a second wait.
 * The cover is live within ~1.1 s of its bytes arriving whatever the pointer
 * is doing; a slide that happens to be running then pays one long frame.
 */
const QUIET_MS = 800;
const QUIET_MAX_MS = 1000;
let lastInput = -Infinity;
const noteInput = () => (lastInput = performance.now());
for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const) {
  window.addEventListener(ev, noteInput, { capture: true, passive: true });
}
// A drag is input (the grid pans under it); a hover is not.
window.addEventListener('pointermove', (e) => e.buttons !== 0 && noteInput(), { capture: true, passive: true });

function whenQuiet(fn: () => void) {
  let done = false;
  const fire = () => {
    if (done) return;
    done = true;
    window.clearTimeout(deadline);
    fn();
  };
  // The deadline has a timer of its own: checked only from idle callbacks
  // (up to 500 ms apart on a busy page) it ran 1.34 s late in a real session.
  const deadline = window.setTimeout(fire, QUIET_MAX_MS);
  const idle: (cb: () => void) => void = window.requestIdleCallback
    ? (cb) => window.requestIdleCallback(cb, { timeout: 500 })
    : (cb) => window.setTimeout(cb, 100);
  const attempt = () => {
    if (done) return;
    const quiet = performance.now() - lastInput > QUIET_MS && !document.getAnimations().some((a) => a.playState === 'running');
    if (quiet) fire();
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

// ── status (dev readout, console) ────────────────────────────────────────
// What a Rive cover is doing, for the COVER panel's readout and the console:
// the file's state, each player's instance and frames, the last pointer event
// an instance received. Written on every change; cheap enough to keep in
// production (a few fields), logged in dev only.

export type RiveFileState = 'not requested' | 'fetching' | 'waiting for idle' | 'importing' | 'loaded' | 'failed';

export interface RivePlayerStatus {
  artboard: string;
  stateMachine: string;
  viewModel: string | null;
  /** State machine advances with dt > 0, and the last dt, s. */
  frames: number;
  lastDt: number;
  instances: number;
  /** When this instance went into use (performance.now). */
  since: number;
}

export interface RivePointerStatus {
  role: RivePlayerRole;
  kind: RivePointerKind;
  x: number;
  y: number;
  t: number;
  n: number;
}

export interface RiveStatus {
  file: RiveFileState;
  error: string;
  /** ms from ensureRive to each state. */
  at: Partial<Record<RiveFileState, number>>;
  players: Partial<Record<RivePlayerRole, RivePlayerStatus>>;
  /** The last pointer event of either instance, and of each. */
  pointer: RivePointerStatus | null;
  pointers: Partial<Record<RivePlayerRole, RivePointerStatus>>;
  /** Which instances are on screen now (the stage's presenters, the paper's
   *  plane), and the last change — the artboard swap is one. */
  showing: string;
  swaps: { from: string; to: string; t: number }[];
  /** The stage's half of `showing`: its visible presenters' roles. */
  dom: { mask: number; roles: string; t: number } | null;
  /** The paper's hero plane for this cover: what it samples, and its uploads. */
  plane: { shows: 'live' | 'still' | 'none'; uploads: number; t: number } | null;
  reducedMotion: boolean;
}

const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
if (import.meta.env.DEV) {
  const say = () =>
    console.info(`[covers] prefers-reduced-motion: ${reducedQuery.matches ? 'reduce — live covers show their stills' : 'no-preference'}`);
  say();
  reducedQuery.addEventListener('change', say);
}
const statuses = new Map<string, RiveStatus & { t0: number }>();

export function riveStatus(id: string): RiveStatus & { t0: number } {
  let st = statuses.get(id);
  if (!st) {
    st = {
      file: 'not requested',
      error: '',
      at: {},
      players: {},
      pointer: null,
      pointers: {},
      showing: '',
      swaps: [],
      dom: null,
      plane: null,
      reducedMotion: reducedQuery.matches,
      t0: performance.now(),
    };
    statuses.set(id, st);
  }
  st.reducedMotion = reducedQuery.matches;
  return st;
}

function log(id: string, msg: string, ...rest: unknown[]) {
  if (import.meta.env.DEV) console.info(`[covers] ${id}: ${msg}`, ...rest);
}

function fileState(id: string, state: RiveFileState, error = '') {
  const st = riveStatus(id);
  if (st.file === 'not requested') st.t0 = performance.now();
  st.file = state;
  st.error = error;
  st.at[state] = Math.round(performance.now() - st.t0);
  log(id, `file ${state} (+${st.at[state]} ms)${error ? ` — ${error}` : ''}`);
}

/** The last pointer event per cover and role, kept while no instance exists to
 *  take it — replayed into the instance when it is made, so a pointer already
 *  resting on the cover is not lost to the load. */
const pendingPointer = new Map<string, { kind: RivePointerKind; u: number; v: number; w: number; h: number }>();

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
  if (!ref) {
    fileState(id, 'failed', 'no cover of kind rive with this id in the manifest');
    return;
  }
  fileState(id, 'fetching');
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
      fileState(id, 'waiting for idle');
      await new Promise<void>((r) => whenQuiet(r));
      fileState(id, 'importing');
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
      entry.file = file;
      // The grid's instance in this same task, not after a second wait and not
      // inside the first frame that draws it.
      const grid = makePlayer(id, 'grid', true);
      if (grid) players.set(`${id}/grid`, grid);
      fileState(id, 'loaded');
      if (grid) {
        grid.status.since = performance.now();
        riveStatus(id).players.grid = grid.status;
        log(id, `grid instance: artboard "${grid.status.artboard}", state machine "${grid.status.stateMachine}", view model ${grid.status.viewModel ?? 'none'}`);
        const pending = pendingPointer.get(`${id}/grid`);
        if (pending) {
          pendingPointer.delete(`${id}/grid`);
          grid.pointer(pending.kind, pending.u, pending.v, pending.w, pending.h);
        }
      }
      for (const l of listeners) l();
      scheduleSpare(id);
    } catch (e) {
      entry.failed = true;
      fileState(id, 'failed', e instanceof Error ? e.message : String(e));
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
  /** The `riveFrame` it was last drawn in. */
  lastFrame = 0;
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
    this.status = {
      artboard: ab.name,
      stateMachine: ref.stateMachine,
      viewModel: vm ? vm.name : null,
      frames: 0,
      lastDt: 0,
      instances: (riveStatus(id).players[role]?.instances ?? 0) + 1,
      since: 0,
    };
  }

  /** What the readout shows for this instance. Bound into the cover's status
   *  when the instance is in use (rivePlayer), not while it is a spare. */
  readonly status: RivePlayerStatus;

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
    this.lastFrame = riveFrame();
    const t0 = performance.now();
    let advanced = false;
    if (t > this.lastT) {
      const dt = this.lastT < 0 ? 0 : Math.min(MAX_STEP_S, t - this.lastT);
      this.lastT = t;
      this.sm.advanceAndApply(dt);
      advanced = true;
      if (dt > 0) {
        this.status.frames++;
        this.status.lastDt = dt;
      }
    }
    // The site's coverBackdrop colour, laid under the artboard only if this
    // cover lets the sky through (card 04 is 'solid': its artboards' own fill).
    const bg = backdropUnder(this.id) ?? '';
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
    notePointer(this.id, this.role, kind, x, y);
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

let pointerLogAt = 0;
let pointerLogN = 0;
function notePointer(id: string, role: RivePlayerRole, kind: RivePointerKind, x: number, y: number) {
  const st = riveStatus(id);
  const now = performance.now();
  const first = !st.pointer || st.pointer.role !== role;
  st.pointer = { role, kind, x: Math.round(x), y: Math.round(y), t: now, n: (st.pointers[role]?.n ?? 0) + 1 };
  st.pointers[role] = st.pointer;
  pointerLogN++;
  if (first || kind !== 'move' || now - pointerLogAt > 2000) {
    log(id, `${role} pointer ${kind} at (${st.pointer.x}, ${st.pointer.y}) in ${role === 'grid' ? 'Main' : 'Main Bounce'}'s space — ${pointerLogN} event(s) since the last line`);
    pointerLogAt = now;
    pointerLogN = 0;
  }
}

/**
 * Which of a cover's instances are on screen: the stage reports its visible
 * presenters' roles every frame it runs, the paper its hero plane; a change is
 * logged — grid → hero is the artboard swap.
 */
const DOM_ROLES = ['grid tiles (Main)', 'morph card (Main)', 'morph card (Main Bounce)', 'hero face, DOM (Main Bounce)'];
export function riveDomRoles(id: string, mask: number) {
  const st = riveStatus(id);
  if (st.dom?.mask !== mask) {
    const roles: string[] = [];
    for (let i = 0; i < DOM_ROLES.length; i++) if (mask & (1 << i)) roles.push(DOM_ROLES[i]);
    st.dom = { mask, roles: roles.join(' + '), t: 0 };
  }
  st.dom!.t = performance.now();
  recomposeShowing(id);
}

const PLANE_TEXT = { live: 'paper plane (Main Bounce)', still: 'paper plane (the still)', none: '' } as const;
/** Composes `showing` from the stage's half and the paper's; strings are
 *  only built when a half changes (this runs every frame). */
const composed = new Map<string, { dom: string; plane: string }>();
function recomposeShowing(id: string) {
  const st = riveStatus(id);
  const now = performance.now();
  const dom = st.dom && now - st.dom.t < 250 ? st.dom.roles : '';
  const plane = st.plane && now - st.plane.t < 250 ? PLANE_TEXT[st.plane.shows] : '';
  let last = composed.get(id);
  if (!last) composed.set(id, (last = { dom: '', plane: '' }));
  if (last.dom === dom && last.plane === plane && st.swaps.length) return;
  last.dom = dom;
  last.plane = plane;
  const showing = dom && plane ? `${dom} + ${plane}` : dom || plane;
  if (st.showing === showing) return;
  const from = st.showing;
  st.showing = showing;
  st.swaps.push({ from, to: showing, t: now });
  if (st.swaps.length > 16) st.swaps.shift();
  log(id, `showing ${from || 'nothing'} → ${showing || 'nothing'}`);
}

/** The paper reports what its hero plane samples for a Rive cover. */
export function rivePlane(id: string, shows: 'live' | 'still' | 'none', uploads: number) {
  const st = riveStatus(id);
  if (!st.plane) st.plane = { shows, uploads, t: 0 };
  st.plane.shows = shows;
  st.plane.uploads = uploads;
  st.plane.t = performance.now();
  recomposeShowing(id);
}

/**
 * A pointer event for a cover's role, at (u, v) across a `w × h` instance box.
 * With no instance yet (the file still loading) the last one is kept and
 * replayed into the instance when it is made.
 */
export function rivePointer(id: string, role: RivePlayerRole, kind: RivePointerKind, u: number, v: number, w: number, h: number) {
  // To the instance on screen, never to a fresh one: asking for the player to
  // hand it an event is not the user coming back. Through `rivePlayer` it was
  // — a hero nobody was drawing (the paper took it for a neighbour at
  // detailSideScale 1) was LEFT, so every pointer move past the grace made a
  // fresh hero, #2, #3, … for as long as the pointer moved. Only a draw makes
  // one now; a move kept here is replayed into it when it is made.
  ensureRive(id);
  const key = `${id}/${role}`;
  const player = players.get(key);
  if (player && !heroLeft(player)) player.pointer(kind, u, v, w, h);
  else if (kind === 'exit') pendingPointer.delete(key);
  else if (kind === 'move') pendingPointer.set(key, { kind, u, v, w, h });
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
 * is a fresh instance when it has not been drawn for `HERO_GRACE_FRAMES`: every
 * entry into the detail view (or slide into the hero slot) starts the bounce.
 */
export function rivePlayer(id: string, role: RivePlayerRole): RivePlayer | null {
  ensureRive(id);
  const key = `${id}/${role}`;
  let p = players.get(key);
  if (p && heroLeft(p)) {
    p.dispose();
    players.delete(key);
    p = undefined;
  }
  if (!p) {
    const spare = role === 'hero' ? spares.get(id) : undefined;
    if (spare) {
      spares.delete(id);
      spare.lastUsed = performance.now();
      spare.lastFrame = riveFrame();
      p = spare;
      scheduleSpare(id);
    } else {
      p = makePlayer(id, role) ?? undefined;
    }
    if (!p) return null;
    players.set(key, p);
    p.status.since = performance.now();
    riveStatus(id).players[role] = p.status;
    log(id, `${role} instance: artboard "${p.status.artboard}", state machine "${p.status.stateMachine}", view model ${p.status.viewModel ?? 'none'} (#${p.status.instances})`);
    const pending = pendingPointer.get(key);
    if (pending) {
      pendingPointer.delete(key);
      p.pointer(pending.kind, pending.u, pending.v, pending.w, pending.h);
    }
  }
  return p;
}

/** A hero player not drawn for the grace (frames AND time) has been left. */
function heroLeft(p: RivePlayer): boolean {
  return p.role === 'hero' && riveFrame() - p.lastFrame > HERO_GRACE_FRAMES && performance.now() - p.lastUsed > HERO_GRACE_MS;
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
    status: (id: string) => {
      const st = riveStatus(id);
      return { ...st, pointer: st.pointer && { ...st.pointer, ageMs: Math.round(performance.now() - st.pointer.t) } };
    },
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
