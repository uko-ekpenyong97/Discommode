import { useCallback, useEffect, useRef, useState } from 'react';
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
}

/**
 * What an object is doing right now. Objects not in the map are at rest: the
 * still alone, no animated WebP mounted at all.
 *
 *   playing  pointer is on it; still hidden, animation running
 *   waiting  pointer has left; still hidden, animation running out its pass
 *   fading   the pass has landed; the still cross-fades back in over it
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
 * ONE `pointermove` listener resolves hover for all twenty objects by testing
 * the pointer against the hit rects in cover space, highest z first. Twenty
 * hover targets would mean twenty elements with pointer events, which would both
 * cost more and, more importantly, sit in front of the panel and the book and
 * eat their clicks and drags.
 *
 * Touch is out of scope: `pointermove` from a touch pointer is ignored, so the
 * layer simply never animates on a phone and the still stays.
 */
export function CoverAnimLayer({ manifest, listen, face = 'cover' }: CoverAnimLayerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<FaceAnims | null>(null);
  const [ready, setReady] = useState(false);
  const [fit, setFit] = useState<CoverFit>({ scale: 0, offsetX: 0, offsetY: 0 });
  const [hovered, setHovered] = useState<string | null>(null);
  const [runtime, setRuntime] = useState<Record<string, Runtime>>({});

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
  const measure = useCallback(() => {
    const el = rootRef.current;
    if (!el || !data) return;
    const r = el.getBoundingClientRect();
    const next = fitCover(r.width, r.height, data.w, data.h);
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
      const el = rootRef.current;
      if (!el) return;
      const box = el.getBoundingClientRect();
      const p = toCover(e.clientX - box.left, e.clientY - box.top, fit);
      const found = p ? hitTest(data.objects, p.x, p.y) : null;
      setHovered((prev) => (prev === (found?.id ?? null) ? prev : (found?.id ?? null)));
    };
    const onLeave = () => setHovered(null);

    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerleave', onLeave);
    host.addEventListener('pointercancel', onLeave);
    return () => {
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', onLeave);
      host.removeEventListener('pointercancel', onLeave);
    };
  }, [data, fit, listen]);

  // Drive the state machine off the hovered id.
  const previous = useRef<string | null>(null);
  useEffect(() => {
    if (!data) return;
    const byId = new Map(data.objects.map((o) => [o.id, o]));
    const leaving = previous.current;
    previous.current = hovered;

    const timers = getTimers();

    if (leaving && leaving !== hovered) {
      clearTimers(leaving);
      setRuntime((prev) => {
        const rt = prev[leaving];
        if (!rt) return prev;
        const o = byId.get(leaving);
        const plan = o
          ? leavePlan(performance.now() - rt.startedAt, o)
          : { wait: 0, fade: 0 };
        const toRest = () => {
          setRuntime((r) => {
            if (!r[leaving]) return r;
            const next = { ...r };
            delete next[leaving];
            return next;
          });
          timers.delete(leaving);
        };
        const after = window.setTimeout(() => {
          if (plan.fade === 0) {
            toRest();
            return;
          }
          setRuntime((r) =>
            r[leaving] ? { ...r, [leaving]: { ...r[leaving], phase: 'fading' } } : r,
          );
          timers.set(leaving, [window.setTimeout(toRest, plan.fade)]);
        }, plan.wait);
        timers.set(leaving, [after]);
        return { ...prev, [leaving]: { ...rt, phase: 'waiting', fadeMs: plan.fade } };
      });
    }

    if (hovered) {
      // Cancel any pending return and take it back to `playing`. `startedAt` is
      // KEPT when the element is already mounted: the animation never stopped,
      // so restarting its clock would misplace the next loop boundary.
      clearTimers(hovered);
      setRuntime((prev) =>
        prev[hovered]
          ? { ...prev, [hovered]: { ...prev[hovered], phase: 'playing' } }
          : {
              ...prev,
              [hovered]: { phase: 'playing', startedAt: performance.now(), fadeMs: 0 },
            },
      );
    }
  }, [hovered, data, clearTimers, getTimers]);

  const show = data !== null && ready && fit.scale > 0;

  return (
    <div className="cover-anim" ref={rootRef} aria-hidden="true">
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
