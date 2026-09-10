import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import SkyLayer from './components/SkyLayer';
import { GridPlane } from './components/GridPlane';
import { FrameHUD } from './components/FrameHUD';
import { MiniMap } from './components/MiniMap';
import { DetailView } from './components/DetailView';
import DetailMorph from './components/DetailMorph';
import type { MorphCard } from './components/DetailMorph';
import { usePanController } from './hooks/usePanController';
import { useDetail } from './hooks/useDetail';
import type { FlipOrigin } from './hooks/useDetail';
import { gridCardRects, panelStepFor } from './detailLayout';
import { useHeroRect } from './layout/hero';
import { useEnvState } from './env';
import { cardHeight, cellSpanX, config, useConfig } from './config';
import { CONTENT, CONTENT_COUNT, contentIndex } from './content';
import { mod } from './grid';
import './App.css';

const DevDials = import.meta.env.DEV ? lazy(() => import('./dev/Dials')) : null;
const DevEnvReadout = import.meta.env.DEV ? lazy(() => import('./dev/EnvReadout')) : null;

/** Small buffer so the morph finishes painting at its end before the phase flips. */
const TRANS_BUFFER_MS = 60;

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/**
 * App owns the grid controller and the detail-view router. Grid↔detail is a true
 * positional FLIP (Phase 15): the three participating cards (centred card + L/R
 * neighbours, which are exactly the detail's active/prev/next) physically travel
 * and scale between their grid rects and their detail rects via `DetailMorph` —
 * no cross-fade on those cards. The rest of the grid cross-fades; the detail
 * chrome fades. Deep-link / reduced-motion fall back to a quick fade.
 */
interface AppProps {
  /** True while the reader layer is open above the app: every grid/detail input
   *  path is gated so the app is fully inert but stays mounted (no re-init). */
  suspended?: boolean;
}

