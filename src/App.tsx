import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
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
import { computeDetailLayout, detailCardRects, gridCardRects } from './detailLayout';
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
export default function App() {
  useConfig(); // re-render on layout/feel changes
  const reducedMotion = useReducedMotion();

  const detailModeRef = useRef<'grid' | 'detail'>('grid');
  const openRef = useRef<(index: number, origin?: FlipOrigin | null) => void>(() => {});

  const isSuspended = useCallback(() => detailModeRef.current !== 'grid', []);
  const onTap = useCallback((col: number, row: number, origin: FlipOrigin) => {
    openRef.current(contentIndex(col, row), origin);
  }, []);

  const pan = usePanController({ isSuspended, onTap });
  const detail = useDetail();
  const envSnapshot = useEnvState();

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

  // Drive the transition timing: the morph/fade runs for `dur`, then the phase
  // settles. On exit, instantly re-centre the grid on the viewed item first, so
  // the FLIP's grid endpoints are valid and the cards land exactly in their slots.
  useEffect(() => {
    if (phase === 'enter') {
      const dur = useMorph ? config.detailTransitionMs : config.detailChromeFadeMs;
      const t = setTimeout(finishEnter, dur + TRANS_BUFFER_MS);
      return () => clearTimeout(t);
    }
    if (phase === 'exit') {
      centerContentInstant(activeIndex);
      const dur = useMorph ? config.detailTransitionMs : config.detailChromeFadeMs;
      const t = setTimeout(finishExit, dur + TRANS_BUFFER_MS);
      return () => clearTimeout(t);
    }
  }, [phase, activeIndex, useMorph, centerContentInstant, finishEnter, finishExit]);

  const inDetail = detail.mode === 'detail';
  // Grid is visible in grid mode and while the detail is exiting (so the rest of
  // the grid cross-fades back in under the morph). Input only in grid mode.
  const gridVisible = !inDetail || phase === 'exit';

  const miniIndex = inDetail ? activeIndex : contentIndex(pan.world.col, pan.world.row);
  const miniNavigate = inDetail ? detail.goto : navigateToContent;

  // The three FLIP cards while morphing: active/prev/next, from grid rects to
  // detail rects (enter) or detail → grid (exit).
  let morphCards: MorphCard[] | null = null;
  if (useMorph && (phase === 'enter' || phase === 'exit')) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const layout = computeDetailLayout(vw, vh, config.detailCardScale, config.detailSideScale, config.detailGap);
    const d = detailCardRects(vw, vh, layout, config.detailSideScale);
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
    <div className="app">
      <SkyLayer env={envSnapshot.env} />
      <div
        className={gridVisible ? 'grid-stage' : 'grid-stage grid-stage--hidden'}
        data-locked={inDetail || undefined}
        style={stageStyle}
      >
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
        />
        <FrameHUD worldCol={pan.world.col} worldRow={pan.world.row} />
      </div>

      {inDetail && <DetailView detail={detail} transition={useMorph ? 'morph' : 'fade'} />}

      {morphCards && (
        <DetailMorph cards={morphCards} durationMs={config.detailTransitionMs} />
      )}

      <div
        className="minimap-wrap"
        data-dim={transitioning || undefined}
        style={{ '--detail-chrome-ms': `${config.detailChromeFadeMs}ms` } as CSSProperties}
      >
        <MiniMap focusedIndex={miniIndex} onNavigate={miniNavigate} />
      </div>

      {DevDials && (
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
