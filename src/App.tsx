import { Suspense, lazy, useCallback, useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import SkyLayer from './components/SkyLayer';
import { GridPlane } from './components/GridPlane';
import { FrameHUD } from './components/FrameHUD';
import { MiniMap } from './components/MiniMap';
import { DetailView } from './components/DetailView';
import { usePanController } from './hooks/usePanController';
import { useDetail } from './hooks/useDetail';
import type { FlipOrigin } from './hooks/useDetail';
import { useEnvState } from './env';
import { config, useConfig } from './config';
import { contentIndex } from './content';
import './App.css';

/**
 * Dev-only DialKit panel. The dynamic import sits in a branch that is statically
 * `false` in production (`import.meta.env.DEV`), so Rollup drops the branch and
 * neither `./dev/Dials` nor `dialkit` is emitted to the production bundle.
 */
const DevDials = import.meta.env.DEV ? lazy(() => import('./dev/Dials')) : null;

/**
 * Dev-only EnvState readout (Phase 11, data-only). Dev-gated the same way, so
 * the `env` data layer it consumes is tree-shaken from production until a future
 * renderer promotes `useEnvState` to App level.
 */
const DevEnvReadout = import.meta.env.DEV ? lazy(() => import('./dev/EnvReadout')) : null;

/**
 * App owns the grid controller and the detail-view router, and cross-fades
 * between the two modes. The grid stays mounted (just faded) so the focused card
 * can morph into the detail page and back. The mini-map lives here so it persists
 * across both modes.
 */
export default function App() {
  useConfig(); // re-render on layout/feel changes (e.g. wrapStride → focused index)

  // Refs break the controller ↔ detail cycle: the controller needs tap/suspend
  // callbacks; the detail router needs the controller's grid-focus navigation.
  const detailModeRef = useRef<'grid' | 'detail'>('grid');
  const openRef = useRef<(index: number, origin?: FlipOrigin | null) => void>(() => {});

  const isSuspended = useCallback(() => detailModeRef.current !== 'grid', []);
  // A tap on ANY card opens its detail view, animating the FLIP from the card's
  // actual on-screen rect (drag / flick / arrows / mini-map still move the grid).
  const onTap = useCallback((col: number, row: number, origin: FlipOrigin) => {
    openRef.current(contentIndex(col, row), origin);
  }, []);

  const pan = usePanController({ isSuspended, onTap });
  const detail = useDetail(pan.navigateToContent);
  // The live SF sky state (Phase 11). Drives the WebGL SkyLayer (Phase 12) and
  // the dev EnvReadout from one shared, stable snapshot.
  const envSnapshot = useEnvState();

  useEffect(() => {
    detailModeRef.current = detail.mode;
    openRef.current = detail.open;
  });

  const onOpenDetail = useCallback(
    (index: number, origin: FlipOrigin | null) => openRef.current(index, origin),
    [],
  );

  const inDetail = detail.mode === 'detail';
  // Grid is visible in grid mode, and again while the detail is exiting (so they
  // cross-fade). It only accepts input in grid mode (input ignored mid-transition).
  const gridVisible = !inDetail || detail.phase === 'exit';

  // Mini-map reflects the focused grid item, or the active detail item, and
  // navigates within whichever mode is active (without leaving detail).
  const miniIndex = inDetail
    ? detail.activeIndex
    : contentIndex(pan.world.col, pan.world.row);
  const miniNavigate = inDetail ? detail.goto : pan.navigateToContent;

  const stageStyle = { '--detail-ms': `${config.detailTransitionMs}ms` } as CSSProperties;

  return (
    <div className="app">
      <SkyLayer env={envSnapshot.env} />
      <div
        className={
          gridVisible
            ? 'grid-stage'
            : 'grid-stage grid-stage--hidden'
        }
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
          onOpenDetail={onOpenDetail}
        />
        <FrameHUD worldCol={pan.world.col} worldRow={pan.world.row} />
      </div>

      {inDetail && <DetailView detail={detail} />}

      <MiniMap focusedIndex={miniIndex} onNavigate={miniNavigate} />

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
