import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { animate } from 'motion';
import { config } from '../config';
import { panelStepFor } from '../detailLayout';
import { computeHeroRect } from '../layout/hero';
import { rectEdges, skyWake } from '../sky/skyStage';
import type { FlipEngine } from './flipEngine';
import {
  CLEAR_DRIFT_PX,
  EXIT_RATE,
  TOTAL_MS,
  applyDoorwayValues,
  decideAutoOpen,
  driveFlipOpen,
  makeFlipDriveState,
  markDoorwayReversed,
  resetDoorwayValues,
  sampleDoorway,
} from './doorway';

type ClockControls = ReturnType<typeof animate>;

interface DoorwayMotionOptions {
  /** The real flip engine (once FlipBook has built it). OPEN drives it. */
  engine: FlipEngine | null;
  /** Reset the reader to the cover spread (0). */
  resetToCover: () => void;
  /** `'entrance'` plays the storyboarded entrance on mount; `'none'` is the
   *  direct-URL / reduced-motion path (no doorway, the layer crossfades). */
  play: 'entrance' | 'none';
}

/**
 * The PRODUCTION driver: a single linear master clock (Motion) sampling the same
 * schedule the DialKit dock authors ({@link sampleDoorway}). It writes the
 * `--doorway-*` CSS variables + the `doorway` singleton every frame and drives
 * the cover turn. `requestExit` reverses from wherever the playhead is (so
 * Escape mid-entrance reverses cleanly), then runs the caller's completion.
 */
/**
 * The doorway moving air through the sky. Two things in it move across the
 * screen: the detail view's NEIGHBOURS, drifting outward and away as CLEAR goes
 * to 1 (and back in on the way out), and the COVER's free edge swinging over
 * the spine as the book OPENS. Each splats its edges into the wake at the speed
 * it is moving; neither is a real rect in this module, so both are rebuilt from
 * the hero rect the way `DetailView` and the reader lay them out.
 */
function doorwayWake(clear: number, open: number): void {
  const hero = computeHeroRect(window.innerWidth, window.innerHeight);
  const cx = hero.x + hero.w / 2;
  const cy = hero.y + hero.h / 2;
  const step = panelStepFor(hero.w, config.detailGap, config.detailSideScale);
  const sw = hero.w * config.detailSideScale;
  const sh = hero.h * config.detailSideScale;
  const drift = clear * CLEAR_DRIFT_PX;
  skyWake('doorway:left', rectEdges(cx - step - drift, cy, sw, sh));
  skyWake('doorway:right', rectEdges(cx + step + drift, cy, sw, sh));
  // The cover hinges on its left edge; its free edge's shadow on the screen
  // sweeps from the right edge, over the spine, to a page-width left of it.
  const edgeX = hero.x + hero.w * Math.cos(Math.PI * open);
  skyWake('doorway:cover', [
    [edgeX, hero.y + hero.h * 0.2],
    [edgeX, cy],
    [edgeX, hero.y + hero.h * 0.8],
  ]);
}

export function useDoorwayMotion({
  engine,
  resetToCover,
  play,
}: DoorwayMotionOptions): { requestExit: (onComplete: () => void) => void } {
  const engineRef = useRef(engine);
  useEffect(() => {
    engineRef.current = engine;
  });
  const resetRef = useRef(resetToCover);
  useEffect(() => {
    resetRef.current = resetToCover;
  });

  const autoOpenRef = useRef(false);
  const msRef = useRef(0);
  const clockRef = useRef<ClockControls | null>(null);
  const flipRef = useRef(makeFlipDriveState());
  const exitingRef = useRef(false);

  // One frame: sample the schedule, apply it, drive the flip.
  const frame = useCallback((ms: number, forward: boolean) => {
    msRef.current = ms;
    const v = sampleDoorway(ms, autoOpenRef.current);
    applyDoorwayValues(v);
    doorwayWake(v.clear, v.open);
    driveFlipOpen(engineRef.current, v.open, forward, autoOpenRef.current, flipRef.current, () =>
      resetRef.current(),
    );
  }, []);

  // Entrance on mount. Set REST synchronously (layout effect → before paint) so
  // the reader layer never flashes fully-formed over the detail view.
  useLayoutEffect(() => {
    if (play !== 'entrance') return;
    autoOpenRef.current = decideAutoOpen();
    frame(0, true);
    clockRef.current = animate(0, TOTAL_MS, {
      duration: TOTAL_MS / 1000,
      ease: 'linear',
      onUpdate: (ms) => frame(ms, true),
    });
    return () => {
      clockRef.current?.stop();
      clockRef.current = null;
      resetDoorwayValues();
    };
  }, [play, frame]);

  const requestExit = useCallback(
    (onComplete: () => void) => {
      if (play !== 'entrance') {
        onComplete(); // direct-URL / reduced-motion: nothing to reverse
        return;
      }
      if (exitingRef.current) return;
      exitingRef.current = true;

      // Stop the entrance clock and snap the book back to the cover, so the
      // opaque cover again coincides with the detail panel exactly (if the book
      // was open, its pages must return to the cover before the layer reverses
      // and unmounts — no page/panel mismatch, no sky flash). An animated close
      // is a later tuning nicety.
      clockRef.current?.stop();
      autoOpenRef.current = false;
      engineRef.current?.clearTurn();
      resetRef.current();
      flipRef.current = makeFlipDriveState();

      // Reverse the schedule from the current playhead back to REST.
      const from = msRef.current || TOTAL_MS;
      clockRef.current = animate(from, 0, {
        duration: (from / 1000) * EXIT_RATE,
        ease: 'linear',
        onUpdate: (ms) => frame(ms, false),
        onComplete: () => {
          markDoorwayReversed(); // tell ReaderGate the reverse already ran
          onComplete();
        },
      });
    },
    [play, frame],
  );

  return { requestExit };
}
