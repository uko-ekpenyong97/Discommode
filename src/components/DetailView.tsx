import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { CARD_ASPECT_H, CARD_ASPECT_W, useConfig } from '../config';
import { config } from '../config';
import { mod } from '../grid';
import { CONTENT, CONTENT_COUNT } from '../content';
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
  const { activeIndex, phase, next, prev, goto, close, transitioning } = detail;
  useConfig(); // re-render on layout/feel dial changes

  const [viewport, setViewport] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Panel geometry (3:4), sized to the viewport, with neighbours peeking.
  const panelH = Math.min(viewport.h * 0.64, ((viewport.w * 0.6) * CARD_ASPECT_H) / CARD_ASPECT_W);
  const panelW = (panelH * CARD_ASPECT_W) / CARD_ASPECT_H;
  const panelStep = viewport.w / 2 + panelW / 2 - config.detailPeekPx;
  const enterScale = (config.cardWidth * config.focusScale) / panelW;

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
    if (trackRef.current) {
      trackRef.current.style.transform = `translateX(${viewport.w / 2 - pos * panelStep}px)`;
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
          '--detail-ms': `${config.detailTransitionMs}ms`,
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
          return (
            <button
              key={p.i}
              type="button"
              className={isCenter ? 'detail__panel detail__panel--center' : 'detail__panel'}
              style={{
                left: `${p.i * panelStep}px`,
                width: `${panelW}px`,
                height: `${panelH}px`,
                opacity: isCenter ? 1 : config.unfocusedOpacity,
              }}
              onClick={() => !isCenter && goto(p.idx)}
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
