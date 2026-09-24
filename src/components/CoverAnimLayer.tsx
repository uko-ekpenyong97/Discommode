import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  enterFadeMs,
  faceOf,
  fitCover,
  hitTest,
  leavePlan,
  loadCoverAnims,
  toCover,
  toScreen,
} from '../reader/coverAnims';
import type { CoverAnim, CoverAnimFace, CoverFit, FaceAnims } from '../reader/coverAnims';
import {
  BOIL_REST,
  Boil,
  HERO_REF_W,
  applyBoilStyle,
  boilHoldFor,
  coverLife,
  lastBoil,
  publishBoil,
  staggerMs,
  subscribeBoilHold,
  subscribeCoverLife,
} from '../reader/coverLife';
import type { BoilSample } from '../reader/coverLife';
import './CoverAnimLayer.css';

interface CoverAnimLayerProps {
  /** Manifest URL from `Issue.anims`. */
  manifest: string;
  /**
   * The element that receives the pointer. It is NOT this layer: the layer is
   * `pointer-events: none` so it can never intercept a click on the panel or a
   * drag on the book, and hover is resolved from coordinates instead. In the
   * reader the book owns the drag, so the book is what we listen to.
   *
   * An element rather than a ref, so the listener effect re-runs when the host
   * changes — in the detail view the centre panel is a different DOM node after
   * every slide.
   */
  listen: HTMLElement | null;
  /** Which face's objects to draw — the cover (default) or the back cover. */
  face?: CoverAnimFace;
  /**
   * Whatever else has to BOIL with this layer (see coverLife.ts): the reader
   * passes the book's static slot under the cover, so the face and its sprites
   * move as one. Each must share this layer's box, since both turn about their
   * own centre. The detail view passes nothing: its plate is the paper plane,
   * which reads the boil from the registry instead.
   */
  boilWith?: () => (HTMLElement | null)[];
}

/** Each face boils its own way; the seeds only have to differ. */
const BOIL_SEED: Record<CoverAnimFace, number> = { cover: 0xb011c0, back: 0xb011ba };

const allOnHoverNow = () => coverLife.allOnHover;

/**
 * What an object is doing right now. Objects not in the map are at rest: the
 * still alone, no animated WebP mounted at all.
 *
 *   playing  it is active (the page is hovered, or it is); still hidden,
 *            animation running
 *   waiting  no longer active; still hidden, animation running out its pass
 *            (plus, on a page leave, its stagger hold)
 *   fading   the pass has landed; the still cross-fades back in over it
 *
 * Each object's box carries its phase as `data-phase` (`rest` when absent
 * from the map), which is what the verify suites read.
 */
type Phase = 'playing' | 'waiting' | 'fading';
interface Runtime {
  phase: Phase;
  /** When the animation element was mounted — the loop clock's origin. */
  startedAt: number;
  /** Chosen when the return begins, so the fade renders at the right length. */
  fadeMs: number;
}

/**
 * The hover layer over an illustrated cover.
 *
 * It draws the cover PLATE — the artwork with all twenty animated objects
 * removed — and then every object's frame 1 back on top of it as a sprite. That
 * is why there is a plate at all: an animation can leave the box its first frame
 * occupies, and anything baked into the backdrop would show through the gap it
 * moves out of.
 *
 * At rest the layer is therefore pixel-identical to `cover-rest.webp`, which is
 * the same composite flattened at build time and is what every surface that
 * cannot mount this layer shows instead. Mounting and unmounting are invisible.
 *
 * ENTERING is invisible for the objects that rest on frame 1 — the animation's
 * opening frame is the image already on screen. An object that rests on its LAST
 * frame (a build-up that should read as finished at rest) is the exception: its
 * still and frame 1 differ by design, so the loop dissolves in instead.
 *
 * LEAVING does not snap — cutting a hand-drawn loop mid-pass reads as a glitch,
 * so the animation runs out the remainder of its current pass (never more than
 * one), and only then does the still cross-fade back over it. Re-entering during
 * that wait cancels it and keeps the same element playing, so a pointer wandering
 * back and forth never restarts the loop. The one case with nothing to dissolve —
 * a `once` object that has finished on the very frame it rests on — returns
 * instantly; see `leavePlan`.
 *
 * PAGE HOVER (coverLife.ts): with `allOnHover`, the pointer anywhere on the
 * face makes EVERY object active, not just the one under it, and the face
 * BOILS — this layer drives its face's boil and writes it to itself, to
 * `boilWith`, and to the registry the paper plane reads, in one task. On a
 * page leave the objects go on the ordinary leave rule, each held a little
 * longer (`staggerMs`) so they do not all fade on one frame.
 *
 * ONE `pointermove` listener resolves hover for all twenty objects by testing
 * the pointer against the hit rects in cover space, highest z first. Twenty
 * hover targets would mean twenty elements with pointer events, which would both
 * cost more and, more importantly, sit in front of the panel and the book and
 * eat their clicks and drags.
 *
 * Touch is out of scope: `pointermove` from a touch pointer is ignored, so the
 * layer simply never animates on a phone and the still stays.
 */
