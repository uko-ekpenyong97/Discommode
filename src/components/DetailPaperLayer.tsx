import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react';
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
  Vector3,
  WebGLRenderer,
} from 'three';
import { CONTENT, itemHeroFace } from '../content';
import { faceOf, loadCoverAnims } from '../reader/coverAnims';
import { issueAnims } from '../reader/issue-01';
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
  coverCrop,
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
import { COVERS } from '../covers/covers';
import { coverTime } from '../covers/coverClock';
import { coverDialsVersion, coverValues, siteCoverDials } from '../covers/coverDials';
import { cssRgb } from '../covers/color';
import { heroDome } from '../covers/dome';
import type { Crop } from '../covers/types';
import { benchCoverDraw } from '../covers/bench';
import type { WebGLRenderTarget } from 'three';

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
 *   dom  → in    `live`, and every texture this viewport needs has decoded
 *   in   → on    HANDOFF_MS later; the DOM faces go `visibility: hidden`
 *   on   → out   a leave (close, Read issue, Open project) — see handoff.ts
 *   out  → dom   HANDOFF_MS later; then the leave runs
 *   any  → dom   INSTANTLY when `live` drops without a leave having asked
 *                (browser Back, a hash edit) or the viewport's size changes
 *
 * The state is written to the `.detail` element as `data-paper`, which is all
 * DetailView.css needs.
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

/** Hard cap on the canvas's backing store — the portfolio sheet's rule. */
const MAX_DPR = 2;

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
}

type State = 'dom' | 'in' | 'on' | 'out';

interface Card {
  mesh: Mesh<PlaneGeometry, PaperMaterial>;
  shadow: Mesh<PlaneGeometry, ShadowMaterial>;
  fold: Tween;
  hover: Tween;
  slot: number;
}

/** DEV: forced uniforms for the verify suite — `zero` is the identity check. */
export interface PaperOverride {
  zero?: boolean;
  velocity?: number;
  hover?: number;
  fold?: number;
}

const hueFill = (hue: number): string => `hsl(${hue}, 28%, 32%)`;

async function decode(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

/** The face at exactly `w × h` device pixels, cropped as `object-fit: cover`.
 *  `premultiply` for a live cover's still, which is not opaque: the plane
 *  samples it as it samples the live cover (premultiplied). */
async function resized(url: string, w: number, h: number, premultiply = false): Promise<ImageBitmap> {
  const img = await decode(url);
  const c = coverCrop(img.naturalWidth, img.naturalHeight, w, h);
  return createImageBitmap(img, c.sx, c.sy, c.sw, c.sh, {
    resizeWidth: w,
    resizeHeight: h,
    resizeQuality: 'high',
    premultiplyAlpha: premultiply ? 'premultiply' : 'default',
  });
}

function flatTexture(source: TexImageSource | HTMLCanvasElement): Texture {
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

export const DetailPaperLayer = forwardRef<DetailPaperHandle, DetailPaperLayerProps>(
  function DetailPaperLayer({ live, interactive, hero, sideScale }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    // Props the imperative engine reads every frame.
    const liveRef = useRef(live);
    const interactiveRef = useRef(interactive);
    const heroRef = useRef(hero);
    const sideRef = useRef(sideScale);
    const engineRef = useRef<ReturnType<typeof createEngine> | null>(null);

    useLayoutEffect(() => {
      liveRef.current = live;
      interactiveRef.current = interactive;
      heroRef.current = hero;
      sideRef.current = sideScale;
      engineRef.current?.sync();
    });

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const engine = createEngine(canvas, {
        live: () => liveRef.current && paper.paper === 'on',
        interactive: () => interactiveRef.current,
        hero: () => heroRef.current,
        side: () => sideRef.current,
      });
      engineRef.current = engine;
      return () => {
        engineRef.current = null;
        engine.dispose();
      };
    }, []);

    useImperativeHandle(ref, () => ({ frame: (f) => engineRef.current?.frame(f) }), []);

    return <canvas ref={canvasRef} className="detail__paper" aria-hidden="true" />;
  },
);

interface EngineInputs {
  live: () => boolean;
  interactive: () => boolean;
  hero: () => HeroRect;
  side: () => number;
}

