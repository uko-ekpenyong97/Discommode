import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { useConfig } from '../config';
import { config } from '../config';
import { mod } from '../grid';
import { CONTENT, CONTENT_COUNT } from '../content';
import { computeDetailLayout } from '../detailLayout';
import { useTicker } from '../hooks/useTicker';
import type { DetailController } from '../hooks/useDetail';
import './DetailView.css';

const SETTLE_DECAY = Math.log(100);
/** Panels rendered on each side of the centre (buffer so far slides don't blank). */
const PANEL_BUFFER = 2;
/** Swipe thresholds (px) for touch prev/next and exit-down. */
const SWIPE_X = 48;
const SWIPE_DOWN = 80;
/** Vertical centre of the panel strip as a fraction of viewport height (= CSS `top`). */
const PANEL_CY = 0.44;

interface DetailViewProps {
  detail: DetailController;
}

/**
 * The detail reading state: a horizontal strip of panels centred on the active
 * item (neighbours peek at the edges, dimmed), a meta block, and a bottom bar
 * (Prev / title dropdown / Next). The strip slides between items with the grid's
 * exponential-settle feel — a continuous position eased in the rAF loop toward a
 * carousel target that accumulates signed steps (so it slides the short way and
 * retargets cleanly on fast Prev/Next). Grid↔detail expand/collapse is the
 * `data-phase` scale+fade in CSS; arrow keys and horizontal swipes drive
 * prev/next; a down-swipe or the close button exits.
 */
export function DetailView({ detail }: DetailViewProps) {
  const { activeIndex, phase, origin, next, prev, goto, close, transitioning } = detail;
  useConfig(); // re-render on layout/feel dial changes

  const [viewport, setViewport] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Hover-to-isolate: the panel under the cursor stays full, the rest dim. Held
  // in a ref (read by the ticker), so hovering doesn't re-render.
  const hoveredRef = useRef<number | null>(null);
  // Per-panel eased opacity, keyed by element (survives slides; React reuses
  // panel DOM by key, so a continuing panel keeps its eased value).
  const opByEl = useRef(new WeakMap<Element, number>()).current;

  // True 3-card geometry: large centre card, side cards at detailSideScale.
  const { panelW, panelH, panelStep } = computeDetailLayout(
    viewport.w,
    viewport.h,
    config.detailCardScale,
    config.detailSideScale,
    config.detailGap,
  );

  // FLIP transform: ENTER expands from the clicked card's actual rect; EXIT (and
  // deep-link / back, which have no origin) collapses to the centre at a card's
  // size. transform-origin is the centre panel, so the scale grows/shrinks there.
  const centerCx = viewport.w / 2;
  const centerCy = viewport.h * PANEL_CY;
  const fromOrigin = origin && phase === 'enter';
  const centerScale = (config.cardWidth * config.focusScale) / panelW;
  const enterScale = fromOrigin ? origin.w / panelW : centerScale;
  const enterTx = fromOrigin ? origin.cx - centerCx : 0;
  const enterTy = fromOrigin ? origin.cy - centerCy : 0;

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
      track.style.transform = `translateX(${viewport.w / 2 - pos * panelStep}px)`;

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
      if (transitioning) return;
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
  }, [next, prev, transitioning]);

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
      style={
        {
          '--enter-scale': enterScale,
          '--enter-tx': `${enterTx}px`,
          '--enter-ty': `${enterTy}px`,
          '--detail-ms': `${config.detailTransitionMs}ms`,
          '--detail-scrim': config.detailScrimOpacity,
          transformOrigin: `${centerCx}px ${centerCy}px`,
        } as CSSProperties
      }
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    >
      <div className="detail__strip" ref={trackRef}>
        {panels.map((p) => {
          const distance = Math.abs(p.i - center);
          const isCenter = distance === 0;
          const item = CONTENT[p.idx];
          // Size, opacity, and z-index are written imperatively by the ticker
          // (continuous in the slide position); base size is the centre size.
          return (
            <button
              key={p.i}
              type="button"
              data-i={p.i}
              className={isCenter ? 'detail__panel detail__panel--center' : 'detail__panel'}
              style={{
                left: `${p.i * panelStep}px`,
                width: `${panelW}px`,
                height: `${panelH}px`,
              }}
              onClick={() => !isCenter && goto(p.idx)}
              onPointerEnter={(e) => e.pointerType !== 'touch' && (hoveredRef.current = p.i)}
              onPointerLeave={(e) => e.pointerType !== 'touch' && (hoveredRef.current = null)}
              tabIndex={isCenter ? -1 : 0}
              aria-label={isCenter ? undefined : `Go to item ${item.title}`}
              aria-hidden={isCenter ? true : undefined}
            >
              {item.image ? (
                <img className="detail__media" src={item.image} alt={`Poster ${item.title}`} draggable={false} />
              ) : (
                <div className="detail__media" style={{ background: `hsl(${item.hue}, 28%, 32%)` }} />
              )}
              <span className="detail__panel-num">{item.title}</span>
            </button>
          );
        })}
      </div>

      {/* Low-opacity bottom scrim for text legibility over the live sky. */}
      <div className="detail__scrim" aria-hidden="true" />

      <div className="detail__meta">
        <h1 className="detail__title">Item {activeItem.title}</h1>
        <p className="detail__captions">{activeItem.captions.join('  ·  ')}</p>
      </div>

      <div className="detail__bar">
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
        <button type="button" className="detail__btn" onClick={next} aria-label="Next item">
          Next ›
        </button>
      </div>

      <button type="button" className="detail__close" onClick={close} aria-label="Close detail">
        ✕
      </button>
    </div>
  );
}
