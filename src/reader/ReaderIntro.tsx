import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { DialRoot, DialTimeline, useDialKit, useDialTimeline } from 'dialkit';
import type { TimelineConfig } from 'dialkit';
import type { FlipEngine } from './flipEngine';
import './ReaderIntro.css';

/* ─────────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — Reader entrance (card → magazine on table)
 *
 *    0ms  stage 0  REST     card in grid, hovered, CTA visible
 *    0ms  stage 1  LIFT     card scale 1 → 1.04, shadow tightens → deep;
 *                          grid dims to 0.4 and softens
 *  150ms  stage 2  TRAVEL   card flies to the cover slot (right half of the
 *                          spread box); w/h ease 3:4 → 10:13
 *  300ms  stage 3  TABLE    sky fades out; wood + vignette fade in beneath
 *                          the moving card
 *  750ms  stage 4  LAND     scale 1.04 → 1.0; travel shadow → page contact
 *                          shadow; low-bounce spring
 * 1050ms  stage 5  BREATH   nothing moves            ← proxy → book swap here
 * 1300ms  stage 6  CHROME   caption + ‹ › fade in
 * 1550ms  stage 7  OPEN     cover turns to 01|02 (marker progress → flip t),
 *                          850ms; first visit per session only
 * 2400ms  stage 8  READING  handoff to the normal reader
 *
 * EXIT: stages 7 → 1 in reverse. Not in this step.
 * ───────────────────────────────────────────────────────────── */

/** Clip start times, in SECONDS (DialKit is seconds; the storyboard is ms).
 *  Derived from the timeline config below — the single source of truth for the
 *  `stage` an arbitrary playhead time falls in, and for the two boundary times
 *  (BREATH = the LAND swap, OPEN = the cover turn) the engine keys off. */
const AT = {
  rest: 0.0,
  lift: 0.0,
  travel: 0.15,
  table: 0.3,
  land: 0.75,
  breath: 1.05, // LAND ends here → proxy hides, real book shows
  chrome: 1.3,
  open: 1.55,
  reading: 2.4,
} as const;

/** Real grid-card size (see config.ts: cardWidth 300, 3:4). The proxy rests at
 *  this size, centred in the viewport, before it flies to the cover slot. */
const CARD = { w: 300, h: 400 };

/** Box-shadow endpoints the `shadow` value (0 → 1) interpolates between: a tight
 *  page-contact shadow (paper lying on the table) and a deep travel shadow (leaf
 *  lifted and floating). Mirrors flipbook.css's contact/ambient intent. */