export function CoverAnimLayer({ manifest, listen, face = 'cover', boilWith }: CoverAnimLayerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<FaceAnims | null>(null);
  const [ready, setReady] = useState(false);
  const [fit, setFit] = useState<CoverFit>({ scale: 0, offsetX: 0, offsetY: 0 });
  const [hovered, setHovered] = useState<string | null>(null);
  // The pointer is on the PAGE — anywhere inside this layer's box.
  const [pageHover, setPageHover] = useState(false);
  const allOnHover = useSyncExternalStore(subscribeCoverLife, allOnHoverNow);
  const [runtime, setRuntimeState] = useState<Record<string, Runtime>>({});
  // Mirrored so the state machine reads what is current without side effects
  // inside a state updater (which StrictMode runs twice).
  const runtimeRef = useRef<Record<string, Runtime>>({});
  const setRuntime = useCallback((fn: (prev: Record<string, Runtime>) => Record<string, Runtime>) => {
    const next = fn(runtimeRef.current);
    if (next === runtimeRef.current) return;
    runtimeRef.current = next;
    setRuntimeState(next);
  }, []);

  // Pending phase changes, keyed by object, so a re-entry can cancel them.
  const timersRef = useRef<Map<string, number[]> | null>(null);
  const getTimers = useCallback(() => {
    timersRef.current ??= new Map<string, number[]>();
    return timersRef.current;
  }, []);
  const clearTimers = useCallback(
    (id: string) => {
      const timers = getTimers();
      for (const t of timers.get(id) ?? []) window.clearTimeout(t);
      timers.delete(id);
    },
    [getTimers],
  );
  useEffect(
    () => () => {
      const timers = timersRef.current;
      if (!timers) return;
      for (const list of timers.values()) for (const t of list) window.clearTimeout(t);
      timers.clear();
    },
    [],
  );

  useEffect(() => {
    let live = true;
    loadCoverAnims(manifest)
      .then((m) => {
        if (live) setData(faceOf(m, face));
      })
      .catch(() => {}); // no manifest yet ⇒ no layer, the cover just sits there
    return () => {
      live = false;
    };
  }, [manifest, face]);

  // Geometry: the layer fills the cover box, so its own size is the box size.
  // A ResizeObserver covers window resizes AND the dial-driven hero rect moving
  // under it, without this component having to know about either.
  //
  // The LAYOUT size, never a bounding rect: the sprites are positioned in this
  // layer's own CSS px, and every transform above it scales them along with it.
  // A bounding rect includes those transforms — the detail strip's panel scale,
  // a page mid-flip, the boil's own turn — and a transform does not fire the
  // ResizeObserver, so a layer that mounted on a panel still scaling up from a
  // neighbour (Prev/Next) kept sprites 6% small for as long as it lived.
  // getComputedStyle, not offsetWidth: that is rounded to a whole pixel.
  const measure = useCallback(() => {
    const el = rootRef.current;
    if (!el || !data) return;
    const cs = getComputedStyle(el);
    const next = fitCover(parseFloat(cs.width), parseFloat(cs.height), data.w, data.h);
    setFit((prev) =>
      prev.scale === next.scale && prev.offsetX === next.offsetX && prev.offsetY === next.offsetY
        ? prev
        : next,
    );
  }, [data]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || !data) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [data, measure]);

  // Nothing is drawn until the plate and every still have decoded. Until then
  // the surface underneath is showing `cover-rest.webp`, which is this same
  // composite — so the wait is invisible, and painting a half-loaded layer over
  // it would not be.
  useEffect(() => {
    if (!data) return;
    let live = true;
    const need = [data.plate, ...data.objects.map((o) => o.still)];
    void Promise.all(
      need.map((src) => {
        const img = new Image();
        img.src = src;
        return img.decode().catch(() => {});
      }),
    ).then(() => {
      if (live) setReady(true);
    });
    // The animations are wanted for the first hover, not for the first paint, so
    // they warm in parallel without gating anything.
    for (const o of data.objects) {
      const img = new Image();
      img.src = o.src;
      void img.decode().catch(() => {});
    }
    return () => {
      live = false;
    };
  }, [data]);

  // Hover resolution. The listener sits on the host, not on this layer, and the
  // hovered id only changes when the object under the pointer changes — moving
  // across one object's artwork causes no re-render at all.
  useEffect(() => {
    const host = listen;
    if (!host || !data || fit.scale <= 0) return;

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const root = rootRef.current;
      const el = root?.parentElement;
      if (!root || !el) return;
      // The pointer in this layer's own CSS px, where `fit` is: the parent's
      // box on screen (untouched by the boil), undone by whatever scales it.
      const box = el.getBoundingClientRect();
      const cs = getComputedStyle(root);
      const w = parseFloat(cs.width);
      const h = parseFloat(cs.height);
      const x = ((e.clientX - box.left) * w) / box.width;
      const y = ((e.clientY - box.top) * h) / box.height;
      // In the reader the host is the whole book; the page is this box.
      setPageHover(x >= 0 && y >= 0 && x <= w && y <= h);
      const p = toCover(x, y, fit);
      const found = p ? hitTest(data.objects, p.x, p.y) : null;
      setHovered((prev) => (prev === (found?.id ?? null) ? prev : (found?.id ?? null)));
    };
    const onLeave = () => {
      setHovered(null);
      setPageHover(false);
    };

    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerleave', onLeave);
    host.addEventListener('pointercancel', onLeave);
    return () => {
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', onLeave);
      host.removeEventListener('pointercancel', onLeave);
    };
  }, [data, fit, listen]);

  // Drive the state machine off the set of objects that should be playing:
  // every object on the face while the page is hovered (`allOnHover`), else
  // the one under the pointer. Objects enter and leave that set; nothing else
  // matters to them, so hovering one object while all are playing does nothing.
  const activeKey = pageHover && allOnHover ? '*' : (hovered ?? '');
  const previous = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!data) return;
    const ids = data.objects.map((o) => o.id);
    const next = new Set(activeKey === '*' ? ids : activeKey ? [activeKey] : []);
    const prev = previous.current;
    previous.current = next;
    const timers = getTimers();

    const leaving = ids.filter((id) => prev.has(id) && !next.has(id));
    // A whole face leaving at once is staggered, so twenty loops that started
    // together do not fade back on one frame; a single object leaves on time.
    const group = leaving.length > 1;
    for (const id of leaving) {
      clearTimers(id);
      const rt = runtimeRef.current[id];
      if (!rt) continue;
      const i = ids.indexOf(id);
      const o = data.objects[i];
      const plan = leavePlan(performance.now() - rt.startedAt, o);
      const hold = group ? staggerMs(i, coverLife.stagger) : 0;
      const toRest = () => {
        setRuntime((r) => {
          if (!r[id]) return r;
          const out = { ...r };
          delete out[id];
          return out;
        });
        timers.delete(id);
      };
      const after = window.setTimeout(() => {
        if (plan.fade === 0) {
          toRest();
          return;
        }
        setRuntime((r) => (r[id] ? { ...r, [id]: { ...r[id], phase: 'fading' } } : r));
        timers.set(id, [window.setTimeout(toRest, plan.fade)]);
      }, plan.wait + hold);
      timers.set(id, [after]);
      setRuntime((r) => (r[id] ? { ...r, [id]: { ...r[id], phase: 'waiting', fadeMs: plan.fade } } : r));
    }

    const entering = ids.filter((id) => next.has(id) && !prev.has(id));
    if (entering.length === 0) return;
    // Cancel any pending return and take it back to `playing`. `startedAt` is
    // KEPT when the element is already mounted: the animation never stopped,
    // so restarting its clock would misplace the next loop boundary.
    for (const id of entering) clearTimers(id);
    const now = performance.now();
    setRuntime((r) => {
      const out = { ...r };
      for (const id of entering) {
        out[id] = r[id]
          ? { ...r[id], phase: 'playing' }
          : { phase: 'playing', startedAt: now, fadeMs: 0 };
      }
      return out;
    });
  }, [activeKey, data, clearTimers, getTimers, setRuntime]);

  // THE BOIL. One signal per face (coverLife.ts), stepped at boilFps, its
  // amplitude ramping with the page hover. This layer is its only driver: on
  // every change it writes the same translate/rotate to itself and to
  // `boilWith`, and publishes it for the paper plane, all in one task — so
  // whatever draws the plate and the sprites drawn over it move on the same
  // frame and stay registered. The loop only runs while there is a boil.
  const boilRef = useRef<Boil | null>(null);
  const fitRef = useRef(fit);
  const boilWithRef = useRef(boilWith);
  useEffect(() => {
    fitRef.current = fit;
    boilWithRef.current = boilWith;
  });
  const rafRef = useRef(0);
  const shownRef = useRef<BoilSample>(BOIL_REST);
  const tickRef = useRef<() => void>(() => {});
  useEffect(() => {
    const host = listen;
    const apply = (b: BoilSample) => {
      const root = rootRef.current;
      if (root) applyBoilStyle(root, b);
      for (const el of boilWithRef.current?.() ?? []) if (el) applyBoilStyle(el, b);
      if (host) publishBoil(host, b);
      lastBoil.set(face, b);
    };
    const tick = () => {
      rafRef.current = 0;
      const boil = boilRef.current;
      if (!boil) return;
      const now = performance.now();
      const f = fitRef.current;
      const scale = data ? (f.scale * data.w) / HERO_REF_W : 0;
      const hold = import.meta.env.DEV ? boilHoldFor(face) : null;
      const b = boil.sample(now, scale, coverLife, hold);
      const was = shownRef.current;
      if (b.dx !== was.dx || b.dy !== was.dy || b.deg !== was.deg || b.amp !== was.amp) {
        shownRef.current = b;
        apply(b);
      }
      if (boil.active(now) || hold) rafRef.current = requestAnimationFrame(tick);
    };
    tickRef.current = () => {
      if (!rafRef.current) rafRef.current = requestAnimationFrame(tick);
    };
    const unsubHold = import.meta.env.DEV ? subscribeBoilHold(() => tickRef.current()) : () => {};
    return () => {
      unsubHold();
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      // Gone mid-boil (a slide, a turn lifting the cover): everything it moved
      // goes back exactly where it was.
      shownRef.current = BOIL_REST;
      apply(BOIL_REST);
    };
  }, [listen, face, data]);

  useEffect(() => {
    boilRef.current ??= new Boil(BOIL_SEED[face]);
    // Reduced motion: no boil. The objects still play.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    boilRef.current.hover(pageHover && !reduced, performance.now());
    tickRef.current();
  }, [pageHover, face]);

  const show = data !== null && ready && fit.scale > 0;

  return (
    <div
      className="cover-anim"
      ref={rootRef}
      aria-hidden="true"
      data-page-hover={pageHover ? '' : undefined}
    >
      {show && data && (
        <>
          <img className="cover-anim__plate" src={data.plate} alt="" draggable={false} />
          {data.objects.map((o: CoverAnim) => {
            const box = toScreen(o.displayRect, fit);
            const rt = runtime[o.id];
            const stillHidden = rt !== undefined && rt.phase !== 'fading';
            return (
              <div
                key={o.id}
                className="cover-anim__obj"
                data-id={o.id}
                data-phase={rt?.phase ?? 'rest'}
                style={{
                  left: `${box.left}px`,
                  top: `${box.top}px`,
                  width: `${box.width}px`,
                  height: `${box.height}px`,
                }}
              >
                {rt && <img className="cover-anim__frame" src={o.src} alt="" draggable={false} />}
                <img
                  className="cover-anim__frame"
                  src={o.still}
                  alt=""
                  draggable={false}
                  style={{
                    opacity: stillHidden ? 0 : 1,
                    // On the way IN: instant when the animation opens on this very
                    // image, a dissolve when it opens on a different frame. On the
                    // way BACK: soft, so any residual mismatch at the loop boundary
                    // is absorbed — except where there is provably none.
                    transition: !rt
                      ? 'none'
                      : rt.phase === 'fading'
                        ? `opacity ${rt.fadeMs}ms linear`
                        : `opacity ${enterFadeMs(o)}ms linear`,
                  }}
                />
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
