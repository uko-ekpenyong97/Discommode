import type {
  Artboard,
  File as RiveFile,
  RiveCanvas,
  StateMachineInstance,
  ViewModelInstance,
  ViewModelInstanceBoolean,
  WrappedRenderer,
} from '@rive-app/canvas/rive_advanced.mjs';
import wasmUrl from '@rive-app/canvas/rive.wasm?url';
import { CONTENT } from '../../content';
import { coverCropOf } from '../coverRenderer';
import { backdropUnder } from '../coverDials';
import { riveCover } from '../covers';
import type { Crop, RiveCoverRef } from '../types';
import { coverFault as riveFault } from '../faults';

/**
 * RIVE COVERS — card 04's cover is a .riv, not a shader (docs/covers.md,
 * "Rive covers"). This module holds everything Rive: the runtime and the file,
 * each loaded ONCE, and ONE INSTANCE per cover — its artboard, state machine
 * and view model — for the page's life.
 *
 * One instance, because card 04's face is a running loop: a fresh instance
 * starts from the top of it, so a grid tile, a side card and a centre card of
 * separate instances would each jump to another moment of the loop as the card
 * changed role. So every surface that shows the cover shows this instance:
 * the grid's tiles, the morph card, the detail view's side card and centre
 * card (the DOM faces, copied by the cover stage), and the paper's plane (a
 * CanvasTexture of the instance's own exact-size canvas). Nothing ever makes a
 * second one; while nothing shows the cover it simply is not advanced, and it
 * resumes where it was.
 *
 * What changes with the card's role is one view-model boolean, the ref's
 * `focusInput` ("focused"): true while the card is the detail view's centre
 * card (`riveFocus`, driven by src/covers/focus.ts). The file does the rest —
 * the face finishes its clip, plays its error, shrinks, and the characters
 * burst out; false cuts back to the top of the loop.
 *
 * The runtime is @rive-app/canvas (Canvas 2D): it adds no WebGL context. The
 * low-level API, not the `Rive` class, because the cover draws on the SHARED
 * cover clock into canvases it owns, once per frame for however many surfaces
 * show it — the `Rive` class runs its own rAF loop into one DOM canvas. The
 * one thing the `Rive` class did for us is `autoBind`: here that is binding
 * the state machine to its artboard's default view model instance (and the
 * globals', if any) — without it nothing view-model-driven runs.
 *
 * The instance advances by the cover clock's delta since its last advance
 * (capped: an instance nobody drew for a while resumes, it does not
 * fast-forward), so a pinned clock holds it still and reduced motion never
 * gets here (the tiles and the paper show the still, and nothing loads the
 * runtime).
 */

export type RivePointerKind = 'move' | 'down' | 'up' | 'exit';
/** Where a pointer event came from: a grid tile's card, or the centre panel. */
export type RivePointerFrom = 'tile' | 'centre';
/** The instance's two canvases: the cover stage's (grow-only; it copies from
 *  its top-left into every DOM surface) and the paper plane's (its texture, so
 *  exactly its size). */
export type RiveSurfaceKind = 'stage' | 'plane';

/** An instance's step is capped at this: a hidden grid resumes, not replays. */
const MAX_STEP_S = 0.1;

