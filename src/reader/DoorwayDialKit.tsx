import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { DialRoot, DialTimeline, useDialKit, useDialTimeline } from 'dialkit';
import type { TimelineConfig } from 'dialkit';
import type { FlipEngine } from './flipEngine';
import {
  EASE,
  EXIT_RATE,
  TIMING,
  TOTAL_MS,
  applyDoorwayValues,
  driveFlipOpen,
  makeFlipDriveState,
  resetDoorwayValues,
} from './doorway';

/** Seconds (DialKit's unit) from a storyboard millisecond. */
const s = (ms: number): number => ms / 1000;

/** The doorway as DialKit clips, built from the SAME constants Motion samples
 *  (see doorway.ts TIMING/EASE). Inlined as object literals so DialKit keeps its
 *  per-clip value inference. `open` is a zero-value MARKER — its progress drives
 *  the flip engine. */
const CLIPS = {
  duration: s(TOTAL_MS),
  clear: {
    at: s(TIMING.clear.at),
    duration: s(TIMING.clear.dur),
    from: { v: 0 },
    to: { v: 1 },
    transition: { type: 'easing', duration: s(TIMING.clear.dur), ease: EASE },
  },
  table: {
    at: s(TIMING.table.at),
    duration: s(TIMING.table.dur),
    from: { v: 0 },
    to: { v: 1 },
    transition: { type: 'easing', duration: s(TIMING.table.dur), ease: EASE },
  },
  settle: {
    at: s(TIMING.settle.at),
    duration: s(TIMING.settle.dur),
    from: { v: 0 },
    to: { v: 1 },
    transition: { type: 'easing', duration: s(TIMING.settle.dur), ease: EASE },
  },
  chrome: {
    at: s(TIMING.chrome.at),
    duration: s(TIMING.chrome.dur),
    from: { v: 0 },
    to: { v: 1 },
    transition: { type: 'easing', duration: s(TIMING.chrome.dur), ease: EASE },
  },
  open: { at: s(TIMING.open.at), duration: s(TIMING.open.dur) },
} satisfies TimelineConfig;

interface DoorwayDialKitProps {
  /** The real flip engine, once FlipBook has created it. OPEN drives it. */
  engine: FlipEngine | null;
  /** Reset the reader to the cover spread (0) when a committed OPEN is reversed. */
  onResetToCover: () => void;
}

/**
 * The dev-only AUTHORING driver: the doorway on a scrubbable DialKit Timeline,
 * mounted over the real detail view via `#item-NN?intro`. It writes the same
 * `--doorway-*` variables + `doorway` singleton and drives the same cover turn
 * as production, so scrubbing any point shows a true intermediate state —
 * neighbours clearing, sky → wood, the cover settling, and the mid-open slide.
 *
 * TODO(production): DialKit's clip.current values are the scrubbable authoring
 * preview. The tuned timings/transitions live in `doorway.ts` (Copy from the
 * dock → paste into TIMING/EASE); production replays them through
 * `useDoorwayMotion`. This whole module is dev-only (tree-shaken from the build).
 */
export default function DoorwayDialKit({ engine, onResetToCover }: DoorwayDialKitProps) {
  const tl = useDialTimeline('Doorway', CLIPS, {
    id: 'doorway-v1',
    persist: import.meta.env.DEV,
    autoplay: false,
  });

  // Reverse playback for "Replay Exit": DialKit has no reverse transport, so we
  // scrub the playhead back to 0 with a small rAF (dev authoring only).
  const reverseRaf = useRef(0);
  const stopReverse = useCallback(() => {
    if (reverseRaf.current) cancelAnimationFrame(reverseRaf.current);
    reverseRaf.current = 0;
  }, []);
  const replayExit = useCallback(() => {
    stopReverse();
    tl.pause();
    const from = tl.time > 0 ? tl.time : tl.duration;
    const durMs = (from / EXIT_RATE) * 1000;
    const start = performance.now();
    const step = (now: number) => {
      const k = Math.min((now - start) / durMs, 1);
      tl.seek(from * (1 - k));
      reverseRaf.current = k < 1 ? requestAnimationFrame(step) : 0;
    };
    reverseRaf.current = requestAnimationFrame(step);
  }, [tl, stopReverse]);

  const onAction = useCallback(
    (action: string) => {
      if (action === 'replayEntrance') {
        stopReverse();
        tl.replay();
      } else if (action === 'replayExit') {
        replayExit();
      }
    },
    [tl, replayExit, stopReverse],
  );

  const panel = useDialKit(
    'DOORWAY',
    {
      firstVisitAutoOpen: true,
      replayEntrance: { type: 'action', label: 'Replay Entrance' },
      replayExit: { type: 'action', label: 'Replay Exit' },
    },
    { id: 'doorway-panel', onAction },
  );

  // REST on mount; restore the normal reader / detail baseline on unmount.
  useLayoutEffect(() => {
    return () => {
      stopReverse();
      resetDoorwayValues();
    };
  }, [stopReverse]);

  // Every playhead move: sample the (dock-editable) clips, apply them, drive the
  // flip. Derived straight from the timeline — no mirrored state — so scrubbing
  // backward restores every intermediate state automatically.
  const flipRef = useRef(makeFlipDriveState());
  const prevTimeRef = useRef(tl.time);
  const time = tl.time;
  const autoOpen = panel.firstVisitAutoOpen;
  useEffect(() => {
    const forward = time >= prevTimeRef.current;
    prevTimeRef.current = time;
    const open = autoOpen ? Math.min(tl.open.progress, 1) : 0;
    applyDoorwayValues({
      clear: tl.clear.current.v,
      table: tl.table.current.v,
      settle: tl.settle.current.v,
      chrome: tl.chrome.current.v,
      open,
    });
    driveFlipOpen(engine, open, forward, autoOpen, flipRef.current, onResetToCover);
  }, [time, autoOpen, engine, tl.clear, tl.table, tl.settle, tl.chrome, tl.open, onResetToCover]);

  return (
    <>
      <DialRoot position="top-right" />
      <DialTimeline />
    </>
  );
}
