import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DialRoot, DialTimeline, useDialKit, useDialKitController, useDialTimeline } from 'dialkit';
import type { TimelineConfig } from 'dialkit';
import 'dialkit/styles.css';
import {
  EASE,
  ENTER_MS,
  ENTRANCE_BENDS,
  EXIT_MS,
  LOOK,
  TIMING,
  applyPortfolioLook,
  applyPortfolioValues,
  entranceBendOf,
  resetPortfolioValues,
  samplePortfolioExit,
} from './portfolioMotion';
import type { EntranceBend, PortfolioLook } from './portfolioMotion';
import { logContrastProbe, subscribeContrast } from './contrastProbe';
import type { ContrastReport } from './contrastProbe';

/**
 * The contrast probe's verdict, beside the dials that change it. Red and
 * specific when something is below the 7:1 bar, because "the paper looks fine"
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
      </strong>
      {failures.map((s, i) => (
        <span key={i}>
          {s.kind} on {s.surface} {s.fontPx}px — {s.ratio}:1, needs {s.required}
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
  pane: {
    at: s(TIMING.enter.pane.at),
    duration: s(TIMING.enter.pane.dur),
    from: { v: 0 },
    to: { v: 1 },
    transition: { type: 'easing', duration: s(TIMING.enter.pane.dur), ease: EASE.pane },
  },
} satisfies TimelineConfig;

/**
 * The dev-only AUTHORING dock, mounted over the real view via `#view-NN?intro`.
 * It writes the same `--pv-*` variables production does, so scrubbing any point
 * shows a true intermediate state — the scrim arriving, the ground half in, the
 * pill still out at its corner — and the LOOK dials retune the ground, the
 * paper, the page geometry, every shader uniform, the whole choreography of an
 * entrance and the reveal system live, on real content.
 *
 * The OPEN is the scrubbable Timeline. The CLOSE is NOT on it: it is a separate
 * storyboard (the pane leading, the scrim trailing), so "Replay Close" plays
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

  // THE GROUND: the field the paper sits on, and the contrast readout that used
  // to live on PV GLASS. `groundAlpha` below 1 is a debugging affordance and not
  // a look — every figure in the readout is measured at 1.
  const ground = useDialKit('PV GROUND', {
    groundColor: { type: 'color', default: LOOK.groundColor },
    groundAlpha: [LOOK.groundAlpha, 0, 1, 0.01],
    grainOpacity: [LOOK.grainOpacity, 0, 0.3, 0.005],
    letterheadHPx: [LOOK.letterheadHPx, 24, 160, 1],
    scrimAlpha: [LOOK.scrimAlpha, 0, 0.9, 0.01],
    probe: { type: 'action', label: 'Re-run contrast probe' },
  }, { id: 'pv-ground', onAction: (a) => a === 'probe' && logContrastProbe() });

  // THE SHEET'S MATERIAL. Every shader uniform and both lights, together —
  // they are not independent: the second light exists to keep the inside of the
  // roll off black, and lowering it is what makes the curl look like a fold.
  const paperDials = useDialKitController('PV PAPER', {
    paperColor: { type: 'color', default: LOOK.paperColor },
    inkColor: { type: 'color', default: LOOK.inkColor },
    /**
     * THE ENTRANCE, as one of two — a preset rather than a slider, because it
     * is four dials that only mean anything together.
     *
     * `roll` ships: the sheet arrives as a tube at its top edge. `held` is the
     * softer bend that replaced it for a release — a wide arc a line of type
     * stays readable across. Choosing one writes `enterCurl`,
     * `enterCurlTightness`, `startRotationDeg` and `curlOutAt` onto PV MOTION,
     * where the sliders stay live underneath: move any of them and this reads
     * `custom` until they are a preset again.
     *
     * The RADIUS is not on this panel any more and that is the point of the
     * whole change. It is a property of the gesture, not of the paper: while it
     * was a material dial, winding the entrance up to a tube also took the
     * tear's arc to 0.03 page heights and creased the whole peel.
     */
    entranceBend: { type: 'select', options: ['roll', 'held', 'custom'], default: 'roll' },
    curlTaper: [LOOK.curlTaper, -1, 1, 0.01],
    curlDepth: [LOOK.curlDepth, 0.1, 1, 0.01],
    lightA: [LOOK.lightA, 0, 3, 0.01],
    lightAX: [LOOK.lightAX, -40, 40, 0.5],
    lightAY: [LOOK.lightAY, -40, 40, 0.5],
    lightAZ: [LOOK.lightAZ, 1, 60, 0.5],
    lightB: [LOOK.lightB, 0, 3, 0.01],
    lightBX: [LOOK.lightBX, -40, 40, 0.5],
    lightBY: [LOOK.lightBY, -40, 40, 0.5],
    lightBZ: [LOOK.lightBZ, 1, 60, 0.5],
    paperRoughness: [LOOK.paperRoughness, 0, 1, 0.01],
    paperReflect: [LOOK.paperReflect, 0, 2, 0.01],
    paperAmbient: [LOOK.paperAmbient, 0, 1, 0.01],
    backShade: [LOOK.backShade, 0.3, 1.2, 0.01],
    edgeAlpha: [LOOK.edgeAlpha, 0, 1, 0.01],
    mouseTiltDeg: [LOOK.mouseTiltDeg, 0, 8, 0.1],
    mouseLerp: [LOOK.mouseLerp, 0.01, 0.5, 0.01],
  });
  const paper = paperDials.values;

  // THE PAGE. A page is the page rect less an inset either side and a
  // twelve-column grid inside that; the rect itself is the viewport less these
  // three margins.
  const page = useDialKit('PV PAGE', {
    pageMarginPx: [LOOK.pageMarginPx, 0, 200, 1],
    pageInsetPx: [LOOK.pageInsetPx, 0, 200, 1],
    gridGapPx: [LOOK.gridGapPx, 0, 160, 1],
    // 0 is off — the body runs to the right inset. 90 is the alternative.
    textMeasureCh: [LOOK.textMeasureCh, 0, 140, 1],
    letterheadTitlePx: [LOOK.letterheadTitlePx, 32, 300, 2],
    // THE AIR IN THE MASTHEAD. Sizes are not in here — these move the spacing
    // around the title without touching it.
    headEyebrowGapPx: [LOOK.headEyebrowGapPx, 0, 80, 1],
    headTitleGapPx: [LOOK.headTitleGapPx, 0, 80, 1],
    headRuleGapPx: [LOOK.headRuleGapPx, 0, 120, 1],
  });

  // THE CHOREOGRAPHY. The four entrance windows are fractions of the entrance's
  // own progress and the ORDER is the point — see `pageTrack.sheetPose`.
  const motionDials = useDialKitController('PV MOTION', {
    enterDistancePx: [LOOK.enterDistancePx, 200, 2400, 10],
    exitDistancePx: [LOOK.exitDistancePx, 100, 2000, 10],
    dwellVh: [LOOK.dwellVh, 0.35, 0.7, 0.01],
    handoffMs: [LOOK.handoffMs, 0, 600, 10],
    // THE ENTRANCE IS A ROLL (curl mode 0), and these are the cone wrap's own
    // dials — not the tear's, which read the same names to mean other things.
    enterCurl: [LOOK.enterCurl, -1, 0, 0.01],
    enterRollReach: [LOOK.enterRollReach, 0.05, 1, 0.01],
    enterRollEdge: { type: 'select', options: ['bottom', 'top'], default: 'bottom' },
    // The tube's TAPER, not its size: the radius is derived from a fixed number
    // of turns, so at any value of this the entrance is a tube.
    enterCurlTightness: [LOOK.enterCurlTightness, 0, 1, 0.01],
    startRotationDeg: [LOOK.startRotationDeg, -180, 180, 1],
    rotationEndAt: [LOOK.rotationEndAt, 0.02, 1, 0.01],
    scaleBase: [LOOK.scaleBase, 0.05, 1, 0.01],
    scaleTargetAt: [LOOK.scaleTargetAt, 0.02, 1, 0.01],
    // The first thing to move if a hand-off starts showing: a bend still
    // resolving at the swap is a shape the flat HTML cannot match.
    curlOutAt: [LOOK.curlOutAt, 0.1, 1, 0.01],
    riseFromH: [LOOK.riseFromH, -2, 2, 0.01],
    // The settle: what stops a sheet resting in mid-air. `settleLow`/`High` are
    // the part of a move worth finishing; outside them, nothing happens.
    settleLow: [LOOK.settleLow, 0, 0.5, 0.01],
    settleHigh: [LOOK.settleHigh, 0.5, 1, 0.01],
    settleMs: [LOOK.settleMs, 100, 1200, 10],
    settleIdleMs: [LOOK.settleIdleMs, 0, 600, 10],
    // THE OPEN TWEEN, and only it: every other entrance is the reader's wheel.
    openDelayMs: [LOOK.openDelayMs, 0, 2000, 10],
    openRiseMs: [LOOK.openRiseMs, 100, 5000, 50],
    // How far under the frame the sheet starts. The DEPTH is computed from the
    // live page rect; this is the clearance it is computed to.
    openStartBelowPx: [LOOK.openStartBelowPx, 0, 400, 5],
    // What a wheel during the open buys: the rest of it, this fast.
    openSkipMs: [LOOK.openSkipMs, 100, 1200, 10],
  });
  const motion = motionDials.values;

  // THE TEAR. A sticky note coming off a surface: pinned at the top-left,
  // peeled from the bottom-right. The three `…At` dials are the joints of the
  // choreography and the rest are what each joint is worth.
  const peel = useDialKit('PV TEAR', {
    peelAngleDeg: [LOOK.peelAngleDeg, -80, 80, 1],
    peelLiftAt: [LOOK.peelLiftAt, 0.02, 0.5, 0.01],
    peelTravelAt: [LOOK.peelTravelAt, 0.2, 0.95, 0.01],
    peelFreeAt: [LOOK.peelFreeAt, 0.3, 1, 0.01],
    peelOriginFrom: [LOOK.peelOriginFrom, 0, 0.5, 0.01],
    peelTravel: [LOOK.peelTravel, 0.1, 1.2, 0.01],
    peelCurlLift: [LOOK.peelCurlLift, 0, 1, 0.01],
    peelCurlPeak: [LOOK.peelCurlPeak, 0, 1, 0.01],
    peelCurlPeakAt: [LOOK.peelCurlPeakAt, 0.05, 0.95, 0.01],
    peelCurlRelax: [LOOK.peelCurlRelax, 0, 1, 0.01],
    // The peel's own radius. A wide arc: at the entrance's 1 the fold is a
    // crease travelling across the sheet rather than a sheet coming away.
    peelCurlTightness: [LOOK.peelCurlTightness, 0, 1, 0.01],
    peelWrapMin: [LOOK.peelWrapMin, 0, 4, 0.05],
    peelRotateDeg: [LOOK.peelRotateDeg, -90, 90, 1],
    peelRotateEndDeg: [LOOK.peelRotateEndDeg, -90, 90, 1],
    peelLiftH: [LOOK.peelLiftH, -1, 1, 0.01],
    peelRiseH: [LOOK.peelRiseH, 0, 3, 0.01],
    peelScaleEnd: [LOOK.peelScaleEnd, 0.3, 1.5, 0.01],
    peelFadeFrom: [LOOK.peelFadeFrom, 0, 1, 0.01],
  });

  // The scroller's own feel. `lenisLerp` and `wheelMultiplier` are the two
  // values CSS cannot carry, so changing either rebuilds the Lenis instance
  // (see `Scroller`); the rest are custom properties like everything else.
  const track = useDialKit('PV TRACK', {
    lenisLerp: [LOOK.lenisLerp, 0.02, 1, 0.01],
    wheelMultiplier: [LOOK.wheelMultiplier, 0.2, 3, 0.05],
    letterheadClickMs: [LOOK.letterheadClickMs, 100, 2500, 10],
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
    scrimAlpha: ground.scrimAlpha,
    groundColor: ground.groundColor,
    groundAlpha: ground.groundAlpha,
    grainOpacity: ground.grainOpacity,
    letterheadHPx: ground.letterheadHPx,
    paperColor: paper.paperColor,
    inkColor: paper.inkColor,
    pageMarginPx: page.pageMarginPx,
    pageInsetPx: page.pageInsetPx,
    gridGapPx: page.gridGapPx,
    textMeasureCh: page.textMeasureCh,
    letterheadTitlePx: page.letterheadTitlePx,
    headEyebrowGapPx: page.headEyebrowGapPx,
    headTitleGapPx: page.headTitleGapPx,
    headRuleGapPx: page.headRuleGapPx,
    curlTaper: paper.curlTaper,
    curlDepth: paper.curlDepth,
    lightA: paper.lightA,
    lightAX: paper.lightAX,
    lightAY: paper.lightAY,
    lightAZ: paper.lightAZ,
    lightB: paper.lightB,
    lightBX: paper.lightBX,
    lightBY: paper.lightBY,
    lightBZ: paper.lightBZ,
    paperRoughness: paper.paperRoughness,
    paperReflect: paper.paperReflect,
    paperAmbient: paper.paperAmbient,
    backShade: paper.backShade,
    edgeAlpha: paper.edgeAlpha,
    mouseTiltDeg: paper.mouseTiltDeg,
    mouseLerp: paper.mouseLerp,
    enterDistancePx: motion.enterDistancePx,
    exitDistancePx: motion.exitDistancePx,
    dwellVh: motion.dwellVh,
    handoffMs: motion.handoffMs,
    enterCurl: motion.enterCurl,
    enterRollReach: motion.enterRollReach,
    enterRollEdge: motion.enterRollEdge === 'top' ? 1 : 0,
    enterCurlTightness: motion.enterCurlTightness,
    startRotationDeg: motion.startRotationDeg,
    rotationEndAt: motion.rotationEndAt,
    scaleBase: motion.scaleBase,
    scaleTargetAt: motion.scaleTargetAt,
    curlOutAt: motion.curlOutAt,
    riseFromH: motion.riseFromH,
    peelAngleDeg: peel.peelAngleDeg,
    peelLiftAt: peel.peelLiftAt,
    peelTravelAt: peel.peelTravelAt,
    peelFreeAt: peel.peelFreeAt,
    peelOriginFrom: peel.peelOriginFrom,
    peelTravel: peel.peelTravel,
    peelCurlLift: peel.peelCurlLift,
    peelCurlPeak: peel.peelCurlPeak,
    peelCurlPeakAt: peel.peelCurlPeakAt,
    peelCurlRelax: peel.peelCurlRelax,
    peelCurlTightness: peel.peelCurlTightness,
    peelWrapMin: peel.peelWrapMin,
    peelRotateDeg: peel.peelRotateDeg,
    peelRotateEndDeg: peel.peelRotateEndDeg,
    peelLiftH: peel.peelLiftH,
    peelRiseH: peel.peelRiseH,
    peelScaleEnd: peel.peelScaleEnd,
    peelFadeFrom: peel.peelFadeFrom,
    settleLow: motion.settleLow,
    settleHigh: motion.settleHigh,
    settleMs: motion.settleMs,
    settleIdleMs: motion.settleIdleMs,
    openDelayMs: motion.openDelayMs,
    openRiseMs: motion.openRiseMs,
    openStartBelowPx: motion.openStartBelowPx,
    openSkipMs: motion.openSkipMs,
    lenisLerp: track.lenisLerp,
    wheelMultiplier: track.wheelMultiplier,
    letterheadClickMs: track.letterheadClickMs,
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

  /**
   * THE PRESET, wired both ways.
   *
   * Choosing one writes its four numbers onto PV MOTION — so the sliders are
   * what is live and the select is a shortcut to a set of them, rather than a
   * second source of truth that would have to win an argument with them. Moving
   * any of the four afterwards puts the select back on `custom`, which is what
   * makes it readable: it always says what the dials actually are.
   */
  const chosenRef = useRef<string>(paper.entranceBend);
  const bend = entranceBendOf(look);
  useEffect(() => {
    const chosen = paper.entranceBend;
    if (chosen === chosenRef.current) return;
    chosenRef.current = chosen;
    if (chosen !== 'custom') motionDials.setValues(ENTRANCE_BENDS[chosen as EntranceBend]);
  }, [paper.entranceBend, motionDials]);
  const shownRef = useRef<string | null>(null);
  useEffect(() => {
    const shows = bend ?? 'custom';
    if (shows === shownRef.current) return;
    shownRef.current = shows;
    chosenRef.current = shows;
    if (shows !== paper.entranceBend) paperDials.setValue('entranceBend', shows);
  }, [bend, paper.entranceBend, paperDials]);

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
          `  pane: ${clip(tl.pane)},\n` +
          `}\n\n{\n${body}\n}`;
        navigator.clipboard?.writeText(snippet).catch(() => {});
        console.log(snippet);
      } else {
        onTransport(action);
      }
    },
    [onTransport, tl.scrim, tl.pane],
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
      pane: tl.pane.current.v,
    });
  }, [time, tl.scrim, tl.pane]);

  return (
    <>
      <DialRoot position="top-right" />
      <DialTimeline />
      <ContrastReadout />
    </>
  );
}
