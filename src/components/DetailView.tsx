import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { useConfig } from '../config';
import { config } from '../config';
import { mod } from '../grid';
import { CONTENT, CONTENT_COUNT, itemFace } from '../content';
import { openReader } from '../reader/readerNav';
import { panelStepFor } from '../detailLayout';
import type { HeroRect } from '../layout/hero';
import { useTicker } from '../hooks/useTicker';
import type { DetailController } from '../hooks/useDetail';
import './DetailView.css';

const SETTLE_DECAY = Math.log(100);
/** Panels rendered on each side of the centre (buffer so far slides don't blank). */
const PANEL_BUFFER = 2;
/** Swipe thresholds (px) for touch prev/next and exit-down. */
const SWIPE_X = 48;
const SWIPE_DOWN = 80;
interface DetailViewProps {
  detail: DetailController;
  /** 'morph' = the positional FLIP runs on a separate layer (strip hidden during
   *  the transition); 'fade' = the whole view cross-fades (deep-link / reduced motion). */
  transition: 'morph' | 'fade';
  /** True while the reader layer is open above the app — arrow keys are ignored
   *  (the reader owns input) and the view stays frozen under the reader. */
  suspended?: boolean;
  /** The shared hero rect: the centre panel is positioned and sized to it. */
  hero: HeroRect;
}

/**
 * The detail reading state: a 3-card strip (large centre, side cards flanking),
 * a meta block, and a bottom bar (Prev / title dropdown / Next). The strip slides
 * between items with the grid's exponential-settle feel (continuous position
 * eased in the rAF loop toward a signed-accumulating carousel target). The
 * grid↔detail transition itself is the positional FLIP on `DetailMorph` (Phase
 * 15); this view's strip is hidden during the morph and appears (matching the
 * morph's end) when settled, while the chrome fades. Clicking empty backdrop
 * dismisses; arrow keys / horizontal swipes drive prev/next; a down-swipe exits.
 */
