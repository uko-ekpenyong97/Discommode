import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DialRoot, DialTimeline, useDialKit, useDialTimeline } from 'dialkit';
import type { TimelineConfig } from 'dialkit';
import 'dialkit/styles.css';
import {
  EASE,
  ENTER_MS,
  EXIT_MS,
  LOOK,
  TIMING,
  applyPortfolioLook,
  applyPortfolioValues,
  resetPortfolioValues,
  samplePortfolioExit,
} from './portfolioMotion';
import type { PortfolioLook } from './portfolioMotion';
import { logContrastProbe, subscribeContrast } from './contrastProbe';
import type { ContrastReport } from './contrastProbe';

/**
 * The contrast probe's verdict, beside the dials that change it. Red and
 * specific when something is below its target, because "the glass looks fine"
 * is exactly the judgement this exists to replace.
 */
function ContrastReadout() {
  const [report, setReport] = useState<ContrastReport | null>(null);
  useEffect(() => subscribeContrast(setReport), []);
  if (!report) return null;
  const failures = report.samples.filter((s) => !s.pass);
  return (
    <div className="pv-contrast" data-fail={failures.length > 0 || undefined}>
      <strong>
        {report.worst === null
          ? 'contrast — no text on screen (scrub the timeline in)'
          : `contrast ${report.worst}:1 worst of ${report.samples.length}`}
        {report.skyEstimated ? ' (sky estimated)' : ''}
      </strong>
      {failures.map((s, i) => (
        <span key={i}>
          {s.kind} {s.fontPx}px — {s.ratio}:1, needs {s.required}
        </span>
      ))}
    </div>
  );
}

/** Seconds (DialKit's unit) from a storyboard millisecond. */
const s = (ms: number): number => ms / 1000;

/** The OPEN as DialKit clips, built from the SAME constants Motion samples (see
 *  portfolioMotion.ts TIMING/EASE). Inlined as object literals so DialKit keeps
 *  its per-clip value inference. */
const CLIPS = {
  duration: s(ENTER_MS),
  scrim: {
    at: s(TIMING.enter.scrim.at),
    duration: s(TIMING.enter.scrim.dur),
    from: { v: 0 },
    to: { v: 1 },
    transition: { type: 'easing', duration: s(TIMING.enter.scrim.dur), ease: EASE.scrim },
  },
  sheet: {
    at: s(TIMING.enter.sheet.at),
    duration: s(TIMING.enter.sheet.dur),
    from: { v: 0 },
    to: { v: 1 },
    transition: { type: 'easing', duration: s(TIMING.enter.sheet.dur), ease: EASE.sheet },
  },
  pill: {
    at: s(TIMING.enter.pill.at),
    duration: s(TIMING.enter.pill.dur),
    from: { v: 0 },
    to: { v: 1 },
    transition: { type: 'easing', duration: s(TIMING.enter.pill.dur), ease: EASE.pill },
  },
} satisfies TimelineConfig;

/**
 * The dev-only AUTHORING dock, mounted over the real view via `#view-NN?intro`.
 * It writes the same `--pv-*` variables production does, so scrubbing any point
 * shows a true intermediate state — the glass arriving, the sheet mid-slide,
 * the pill still out at its corner — and the LOOK dials retune the page
 * geometry, the scroller's feel and the whole reveal system live, on real
 * content.
 *
 * The OPEN is the scrubbable Timeline. The CLOSE is NOT on it: it is a separate
 * storyboard (the sheet leading, the scrim trailing), so "Replay Close" plays
 * `samplePortfolioExit` on its own rAF and hands the values back to the
 * timeline at REST when it lands.
 *
 * TODO(production): the tuned numbers live in `portfolioMotion.ts` — Copy from
 * the dock, paste over TIMING/LOOK. This whole module is dev-only (behind an
 * `import.meta.env.DEV` dynamic import, so it and `dialkit` tree-shake out).
 */