export default function App({ suspended = false }: AppProps) {
  useConfig(); // re-render on layout/feel changes
  const reducedMotion = useReducedMotion();

  const detailModeRef = useRef<'grid' | 'detail'>('grid');
  const openRef = useRef<(index: number, origin?: FlipOrigin | null) => void>(() => {});

  // The reader suspends every grid input path (keyboard, pointer, cursor tilt),
  // on top of the existing detail-mode suspension.
  const suspendedRef = useRef(suspended);
  useEffect(() => {
    suspendedRef.current = suspended;
  });

  const isSuspended = useCallback(
    () => suspendedRef.current || detailModeRef.current !== 'grid',
    [],
  );
  const onTap = useCallback((col: number, row: number, origin: FlipOrigin) => {
    openRef.current(contentIndex(col, row), origin);
  }, []);

  const pan = usePanController({ isSuspended, onTap });
  const detail = useDetail(suspended);
  const envSnapshot = useEnvState();
  // The one hero rect the detail panel, the FLIP morph, and the reader all use.
  const hero = useHeroRect();

  useEffect(() => {
    detailModeRef.current = detail.mode;
    openRef.current = detail.open;
  });

  const { phase, activeIndex, origin } = detail;
  const { centerContentInstant, navigateToContent } = pan;
  const { finishEnter, finishExit } = detail;

  // A morph (vs a fade) runs only when opened from a grid card (origin present)
  // and motion is allowed.
  const useMorph = !!origin && !reducedMotion;
  const transitioning = phase !== 'active';

  // Finish exiting: re-centre the grid on the viewed item + flatten the hero
  // cards INSTANTLY (still hidden), then reveal it — so the grid appears exactly
  // under the morph cards' final positions, in one frame. The grid stays fully
  // hidden for the whole exit (see gridClass), so the cards never double.
  const finishExitToGrid = useCallback(() => {
    centerContentInstant(activeIndex);
    finishExit();
  }, [centerContentInstant, activeIndex, finishExit]);

  // Drive completion. In morph mode the morph layer fires `onFinished` on its
  // WAAPI `finished` (exact landing frame). In fade mode there is no morph layer,
  // so a timer settles it.
  useEffect(() => {
    if (useMorph || phase === 'active') return;
    const done = phase === 'enter' ? finishEnter : finishExitToGrid;
    const t = setTimeout(done, config.detailChromeFadeMs + TRANS_BUFFER_MS);
    return () => clearTimeout(t);
  }, [phase, useMorph, finishEnter, finishExitToGrid]);

  const inDetail = detail.mode === 'detail';
  // Grid-stage opacity:
  //  - enter: fade OUT (the rest of the grid recedes under the travelling morph),
  //  - active: hidden (not painted),
  //  - exit: fade IN — the NON-hero cards reappear smoothly (the three hero cards
  //    are gated separately, hidden until the morph's handoff; see hideHero),
  //  - grid: visible. The base `.grid-stage` has no transition, so when the exit
  //    handoff flips to grid + reveals the hero cells, they appear instantly.
  const gridClass =
    phase === 'enter'
      ? 'grid-stage grid-stage--fading'
      : phase === 'exit'
        ? 'grid-stage grid-stage--fading-in'
        : inDetail
          ? 'grid-stage grid-stage--hidden'
          : 'grid-stage';
  // The three hero cards are carried by the morph until handoff — hide their grid
  // cells for the whole morph exit so they don't double (Phase 16/17).
  const hideHero = phase === 'exit' && useMorph;

  // On exit start, re-centre the grid on the viewed item (before paint) so the
  // non-hero cards fade in at their FINAL positions — no jump at the handoff even
  // if the user navigated inside detail. (The grid is at ~0 opacity here.)
  useLayoutEffect(() => {
    if (phase === 'exit') centerContentInstant(activeIndex);
  }, [phase, activeIndex, centerContentInstant]);

  const miniIndex = inDetail ? activeIndex : contentIndex(pan.world.col, pan.world.row);
  const miniNavigate = inDetail ? detail.goto : navigateToContent;

  // The three FLIP cards while morphing: active/prev/next, from grid rects to
  // detail rects (enter) or detail → grid (exit).
  let morphCards: MorphCard[] | null = null;
  if (useMorph && (phase === 'enter' || phase === 'exit')) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Detail endpoint = the hero rect (centre) + its neighbours at sideScale, so
    // the morph lands exactly on the detail panel and the reader cover.
    const sideScale = config.detailSideScale;
    const cx = hero.x + hero.w / 2;
    const cy = hero.y + hero.h / 2;
    const step = panelStepFor(hero.w, config.detailGap, sideScale);
    const sideW = hero.w * sideScale;
    const sideH = hero.h * sideScale;
    const d = {
      center: { cx, cy, w: hero.w, h: hero.h },
      left: { cx: cx - step, cy, w: sideW, h: sideH },
      right: { cx: cx + step, cy, w: sideW, h: sideH },
    };
    const g = gridCardRects(vw, vh, config.cardWidth, cardHeight(), cellSpanX(), config.focusScale);
    const items = {
      left: CONTENT[mod(activeIndex - 1, CONTENT_COUNT)],
      center: CONTENT[activeIndex],
      right: CONTENT[mod(activeIndex + 1, CONTENT_COUNT)],
    } as const;
    const entering = phase === 'enter';
    const card = (k: 'left' | 'center' | 'right'): MorphCard => ({
      item: items[k],
      from: entering ? g[k] : d[k],
      to: entering ? d[k] : g[k],
    });
    morphCards = [card('left'), card('center'), card('right')];
  }

  const stageStyle = { '--detail-ms': `${config.detailTransitionMs}ms` } as CSSProperties;

  return (
    <div className="app" data-suspended={suspended || undefined}>
      <SkyLayer env={envSnapshot.env} />
      <div className={gridClass} data-locked={inDetail || undefined} style={stageStyle}>
        <GridPlane
          position={pan.position}
          world={pan.world}
          isDragging={pan.isDragging}
          onPointerDown={pan.onPointerDown}
          onPointerMove={pan.onPointerMove}
          onPointerUp={pan.onPointerUp}
          tiltRef={pan.tiltRef}
          cardsRef={pan.cardsRef}
          markCardsChanged={pan.markCardsChanged}
          overlayCell={inDetail ? null : pan.overlayCell}
          onRequestOpen={pan.requestCardOpen}
          hideHero={hideHero}
        />
        <FrameHUD worldCol={pan.world.col} worldRow={pan.world.row} />
      </div>

      {inDetail && (
        <DetailView
          detail={detail}
          transition={useMorph ? 'morph' : 'fade'}
          suspended={suspended}
          hero={hero}
        />
      )}

      {morphCards && (
        <DetailMorph
          cards={morphCards}
          durationMs={config.detailTransitionMs}
          entering={phase === 'enter'}
          onFinished={phase === 'enter' ? finishEnter : finishExitToGrid}
        />
      )}

      <div
        className="minimap-wrap"
        data-dim={transitioning || undefined}
        style={{ '--detail-chrome-ms': `${config.detailChromeFadeMs}ms` } as CSSProperties}
      >
        <MiniMap focusedIndex={miniIndex} onNavigate={miniNavigate} />
      </div>

      {DevDials && !suspended && (
        <Suspense fallback={null}>
          <DevDials />
        </Suspense>
      )}

      {DevEnvReadout && (
        <Suspense fallback={null}>
          <DevEnvReadout snapshot={envSnapshot} />
        </Suspense>
      )}
    </div>
  );
}