/**
 * THE ONE-OFF WORK PREFERS A QUIET MOMENT, AND WAITS AT MOST A SECOND FOR ONE.
 * (A quiet moment: no press, key, wheel, touch or drag for `QUIET_MS`, and no
 * animation running. A HOVER is not input here: slides and morphs start from
 * presses, keys and wheels, never from the pointer merely moving, and counting
 * it made every arrival wait the whole deadline — a direct load of #item-04
 * showed the still for 2.1–2.7 s while nothing at all was animating.)
 * Importing card 04's file is one ~60–100 ms main-thread task (its scripts and
 * nested artboards), making the instance ~10 ms (docs/covers.md, "Frame
 * time"). Inside a slide or a morph that is a dropped frame — verify:detail's
 * Prev slide caught the import doing exactly that — so it waits for an idle
 * callback with no input for `QUIET_MS` and no animation running.
 *
 * But a person's pointer is always moving, and a moving pointer is input: with
 * a 10 s fallback, run twice in a row (the import, then an instance), card 04
 * stayed its still for 20.8 s in a real Chrome session with the mouse moving,
 * and every hover in that time went nowhere. So the wait has a DEADLINE,
 * `QUIET_MAX_MS` from the bytes being ready, and the instance is made in the
 * same task as the import, not after a second wait. The cover is live within
 * ~1.1 s of its bytes arriving whatever the pointer is doing; a slide that
 * happens to be running then pays one long frame.
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
const instances = new Map<string, RiveInstance>();
const listeners = new Set<() => void>();
/** The focus each cover's instance should have, set before or after it exists:
 *  an instance is made with it, before its first advance (a deep link to
 *  #item-04 goes straight to the error and the burst). */
const wantFocus = new Map<string, boolean>();
/** DEV / verify: main-thread ms of the one-off work — the file's import, and
 *  each instance made. */
const oneOff = { importMs: 0, instances: [] as { ms: number; idle: boolean }[] };

// ── status (dev readout, console) ────────────────────────────────────────
// What a Rive cover is doing, for the COVER panel's readout and the console:
// the file's state, the instance, its focus, what shows it, the last pointer
// event. Written on every change; cheap enough to keep in production (a few
// fields), logged in dev only.

export type RiveFileState = 'not requested' | 'fetching' | 'waiting for idle' | 'importing' | 'loaded' | 'failed';

export interface RiveInstanceStatus {
  artboard: string;
  stateMachine: string;
  viewModel: string | null;
  /** State machine advances with dt > 0, and the last dt, s. */
  frames: number;
  lastDt: number;
  /** Seconds of cover time this instance has advanced: its own clock. */
  clock: number;
  /** Which instance this is (counts from 1 for the page's life). */
  instances: number;
  /** When this instance was made (performance.now). */
  since: number;
  /** Its focus input as set now (false when it has none). */
  focused: boolean;
  /** `clock` when focus last turned true, or -1. */
  focusedAt: number;
}

export interface RivePointerStatus {
  from: RivePointerFrom;
  kind: RivePointerKind;
  x: number;
  y: number;
  t: number;
  n: number;
}

export type RivePlaneShows = 'live' | 'still' | 'none';

