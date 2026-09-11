import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { animate } from 'motion';
import {
  ENTER_MS,
  EXIT_MS,
  applyPortfolioLook,
  applyPortfolioValues,
  markPortfolioReversed,
  resetPortfolioValues,
  samplePortfolioEnter,
  samplePortfolioExit,
} from './portfolioMotion';

type ClockControls = ReturnType<typeof animate>;

interface PortfolioMotionOptions {
  /** `'enter'` plays the storyboarded open on mount; `'none'` hands the values
   *  to someone else (the dev dock) and stays inert. */
  play: 'enter' | 'none';
}

/**
 * The PRODUCTION driver: a single linear master clock (Motion) sampling the same
 * storyboard the DialKit dock authors ({@link samplePortfolioEnter} /
 * {@link samplePortfolioExit}). It writes the `--pv-*` CSS variables + the
 * `portfolio` singleton every frame — no React state per frame.
 *
 * `requestExit` plays the CLOSE storyboard (the sheet leading, the scrim
 * trailing) and then runs the caller's completion. Closing mid-open starts the
 * close partway in, at the point that matches how far the open had got, so
 * Escape during the slide reads as one continuous move rather than a snap.
 */
export function usePortfolioMotion({ play }: PortfolioMotionOptions): {
  requestExit: (onComplete: () => void) => void;
} {
  /** 0…1 of the OPEN that has played — where a close has to start from. */
  const enteredRef = useRef(0);
  const clockRef = useRef<ClockControls | null>(null);
  const exitingRef = useRef(false);

  // Open on mount. Publish the LOOK and pin REST synchronously (layout effect →
  // before paint) so the layer never flashes a fully-open sheet.
  useLayoutEffect(() => {
    applyPortfolioLook();
    if (play !== 'enter') return;
    applyPortfolioValues(samplePortfolioEnter(0));
    clockRef.current = animate(0, ENTER_MS, {
      duration: ENTER_MS / 1000,
      ease: 'linear',
      onUpdate: (ms) => {
        enteredRef.current = ms / ENTER_MS;
        applyPortfolioValues(samplePortfolioEnter(ms));
      },
    });
    return () => {
      clockRef.current?.stop();
      clockRef.current = null;
    };
  }, [play]);

  // Whoever mounted us owns the variables while we live; clear them on the way
  // out so nothing leaks into the app underneath.
  useEffect(() => resetPortfolioValues, []);

  const requestExit = useCallback(
    (onComplete: () => void) => {
      if (play !== 'enter') {
        onComplete(); // the dock owns the values — nothing of ours to play out
        return;
      }
      if (exitingRef.current) return;
      exitingRef.current = true;

      clockRef.current?.stop();
      // Start the close at the point matching how far the open had got: a
      // half-open sheet leaves from half-open, not from fully in.
      const from = (1 - Math.min(enteredRef.current, 1)) * EXIT_MS;
      clockRef.current = animate(from, EXIT_MS, {
        duration: (EXIT_MS - from) / 1000,
        ease: 'linear',
        onUpdate: (ms) => applyPortfolioValues(samplePortfolioExit(ms)),
        onComplete: () => {
          markPortfolioReversed(); // tell the gate the close already played
          onComplete();
        },
      });
    },
    [play],
  );

  return { requestExit };
}
