import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { useConfig } from '../config';
import { registerBusy } from '../activity';
import { config } from '../config';
import { mod } from '../grid';
import { CONTENT, CONTENT_COUNT, itemHeroFace } from '../content';
import { openReader } from '../reader/readerNav';
import { openPortfolio } from '../portfolio/portfolioNav';
import { issueAnims } from '../reader/issue-01';
import { CoverAnimLayer } from './CoverAnimLayer';
import { DetailPaperLayer } from './DetailPaperLayer';
import { CoverTile } from '../covers/CoverTile';
import { heroDome } from '../covers/dome';
import { coverSideLive } from '../covers/covers';
import { coverValues } from '../covers/coverDials';
import { LANDED_EPS, focusedIndex, riveFocusAt } from '../covers/focus';
import { riveFocusCard } from '../covers/rive/riveCover';
import type { DetailPaperHandle, PaperPanel } from './DetailPaperLayer';
import { afterHandOut } from './detailPaper/handoff';
import { CHROME_DRIFT_PX, CLEAR_DRIFT_PX, doorway } from '../reader/doorway';
import { panelStepFor } from '../detailLayout';
import type { HeroRect } from '../layout/hero';
import { useTicker } from '../hooks/useTicker';
import { skySplat } from '../sky/skyStage';
import type { DetailController } from '../hooks/useDetail';
import { PillFace, ShapeFace } from '../chrome/Paper';
import { two } from '../chrome/two';
import { useSkyChrome } from '../chrome/useSkyChrome';
import { useChromeFit } from '../chrome/useChromeFit';
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
  /** Edge-to-edge gap between the centre panel and each neighbour, px — the
   *  hero layout's, so it keeps its ratio to the hero on every screen. */
  neighbourGap: number;
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
export function DetailView({ detail, transition, suspended = false, hero, neighbourGap }: DetailViewProps) {
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
  const panelStep = panelStepFor(hero.w, neighbourGap, config.detailSideScale);
  const centerX = hero.x + hero.w / 2;

  // Continuous carousel slide: target accumulates signed shortest steps as the
  // active item changes; the rAF loop eases the live position toward it and
  // writes the strip transform. `center` (round of the position) drives which
  // panels render — updated only when it shifts, like the grid window.
  const trackRef = useRef<HTMLDivElement>(null);
  // The live centre-panel element. The hover layer is drawn inside it and reads
  // the pointer from it, and it is a DIFFERENT node after each slide, so this is
  // state rather than a ref — the layer's listener has to be re-bound.
  const [centerEl, setCenterEl] = useState<HTMLElement | null>(null);
  // The doorway (reader layer above) clears the app's detail chrome as it opens;
  // the ticker fades + drifts these while `doorway.clear` > 0. See below.
  const backRef = useRef<HTMLButtonElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  // The paper canvas under the strip (DetailPaperLayer): told where every panel
  // is at the end of each tick, from the same numbers that just laid them out.
  const paperRef = useRef<DetailPaperHandle>(null);
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

  // A Prev/Next slide is motion the idle warm-up waits for.
  useEffect(() => registerBusy(() => posRef.current !== targetRef.current), []);

  // FOCUS (src/covers/focus.ts): a live cover is told when its card is the
  // centre card — card 04's face errors and bursts into its characters. On
  // the morph in from its start (or landing: the cover's riveFocusAt), on a
  // deep link at once, on a slide as the strip LANDS on the card (a card the
  // strip only passes through is never focused), and off the moment the view
  // leaves it (the active card changes, or the exit starts). Checked on every
  // render and every tick; acted on only when it changes.
  const focusRef = useRef<number | null | undefined>(undefined);
  const syncFocus = () => {
    const target = targetRef.current;
    const landed = mod(Math.round(target), CONTENT_COUNT) === activeIndex && Math.abs(target - posRef.current) < LANDED_EPS;
    const cover = CONTENT[activeIndex].cover;
    const focusAt = riveFocusAt(cover ? (coverValues(cover.id) as { rive?: { riveFocusAt?: unknown } }) : undefined);
    const fi = focusedIndex({ phase, transition, activeIndex, landed, focusAt });
    if (fi === focusRef.current) return;
    focusRef.current = fi;
    riveFocusCard(fi);
  };
  useLayoutEffect(syncFocus);
  useEffect(
    () => () => {
      // Forgotten too, so a remount (StrictMode's, in dev) tells it again.
      focusRef.current = undefined;
      riveFocusCard(null);
    },
    [],
  );

  useTicker((dt) => {
    const target = targetRef.current;
    const k = 1 - Math.exp(-dt / (config.detailSlideMs / 1000 / SETTLE_DECAY));
    let pos = posRef.current + (target - posRef.current) * k;
    if (Math.abs(target - pos) < 0.0005) pos = target;
    const dpos = pos - posRef.current;
    posRef.current = pos;

    // The doorway CLEAR channel (reader layer above): 0 normally, → 1 as the
    // reader opens. It fades + drifts the NEIGHBOURS outward and clears the
    // detail chrome, while the centre panel stays put (the reader cover settles
    // onto it). `d` (0 at centre → 1 at a side) scopes the fade to the sides.
    const clear = doorway.clear;

    const track = trackRef.current;
    const paperPanels: PaperPanel[] = [];
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
        const driftX = clear === 0 ? 0 : Math.sign(i - pos) * clear * CLEAR_DRIFT_PX * d;
        el.style.transform = `translate(-50%, -50%) translateX(${driftX.toFixed(2)}px) scale(${scale})`;
        el.style.opacity = String(op * (1 - clear * d)); // sides fade; centre stays
        // Two or more from the centre the paper draws the card folded out of
        // sight (paperMath.foldTarget); its DOM number goes with it (the CSS).
        el.toggleAttribute('data-folded', Math.abs(i - Math.round(pos)) >= 2);
        const z = Math.round(100 - Math.abs(i - pos) * 10);
        el.style.zIndex = String(z);
        // The same panel, as the paper canvas draws it. The centre is the hero
        // rect (hero.ts); every panel is that rect moved along the strip and
        // scaled about its centre, which is what the transform above does.
        paperPanels.push({
          key: i,
          idx: Number(el.dataset.idx),
          el,
          rect: {
            cx: centerX - pos * panelStep + i * panelStep + driftX,
            cy: hero.y + hero.h / 2,
            w: panelW * scale,
            h: panelH * scale,
          },
          scale,
          opacity: op * (1 - clear * d),
          z,
          dist: Math.abs(i - pos),
          slot: Math.abs(i - Math.round(pos)),
        });
      });
    }
    paperRef.current?.frame({ panels: paperPanels, dpos, dt, panelStep });

    // PREV / NEXT pushes air. The card in the hero slot is the one sliding
    // through the middle of the screen, and its two side edges splat into the
    // sky's wake at the strip's speed — the cloud behind it parts and swirls.
    if (dpos !== 0 && dt > 0) {
      const vx = (-dpos * panelStep) / dt;
      let lead: PaperPanel | null = null;
      for (const p of paperPanels) if (!lead || p.dist < lead.dist) lead = p;
      if (lead) {
        const { cx, cy, w, h } = lead.rect;
        for (const x of [cx - w / 2, cx + w / 2]) {
          for (const y of [cy - h / 3, cy, cy + h / 3]) skySplat(x, y, vx, 0);
        }
      }
    }

    // Detail chrome (back pill / bottom bar): fade + drift out with CLEAR. Driven
    // imperatively (transition off) so DialKit scrubbing stays instant; restored
    // to the CSS-driven values once CLEAR returns to 0 (so morph-phase fades work).
    const back = backRef.current;
    const bar = barRef.current;
    if (back && bar) {
      if (clear > 0) {
        const chromeOp = String(1 - clear);
        back.style.transition = 'none';
        bar.style.transition = 'none';
        back.style.opacity = chromeOp;
        bar.style.opacity = chromeOp;
        back.style.transform = `translateX(-50%) translateY(${(-clear * CHROME_DRIFT_PX).toFixed(2)}px)`;
        bar.style.transform = `translateX(-50%) translateY(${(clear * CHROME_DRIFT_PX).toFixed(2)}px)`;
      } else if (back.style.opacity !== '') {
        back.style.transition = '';
        bar.style.transition = '';
        back.style.opacity = '';
        bar.style.opacity = '';
        back.style.transform = '';
        bar.style.transform = '';
      }
    }

    syncFocus();

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

  // Leaving for the reader or the project view hands the cards back to the DOM
  // first: the doorway settles its cover onto the DOM panel. See handoff.ts.
  const read = (issue: string) => afterHandOut(() => openReader(issue));
  const openProject = (project: string) => afterHandOut(() => openPortfolio(project));

  // The canvas may carry the cards once the view has settled and nothing above
  // it wants them — except under the dev doorway dock (`#item-NN?intro`), which
  // suspends the view on purpose and is where the paper's own dials live.
  const authoring = import.meta.env.DEV && window.location.hash.includes('?intro');
  const paperLive = phase === 'active' && (!suspended || authoring);

  // The chrome's paper takes its colour from the sky under it — not while the
  // reader is up over this view, which has its own.
  const rootRef = useRef<HTMLDivElement>(null);
  useSkyChrome(rootRef, !suspended);
  // …and shrinks with the band on a short screen (layout/hero.ts).
  useChromeFit(barRef, backRef);
  const tilt = (t: number) => ({ '--tilt': t }) as CSSProperties;

  return (
    <div
      ref={rootRef}
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
      <DetailPaperLayer
        ref={paperRef}
        live={paperLive}
        interactive={!suspended && phase === 'active'}
        hero={hero}
        sideScale={config.detailSideScale}
        active={activeIndex}
      />

      <button
        ref={backRef}
        type="button"
        className="paper chrome-top detail__back"
        data-chrome="close"
        style={tilt(-1)}
        onClick={(e) => {
          e.stopPropagation();
          close();
        }}
        aria-label="Close"
      >
        <ShapeFace shape="escape" />
      </button>

      <div className="detail__strip" ref={trackRef}>
        {panels.map((p) => {
          const distance = Math.abs(p.i - center);
          const isCenter = distance === 0;
          const item = CONTENT[p.idx];
          // The centre panel opens what its kind opens — the reader for an
          // issue, the project view for a portfolio card; side panels navigate.
          // A centre panel with neither is inert (aria-hidden). A Rive cover's
          // hero opens its project too: the cover's interactions are all
          // hover (docs/covers.md, "The pointer").
          const canOpen = isCenter && !!(item.issue ?? item.project);
          const face = itemHeroFace(item);
          // Keyed off THIS panel's item, not the active one: mid-slide the
          // centre panel and `activeIndex` can briefly disagree, and the layer
          // must never draw one issue's objects onto another issue's cover.
          const animsUrl = isCenter && item.issue ? issueAnims(item.issue) : undefined;
          // Size, opacity, and z-index are written imperatively by the ticker
          // (continuous in the slide position); base size is the centre size.
          return (
            <button
              key={p.i}
              ref={isCenter ? setCenterEl : undefined}
              type="button"
              data-i={p.i}
              data-idx={p.idx}
              className={
                (canOpen
                  ? 'detail__panel detail__panel--center detail__panel--readable'
                  : isCenter
                    ? 'detail__panel detail__panel--center'
                    : 'detail__panel') + (item.cover ? ' detail__panel--bare' : '')
              }
              style={{
                left: `${p.i * panelStep}px`,
                width: `${panelW}px`,
                height: `${panelH}px`,
              }}
              onClick={(e) => {
                e.stopPropagation(); // a card is not backdrop — don't dismiss
                if (!isCenter) goto(p.idx);
                else if (item.issue) read(item.issue);
                else if (item.project) openProject(item.project);
              }}
              onPointerEnter={(e) => e.pointerType !== 'touch' && (hoveredRef.current = p.i)}
              onPointerLeave={(e) => e.pointerType !== 'touch' && (hoveredRef.current = null)}
              tabIndex={isCenter ? (canOpen ? 0 : -1) : 0}
              aria-label={
                canOpen
                  ? item.issue
                    ? `Read issue ${item.issue}`
                    : `Open project ${item.title}`
                  : isCenter
                    ? undefined
                    : `Go to item ${item.title}`
              }
              aria-hidden={isCenter && !canOpen ? true : undefined}
            >
              {item.cover ? (
                // The live cover on the CENTRE panel (its dome is the hero's,
                // which the paper plane reads too), and on a SIDE panel for a
                // cover that is live there (`coverSideLive`: card 04), at
                // rest; otherwise the side cards show its still. A Rive
                // cover's every surface is its one instance.
                // The paper takes this face over once the view settles, as it
                // does an image: the data-paper rules fade `.detail__media`.
                <CoverTile
                  coverId={item.cover.id}
                  live={isCenter || (distance === 1 && coverSideLive(item.cover))}
                  dome={isCenter ? heroDome : null}
                  className="detail__media"
                />
              ) : face ? (
                <img className="detail__media" src={face} alt={`Poster ${item.title}`} draggable={false} />
              ) : (
                <div className="detail__media" style={{ background: `hsl(${item.hue}, 28%, 32%)` }} />
              )}
              {/* Hover animations, on the centre panel only: it is the one panel
                  showing the cover at rest and at full size. Neighbours show the
                  same resting illustration but stay still, and the layer is
                  unmounted outright while a transition runs or the reader sits
                  above.

                  BEFORE the panel number, not after: the layer's plate is opaque
                  (it has to be — it replaces the cover face while mounted), so
                  anything drawn earlier in the panel would disappear behind it. */}
              {animsUrl && phase === 'active' && !suspended && (
                <CoverAnimLayer manifest={animsUrl} listen={centerEl} />
              )}
              <span className="detail__panel-num">{item.title}</span>
            </button>
          );
        })}
      </div>

      <div className="chrome-row detail__bar" ref={barRef} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="paper" data-chrome="prev" style={tilt(-1)} onClick={prev} aria-label="Previous item">
          <ShapeFace shape="prev" />
        </button>
        {/* current | total cards. The native select over it is what is pressed
            and focused (jump to any card), so the pill is the only thing seen. */}
        <div className="paper" data-chrome="card" style={tilt(1)}>
          <PillFace numbers={[two(activeIndex + 1), two(CONTENT_COUNT)]} />
          <select
            className="paper__select detail__select"
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
        </div>
        {/* The primary action follows the card's kind: the magazine reads, a
            portfolio card opens its project view at `#view-NN`. */}
        {activeItem.issue ? (
          <button
            type="button"
            className="paper detail__btn--read"
            data-chrome="action"
            style={tilt(-1)}
            onClick={() => read(activeItem.issue!)}
          >
            <PillFace>Read issue</PillFace>
          </button>
        ) : activeItem.project ? (
          <button
            type="button"
            className="paper detail__btn--read"
            data-chrome="action"
            style={tilt(-1)}
            onClick={() => openProject(activeItem.project!)}
          >
            <PillFace>Open project</PillFace>
          </button>
        ) : null}
        <button type="button" className="paper" data-chrome="next" style={tilt(1)} onClick={next} aria-label="Next item">
          <ShapeFace shape="next" />
        </button>
      </div>
    </div>
  );
}