export interface RiveStatus {
  file: RiveFileState;
  error: string;
  /** ms from ensureRive to each state. */
  at: Partial<Record<RiveFileState, number>>;
  instance: RiveInstanceStatus | null;
  /** The last pointer event from either source, and from each. */
  pointer: RivePointerStatus | null;
  pointers: Partial<Record<RivePointerFrom, RivePointerStatus>>;
  /** What shows the instance now (the stage's DOM surfaces, the paper's
   *  plane), and its last changes. */
  showing: string;
  swaps: { from: string; to: string; t: number }[];
  /** The stage's half of `showing`: its visible surfaces, as a mask. */
  dom: { mask: number; roles: string; t: number } | null;
  /** The paper's plane for this cover: what it samples, for which slot, and
   *  its uploads. */
  plane: { shows: RivePlaneShows; slot: 'centre' | 'side'; uploads: number; t: number } | null;
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
      instance: null,
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

/** The last pointer event per cover, kept while no instance exists to take it
 *  — replayed into the instance when it is made, so a pointer already resting
 *  on the cover is not lost to the load. */
const pendingPointer = new Map<string, { from: RivePointerFrom; kind: RivePointerKind; u: number; v: number; w: number; h: number }>();

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
 * loads it. Card 04's file draws none, and with that context withheld its
 * frames are byte-identical (docs/covers.md). So while the runtime
 * initialises, a request for a context with Emscripten's own
 * `renderViaOffscreenBackBuffer` attribute — the runtime's, and nothing else
 * on the site asks for one — gets null; the runtime logs "Image mesh will not
 * be drawn" and carries on. A .riv that deforms images would need this lifted
 * (and would cost that context back).
 *
 * Decoding an IMAGE asset retries that context (on the image's load), so the
 * file is imported with an asset loader that declines images: card 04's are
 * reference screenshots its artboards never show. An artboard that SHOWS an
 * image would draw nothing where it is until this is lifted too.
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
      // The instance in this same task, not after a second wait and not inside
      // the first frame that draws it.
      const inst = makeInstance(id, true);
      fileState(id, 'loaded');
      if (inst) adopt(id, inst);
      for (const l of listeners) l();
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
      sms.push({ name: ab.stateMachineByIndex(j).name, inputs, listeners: rt.hasListeners(smi) });
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
  console.info(`[covers] ${id} (${ref.src})`, { artboards, viewModels, globals: file.globalViewModelNames() });
  const shown = artboards.find((a) => a.name === ref.artboard);
  if (!shown) {
    console.warn(
      `[covers] ${id}: artboard "${ref.artboard}" is not in the file (docs/covers.md, "The .riv": the Editor's export of this file left its scripted artboards out; the CLI's signed build has them).`,
    );
    return;
  }
  if (!shown.stateMachines.some((s) => s.name === ref.stateMachine)) {
    console.warn(`[covers] ${id}: "${ref.artboard}" has no state machine "${ref.stateMachine}".`);
  }
  if (ref.focusInput) {
    const vm = viewModels.find((v) => v.name === shown.viewModel);
    if (!vm?.properties.includes(`${ref.focusInput}: boolean`)) {
      console.warn(
        `[covers] ${id}: "${ref.artboard}"'s view model (${shown.viewModel ?? 'none'}) has no boolean "${ref.focusInput}": the card cannot be focused (docs/covers.md, "The .riv").`,
      );
    }
  }
}

/** One canvas the instance draws into, and its renderer. */
class Surface {
  readonly canvas = document.createElement('canvas');
  readonly renderer: WrappedRenderer;
  /** The last draw's size: its top-left `pxW × pxH` of `canvas`. */
  pxW = 0;
  pxH = 0;
  /** Bumped whenever the canvas holds a new picture. */
  version = 0;
  /** The instance's `changes` it last drew. */
  drewChange = -1;
  /** The backdrop it was last drawn over ('' = none). */
  drawnBg = '';
  /** Exactly its draw's size (the paper's texture), or grow-only (the stage's:
   *  it copies a top-left region, and a tile's size moves every frame of a
   *  focus tween). */
  readonly exact: boolean;

  /** Made at its first draw's size: one backing-store write, not two (a
   *  surface first wanted mid-slide — card 04 arriving as the side card — is
   *  made then; cover-drag-checks counts the writes). */
  constructor(rt: RiveCanvas, exact: boolean, pxW: number, pxH: number) {
    this.exact = exact;
    this.canvas.width = pxW;
    this.canvas.height = pxH;
    this.renderer = rt.makeRenderer(this.canvas);
  }