export default function PortfolioDialKit() {
  const tl = useDialTimeline('Portfolio', CLIPS, {
    id: 'portfolio-v1',
    persist: import.meta.env.DEV,
    autoplay: false,
  });

  // The close replay owns the channels while it runs; the timeline effect below
  // stands down so the two never fight over the same three properties.
  const closingRef = useRef(false);
  const rafRef = useRef(0);

  const stopClose = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    closingRef.current = false;
  }, []);

  const replayClose = useCallback(() => {
    stopClose();
    tl.pause();
    closingRef.current = true;
    const start = performance.now();
    const frame = (now: number) => {
      const ms = Math.min(now - start, EXIT_MS);
      applyPortfolioValues(samplePortfolioExit(ms));
      if (ms < EXIT_MS) {
        rafRef.current = requestAnimationFrame(frame);
      } else {
        rafRef.current = 0;
        closingRef.current = false;
        tl.seek(0); // hand back at REST — the same values the close just landed on
      }
    };
    rafRef.current = requestAnimationFrame(frame);
  }, [tl, stopClose]);

  const onTransport = useCallback(
    (action: string) => {
      if (action === 'replayOpen') {
        stopClose();
        tl.replay();
      } else if (action === 'replayClose') {
        replayClose();
      }
    },
    [tl, replayClose, stopClose],
  );

  const geometry = useDialKit('PV GEOMETRY', {
    pageVw: [LOOK.pageVw, 24, 80, 1],
    sliverVw: [LOOK.sliverVw, 2, 30, 0.5],
    columnPx: [LOOK.columnPx, 320, 900, 1],
    previewOpacity: [LOOK.previewOpacity, 0, 1, 0.01],
    previewFadeMs: [LOOK.previewFadeMs, 0, 1000, 10],
    zFadeMs: [LOOK.zFadeMs, 0, 1500, 10],
    scrimBlurPx: [LOOK.scrimBlurPx, 0, 48, 1],
    scrimAlpha: [LOOK.scrimAlpha, 0, 0.9, 0.01],
  });

  // The page glass. `pageAlpha` is the contrast lever: it is what stands
  // between the text and whatever the grid happens to be showing through.
  const glass = useDialKit('PV GLASS', {
    pageSurface: { type: 'select', options: ['frosted', 'solid'], default: LOOK.pageSurface },
    pageAlpha: [LOOK.pageAlpha, 0, 1, 0.01],
    pageBlurPx: [LOOK.pageBlurPx, 0, 60, 1],
    pageSaturate: [LOOK.pageSaturate, 0.5, 2, 0.05],
    probe: { type: 'action', label: 'Re-run contrast probe' },
  }, { id: 'pv-glass', onAction: (a) => a === 'probe' && logContrastProbe() });

  const pill = useDialKit('PV PILL', {
    pillDiameterPx: [LOOK.pillDiameterPx, 40, 240, 1],
    pillGutterX: [LOOK.pillGutterX, 0, 1, 0.01],
    pillOffsetPx: [LOOK.pillOffsetPx, 0, 160, 1],
    pillBlurPx: [LOOK.pillBlurPx, 0, 32, 1],
    pillInkRest: [LOOK.pillInkRest, 0, 1, 0.01],
    pillInkHover: [LOOK.pillInkHover, 0, 1, 0.01],
    pillHoverScale: [LOOK.pillHoverScale, 0.7, 1.2, 0.01],
  });

  // The scroller's own feel. `lenisLerp` and `wheelMultiplier` are the two
  // values CSS cannot carry, so changing either rebuilds the Lenis instance
  // (see `Sheet`); the rest are custom properties like everything else.
  const track = useDialKit('PV TRACK', {
    lenisLerp: [LOOK.lenisLerp, 0.02, 1, 0.01],
    wheelMultiplier: [LOOK.wheelMultiplier, 0.2, 3, 0.05],
    sliverClickMs: [LOOK.sliverClickMs, 100, 2500, 10],
    sliverReturn: { type: 'select', options: ['top', 'bottom'], default: LOOK.sliverReturn },
  });

  const reveal = useDialKit('PV REVEAL', {
    revealMs: [LOOK.revealMs, 200, 2000, 10],
    revealBlurPx: [LOOK.revealBlurPx, 0, 40, 1],
    revealOffsetPx: [LOOK.revealOffsetPx, 0, 80, 1],
    revealStaggerMs: [LOOK.revealStaggerMs, 0, 200, 5],
    charRampMs: [LOOK.charRampMs, 0, 600, 10],
    charMs: [LOOK.charMs, 100, 1500, 10],
    flipDepthPx: [LOOK.flipDepthPx, 0, 1500, 10],
    flipAngleDeg: [LOOK.flipAngleDeg, 0, 90, 1],
    flipMs: [LOOK.flipMs, 100, 1500, 10],
    flipDelayMs: [LOOK.flipDelayMs, 0, 1000, 10],
  });

  /** The live look, assembled from both panels — what the CSS variables and
   *  Copy are both built from. */
  const look: PortfolioLook = {
    scrimBlurPx: geometry.scrimBlurPx,
    scrimAlpha: geometry.scrimAlpha,
    pageVw: geometry.pageVw,
    sliverVw: geometry.sliverVw,
    columnPx: geometry.columnPx,
    previewOpacity: geometry.previewOpacity,
    previewFadeMs: geometry.previewFadeMs,
    zFadeMs: geometry.zFadeMs,
    lenisLerp: track.lenisLerp,
    wheelMultiplier: track.wheelMultiplier,
    sliverClickMs: track.sliverClickMs,
    sliverReturn: track.sliverReturn as PortfolioLook['sliverReturn'],
    pageSurface: glass.pageSurface as PortfolioLook['pageSurface'],
    pageAlpha: glass.pageAlpha,
    pageBlurPx: glass.pageBlurPx,
    pageSaturate: glass.pageSaturate,
    pillDiameterPx: pill.pillDiameterPx,
    pillGutterX: pill.pillGutterX,
    pillOffsetPx: pill.pillOffsetPx,
    pillBlurPx: pill.pillBlurPx,
    pillInkRest: pill.pillInkRest,
    pillInkHover: pill.pillInkHover,
    pillHoverScale: pill.pillHoverScale,
    revealMs: reveal.revealMs,
    revealBlurPx: reveal.revealBlurPx,
    revealOffsetPx: reveal.revealOffsetPx,
    revealStaggerMs: reveal.revealStaggerMs,
    charRampMs: reveal.charRampMs,
    charMs: reveal.charMs,
    flipDepthPx: reveal.flipDepthPx,
    flipAngleDeg: reveal.flipAngleDeg,
    flipMs: reveal.flipMs,
    flipDelayMs: reveal.flipDelayMs,
  };

  // Look dials → CSS variables, live. The dock re-renders on every playhead
  // tick, so the effect compares before writing: retuning must not itself cost
  // nineteen custom-property writes a frame in the thing being tuned.
  const lookRef = useRef<PortfolioLook | null>(null);
  useEffect(() => {
    const prev = lookRef.current;
    lookRef.current = look;
    const same =
      prev && (Object.keys(look) as (keyof PortfolioLook)[]).every((k) => prev[k] === look[k]);
    if (!same) applyPortfolioLook(look);
  });

  // Copy → a paste-ready TIMING + LOOK snippet. Clip `at`/`duration` are read
  // off the live timeline, so dragging a clip in the dock ends up in the paste.
  const onCopy = useCallback(
    (action: string) => {
      if (action === 'copy') {
        const ms = (sec: number) => Math.round(sec * 1000);
        const clip = (c: { at: number; duration: number }) =>
          `{ at: ${ms(c.at)}, dur: ${ms(c.duration)} }`;
        const body = Object.entries(lookRef.current ?? LOOK)
          .map(([k, v]) => `  ${k}: ${v},`)
          .join('\n');
        const snippet =
          `// tuned values — paste over TIMING.enter and LOOK in src/portfolio/portfolioMotion.ts\n` +
          `enter: {\n` +
          `  scrim: ${clip(tl.scrim)},\n` +
          `  sheet: ${clip(tl.sheet)},\n` +
          `  pill: ${clip(tl.pill)},\n` +
          `}\n\n{\n${body}\n}`;
        navigator.clipboard?.writeText(snippet).catch(() => {});
        console.log(snippet);
      } else {
        onTransport(action);
      }
    },
    [onTransport, tl.scrim, tl.sheet, tl.pill],
  );

  useDialKit(
    'PORTFOLIO',
    {
      replayOpen: { type: 'action', label: 'Replay Open' },
      replayClose: { type: 'action', label: 'Replay Close' },
      copy: { type: 'action', label: 'Copy motion' },
    },
    { id: 'portfolio-panel', onAction: onCopy },
  );

  // Restore the baseline on unmount.
  useLayoutEffect(() => {
    return () => {
      stopClose();
      resetPortfolioValues();
    };
  }, [stopClose]);

  // Every playhead move: sample the (dock-editable) clips and apply them.
  // Derived straight from the timeline — no mirrored state — so scrubbing
  // backward restores every intermediate state automatically.
  const time = tl.time;
  useEffect(() => {
    if (closingRef.current) return;
    void time;
    applyPortfolioValues({
      scrim: tl.scrim.current.v,
      sheet: tl.sheet.current.v,
      pill: tl.pill.current.v,
    });
  }, [time, tl.scrim, tl.sheet, tl.pill]);

  return (
    <>
      <DialRoot position="top-right" />
      <DialTimeline />
      <ContrastReadout />
    </>
  );
}
