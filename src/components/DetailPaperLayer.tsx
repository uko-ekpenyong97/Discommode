import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { Mesh, OrthographicCamera, PlaneGeometry, Scene, Vector3 } from 'three';
import type { Texture } from 'three';
import { CONTENT } from '../content';
import { boilFor, subscribeBoil } from '../reader/coverLife';
import type { HeroRect } from '../layout/hero';
import { HANDOFF_MS, registerHandOut } from './detailPaper/handoff';
import { paper, setPaper, subscribePaper } from './detailPaper/paperDials';
import {
  CARD_RADIUS_PX,
  MAX_SPRITES,
  PERSPECTIVE_VH,
  SHADOW,
  createPaperMaterial,
  createShadowMaterial,
} from './detailPaper/paperMaterial';
import type { PaperMaterial, ShadowMaterial } from './detailPaper/paperMaterial';
import {
  effectiveFold,
  foldTarget,
  lerpK,
  pointerUv,
  retarget,
  sampleTween,
  spriteUvRect,
  stripVelocity,
  tweenDone,
} from './detailPaper/paperMath';
import type { CardRect, Tween } from './detailPaper/paperMath';
import { CoverRenderer, coverCropOf } from '../covers/coverRenderer';
import { CachedCoverRenderer } from '../covers/cachedCoverRenderer';
import {
  MAX_DPR,
  faceKey,
  faceKeys,
  faceSettled,
  faceTexture,
  flatTexture,
  liveCover,
  liveCoverEntries,
  onPaperProgress,
  paperContexts,
  paperCreases,
  paperGL,
  paperReady,
  plateKey,
  sizePaper,
  wantFaces,
  warmPaper,
} from './detailPaper/paperGL';
import { span } from './detailPaper/span';
import { riveCover, shaderCover } from '../covers/covers';
import { riveCost, riveFrame, rivePlane, rivePlayer } from '../covers/rive/riveCover';
import type { RivePlayer } from '../covers/rive/riveCover';
import { coverTime } from '../covers/coverClock';
import { backdropUnder, coverDialsVersion, coverValues, siteCoverDials } from '../covers/coverDials';
import { cssRgb } from '../covers/color';
import { heroDome } from '../covers/dome';
import type { Crop } from '../covers/types';
import { benchCoverDraw } from '../covers/bench';

/**
 * THE DETAIL CARDS AS PAPER — one fixed WebGL canvas under the detail strip,
 * carrying the hero and its neighbours once the view has settled.
 *
 * ── LAYERS, bottom to top ─────────────────────────────────────────────────
 *
 *   the sky           (the app's, untouched)
 *   this canvas       every card's shadow, then every card, in the strip's
 *                     z-order — so a neighbour's shadow falls under the hero
 *                     exactly as the DOM's does
 *   the strip         the DOM panels — their faces `visibility: hidden` while
 *                     the canvas carries them, everything else (the number, the
 *                     name, the hover sprites) still drawn, on top
 *   the chrome        the back pill and the bar
 *
 * The canvas is `pointer-events: none`: the panels keep every click, and the
 * CoverAnimLayer's sprites keep resolving hover from the panel, exactly as
 * before. The canvas also draws the cards' SHADOWS, because a DOM shadow cast by
 * a panel whose face is hidden would fall ON TOP of the canvas — a neighbour's
 * shadow across the hero's paper.
 *
 * ── THE HAND-OFF ──────────────────────────────────────────────────────────
 *
 * The DOM cards carry the grid→detail morph, the exit morph and the doorway;
 * this layer only takes over once the view has settled, and gives the cards back
 * before anything else moves them. It is the portfolio view's plate crossfade,
 * and for the same reason ONLY THE DOM'S ALPHA MOVES: the canvas sits under the
 * strip at full alpha and the DOM faces dissolve off it (`in`) or back over it
 * (`out`) across {@link HANDOFF_MS}. Two surfaces at half alpha would let the sky
 * through between them.
 *
 *   dom  → in    `live`, the shared GL warm (paperGL.ts), and every texture
 *                this viewport needs uploaded
 *   in   → on    HANDOFF_MS later; the DOM faces go `visibility: hidden`
 *   on   → out   a leave (close, Read issue, Open project) — see handoff.ts
 *   out  → dom   HANDOFF_MS later; then the leave runs
 *   any  → dom   INSTANTLY when `live` drops without a leave having asked
 *                (browser Back, a hash edit) or the viewport's size changes
 *
 * The state is written to the `.detail` element as `data-paper`, which is all
 * DetailView.css needs.
 *
 * ── THE GL IS NOT THIS COMPONENT'S ────────────────────────────────────────
 *
 * The renderer, its canvas, its programs, the crease map, the live covers'
 * renderers and the face textures are made once for the page, warmed up on
 * the first hover of a grid card, and kept across every open and close
 * (paperGL.ts, docs/detail-paper.md "The arrival"). This component renders an
 * empty host; the engine moves the shared canvas into it, and out on unmount.
 * Made here, on mount, they were the detail view's janky arrival.
 *
 * ── TEXTURES ──────────────────────────────────────────────────────────────
 *
 * Each face is resized ONCE, on the CPU, by the browser, to the card's own
 * device pixels — at the hero's size and at the neighbours' — so the plane
 * samples it one texel to one pixel, the same resampling the <img> it replaces
 * got. A 2000×2600 face minified 3× on the GPU would alias where the DOM does
 * not, and the identity check would be measuring that rather than the paper.
 * Issue 01's hero also gets its PLATE (the cover with the animated objects
 * removed), because the CoverAnimLayer's sprites are drawn over it.
 *
 * At scale 1 this matches the DOM to 0.01–0.95% of a card's pixels. At the
 * neighbours' scale(0.85) Chrome draws the <img> softer than any texture made
 * from the same file — four ways were measured (docs/detail-paper.md) — which
 * on card 01's line art is 1.1–6.4% of the card. The direct resize is kept: it
 * is the simplest, the cheapest, and no alternative held at both ratios.
 */