const SHADOW = {
  contact: { y: 2, blur: 10, spread: -2, alpha: 0.35 },
  travel: { y: 44, blur: 90, spread: -24, alpha: 0.55 },
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** `shadow` 0 (contact) → 1 (deep travel) as an interpolated box-shadow string. */
function shadowFor(s: number): string {
  const y = lerp(SHADOW.contact.y, SHADOW.travel.y, s);
  const blur = lerp(SHADOW.contact.blur, SHADOW.travel.blur, s);
  const spread = lerp(SHADOW.contact.spread, SHADOW.travel.spread, s);
  const alpha = lerp(SHADOW.contact.alpha, SHADOW.travel.alpha, s);
  return `0 ${y.toFixed(1)}px ${blur.toFixed(1)}px ${spread.toFixed(1)}px rgba(0, 0, 0, ${alpha.toFixed(3)})`;
}

/** The seven clips from the brief. `open` is a zero-value MARKER — its progress
 *  drives the real flip engine; it has no `current` of its own. Starting values;
 *  Uko tunes them in the dock and Copy-pastes the result back here. */
const TIMELINE = {
  lift: {
    at: AT.lift,
    duration: 0.35,
    from: { scale: 1, shadow: 0 },
    to: { scale: 1.04, shadow: 1 },
    transition: { type: 'spring', visualDuration: 0.35, bounce: 0.1 },
  },
  grid: {
    at: 0.0,
    duration: 0.45,
    from: { opacity: 1, blur: 0 },
    to: { opacity: 0.4, blur: 6 },
  },
  travel: {
    at: AT.travel,
    duration: 0.6,
    from: { p: 0 },
    to: { p: 1 },
    transition: { type: 'spring', visualDuration: 0.6, bounce: 0.05 },
  },
  table: {
    at: AT.table,
    duration: 0.5,
    from: { opacity: 0 },
    to: { opacity: 1 },
  },
  land: {
    at: AT.land,
    duration: 0.3,
    from: { scale: 1.04, shadow: 1 },
    to: { scale: 1, shadow: 0 },
    transition: { type: 'spring', visualDuration: 0.3, bounce: 0.15 },
  },
  chrome: {
    at: AT.chrome,
    duration: 0.25,
    from: { opacity: 0 },
    to: { opacity: 1 },
  },
  open: { at: AT.open, duration: 0.85 }, // marker; progress → flip t
} satisfies TimelineConfig;

interface Geo {
  card: { left: number; top: number; width: number; height: number };
  slot: { left: number; top: number; width: number; height: number };
}

interface ReaderIntroProps {
  /** The real flip engine, once FlipBook has created it. OPEN drives it. */
  engine: FlipEngine | null;
  /** The `.reader` stage element — the intro reads the cover slot rect from it
   *  and writes the reversible `data-intro-book` LAND boundary onto it. */
  stageRef: RefObject<HTMLDivElement | null>;
  /** Reset the reader to the cover spread (0). Called when a committed OPEN is
   *  scrubbed back across its start, so the turn can be rebuilt cleanly. */
  onResetToCover: () => void;
}

/**
 * The dev-only entrance prototype: a stand-in card that lifts off a stand-in
 * grid, travels to the cover slot, lands as the closed magazine and opens — as a
 * scrubbable DialKit Timeline. Choreography only; wiring to the real grid card
 * (4c) and the exit (4d) are later steps.
 *
 * TODO(production): DialKit's clip.current values are the scrubbable authoring
 * preview. When this graduates, replace them with equivalent real Motion
 * animations using the tuned timings/transitions, translate the LAND (breath)
 * and OPEN marker boundaries to real state transitions, then remove
 * useDialTimeline, <DialTimeline /> and <DialRoot />.
 */
export default function ReaderIntro({ engine, stageRef, onResetToCover }: ReaderIntroProps) {
  const tl = useDialTimeline('Reader entrance', TIMELINE, {
    id: 'reader-entrance-v1',
    persist: import.meta.env.DEV,
    autoplay: false,
  });

  // A toggle (does the cover auto-open on first visit?) and a replay action,
  // on their own DialRoot panel alongside the timeline dock.
  const onAction = useCallback(
    (action: string) => {
      if (action === 'replay') tl.replay();
    },
    [tl],
  );
  const panel = useDialKit(
    'INTRO',
    {
      firstVisitAutoOpen: true,
      replay: { type: 'action', label: 'Replay entrance' },
    },
    { id: 'reader-entrance-panel', onAction },
  );

  // Measure the rest rect (centred card) and the destination rect (the real
  // cover slot, `.book__page--right`) so the proxy can FLIP between them. Both
  // are read from layout, re-measured on resize.
  const [geo, setGeo] = useState<Geo | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const stage = stageRef.current;
      const slotEl = stage?.querySelector('.book__page--right');
      if (!slotEl) return;
      const r = slotEl.getBoundingClientRect();
      setGeo({
        card: {
          left: (window.innerWidth - CARD.w) / 2,
          top: (window.innerHeight - CARD.h) / 2,
          width: CARD.w,
          height: CARD.h,
        },
        slot: { left: r.left, top: r.top, width: r.width, height: r.height },
      });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [stageRef]);

  const time = tl.time;

  // Mark the stage as intro-driven for the whole life of the prototype; undo
  // every stage-level style on unmount so the reader returns to normal.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.classList.add('reader--intro');
    return () => {
      stage.classList.remove('reader--intro');
      delete stage.dataset.introBook;
      stage.style.removeProperty('--intro-chrome');
    };
  }, [stageRef]);

  // Reversible LAND swap: before BREATH the proxy is the card; at/after BREATH
  // the real book shows and the proxy hides. Derived straight from the playhead
  // (no mirrored state), so scrubbing backward restores the proxy automatically.
  const bookShown = time >= AT.breath;
  useEffect(() => {
    const stage = stageRef.current;
    if (stage) stage.dataset.introBook = bookShown ? 'shown' : 'hidden';
  }, [stageRef, bookShown]);

  // Chrome (real caption + nav) opacity, driven by the chrome clip.
  const chromeOpacity = tl.chrome.current.opacity;
  useEffect(() => {
    const stage = stageRef.current;
    if (stage) stage.style.setProperty('--intro-chrome', String(chromeOpacity));
  }, [stageRef, chromeOpacity]);

  // OPEN: drive the real flip engine from the marker's progress. Per the agreed
  // model — startTurn when the marker begins, applyTurn every frame, and COMMIT
  // only when a forward-played playhead completes the marker. Scrubbing back
  // across the start cancels (or resets a committed turn). Guards keep it
  // reversible so scrubbing to any time shows the curl at the corresponding t.
  const armedRef = useRef(false);
  const committedRef = useRef(false);
  const prevTimeRef = useRef(time);
  useEffect(() => {
    const forward = time >= prevTimeRef.current;
    prevTimeRef.current = time;

    const open = tl.open;
    const autoOpen = panel.firstVisitAutoOpen;

    if (!engine || !autoOpen) {
      if (armedRef.current) {
        engine?.clearTurn();
        armedRef.current = false;
        committedRef.current = false;
      }
      return;
    }

    if (open.started) {
      if (!armedRef.current) {
        armedRef.current = engine.startTurn('next');
        committedRef.current = false;
      }
      if (armedRef.current && !committedRef.current) {
        const p = Math.min(open.progress, 1);
        engine.applyTurn(p);
        if (p >= 0.999 && forward) {
          engine.commitTurn(0); // finalises the spread via onSpreadChange
          committedRef.current = true;
        }
      }
    } else if (armedRef.current) {
      // Scrubbed back before the turn began — undo cleanly.
      if (committedRef.current) onResetToCover();
      else engine.clearTurn();
      armedRef.current = false;
      committedRef.current = false;
    }
  }, [engine, time, tl.open, panel.firstVisitAutoOpen, onResetToCover]);

  // Proxy geometry for the current playhead. travel.p drives the FLIP rect; the
  // scale/shadow come from LIFT before the land boundary and LAND after it.
  const p = tl.travel.current.p;
  const scale = time >= AT.land ? tl.land.current.scale : tl.lift.current.scale;
  const shadowVal = time >= AT.land ? tl.land.current.shadow : tl.lift.current.shadow;
  const grid = tl.grid.current;
  const skyOpacity = 1 - tl.table.current.opacity;

  const proxyStyle = geo
    ? {
        left: lerp(geo.card.left, geo.slot.left, p),
        top: lerp(geo.card.top, geo.slot.top, p),
        width: lerp(geo.card.width, geo.slot.width, p),
        height: lerp(geo.card.height, geo.slot.height, p),
        transform: `scale(${scale})`,
        boxShadow: shadowFor(shadowVal),
        opacity: bookShown ? 0 : 1,
      }
    : { opacity: 0 };

  return (
    <>
      <div
        className="intro-sky"
        style={{ opacity: skyOpacity, ['--intro-grid-blur' as string]: `${grid.blur}px` }}
      >
        <div className="intro-grid" style={{ opacity: grid.opacity }}>
          <div className="intro-grid__card" />
          <div className="intro-grid__card" />
          <div className="intro-grid__card" />
        </div>
      </div>

      <div className="intro-proxy" style={proxyStyle}>
        <img src="/issues/01/cover.webp" alt="" draggable={false} />
      </div>

      <button type="button" className="intro-replay" onClick={() => tl.replay()}>
        ↻ Replay entrance
      </button>

      <DialRoot position="top-right" />
      <DialTimeline />
    </>
  );
}