  /** Size for a draw; true when the draw's size changed. */
  size(pxW: number, pxH: number): boolean {
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

  dispose() {
    this.renderer.delete();
    this.canvas.width = this.canvas.height = 0;
  }
}

/**
 * THE instance of a Rive cover: its artboard, state machine and view model,
 * advanced once per moment of the cover clock however many surfaces draw it,
 * and drawn into whichever of its two canvases a surface asks for.
 */
export class RiveInstance {
  readonly id: string;
  /** Main-thread ms of this instance's last advance + draw. */
  lastMs = 0;
  readonly status: RiveInstanceStatus;
  private readonly rt: RiveCanvas;
  private readonly artboard: Artboard;
  private readonly sm: StateMachineInstance;
  private readonly vmi: ViewModelInstance | null;
  private readonly focusProp: ViewModelInstanceBoolean | null;
  private readonly surfaces: Partial<Record<RiveSurfaceKind | 'probe', Surface>> = {};
  private readonly frame = { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  private readonly crop: Crop = { x0: 0, y0: 0, w: 1, h: 1 };
  private lastT = -1;
  /** Bumped by every advance after which the artboard changed. */
  private changes = 0;
  /** `latefocus` (dev): the focus wanted at birth, held back. */
  private lateFocus = false;
  private disposed = false;

  constructor(rt: RiveCanvas, file: RiveFile, id: string, ref: RiveCoverRef, serial: number) {
    this.rt = rt;
    this.id = id;
    const ab = file.artboardByName(ref.artboard);
    if (!ab) throw new Error(`no artboard "${ref.artboard}"`);
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
    this.focusProp = ref.focusInput && this.vmi ? (this.vmi.boolean(ref.focusInput) ?? null) : null;
    this.status = {
      artboard: ab.name,
      stateMachine: ref.stateMachine,
      viewModel: vm ? vm.name : null,
      frames: 0,
      lastDt: 0,
      clock: 0,
      instances: serial,
      since: performance.now(),
      focused: false,
      focusedAt: -1,
    };
    // The focus wanted now goes in BEFORE the first advance: focused from
    // birth, the file goes straight to its error and the burst (a deep link).
    if (wantFocus.get(id)) {
      if (riveFault('latefocus')) this.lateFocus = true;
      else this.focus(true);
    }
    this.sm.advanceAndApply(0);
  }

  /** Set the focus input (no-op for a file without one). */
  focus(v: boolean) {
    if (this.disposed || !this.focusProp) return;
    if (this.focusProp.value === v) return;
    this.focusProp.value = v;
    this.status.focused = v;
    if (v) this.status.focusedAt = this.status.clock;
    log(this.id, `${v ? 'focused' : 'unfocused'} at ${this.status.clock.toFixed(2)} s of its clock`);
  }

  /** Advance to cover time `t` (once per moment, whoever asks first). */
  private advance(t: number) {
    if (t <= this.lastT) return;
    let dt = this.lastT < 0 ? 0 : Math.min(MAX_STEP_S, t - this.lastT);
    this.lastT = t;
    if (riveFault('frozen')) dt = 0;
    this.sm.advanceAndApply(dt);
    if (this.artboard.didChange()) this.changes++;
    if (dt > 0) {
      this.status.frames++;
      this.status.lastDt = dt;
      this.status.clock += dt;
      if (this.lateFocus && this.status.clock >= 1) {
        this.lateFocus = false;
        this.focus(true);
      }
    }
  }

  /**
   * Advance to cover time `t` and draw at `pxW × pxH` (an `object-fit: cover`
   * crop of the artboard) into one of its canvases. Called by every surface
   * that shows this instance, in any order, any number of times a frame: the
   * clock only moves forward, and a second call for the same moment and size
   * draws nothing. Returns the main-thread ms THIS call spent (0 when it had
   * nothing to do).
   */
  draw(t: number, kind: RiveSurfaceKind, pxW: number, pxH: number): number {
    if (this.disposed) return 0;
    const t0 = performance.now();
    this.advance(t);
    const s = this.surface(kind, pxW, pxH);
    // The site's coverBackdrop colour, laid under the artboard only if this
    // cover lets the sky through (card 04 is 'solid': its artboard's own fill).
    const bg = backdropUnder(this.id) ?? '';
    const resized = s.size(pxW, pxH) || bg !== s.drawnBg;
    if (!resized && s.drewChange === this.changes && s.version > 0) {
      const ms = performance.now() - t0;
      if (ms > 0.05) this.lastMs = ms;
      return ms;
    }
    this.paint(s, bg);
    this.lastMs = performance.now() - t0;
    return this.lastMs;
  }

  private surface(kind: RiveSurfaceKind | 'probe', pxW: number, pxH: number): Surface {
    return (this.surfaces[kind] ??= new Surface(this.rt, kind !== 'stage', pxW, pxH));
  }

  private paint(s: Surface, bg: string) {
    const r = s.renderer;
    r.clear();
    r.save();
    this.frame.maxX = s.pxW;
    this.frame.maxY = s.pxH;
    r.align(this.rt.Fit.cover, this.rt.Alignment.center, this.frame, this.artboard.bounds);
    this.artboard.draw(r);
    r.restore();
    r.flush();
    this.rt.resolveAnimationFrame();
    if (bg) {
      // Under the drawing, not before it: the renderer's clear lands at flush.
      const ctx = s.canvas.getContext('2d')!;
      ctx.save();
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, s.pxW, s.pxH);
      ctx.restore();
    }
    s.drawnBg = bg;
    s.drewChange = this.changes;
    s.version++;
  }