function createEngine(canvas: HTMLCanvasElement, input: EngineInputs) {
  const root = canvas.parentElement as HTMLElement;
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: true });
  // No colour management, as on the portfolio sheet: the faces' sRGB bytes go
  // in and come out untouched, which is what makes the plane match the <img>.
  renderer.outputColorSpace = LinearSRGBColorSpace;
  ColorManagement.enabled = false;
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new OrthographicCamera(0, 1, 0, -1, -10, 10);
  let dpr = 1;
  let vw = 0;
  let vh = 0;

  let geometry = new PlaneGeometry(1, 1, paper.segments, paper.segments);
  const shadowGeometry = new PlaneGeometry(1, 1, 1, 1);

  let creases: Texture | null = null;
  void decode('/textures/paper-creases.webp')
    .then((img) => {
      creases = flatTexture(img);
      renderer.initTexture(creases);
      for (const c of cards.values()) c.mesh.material.uniforms.uCreases.value = creases;
      dirty = true;
    })
    .catch(() => {});

  // ── textures ───────────────────────────────────────────────────────────
  // Keyed by `${url}@${w}x${h}`. Built for a SIZE KEY (the hero's device size
  // and the neighbours'); a new key rebuilds the set and drops the old one.
  const textures = new Map<string, Texture>();
  let sizeKey = '';
  let building = '';
  let disposed = false;
  let texturesReady = false;
  let buildToken = 0;
  const plates = new Map<number, string>(); // content idx → plate url

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

  const texKey = (src: string, w: number, h: number) => `${src}@${w}x${h}`;

  async function makeFace(idx: number, w: number, h: number): Promise<[string, Texture]> {
    const item = CONTENT[idx];
    const url = itemHeroFace(item);
    if (!url) {
      const c = document.createElement('canvas');
      c.width = 2;
      c.height = 2;
      const g = c.getContext('2d')!;
      g.fillStyle = hueFill(item.hue);
      g.fillRect(0, 0, 2, 2);
      return [texKey(`hue:${item.hue}`, w, h), flatTexture(c)];
    }
    return [texKey(url, w, h), flatTexture(await resized(url, w, h, !!item.cover))];
  }

  async function buildTextures(key: string) {
    const token = ++buildToken;
    texturesReady = false;
    const d = dims();
    const jobs: Promise<[string, Texture]>[] = [];
    for (let idx = 0; idx < CONTENT.length; idx++) {
      jobs.push(makeFace(idx, d.heroW, d.heroH), makeFace(idx, d.sideW, d.sideH));
      const anims = CONTENT[idx].issue ? issueAnims(CONTENT[idx].issue!) : undefined;
      if (anims) {
        jobs.push(
          loadCoverAnims(anims).then(async (m) => {
            const plate = faceOf(m, 'cover')?.plate;
            if (!plate) throw new Error('no plate');
            plates.set(idx, plate);
            return [texKey(plate, d.heroW, d.heroH), flatTexture(await resized(plate, d.heroW, d.heroH))];
          }),
        );
      }
    }
    const built = await Promise.allSettled(jobs);
    if (token !== buildToken) {
      for (const r of built) if (r.status === 'fulfilled') r.value[1].dispose();
      return;
    }
    for (const t of textures.values()) t.dispose();
    textures.clear();
    for (const r of built) {
      if (r.status !== 'fulfilled') continue;
      const [k, tex] = r.value;
      // Upload now, not on the first frame a card is drawn — which would be in
      // the middle of a slide.
      renderer.initTexture(tex);
      textures.set(k, tex);
    }
    sizeKey = key;
    texturesReady = true;
    dirty = true;
  }

  // ── live covers ────────────────────────────────────────────────────────
  // A card with a live cover (content.ts `cover`) is drawn by the cover's
  // renderer IN THIS CONTEXT, into a target whose texture IS the hero plane's
  // map — a texture cannot cross WebGL contexts, and copying a 2 MP frame across
  // from the grid's stage every frame would cost more than drawing it here.
  // Only the hero is live; the neighbours use the still (itemHeroFace).
  const liveCovers = new Map<string, { r: CoverRenderer; rt: WebGLRenderTarget | null; bound: number }>();
  const coverCrop_: Crop = { x0: 0, y0: 0, w: 1, h: 1 };
  let coversDrawn = 0;

  /** Draw a cover for the hero at `pxW × pxH`; its texture, or null if not ready.
   *  While the cards are handed OUT the DOM face is the live one (it is
   *  dissolving back over this plane) and this holds its last frame, so the one
   *  moment is not drawn twice. */
  function liveCoverTexture(id: string, pxW: number, pxH: number): Texture | null {
    const def = COVERS[id];
    if (!def) return null;
    let c = liveCovers.get(id);
    if (!c) {
      c = { r: new CoverRenderer(renderer, def, coverValues(id)), rt: null, bound: coverDialsVersion() };
      c.r.warm();
      liveCovers.set(id, c);
    }
    if (c.bound !== coverDialsVersion()) {
      c.bound = coverDialsVersion();
      c.r.setValues(coverValues(id));
    }
    if (state === 'out' && c.rt && c.rt.width === pxW && c.rt.height === pxH) return c.rt.texture;
    if (!c.rt || c.rt.width !== pxW || c.rt.height !== pxH) {
      c.rt?.dispose();
      c.rt = CoverRenderer.outputTarget(pxW, pxH);
    }
    const spring = def.domeSpring(coverValues(id));
    heroDome.step(performance.now(), spring.spring, spring.damping);
    coverCropOf(def.frame.w, def.frame.h, pxW, pxH, coverCrop_);
    const site = siteCoverDials();
    const drawn = c.r.draw(c.rt, {
      t: coverTime(),
      crop: coverCrop_,
      pxW,
      pxH,
      dome: heroDome.state,
      backdrop: site.coverBackdrop === 'solid' ? cssRgb(site.coverBackdropColor) : null,
    });
    if (!drawn) return null;
    coversDrawn++;
    return c.rt.texture;
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
    canvas.style.visibility = next === 'dom' ? 'hidden' : 'visible';
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
    renderer.setPixelRatio(dpr);
    renderer.setSize(vw, vh, false);
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
    const d = dims();
    const key = `${d.heroW}x${d.heroH}/${d.sideW}x${d.sideH}`;
    if (key !== sizeKey && !disposed) {
      // A new size: the textures are the wrong resolution. Give the cards back
      // at once and rebuild; the hand-in runs again once they are ready.
      if (state !== 'dom') toDomNow();
      if (building !== key) {
        building = key;
        void buildTextures(key);
      }
    }
    const live = input.live();
    if (!live) {
      heldOutUntil = 0;
      if (state !== 'dom') toDomNow();
    }
  }

  function maybeHandIn() {
    if (state !== 'dom' || !input.live() || !texturesReady || !creases || !last) return;
    if (performance.now() < heldOutUntil) return;
    handIn();
  }

  // ── per frame ──────────────────────────────────────────────────────────
  function frame(f: PaperFrame) {
    last = f;
    sync();
    const v = stripVelocity(f.dpos, f.panelStep, input.hero().w, f.dt);
    velocity += (v - velocity) * lerpK(0.2, f.dt);
    if (Math.abs(velocity) < 1e-5) velocity = 0;
    maybeHandIn();
    if (state !== 'dom') render(false);
  }

  function render(force: boolean) {
    const f = last;
    if (!f) return;
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
      const plate = plateEl ? plates.get(p.idx) : undefined;
      const item = CONTENT[p.idx];
      const big = p.scale > (1 + input.side()) / 2;
      const [tw, th] = plate || big ? [d.heroW, d.heroH] : [d.sideW, d.sideH];
      const src = plate ?? itemHeroFace(item) ?? `hue:${item.hue}`;
      let tex = textures.get(texKey(src, tw, th)) ?? null;
      // The hero's live cover, at the hero's device size (coverMaxDpr caps it),
      // on the shared cover clock. Under reduced motion it stays the still.
      if (item.cover && big && !still) {
        const cap = Math.min(dpr, siteCoverDials().coverMaxDpr) / dpr;
        const live = liveCoverTexture(item.cover.id, Math.round(tw * cap), Math.round(th * cap));
        if (live) {
          tex = live;
          liveThisFrame = true;
        }
      }
      u.uMap.value = tex;
      u.uPremul.value = item.cover ? 1 : 0;

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
      u.uRadius.value = CARD_RADIUS_PX * p.scale;
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
      c.mesh.visible = tex !== null;

      // The shadow: the DOM panel's box-shadow, scaled with the panel, faded
      // with it, and gone with the card while it is crumpled away. In `out` the
      // DOM has its own back, so the canvas stops drawing one on that frame.
      const s = c.shadow.material.uniforms;
      s.uRect.value.copy(u.uRect.value);
      s.uSigma.value = (SHADOW.blur / 2) * p.scale;
      s.uMargin.value = SHADOW.blur * 1.5 * p.scale;
      s.uOffsetY.value = SHADOW.y * p.scale;
      s.uAlpha.value = state === 'out' ? 0 : SHADOW.alpha * alpha * (1 - u.uFold.value);
      // A live cover lets the sky through its ground: its shadow stays outside it.
      s.uHole.value = item.cover ? 1 : 0;
      s.uRadius.value = CARD_RADIUS_PX * p.scale;

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
    // A live cover changes every frame, whatever the signature says.
    if (liveThisFrame) dirty = true;

    // An epsilon, not equality: the strip's hover-dim is an exponential ease
    // whose tail moves opacity by 1e-9 a frame for seconds, and an exact compare
    // repainted the canvas on every one of them.
    const changed = sig.length !== lastSig.length || sig.some((x, i) => Math.abs(x - lastSig[i]) > 1e-5);
    if (!force && !dirty && !changed) return;
    lastSig = sig; // what is now ON the canvas
    dirty = false;
    renderer.render(scene, camera);
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
      ready: () => texturesReady && !!creases,
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
      coversDrawn: () => coversDrawn,
      /** GPU ms for one hero draw of the live cover, in THIS renderer. */
      benchCover: () => {
        for (const [id, c] of liveCovers) {
          if (!c.rt || !c.r.ready()) continue;
          const def = COVERS[id];
          const crop: Crop = coverCropOf(def.frame.w, def.frame.h, c.rt.width, c.rt.height, { x0: 0, y0: 0, w: 1, h: 1 });
          return {
            id,
            pxW: c.rt.width,
            pxH: c.rt.height,
            ...benchCoverDraw(renderer, c.r, c.rt, {
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
      root.removeAttribute('data-paper');
      const then = pendingLeave;
      pendingLeave = null;
      for (const k of [...cards.keys()]) dropCard(k);
      for (const t of textures.values()) t.dispose();
      for (const c of liveCovers.values()) {
        c.r.dispose();
        c.rt?.dispose();
      }
      creases?.dispose();
      geometry.dispose();
      shadowGeometry.dispose();
      renderer.dispose();
      disposed = true;
      buildToken++;
      then?.();
    },
  };
}