/**
 * How long the paper takes to SETTLE IN once the canvas has the cards.
 *
 * Every effect is scaled by one `presence`, which is 0 at both hand-offs: the
 * canvas takes the cards over as an exact copy of the DOM (the identity), and
 * only then do the creases, the ripple and the rest arrive, over this long. On
 * the way out presence falls back to 0 across the reverse crossfade itself, so
 * the DOM comes back over a flat copy of itself.
 *
 * Without it the crossfade would be a dissolve between two different pictures:
 * the resting ripple alone moves the artwork 2–3px, which on line art is most of
 * the edges in the card. A hand-off should be a swap nobody can see, and this is
 * what makes it one — and what makes it measurable.
 */
const SETTLE_MS = 500;

export interface PaperPanel {
  /** The strip's key for the panel — its signed position in the carousel. */
  key: number;
  /** Content index. */
  idx: number;
  el: HTMLElement;
  /** On screen, CSS px, after the panel's scale. */
  rect: CardRect;
  scale: number;
  opacity: number;
  /** The strip's z-index for the panel. */
  z: number;
  /** Continuous distance from the centre, in panels. */
  dist: number;
  /** Rounded distance from the centre panel, as the strip counts it. */
  slot: number;
}

export interface PaperFrame {
  panels: PaperPanel[];
  /** The slide position's change this frame, in panels. */
  dpos: number;
  dt: number;
  panelStep: number;
}

export interface DetailPaperHandle {
  /** Called at the end of every DetailView tick, after it has laid the strip out. */
  frame: (f: PaperFrame) => void;
}

interface DetailPaperLayerProps {
  /** Allowed to carry the cards: the view has settled, and nothing is about to
   *  need the DOM. Going false hands the cards back at once. */
  live: boolean;
  /** Pointer effects on — false while a layer above has the pointer. */
  interactive: boolean;
  hero: HeroRect;
  sideScale: number;
  /** The active item: its faces are uploaded first. */
  active: number;
}

type State = 'dom' | 'in' | 'on' | 'out';

interface Card {
  mesh: Mesh<PlaneGeometry, PaperMaterial>;
  shadow: Mesh<PlaneGeometry, ShadowMaterial>;
  fold: Tween;
  hover: Tween;
  slot: number;
}

/** DEV: forced uniforms for the verify suite — `zero` is the identity check;
 *  `hideCovers` leaves the live-cover planes undrawn (verify:cover's `ground`
 *  reference: the sky with the cover hidden and everything else as it was). */
export interface PaperOverride {
  zero?: boolean;
  velocity?: number;
  hover?: number;
  fold?: number;
  hideCovers?: boolean;
}

export const DetailPaperLayer = forwardRef<DetailPaperHandle, DetailPaperLayerProps>(
  function DetailPaperLayer({ live, interactive, hero, sideScale, active }, ref) {
    const hostRef = useRef<HTMLDivElement>(null);
    // Props the imperative engine reads every frame.
    const liveRef = useRef(live);
    const interactiveRef = useRef(interactive);
    const heroRef = useRef(hero);
    const sideRef = useRef(sideScale);
    const activeRef = useRef(active);
    const engineRef = useRef<ReturnType<typeof createEngine> | null>(null);

    useLayoutEffect(() => {
      liveRef.current = live;
      interactiveRef.current = interactive;
      heroRef.current = hero;
      sideRef.current = sideScale;
      activeRef.current = active;
      engineRef.current?.sync();
    });

    useEffect(() => {
      const host = hostRef.current;
      if (!host) return;
      const engine = createEngine(host, {
        live: () => liveRef.current && paper.paper === 'on',
        interactive: () => interactiveRef.current,
        hero: () => heroRef.current,
        side: () => sideRef.current,
        active: () => activeRef.current,
      });
      engineRef.current = engine;
      return () => {
        engineRef.current = null;
        engine.dispose();
      };
    }, []);

    useImperativeHandle(ref, () => ({ frame: (f) => engineRef.current?.frame(f) }), []);

    // The canvas is the shared one (paperGL.ts), moved in here while mounted.
    return <div ref={hostRef} className="detail__paper-host" />;
  },
);

interface EngineInputs {
  live: () => boolean;
  interactive: () => boolean;
  hero: () => HeroRect;
  side: () => number;
  active: () => number;
}