  /** A surface's canvas and its last draw, or null before its first. */
  canvasOf(kind: RiveSurfaceKind): { canvas: HTMLCanvasElement; pxW: number; pxH: number; version: number } | null {
    const s = this.surfaces[kind];
    return s && s.version > 0 ? { canvas: s.canvas, pxW: s.pxW, pxH: s.pxH, version: s.version } : null;
  }

  /** DEV / verify: the instance as it is NOW, drawn at `w × h` into a canvas
   *  of its own — no advance, so it shows exactly the moment the surfaces do,
   *  wherever they are. RGBA, top row first. */
  snapshot(w: number, h: number): Uint8ClampedArray {
    const s = this.surface('probe', w, h);
    s.size(w, h);
    this.paint(s, backdropUnder(this.id) ?? '');
    return s.canvas.getContext('2d')!.getImageData(0, 0, w, h).data;
  }

  /** A pointer event at (u, v) across a `w × h` box (0..1 each). */
  pointer(from: RivePointerFrom, kind: RivePointerKind, u: number, v: number, w: number, h: number) {
    if (this.disposed) return;
    const b = this.artboard.bounds;
    coverCropOf(b.maxX - b.minX, b.maxY - b.minY, w, h, this.crop);
    const x = b.minX + this.crop.x0 + u * this.crop.w;
    const y = b.minY + this.crop.y0 + v * this.crop.h;
    notePointer(this.id, from, kind, x, y);
    if (kind === 'move') this.sm.pointerMove(x, y, 0);
    else if (kind === 'down') this.sm.pointerDown(x, y, 0);
    else if (kind === 'up') this.sm.pointerUp(x, y, 0);
    else this.sm.pointerExit(x, y, 0);
  }