export function DetailView({ detail, transition, suspended = false, hero }: DetailViewProps) {
  const { activeIndex, phase, next, prev, goto, close, transitioning } = detail;
  useConfig(); // re-render on layout/feel dial changes

  // Hover-to-isolate: the panel under the cursor stays full, the rest dim. Held
  // in a ref (read by the ticker), so hovering doesn't re-render.
  const hoveredRef = useRef<number | null>(null);
  // Per-panel eased opacity, keyed by element (survives slides; React reuses
  // panel DOM by key, so a continuing panel keeps its eased value).
  const opByEl = useRef(new WeakMap<Element, number>()).current;

  // 3-card geometry from the shared hero rect: centre panel = hero, sides at
  // detailSideScale. The hero's centre is the viewport centre (it's centred both
  // ways), so the strip is laid out around it.
  const panelW = hero.w;
  const panelH = hero.h;
  const panelStep = panelStepFor(hero.w, config.detailGap, config.detailSideScale);
  const centerX = hero.x + hero.w / 2;

  // Continuous carousel slide: target accumulates signed shortest steps as the
  // active item changes; the rAF loop eases the live position toward it and
  // writes the strip transform. `center` (round of the position) drives which
  // panels render — updated only when it shifts, like the grid window.
  const trackRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef(activeIndex);
  const posRef = useRef(activeIndex);
  const [center, setCenter] = useState(activeIndex);
  const centerRef = useRef(activeIndex);
  const prevActiveRef = useRef(activeIndex);

  useEffect(() => {
    if (activeIndex === prevActiveRef.current) return;
    let step = activeIndex - prevActiveRef.current;
    if (step > CONTENT_COUNT / 2) step -= CONTENT_COUNT;
    else if (step < -CONTENT_COUNT / 2) step += CONTENT_COUNT;
    prevActiveRef.current = activeIndex;
    targetRef.current += step;
  }, [activeIndex]);

  useTicker((dt) => {
    const target = targetRef.current;
    const k = 1 - Math.exp(-dt / (config.detailSlideMs / 1000 / SETTLE_DECAY));
    let pos = posRef.current + (target - posRef.current) * k;
    if (Math.abs(target - pos) < 0.0005) pos = target;
    posRef.current = pos;

    const track = trackRef.current;
    if (track) {
      track.style.transform = `translateX(${centerX - pos * panelStep}px)`;

      // Per-panel: continuous scale (centre = 1 → side = detailSideScale) and
      // opacity (resting fade to detailSideOpacity, or the hover-isolate state),
      // driven by the continuous distance from centre so the slide interpolates
      // smoothly with no size/opacity pop at the crossover.
      const sideScale = config.detailSideScale;
      const sideOp = config.detailSideOpacity;
      const hoverDim = config.detailHoverDim;
      const hov = hoveredRef.current;
      const kOp = 1 - Math.exp(-dt / (config.overlayFadeMs / 1000));
      track.querySelectorAll<HTMLElement>('.detail__panel').forEach((el) => {
        const i = Number(el.dataset.i);
        const d = Math.min(Math.abs(i - pos), 1);
        const scale = 1 + (sideScale - 1) * d;
        const restOp = 1 + (sideOp - 1) * d;
        const targetOp = hov === null ? restOp : i === hov ? 1 : hoverDim;
        const prev = opByEl.get(el);
        const op = prev === undefined ? targetOp : prev + (targetOp - prev) * kOp;
        opByEl.set(el, op);
        el.style.transform = `translate(-50%, -50%) scale(${scale})`;
        el.style.opacity = String(op);
        el.style.zIndex = String(Math.round(100 - Math.abs(i - pos) * 10));
      });
    }

    const c = Math.round(pos);
    if (c !== centerRef.current) {
      centerRef.current = c;
      setCenter(c);
    }
  });

  const panels = useMemo(() => {
    const out: { i: number; idx: number }[] = [];
    for (let i = center - PANEL_BUFFER; i <= center + PANEL_BUFFER; i++) {
      out.push({ i, idx: mod(i, CONTENT_COUNT) });
    }
    return out;
  }, [center]);

  // Keyboard: arrows drive prev/next while in detail (grid keys are suspended).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (transitioning || suspended) return; // reader open ⇒ it owns the keys
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prev();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, transitioning, suspended]);

  // Touch swipe: horizontal = prev/next, downward = close.
  const swipeRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.pointerType !== 'touch') return;
    swipeRef.current = { x: e.clientX, y: e.clientY, t: e.timeStamp };
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    const s = swipeRef.current;
    swipeRef.current = null;
    if (!s || transitioning) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > SWIPE_X) {
      if (dx < 0) next();
      else prev();
    } else if (dy > SWIPE_DOWN) {
      close();
    }
  };

  const activeItem = CONTENT[activeIndex];

  return (
    <div
      className="detail"
      data-phase={phase}
      data-trans={transition}
      style={
        {
          '--detail-ms': `${config.detailTransitionMs}ms`,
          '--detail-chrome-ms': `${config.detailChromeFadeMs}ms`,
        } as CSSProperties
      }
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onClick={close} // click on the empty backdrop dismisses (panels/bar stop propagation)
    >
      <button
        type="button"
        className="detail__back"
        onClick={(e) => {
          e.stopPropagation();
          close();
        }}
      >
        ← Back to the grid
      </button>

      <div className="detail__strip" ref={trackRef}>
        {panels.map((p) => {
          const distance = Math.abs(p.i - center);
          const isCenter = distance === 0;
          const item = CONTENT[p.idx];
          // The centre panel of a readable issue opens the reader; side panels
          // navigate; a centre non-issue panel is inert (aria-hidden).
          const canRead = isCenter && !!item.issue;
          const face = itemFace(item);
          // Size, opacity, and z-index are written imperatively by the ticker
          // (continuous in the slide position); base size is the centre size.
          return (
            <button
              key={p.i}
              type="button"
              data-i={p.i}
              className={
                canRead
                  ? 'detail__panel detail__panel--center detail__panel--readable'
                  : isCenter
                    ? 'detail__panel detail__panel--center'
                    : 'detail__panel'
              }
              style={{
                left: `${p.i * panelStep}px`,
                width: `${panelW}px`,
                height: `${panelH}px`,
              }}
              onClick={(e) => {
                e.stopPropagation(); // a card is not backdrop — don't dismiss
                if (!isCenter) goto(p.idx);
                else if (item.issue) openReader(item.issue);
              }}
              onPointerEnter={(e) => e.pointerType !== 'touch' && (hoveredRef.current = p.i)}
              onPointerLeave={(e) => e.pointerType !== 'touch' && (hoveredRef.current = null)}
              tabIndex={isCenter ? (canRead ? 0 : -1) : 0}
              aria-label={
                canRead ? `Read issue ${item.issue}` : isCenter ? undefined : `Go to item ${item.title}`
              }
              aria-hidden={isCenter && !canRead ? true : undefined}
            >
              {face ? (
                <img className="detail__media" src={face} alt={`Poster ${item.title}`} draggable={false} />
              ) : (
                <div className="detail__media" style={{ background: `hsl(${item.hue}, 28%, 32%)` }} />
              )}
              <span className="detail__panel-num">{item.title}</span>
            </button>
          );
        })}
      </div>

      <div className="detail__bar" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="detail__btn" onClick={prev} aria-label="Previous item">
          ‹ Prev
        </button>
        <select
          className="detail__select"
          value={activeIndex}
          onChange={(e) => goto(Number(e.target.value))}
          aria-label="Jump to item"
        >
          {CONTENT.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title} — {item.slug}
            </option>
          ))}
        </select>
        {activeItem.issue && (
          <button
            type="button"
            className="detail__btn detail__btn--read"
            onClick={() => openReader(activeItem.issue!)}
          >
            Read issue
          </button>
        )}
        <button type="button" className="detail__btn" onClick={next} aria-label="Next item">
          Next ›
        </button>
      </div>
    </div>
  );
}