function createEngine(host: HTMLElement, input: EngineInputs) {
  const root = host.parentElement as HTMLElement;
  // The shared GL (paperGL.ts): made by the warm-up — on the first hover of a
  // grid card, or here for a direct load — and never by this mount. Until it
  // is ready the layer stays on the DOM, which is showing the cards anyway.
  warmPaper();
  let canvas: HTMLCanvasElement | null = null;
  const R = () => paperGL()!.renderer;

  const scene = new Scene();
  const camera = new OrthographicCamera(0, 1, 0, -1, -10, 10);
  let dpr = 1;
  let vw = 0;
  let vh = 0;

  let geometry = new PlaneGeometry(1, 1, paper.segments, paper.segments);
  const shadowGeometry = new PlaneGeometry(1, 1, 1, 1);

  // Resident in paperGL.ts; it arrives with the warm-up.
  let creases: Texture | null = paperCreases();
  /** Take the GL in once the warm-up has it: the canvas into this mount's
   *  host, the crease map into the cards. */
  function adopt() {
    const g = paperGL();
    if (g && !canvas) {
      canvas = g.canvas;
      canvas.style.visibility = state === 'dom' ? 'hidden' : 'visible';
      host.appendChild(canvas);
      dirty = true;
    }
    if (!creases && paperCreases()) {
      creases = paperCreases();
      for (const c of cards.values()) c.mesh.material.uniforms.uCreases.value = creases;
      dirty = true;
    }
  }
  const unsubProgress = onPaperProgress(() => {
    adopt();
    sync();
    maybeHandIn();
  });

  // ── textures ───────────────────────────────────────────────────────────
  // Keyed by `${url}@${w}x${h}` (an issue's plate by `plate:${idx}`). Wanted
  // for a SIZE KEY (the hero's device size and the neighbours'); a new key
  // wants a new set, and the old one is dropped once it has arrived. The
  // textures themselves live in paperGL.ts, uploaded a few ms a frame, and
  // outlive this mount: a second arrival at the same size uploads nothing.
  let sizeKey = '';
  let wanted: string[] = [];
  let disposed = false;
  let texturesReady = false;

  function dims() {
    const h = input.hero();
    const s = input.side();
    return {
      heroW: Math.round(h.w * dpr),
      heroH: Math.round(h.h * dpr),
      sideW: Math.round(h.w * s * dpr),
      sideH: Math.round(h.h * s * dpr),
    };
  }

  /** Ask for every face this size needs (paperGL.ts); most are already in
   *  when the warm-up ran on a hover. */
  function wantTextures() {
    wanted = wantFaces(input.active(), dims());
    texturesReady = false;
  }

  /** Every wanted face has arrived (or failed for good). */
  function checkTextures() {
    if (texturesReady || !wanted.length) return;
    if (!wanted.every(faceSettled)) return;
    texturesReady = true;
    dirty = true;
  }

  // ── live covers ────────────────────────────────────────────────────────
  // A card with a live cover (content.ts `cover`) is drawn by the cover's
  // renderer IN THIS CONTEXT, into a target whose texture IS the hero plane's
  // map — a texture cannot cross WebGL contexts, and copying a 2 MP frame across
  // from the grid's stage every frame would cost more than drawing it here.
  // Only the hero is live; the neighbours use the still (itemHeroFace). The
  // renderer (and its target) is made, compiled and first drawn by the
  // warm-up, and kept (paperGL.ts).
  const coverCrop_: Crop = { x0: 0, y0: 0, w: 1, h: 1 };
  let coversDrawn = 0;

  /** Draw a cover for the hero at `pxW × pxH`; its texture, or null if not ready.
   *  While the cards are handed OUT the DOM face is the live one (it is
   *  dissolving back over this plane) and this holds its last frame, so the one
   *  moment is not drawn twice. */
  function liveCoverTexture(id: string, pxW: number, pxH: number): Texture | null {
    const def = shaderCover(id);
    const c = def ? liveCover(id) : null;
    if (!def || !c) return null;
    if (c.bound !== coverDialsVersion()) {
      c.bound = coverDialsVersion();
      c.r.setValues(coverValues(id));
    }
    if (state === 'out' && c.rt && c.rt.width === pxW && c.rt.height === pxH) return c.rt.texture;
    if (!c.rt || c.rt.width !== pxW || c.rt.height !== pxH) {
      c.rt?.dispose();
      c.rt = CoverRenderer.outputTarget(pxW, pxH);
    }
    heroDome.advance(performance.now(), def.domeMotion(coverValues(id)));
    coverCropOf(def.frame.w, def.frame.h, pxW, pxH, coverCrop_);
    const under = backdropUnder(id);
    const drawn = c.r.draw(c.rt, {
      t: coverTime(),
      crop: coverCrop_,
      pxW,
      pxH,
      dome: heroDome.state,
      backdrop: under ? cssRgb(under) : null,
    });
    if (!drawn) return null;
    coversDrawn++;
    return c.rt.texture;
  }

  /**
   * Before the hand-in: the hero's live cover is ready to draw at its size —
   * its renderer's assets in, and its two targets allocated now, one frame
   * ahead, instead of inside the hand-in's first draw. True once it is (or
   * the hero has no shader cover).
   */
  function primeHeroCover(): boolean {
    const item = CONTENT[input.active()];
    const def = item.cover && !reduced.matches ? shaderCover(item.cover.id) : undefined;
    if (!def) return true;
    const c = liveCover(def.id);
    if (!c || !c.r.ready()) return false;
    const d = dims();
    const cap = Math.min(dpr, siteCoverDials().coverMaxDpr) / dpr;
    const pxW = Math.round(d.heroW * cap);
    const pxH = Math.round(d.heroH * cap);
    if (c.rt && c.rt.width === pxW && c.rt.height === pxH) return true;
    span('prime cover', () => {
      c.rt?.dispose();
      c.rt = CoverRenderer.outputTarget(pxW, pxH);
      R().initRenderTarget(c.rt);
      c.r.prepare(coverCropOf(def.frame.w, def.frame.h, pxW, pxH, coverCrop_), pxW);
    });
    return false; // the hand-in waits for the next frame
  }

  // A RIVE cover's hero (card 04) is its hero player's canvas — the same
  // instance the DOM hero face shows, so the hand-off is one picture —
  // uploaded as this plane's texture when the player has drawn a new frame,
  // and not otherwise (a still artboard costs nothing here). Premultiplied, as
  // a 2D canvas already is: no conversion on the upload. Held while handing
  // OUT, as the shader's is.
  const riveTex = new Map<string, { tex: Texture; player: RivePlayer; version: number; w: number; h: number }>();
  let riveUploads = 0;
  let riveUploadMs = 0;
  let riveFresh = false;

  function riveCoverTexture(id: string, pxW: number, pxH: number): Texture | null {
    const player = rivePlayer(id, 'hero');
    if (!player) return null;
    let c = riveTex.get(id);
    if (state === 'out' && c && c.player === player && player.pxW === pxW && player.pxH === pxH) return c.tex;
    const ms = player.draw(coverTime(), pxW, pxH);
    if (player.version === 0) return null;
    riveCost('draw', ms);
    if (c && (c.player !== player || c.w !== pxW || c.h !== pxH)) {
      // A new instance, or a new size: three.js allocates a texture's storage
      // once, so a new size is a new texture.
      c.tex.dispose();
      riveTex.delete(id);
      c = undefined;
    }
    if (!c) {
      const tex = flatTexture(player.canvas);
      tex.premultiplyAlpha = true;
      c = { tex, player, version: -1, w: pxW, h: pxH };
      riveTex.set(id, c);
    }
    if (c.version !== player.version) {
      c.version = player.version;
      c.tex.needsUpdate = true;
      const t0 = performance.now();
      R().initTexture(c.tex); // the upload, now, so it can be timed
      riveUploadMs = performance.now() - t0;
      riveCost('upload', riveUploadMs);
      riveUploads++;
      riveFresh = true;
    }
    return c.tex;
  }

  // ── cards ──────────────────────────────────────────────────────────────
  const cards = new Map<number, Card>();

  function cardFor(p: PaperPanel, now: number): Card {
    let c = cards.get(p.key);
    if (c) return c;
    const mat = createPaperMaterial(creases);
    const mesh = new Mesh(geometry, mat);
    mesh.frustumCulled = false;
    const shadow = new Mesh(shadowGeometry, createShadowMaterial());
    shadow.frustumCulled = false;
    scene.add(shadow, mesh);
    const f = foldTarget(p.slot);
    c = {
      mesh,
      shadow,
      // A card first seen is already where its slot says — only a CHANGE of
      // slot tweens.
      fold: { from: f, to: f, start: now, ms: 0 },
      hover: { from: 0, to: 0, start: now, ms: 0 },
      slot: p.slot,
    };
    cards.set(p.key, c);
    return c;
  }

  function dropCard(key: number) {
    const c = cards.get(key);
    if (!c) return;
    scene.remove(c.mesh, c.shadow);
    c.mesh.material.dispose();
    c.shadow.material.dispose();
    cards.delete(key);
  }

  const unsubPaper = subscribePaper((p) => {
    if (geometry.parameters.widthSegments !== p.segments) {
      const next = new PlaneGeometry(1, 1, p.segments, p.segments);
      for (const c of cards.values()) c.mesh.geometry = next;
      geometry.dispose();
      geometry = next;
    }
    dirty = true;
    sync();
  });

  // ── pointer ────────────────────────────────────────────────────────────
  let pointer: { x: number; y: number } | null = null;
  const onMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    pointer = { x: e.clientX, y: e.clientY };
  };
  const onLeave = () => {
    pointer = null;
  };
  window.addEventListener('pointermove', onMove, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);
  window.addEventListener('blur', onLeave);

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  // The cover's boil is driven by the CoverAnimLayer, which publishes each new
  // value in the same task it moves its sprites: repaint the plate right here,
  // so the two never show different values on one frame.
  const unsubBoil = subscribeBoil(() => {
    if (state !== 'dom') render(false);
  });

  // ── state ──────────────────────────────────────────────────────────────
  let state: State = 'dom';
  let timer = 0;
  let pendingLeave: (() => void) | null = null;
  // After a leave has handed the cards back, stay on the DOM until `live` has
  // actually dropped (the leave's hash change lands a task later), or a second.
  let heldOutUntil = 0;
  let dirty = true;
  let frames = 0;
  let last: PaperFrame | null = null;
  let velocity = 0;
  let override: PaperOverride = {};
  // See SETTLE_MS. Starts flat.
  let presence: Tween = { from: 0, to: 0, start: 0, ms: 0 };
  // DEV probes for the verify suite: hold presence where it is; hold `out` at
  // its last frame instead of completing it.
  let freezePresence = false;
  let holdOut = false;
  let lastSig: number[] = [];

  function setState(next: State) {
    state = next;
    if (next === 'dom') root.removeAttribute('data-paper');
    else root.setAttribute('data-paper', next);
    if (canvas) canvas.style.visibility = next === 'dom' ? 'hidden' : 'visible';
    dirty = true;
  }

  function toDomNow() {
    window.clearTimeout(timer);
    setState('dom');
    const then = pendingLeave;
    pendingLeave = null;
    then?.();
  }

  function handIn() {
    // Paint the canvas first, in this same task, so the frame the DOM faces
    // start to dissolve is a frame the canvas is already showing.
    state = 'in';
    render(true);
    setState('in');
    window.clearTimeout(timer);
    presence = { from: 0, to: 0, start: performance.now(), ms: 0 };
    timer = window.setTimeout(() => {
      if (state !== 'in') return;
      setState('on');
      if (!freezePresence) {
        presence = { from: 0, to: 1, start: performance.now(), ms: reduced.matches ? 0 : SETTLE_MS };
      }
    }, HANDOFF_MS);
  }

  function handOut(then: () => void) {
    if (state === 'dom') {
      then();
      return;
    }
    if (pendingLeave) return; // one leave at a time; the first wins
    pendingLeave = then;
    heldOutUntil = performance.now() + 1000;
    setState('out');
    // Flat again by the time the DOM is back over it.
    if (!freezePresence) presence = retarget(presence, 0, performance.now(), HANDOFF_MS);
    render(true); // the shadows go back to the DOM on this same frame
    window.clearTimeout(timer);
    const finish = () => {
      if (holdOut) {
        timer = window.setTimeout(finish, 16);
        return;
      }
      heldOutUntil = performance.now() + 1000;
      toDomNow();
    };
    timer = window.setTimeout(finish, HANDOFF_MS);
  }
  const unregister = registerHandOut(handOut);

  function resize() {
    const nextDpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (nextDpr === dpr && w === vw && h === vh) return;
    dpr = nextDpr;
    vw = w;
    vh = h;
    camera.left = 0;
    camera.right = vw;
    camera.top = 0;
    camera.bottom = -vh;
    camera.updateProjectionMatrix();
    dirty = true;
  }

  /** Reconcile with the inputs: size, textures, and whether to hand in or out. */
  function sync() {
    resize();
    if (sizePaper()) dirty = true; // the shared drawing buffer, to this viewport
    const d = dims();
    const key = `${d.heroW}x${d.heroH}/${d.sideW}x${d.sideH}`;
    if (key !== sizeKey && !disposed) {
      // A new size: the textures are the wrong resolution. Give the cards back
      // at once and ask for the new set; the hand-in runs again once it is in.
      if (state !== 'dom') toDomNow();
      sizeKey = key;
      wantTextures();
    }
    const live = input.live();
    if (!live) {
      heldOutUntil = 0;
      if (state !== 'dom') toDomNow();
    }
  }

  function maybeHandIn() {
    if (state !== 'dom' || !input.live() || !paperReady() || !canvas || !texturesReady || !creases || !last) return;
    if (performance.now() < heldOutUntil) return;
    if (!primeHeroCover()) return;
    handIn();
  }

  // ── per frame ──────────────────────────────────────────────────────────
  function frame(f: PaperFrame) {
    last = f;
    sync();
    checkTextures();
    const v = stripVelocity(f.dpos, f.panelStep, input.hero().w, f.dt);
    velocity += (v - velocity) * lerpK(0.2, f.dt);
    if (Math.abs(velocity) < 1e-5) velocity = 0;
    maybeHandIn();
    if (state !== 'dom') render(false);
  }

  function render(force: boolean) {
    const f = last;
    if (!f || !canvas) return;
    riveFrame(); // a frame of cover work, for the Rive hero's "left" test
    const now = performance.now();
    const still = reduced.matches;
    const zero = !!override.zero;
    const d = dims();
    const P = sampleTween(presence, now);

    // Drop the planes whose panels the strip no longer renders.
    const keys = new Set(f.panels.map((p) => p.key));
    for (const k of [...cards.keys()]) if (!keys.has(k)) dropCard(k);

    // Hover: the topmost card under the pointer (the raycast; see pointerUv).
    let hovered: PaperPanel | null = null;
    let hoveredUv: { u: number; v: number } | null = null;
    if (pointer && input.interactive() && !still && (state === 'on' || state === 'in')) {
      for (const p of f.panels) {
        const uv = pointerUv(p.rect, pointer.x, pointer.y);
        if (uv && p.opacity > 0.01 && (!hovered || p.z > hovered.z || (p.z === hovered.z && p.key > hovered.key))) {
          hovered = p;
          hoveredUv = uv;
        }
      }
    }

    const sig: number[] = [state === 'out' ? 1 : 0, dpr, vw, vh];
    let liveThisFrame = false;
    const sorted = [...f.panels].sort((a, b) => a.z - b.z || a.key - b.key);
    let order = 0;
    for (const p of sorted) {
      const c = cardFor(p, now);
      if (p.slot !== c.slot) {
        c.fold = retarget(c.fold, foldTarget(p.slot), now, paper.foldMs);
        c.slot = p.slot;
      }
      const hoverTo = hovered && hovered.key === p.key ? 1 : 0;
      c.hover = retarget(c.hover, hoverTo, now, paper.hoverMs);

      const u = c.mesh.material.uniforms;
      // Which face: the plate under the hover sprites while the CoverAnimLayer
      // is drawing them, else the face at the size nearer this panel's scale.
      const plateEl = p.el.querySelector<HTMLImageElement>('.cover-anim__plate');
      const plateTex = plateEl ? faceTexture(plateKey(p.idx, d.heroW, d.heroH)) : null;
      const plate = !!plateTex;
      const item = CONTENT[p.idx];
      // The hero's face while the panel is nearer the hero slot than a
      // neighbour's. By DISTANCE, not scale: the two are the same test while
      // detailSideScale < 1, and at 1 every panel is scale 1 — "bigger than
      // halfway to the side scale" was true of none, the hero was a
      // neighbour, and card 04's live hero was never drawn (below).
      const big = p.dist < 0.5;
      const [tw, th] = plate || big ? [d.heroW, d.heroH] : [d.sideW, d.sideH];
      let tex = plateTex ?? faceTexture(faceKey(p.idx, tw, th));
      // The hero's live cover, at the hero's device size (coverMaxDpr caps it;
      // a Rive cover's riveMaxDpr), on the shared cover clock. Under reduced
      // motion it stays the still.
      const rive = item.cover?.kind === 'rive' ? riveCover(item.cover.id) : undefined;
      const riveDials = rive ? (coverValues(rive.id) as { rive?: { riveMaxDpr?: number; coverPaperShade?: number } }).rive : undefined;
      if (rive && big) {
        // The readout's "paper plane": live Main Bounce, or the still.
        let live: Texture | null = null;
        if (!still) {
          const cap = Math.min(dpr, Math.max(0.5, riveDials?.riveMaxDpr ?? 2)) / dpr;
          live = riveCoverTexture(rive.id, Math.round(tw * cap), Math.round(th * cap));
          if (live) tex = live;
        }
        rivePlane(rive.id, live ? 'live' : tex ? 'still' : 'none', riveUploads);
      } else if (item.cover && big && !still) {
        const cap = Math.min(dpr, siteCoverDials().coverMaxDpr) / dpr;
        const live = liveCoverTexture(item.cover.id, Math.round(tw * cap), Math.round(th * cap));
        if (live) {
          tex = live;
          liveThisFrame = true;
        }
      }
      u.uMap.value = tex;
      u.uPremul.value = item.cover ? 1 : 0;
      // A live cover lies on the sky with no card around it: no rounded
      // corners, no shadow (below), and the paper's light only where its ink is
      // — card 02's by the site's coverPaperShade, a Rive cover's by its own.
      const bare = !!item.cover;
      u.uCoverShade.value = rive ? (riveDials?.coverPaperShade ?? 1) : siteCoverDials().coverPaperShade;

      // Sprite mask: every hover sprite's box, from its inline px in the panel.
      let sprites = 0;
      if (plateEl) {
        const hostW = p.rect.w / p.scale;
        const hostH = p.rect.h / p.scale;
        for (const o of p.el.querySelectorAll<HTMLElement>('.cover-anim__obj')) {
          if (sprites >= MAX_SPRITES) break;
          const s = o.style;
          const r = spriteUvRect(
            parseFloat(s.left),
            parseFloat(s.top),
            parseFloat(s.width),
            parseFloat(s.height),
            hostW,
            hostH,
          );
          u.uSprites.value[sprites++].set(r[0], r[1], r[2], r[3]);
        }
      }
      u.uSpriteCount.value = sprites;

      const hover = override.hover ?? (still ? 0 : sampleTween(c.hover, now) * P);
      // The cursor only matters while there is a dent to put under it; held
      // still otherwise, so a pointer crossing a card under reduced motion does
      // not repaint it.
      if (hovered && hovered.key === p.key && hoveredUv && hover > 0) {
        u.uHit.value.set(hoveredUv.u - 0.5, hoveredUv.v - 0.5);
      }
      const fold = override.fold ?? (still ? 0 : effectiveFold(sampleTween(c.fold, now), p.dist) * P);
      const vel = override.velocity ?? (still ? 0 : velocity * P);

      u.uRect.value.set(p.rect.cx, p.rect.cy, p.rect.w, p.rect.h);
      u.uViewport.value.set(vw, vh);
      u.uPerspective.value = PERSPECTIVE_VH * vh;
      u.uPixelRatio.value = dpr;
      u.uRadius.value = bare ? 0 : CARD_RADIUS_PX * p.scale;
      u.uIndex.value = p.idx;
      // In 8-bit steps, as the compositor applies the DOM panel's opacity: the
      // strip's hover-dim eases forever in its last bits, and repainting on
      // those moved the canvas by a level where the DOM had not moved at all.
      const alpha = Math.round(p.opacity * 255) / 255;
      u.uAlpha.value = alpha;
      u.uCreaseBlend.value = zero ? 0 : paper.creaseBlend * P;
      u.uCreaseDisplacement.value = zero ? 0 : paper.creaseDisplacement * P;
      u.uHover.value = zero ? 0 : hover;
      u.uHoverRadius.value = paper.hoverRadius;
      u.uHoverDepth.value = paper.hoverDepth;
      u.uVelocity.value = zero ? 0 : vel;
      u.uSquash.value = paper.squash;
      u.uSquashScale.value = paper.squashScale;
      // The hero's ripple is its own dial (0 by default, so the plate stays
      // registered with the DOM sprites at rest); a panel sliding between the
      // hero slot and a neighbour's blends the two by its distance, so the
      // slide has no step in it.
      const ripple = paper.heroRipple + (paper.ripple - paper.heroRipple) * Math.min(1, p.dist);
      u.uRipple.value = zero || still ? 0 : ripple * P;
      u.uFold.value = zero ? 0 : fold;
      u.uFoldAmp.value = paper.foldAmp;
      // The boil moves the plate with its sprites — the layer's own translate
      // and rotate, taken to screen by the panel's scale. Not under `presence`:
      // the sprites boil whether or not the paper has settled, and the plate
      // has to go where they go. Not under `override.zero` either: that zeroes
      // the paper's EFFECTS, and the boil is registration, not an effect — it is
      // how the verify suite compares a boiled plate with the boiled DOM one.
      // The layer does not boil under reduced motion.
      const b = boilFor(p.el);
      u.uBoil.value.set(b.dx * p.scale, b.dy * p.scale, (b.deg * Math.PI) / 180);
      c.mesh.visible = tex !== null && !(override.hideCovers && item.cover);

      // The shadow: the DOM panel's box-shadow, scaled with the panel, faded
      // with it, and gone with the card while it is crumpled away. In `out` the
      // DOM has its own back, so the canvas stops drawing one on that frame.
      const s = c.shadow.material.uniforms;
      s.uRect.value.copy(u.uRect.value);
      s.uSigma.value = (SHADOW.blur / 2) * p.scale;
      s.uMargin.value = SHADOW.blur * 1.5 * p.scale;
      s.uOffsetY.value = SHADOW.y * p.scale;
      // A live cover has none: its DOM panel has none either (DetailView.css).
      s.uAlpha.value = state === 'out' || bare ? 0 : SHADOW.alpha * alpha * (1 - u.uFold.value);
      // A live cover lets the sky through its ground: its shadow stays outside it.
      s.uHole.value = item.cover ? 1 : 0;
      s.uRadius.value = CARD_RADIUS_PX * p.scale;

      c.shadow.visible = !bare;
      c.shadow.renderOrder = order++;
      c.mesh.renderOrder = order++;

      sig.push(
        p.key,
        p.rect.cx,
        p.rect.cy,
        p.rect.w,
        p.rect.h,
        alpha,
        u.uHover.value,
        u.uHit.value.x,
        u.uHit.value.y,
        u.uVelocity.value,
        u.uFold.value,
        u.uCreaseBlend.value,
        u.uCreaseDisplacement.value,
        u.uCoverShade.value,
        u.uRipple.value,
        u.uHoverRadius.value,
        u.uHoverDepth.value,
        u.uSquash.value,
        u.uSquashScale.value,
        u.uFoldAmp.value,
        u.uBoil.value.x,
        u.uBoil.value.y,
        u.uBoil.value.z * 1000,
        sprites,
        tex ? tex.id : -1,
        s.uAlpha.value,
      );
      // Keep painting while a tween is still running, even if this frame's
      // sample happens to repeat.
      if (!tweenDone(c.fold, now) || !tweenDone(c.hover, now)) dirty = true;
    }
    if (!tweenDone(presence, now)) dirty = true;
    // A live cover changes every frame, whatever the signature says; a Rive
    // one whenever its player drew a new picture.
    if (liveThisFrame || riveFresh) dirty = true;
    riveFresh = false;

    // An epsilon, not equality: the strip's hover-dim is an exponential ease
    // whose tail moves opacity by 1e-9 a frame for seconds, and an exact compare
    // repainted the canvas on every one of them.
    const changed = sig.length !== lastSig.length || sig.some((x, i) => Math.abs(x - lastSig[i]) > 1e-5);
    if (!force && !dirty && !changed) return;
    lastSig = sig; // what is now ON the canvas
    dirty = false;
    span(frames === 0 ? 'render first' : 'render', () => R().render(scene, camera));
    frames++;
  }

  // A panel's face can change between ticks — React mounting or unmounting the
  // CoverAnimLayer after a slide — and the plate/rest choice has to follow on
  // the SAME paint, or the cover shows for one frame with its objects missing.
  // Mutation callbacks run before the paint that shows the mutation.
  const mo = new MutationObserver(() => {
    if (state !== 'dom') render(true);
  });
  mo.observe(root, { childList: true, subtree: true });

  const onResize = () => {
    sync();
    dirty = true;
  };
  window.addEventListener('resize', onResize);

  if (import.meta.env.DEV) {
    (window as unknown as { __paper?: unknown }).__paper = {
      state: () => state,
      ready: () => texturesReady && !!creases && paperReady(),
      /** WebGL contexts the paper has ever made: 1, however many arrivals. */
      contexts: paperContexts,
      /** The resident faces and their state. */
      faces: faceKeys,
      frames: () => frames,
      velocity: () => velocity,
      /** Every plane's rect as the shader is told it, keyed by content idx. */
      rects: () =>
        (last?.panels ?? []).map((p) => ({ key: p.key, idx: p.idx, slot: p.slot, ...p.rect })),
      /** Every plane's vertex-stage inputs — the terms that can move it off
       *  the DOM sprites drawn over it. */
      uniforms: () =>
        (last?.panels ?? []).map((p) => {
          const u = cards.get(p.key)?.mesh.material.uniforms;
          return {
            key: p.key,
            idx: p.idx,
            slot: p.slot,
            ripple: u?.uRipple.value,
            hover: u?.uHover.value,
            velocity: u?.uVelocity.value,
            fold: u?.uFold.value,
            boil: u ? { x: u.uBoil.value.x, y: u.uBoil.value.y, rad: u.uBoil.value.z } : null,
            sprites: u?.uSpriteCount.value,
          };
        }),
      folds: () =>
        [...cards.entries()].map(([key, c]) => ({ key, fold: c.mesh.material.uniforms.uFold.value })),
      presence: () => sampleTween(presence, performance.now()),
      /** Live-cover draws issued by this layer (the hero), for verify:cover. */
      coversDrawn: () => coversDrawn + riveUploads,
      /** The Rive hero's texture uploads, and the last one's main-thread ms. */
      riveUploads: () => ({ n: riveUploads, ms: riveUploadMs }),
      /** Main-thread ms per upload of the Rive hero's canvas, `n` in a row. */
      benchRiveUpload: (n = 60) => {
        for (const c of riveTex.values()) {
          const t0 = performance.now();
          for (let i = 0; i < n; i++) {
            c.tex.needsUpdate = true;
            R().initTexture(c.tex);
          }
          return (performance.now() - t0) / n;
        }
        return null;
      },
      /** GPU ms for one hero draw of the live cover (`only`: that one's), in
       *  THIS renderer. */
      benchCover: (only?: string) => {
        for (const [id, c] of liveCoverEntries()) {
          if (!c.rt || !c.r.ready() || (only && id !== only)) continue;
          const def = shaderCover(id)!;
          const crop: Crop = coverCropOf(def.frame.w, def.frame.h, c.rt.width, c.rt.height, { x0: 0, y0: 0, w: 1, h: 1 });
          return {
            id,
            pxW: c.rt.width,
            pxH: c.rt.height,
            ...benchCoverDraw(R(), c.r, c.rt, {
              t: 1,
              crop,
              pxW: c.rt.width,
              pxH: c.rt.height,
              dome: { x: 450, y: 600, amp: 0 },
              backdrop: null,
            }),
          };
        }
        return null;
      },
      /** A cached-pass cover's prints in THIS renderer (card 03): pass A's
       *  renders so far, the last one's ms, the sizes kept; and `diagnose`,
       *  its programs linked and no GL error after a draw of each pass. */
      coverPrints: (id: string) => {
        const c = [...liveCoverEntries()].find(([k]) => k === id)?.[1].r;
        return c instanceof CachedCoverRenderer ? c.printStats() : null;
      },
      coverDiagnose: (id: string) => {
        const c = liveCover(id)?.r;
        return c instanceof CachedCoverRenderer ? c.diagnose() : null;
      },
      set: setPaper,
      override: (o: PaperOverride) => {
        override = o;
        dirty = true;
        render(true);
      },
      freezePresence: (on: boolean) => {
        freezePresence = on;
      },
      holdOut: (on: boolean) => {
        holdOut = on;
      },
      handOut: () => handOut(() => {}),
      /** What three.js projects for each plane's flat corners, CSS px. */
      projected: () =>
        (last?.panels ?? []).map((p) => {
          const u = cards.get(p.key)?.mesh.material.uniforms.uRect.value;
          if (!u) return null;
          const corner = (sx: number, sy: number) => {
            const v = new Vector3(u.x + (sx * u.z) / 2, -(u.y + (sy * u.w) / 2), 0).project(camera);
            return { x: ((v.x + 1) / 2) * vw, y: ((1 - v.y) / 2) * vh };
          };
          const a = corner(-1, -1);
          const b = corner(1, 1);
          return { key: p.key, idx: p.idx, slot: p.slot, x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
        }),
    };
  }

  adopt();
  sync();

  return {
    frame,
    sync: () => {
      sync();
      maybeHandIn();
    },
    dispose() {
      window.clearTimeout(timer);
      mo.disconnect();
      unregister();
      unsubPaper();
      unsubBoil();
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onLeave);
      window.removeEventListener('resize', onResize);
      unsubProgress();
      root.removeAttribute('data-paper');
      const then = pendingLeave;
      pendingLeave = null;
      for (const k of [...cards.keys()]) dropCard(k);
      for (const c of riveTex.values()) c.tex.dispose();
      geometry.dispose();
      shadowGeometry.dispose();
      // The GL is NOT disposed: the canvas leaves this mount, hidden, and the
      // context, its programs, the crease map, the covers' renderers and the
      // faces stay for the next arrival (paperGL.ts).
      if (canvas) {
        canvas.style.visibility = 'hidden';
        canvas.remove();
      }
      disposed = true;
      then?.();
    },
  };
}