  /** DEV / verify: the bound view model's values, flattened
   *  (`noseyAgent/agentStatus`…). Enums as their value's name. */
  viewModel(): Record<string, number | boolean | string> {
    const out: Record<string, number | boolean | string> = {};
    const walk = (vmi: ViewModelInstance, prefix: string, depth: number) => {
      for (const p of vmi.getProperties()) {
        const key = prefix + p.name;
        const type = p.type as string;
        if (type === 'number') out[key] = vmi.number(p.name).value;
        else if (type === 'boolean') out[key] = vmi.boolean(p.name).value;
        else if (type === 'string') out[key] = vmi.string(p.name).value;
        else if (type === 'enumType') out[key] = vmi.enum(p.name).value;
        else if (type === 'viewModel' && depth < 3) {
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
    for (const s of Object.values(this.surfaces)) s?.dispose();
    this.sm.delete();
    this.artboard.delete();
  }
}

let pointerLogAt = 0;
let pointerLogN = 0;
function notePointer(id: string, from: RivePointerFrom, kind: RivePointerKind, x: number, y: number) {
  const st = riveStatus(id);
  const now = performance.now();
  const first = !st.pointer || st.pointer.from !== from;
  st.pointer = { from, kind, x: Math.round(x), y: Math.round(y), t: now, n: (st.pointers[from]?.n ?? 0) + 1 };
  st.pointers[from] = st.pointer;
  pointerLogN++;
  if (first || kind !== 'move' || now - pointerLogAt > 2000) {
    log(id, `pointer ${kind} from the ${from === 'tile' ? 'grid tile' : 'centre card'} at (${st.pointer.x}, ${st.pointer.y}) in artboard space — ${pointerLogN} event(s) since the last line`);
    pointerLogAt = now;
    pointerLogN = 0;
  }
}

/**
 * What shows a cover's instance now: the stage reports its visible DOM
 * surfaces every frame it runs, the paper its plane; a change is logged.
 */
const DOM_ROLES = ['grid tiles', 'morph card', 'side card (DOM)', 'centre card (DOM)'];
export const RIVE_DOM = { tiles: 1, morph: 2, side: 4, centre: 8 } as const;
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

/** Composes `showing` from the stage's half and the paper's; strings are
 *  only built when a half changes (this runs every frame). */
const composed = new Map<string, { dom: string; plane: string }>();
function recomposeShowing(id: string) {
  const st = riveStatus(id);
  const now = performance.now();
  const dom = st.dom && now - st.dom.t < 250 ? st.dom.roles : '';
  const plane = st.plane && now - st.plane.t < 250 && st.plane.shows !== 'none' ? `paper ${st.plane.slot} (${st.plane.shows === 'live' ? 'live' : 'the still'})` : '';
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
  // DEV fault `fresh`: what the per-role instances did — a new one per role.
  if (riveFault('fresh') && from && showing && instances.has(id)) resetInstance(id);
}

/** The paper reports what its plane samples for a Rive cover, and for which slot. */
export function rivePlane(id: string, shows: RivePlaneShows, slot: 'centre' | 'side', uploads: number) {
  const st = riveStatus(id);
  if (!st.plane) st.plane = { shows, slot, uploads, t: 0 };
  st.plane.shows = shows;
  st.plane.slot = slot;
  st.plane.uploads = uploads;
  st.plane.t = performance.now();
  recomposeShowing(id);
}

/**
 * A pointer event for a cover's instance, at (u, v) across a `w × h` box.
 * With no instance yet (the file still loading) the last move is kept and
 * replayed into the instance when it is made.
 */
export function rivePointer(id: string, from: RivePointerFrom, kind: RivePointerKind, u: number, v: number, w: number, h: number) {
  ensureRive(id);
  const inst = instances.get(id);
  if (inst) inst.pointer(from, kind, u, v, w, h);
  else if (kind === 'exit') pendingPointer.delete(id);
  else if (kind === 'move') pendingPointer.set(id, { from, kind, u, v, w, h });
}

/**
 * The cover's card is (true) or is not (false) the detail view's centre card:
 * its focus input (the ref's `focusInput`). Kept, and given to the instance
 * when it is made if it does not exist yet — before its first advance.
 */
export function riveFocus(id: string, focused: boolean) {
  if (focused && riveFault('nofocus')) return;
  if (!focused && riveFault('nounfocus')) return;
  wantFocus.set(id, focused);
  instances.get(id)?.focus(focused);
}

/** The detail view's focused card is `index` (CONTENT's), or none: every Rive
 *  cover with a focus input is told whether its card is it. */
export function riveFocusCard(index: number | null) {
  CONTENT.forEach((item, i) => {
    if (item.cover?.kind === 'rive' && item.cover.focusInput) riveFocus(item.cover.id, i === index);
  });
}

let serial = 0;
function makeInstance(id: string, idle = false): RiveInstance | null {
  const f = files.get(id);
  const ref = riveRef(id);
  if (!runtime || !f?.file || !ref) return null;
  try {
    const t0 = performance.now();
    const inst = new RiveInstance(runtime, f.file, id, ref, ++serial);
    oneOff.instances.push({ ms: performance.now() - t0, idle });
    return inst;
  } catch (e) {
    f.failed = true;
    console.warn(`[covers] ${id}: no instance —`, e);
    return null;
  }
}

function adopt(id: string, inst: RiveInstance) {
  instances.set(id, inst);
  riveStatus(id).instance = inst.status;
  log(id, `instance #${inst.status.instances}: artboard "${inst.status.artboard}", state machine "${inst.status.stateMachine}", view model ${inst.status.viewModel ?? 'none'}${inst.status.focused ? ', focused from birth' : ''}`);
  const pending = pendingPointer.get(id);
  if (pending) {
    pendingPointer.delete(id);
    inst.pointer(pending.from, pending.kind, pending.u, pending.v, pending.w, pending.h);
  }
}

/** Drop the instance and make it again at the top of its loop (the focus
 *  wanted now applied from birth). DEV / verify only: nothing in the site
 *  ever replaces it. */
function resetInstance(id: string) {
  instances.get(id)?.dispose();
  instances.delete(id);
  const inst = makeInstance(id);
  if (inst) adopt(id, inst);
}

/** A cover's instance, or null until its file has loaded. */
export function riveInstance(id: string): RiveInstance | null {
  ensureRive(id);
  return instances.get(id) ?? null;
}

/** The instance, without asking for its file. */
export function peekRiveInstance(id: string): RiveInstance | null {
  return instances.get(id) ?? null;
}

// ── cost, per frame ──────────────────────────────────────────────────────
// Every piece of main-thread work a Rive cover does in a frame — the
// instance's advance + draws, each DOM surface's copy, the paper's texture
// upload — is added to the frame's bucket (keyed by the frame's time), for
// verify:cover's budget.

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

/** DEV / verify: the per-frame totals of the last frames, and the instance. */
export function riveProbe() {
  return {
    ready: (id: string) => !!files.get(id)?.file,
    failed: (id: string) => !!files.get(id)?.failed,
    costs: () => history.slice(),
    clearCosts: () => {
      history.length = 0;
    },
    /** The instance: which one, its clock, its focus, its surfaces' draws. */
    instance: (id: string) => {
      const i = instances.get(id);
      if (!i) return null;
      const s = (k: RiveSurfaceKind) => i.canvasOf(k);
      const stage = s('stage');
      const plane = s('plane');
      return {
        ...i.status,
        lastMs: i.lastMs,
        stage: stage && { pxW: stage.pxW, pxH: stage.pxH, version: stage.version },
        plane: plane && { pxW: plane.pxW, pxH: plane.pxH, version: plane.version },
      };
    },
    viewModel: (id: string) => instances.get(id)?.viewModel() ?? null,
    /** The instance's current moment drawn at `w × h` (RGBA), no advance. */
    snapshot: (id: string, w: number, h: number) => instances.get(id)?.snapshot(w, h) ?? null,
    /** Drop the instance: a fresh one at the top of its loop, now. */
    reset: (id: string) => {
      if (instances.has(id)) resetInstance(id);
    },
    focus: (id: string, v: boolean) => riveFocus(id, v),
    def: (id: string) => riveCover(id),
    status: (id: string) => {
      const st = riveStatus(id);
      return { ...st, pointer: st.pointer && { ...st.pointer, ageMs: Math.round(performance.now() - st.pointer.t) } };
    },
    /** The one-off costs: the file's import, each instance made. */
    oneOff: () => ({ importMs: oneOff.importMs, instances: oneOff.instances.slice() }),
    /** Main-thread ms per draw of a THROWAWAY instance at `w × h`, `n` frames
     *  of 1/60 s, its pointer circling — the live one untouched. `focused`:
     *  focused from birth, and `lead` seconds advanced first (past the burst,
     *  the characters bouncing). */
    bench: (id: string, w: number, h: number, n = 120, opts: { focused?: boolean; lead?: number } = {}) => {
      const keep = wantFocus.get(id);
      wantFocus.set(id, !!opts.focused);
      const p = makeInstance(id);
      if (keep === undefined) wantFocus.delete(id);
      else wantFocus.set(id, keep);
      if (!p) return null;
      let t = 0;
      p.draw(t, 'plane', w, h);
      for (let k = 0; k < (opts.lead ?? 0) * 60; k++) p.draw((t += 1 / 60), 'plane', w, h);
      const t0 = performance.now();
      for (let i = 1; i <= n; i++) {
        const a = (i / n) * Math.PI * 4;
        p.pointer('centre', 'move', 0.5 + 0.4 * Math.cos(a), 0.5 + 0.4 * Math.sin(a), w, h);
        p.draw((t += 1 / 60), 'plane', w, h);
      }
      const ms = (performance.now() - t0) / n;
      p.dispose();
      oneOff.instances.pop();
      serial--;
      return ms;
    },
  };
}
