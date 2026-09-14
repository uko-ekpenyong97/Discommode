/**
 * The page track — the pure geometry behind the project's sheets of paper.
 *
 * A SECTION IS A SHEET. It stands curled in the frame, unrolls flat toward you
 * and becomes the page you read; at the end of its run it tilts away and the
 * next section's sheet unrolls behind it. There are no tabs, no folders and no
 * pile: at any moment there is at most one live page and at most one sheet, and
 * they occupy the same rectangle.
 *
 * ONE POSITION drives all of it. Each section gets THREE SEGMENTS:
 *
 *   enter 0 │ page 0 │ exit 0 │ enter 1 │ page 1 │ exit 1 │ enter 2 │ page 2
 *   ├──────>├───────>├───────>├────────>├───────>├───────>├────────>├──────>
 *  -enter   0                                                        max
 *
 *   enterDistance   the sheet unrolls              (dial)
 *   pageScroll[k]   the section's own vertical run (measured)
 *   exitDistance    the page tilts away            (dial)
 *
 *   start[k]     the position at which section k's PAGE is at its top — where a
 *                deep link and a letterhead click both land
 *   start[k+1]   = start[k] + enterDistance + pageScroll[k] + exitDistance
 *   minPosition  = -enterDistance, which is section 0's entrance: the sheet
 *                fully rolled and out of frame, before there is anything to read
 *   maxPosition  = start[n-1] + pageScroll[n-1]
 *
 * The three segments PARTITION the track — {@link positionAt} is the one place
 * a boundary is decided, and {@link layout} goes through it, so the two can
 * never disagree. What does NOT partition it is what is on SCREEN: the next
 * section's sheet starts unrolling partway through the previous page's exit
 * (`enterOverlap`), so for a stretch both are painting. See {@link enterWindow}.
 *
 * Kept free of React and of the DOM so the mapping can be unit-tested: it is
 * the one place where "where is everything at position y" is decided, and every
 * frame of the view is a call to {@link layout}.
 */

/** Which of a section's three segments a position falls in. */
export type Segment = 'enter' | 'page' | 'exit';

export interface TrackMetrics {
  /** Content height of each section's page, in px. Its length is the count. */
  heights: number[];
  /** The page rect's height — what a section's content is measured against. */
  pageHeight: number;
  /** Scroll spent on one entrance (px). A feel, not a length. */
  enterDistance: number;
  /** Scroll spent on one exit (px). */
  exitDistance: number;
  /** How far through an exit the NEXT sheet starts unrolling, 0…1. The reason
   *  the view never shows an empty ground. */
  enterOverlap: number;
}

export interface Track {
  /** How far each section scrolls internally: `max(0, height - pageHeight)`. A
   *  section shorter than the frame has a zero-length run and goes straight
   *  from its entrance into its exit, which is a legitimate state. */
  pageScroll: number[];
  /** Track position at which each section's PAGE sits at its top. */
  start: number[];
  /** The measured content heights, kept for the dev log. */
  heights: number[];
  pageHeight: number;
  enterDistance: number;
  exitDistance: number;
  enterOverlap: number;
}

/**
 * WHERE YOU ARE, in the project's own terms rather than in pixels.
 *
 * The pixel position is meaningless across a rebuild: a section growing by
 * 400px moves every start behind it, so the same `y` is a different place. This
 * is what survives — the section, which of its three segments, and how far
 * through. Re-derive `y` from it after a rebuild ({@link resolve}) and the
 * reader has not moved.
 */
export interface TrackPosition {
  section: number;
  segment: Segment;
  /** How far down the page, in px. Only meaningful for `page`. */
  offset: number;
  /** 0…1 through an `enter` or an `exit`; 0 on a `page`. */
  p: number;
}

/** The unrolling sheet's pose. Angles in degrees, `y` in PAGE HEIGHTS. */
export interface SheetPose {
  /** 0…1 through the entrance's own window (see {@link enterWindow}). */
  p: number;
  rotationZ: number;
  scale: number;
  /** `uCurlAmount`: −1 fully rolled … 0 flat. SIGNED — see `curlMaterial.ts`. */
  curl: number;
  /** Offset from the page's resting centre, in page heights. Negative is below. */
  y: number;
}

/** The live HTML page's pose. Angles in degrees, `translateY` in page heights. */
export interface PagePose {
  /** What to write to the page's `scrollTop`. */
  scrollTop: number;
  scale: number;
  rotateZ: number;
  translateY: number;
  opacity: number;
}

export interface TrackLayout {
  /** The live HTML page, or null — during the part of an entrance that no exit
   *  overlaps there is no page at all, only the sheet. */
  page: { index: number; pose: PagePose } | null;
  /** The unrolling sheet, or null. Never painted during a vertical run. */
  sheet: { index: number; pose: SheetPose } | null;
  /**
   * The section you are IN. Commits at the HAND-OFF — during section k's
   * entrance it is still k − 1 — so the hash and the letterhead change once,
   * when the page they name actually appears.
   */
  activeIndex: number;
  segment: Segment;
  /** 0…1 through {@link segment}. */
  progress: number;
}

/** How the entrance's four channels are staggered, and where the exit ends up.
 *  All of it comes off `LOOK`; the track holds none of it. */
export interface PoseDials {
  /** Entrance. The windows are fractions of the entrance's own progress. */
  startRotation: number;
  rotationEndAt: number;
  scaleBase: number;
  scaleTargetAt: number;
  curlOutAt: number;
  /** Where the sheet rises from, in page heights. */
  riseFrom: number;
  /** Exit. */
  exitScale: number;
  exitRotate: number;
  exitRise: number;
  exitFadeFrom: number;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const clamp01 = (v: number): number => clamp(v, 0, 1);

/** 0→1 across `[0, end]` of `p`, then held. The entrance's four staggered
 *  windows are all this, and the stagger IS the choreography. */
const window01 = (p: number, end: number): number => (end <= 0 ? 1 : clamp01(p / end));

/**
 * Sub-pixel dead zone at a segment boundary. Used twice, and both matter:
 *
 *  - at the end of a vertical run, so a smoothed scroll settling on a section's
 *    bottom does not flicker into the exit;
 *  - at the end of an ENTRANCE, because a scroller quantises to device pixels
 *    and `scrollTo(start[k])` can come back a fraction short. Without it a deep
 *    link reads as "the entrance, 99.98% done" — which means the hand-off has
 *    not fired and you are looking at a texture instead of a live page, with no
 *    way to scroll it.
 */
export const SEGMENT_EPSILON = 0.5;

export function buildTrack({
  heights,
  pageHeight,
  enterDistance,
  exitDistance,
  enterOverlap,
}: TrackMetrics): Track {
  // A project always has at least one section; an empty list would make every
  // derived array empty and `layout` unanswerable.
  const h = heights.length > 0 ? heights : [pageHeight];
  const pageScroll = h.map((height) => Math.max(0, height - pageHeight));

  const start = [0];
  for (let k = 0; k + 1 < h.length; k++) {
    start.push(start[k] + enterDistance + pageScroll[k] + exitDistance);
  }

  return { pageScroll, start, heights: h, pageHeight, enterDistance, exitDistance, enterOverlap };
}

/** The position at which section `k`'s page sits at its top. */
export function positionOf(track: Track, k: number): number {
  return track.start[sectionIndex(track, k)];
}

/** The position at which section `k`'s vertical run ENDS — where its exit
 *  begins, and where a rewind out of the next section lands. */
export function bottomOf(track: Track, k: number): number {
  const i = sectionIndex(track, k);
  return track.start[i] + track.pageScroll[i];
}

function sectionIndex(track: Track, k: number): number {
  return clamp(Math.round(k), 0, track.start.length - 1);
}

/** The bottom of the last section's vertical run. The last section has no exit
 *  to scroll into: there is nothing behind it to bring on. */
export function maxPosition(track: Track): number {
  const n = track.start.length;
  return track.start[n - 1] + track.pageScroll[n - 1];
}

/** One entrance BEFORE the start: section 0's sheet fully rolled and out of
 *  frame. The scroller cannot go there — the intro tween drives it and hands
 *  over at 0. */
export function minPosition(track: Track): number {
  return -track.enterDistance;
}

/**
 * The stretch of track over which section `k`'s sheet is unrolling.
 *
 * It is NOT the same as the `enter` segment, and the difference is the whole
 * reason the ground is never empty. A sheet starts unrolling `enterOverlap` of
 * the way through the PREVIOUS section's exit, so it is already rising behind
 * the page that is leaving. The window therefore runs from inside that exit to
 * the hand-off, and is `enterDistance + (1 − enterOverlap) · exitDistance` long
 * — longer than `enterDistance`, which is the length of section 0's, the one
 * entrance with no exit in front of it.
 */
export function enterWindow(track: Track, k: number): { from: number; to: number } {
  const to = track.start[sectionIndex(track, k)];
  if (k <= 0) return { from: to - track.enterDistance, to };
  return { from: bottomOf(track, k - 1) + track.enterOverlap * track.exitDistance, to };
}

/**
 * Read a pixel position as a {@link TrackPosition}. The inverse of
 * {@link resolve}, and the only place a segment boundary is decided.
 */
export function positionAt(track: Track, position: number): TrackPosition {
  const { start, pageScroll, enterDistance: E, exitDistance: X } = track;
  const n = start.length;
  const y = clamp(position, minPosition(track), maxPosition(track));

  // The boundary between section k's exit and section k+1's entrance is
  // `start[k+1] - E`, and it is not a resting place — no epsilon is wanted
  // there, only at the two ends of a vertical run.
  let k = 0;
  while (k + 1 < n && y >= start[k + 1] - E) k++;

  if (y < start[k] - SEGMENT_EPSILON) {
    return { section: k, segment: 'enter', offset: 0, p: clamp01((y - (start[k] - E)) / E) };
  }
  const bottom = start[k] + pageScroll[k];
  if (y > bottom + SEGMENT_EPSILON) {
    return { section: k, segment: 'exit', offset: pageScroll[k], p: clamp01((y - bottom) / X) };
  }
  return { section: k, segment: 'page', offset: clamp(y - start[k], 0, pageScroll[k]), p: 0 };
}

/**
 * Put a {@link TrackPosition} back into pixels against a (possibly rebuilt)
 * track. A section that got taller keeps you at the same distance down it; one
 * that got shorter than where you were puts you at its bottom.
 */
export function resolve(track: Track, at: TrackPosition): number {
  const i = sectionIndex(track, at.section);
  const fit = (y: number): number => clamp(y, minPosition(track), maxPosition(track));
  if (at.segment === 'enter') {
    return fit(track.start[i] - track.enterDistance * (1 - clamp01(at.p)));
  }
  if (at.segment === 'exit') {
    // An exit only exists where there is a section after this one to bring on,
    // and it always begins at the BOTTOM of the section it follows — so that is
    // the base however tall that section has become. Carrying the old offset
    // across would land the position back inside the vertical run.
    if (i + 1 >= track.start.length) return maxPosition(track);
    return fit(bottomOf(track, i) + clamp01(at.p) * track.exitDistance);
  }
  return fit(track.start[i] + clamp(at.offset, 0, track.pageScroll[i]));
}

/**
 * THE TURN: an exit and the entrance that overlaps it, taken as ONE transition.
 *
 * The settle works on this rather than on a segment, and it has to. The two
 * segments between one page and the next are a single move — the page leaves,
 * the sheet arrives — and the boundary between them is a state with nothing on
 * screen but ground. Settling "to the nearer end of the exit" would park the
 * reader exactly there. The nearer end of the TURN is always a page.
 *
 * `index` is the section being left; `-1` is the view's own entrance, before
 * there is a section to leave. Null during a vertical run.
 */
export function turnAt(track: Track, position: number): { index: number; p: number } | null {
  const at = positionAt(track, position);
  if (at.segment === 'page') return null;
  const y = clamp(position, minPosition(track), maxPosition(track));
  const index = at.segment === 'exit' ? at.section : at.section - 1;
  if (index < 0) return { index: -1, p: clamp01((y - minPosition(track)) / track.enterDistance) };
  return {
    index,
    p: clamp01((y - bottomOf(track, index)) / (track.exitDistance + track.enterDistance)),
  };
}

/** Where a part-done turn should land: back to the page you were reading, or on
 *  to the top of the next one. */
export function settleTarget(track: Track, turn: { index: number; p: number }): number {
  if (turn.index < 0) return 0;
  return turn.p < 0.5 ? bottomOf(track, turn.index) : positionOf(track, turn.index + 1);
}

/* ── the poses ───────────────────────────────────────────────────────────── */

/**
 * The sheet, `p` through its entrance.
 *
 * The four windows are staggered deliberately and the ORDER is the point: the
 * sheet stops tumbling first, reaches full size second, and finishes uncurling
 * well before the hand-off — `curl` is 0 for the last 40% of the entrance. A
 * curl still resolving at the swap is a curl the flat HTML cannot match, so the
 * crossfade would have to hide a shape change rather than a surface change. It
 * cannot. Moving `curlOutAt` down is the first thing to try if the hand-off
 * starts showing.
 *
 * `y` is the one channel that runs the full window, so the sheet is still
 * rising into place when everything else has settled. That is what makes the
 * last third read as a sheet being laid down rather than as a finished graphic
 * waiting for its cue.
 *
 * Every channel is LINEAR inside its window. The scroll is the clock and Lenis
 * is the only smoothing there is: an eased channel would put the sheet
 * somewhere other than where the wheel left it.
 */
export function sheetPose(p: number, d: PoseDials): SheetPose {
  const t = clamp01(p);
  return {
    p: t,
    rotationZ: d.startRotation * (1 - window01(t, d.rotationEndAt)),
    scale: d.scaleBase + (1 - d.scaleBase) * window01(t, d.scaleTargetAt),
    // Signed, and it stays signed: the sign is which way the sheet rolls.
    curl: -(1 - window01(t, d.curlOutAt)),
    y: d.riseFrom * (1 - t),
  };
}

/**
 * The page, `p` through its exit. CSS 3D on the live element — no texture, no
 * canvas.
 *
 * The opacity runs late so the page is a solid object for most of its departure
 * and only dissolves once it is small and off-axis: fading it from the start
 * turns a sheet being taken away into a layer being switched off.
 */
export function exitPose(p: number, scrollTop: number, d: PoseDials): PagePose {
  const t = clamp01(p);
  const fade = d.exitFadeFrom >= 1 ? 0 : clamp01((t - d.exitFadeFrom) / (1 - d.exitFadeFrom));
  return {
    scrollTop,
    scale: 1 + (d.exitScale - 1) * t,
    rotateZ: d.exitRotate * t,
    translateY: d.exitRise * t,
    opacity: 1 - fade,
  };
}

/** The page at rest: its own scroll, and nothing else. */
export function restingPose(scrollTop: number): PagePose {
  return { scrollTop, scale: 1, rotateZ: 0, translateY: 0, opacity: 1 };
}

/**
 * Where everything is at track position `y`.
 *
 * Two moving parts at most, and usually one. On a vertical run there is a page
 * and nothing else. On an exit there is the leaving page, and — once the
 * overlap starts — the next section's sheet behind it. On an entrance past the
 * end of that exit there is only the sheet.
 *
 * Never two live HTML pages: the next section's page does not exist until its
 * own hand-off.
 */
export function layout(track: Track, position: number, d: PoseDials): TrackLayout {
  const n = track.start.length;
  const y = clamp(position, minPosition(track), maxPosition(track));
  const at = positionAt(track, y);

  let page: TrackLayout['page'] = null;
  if (at.segment === 'page') {
    page = { index: at.section, pose: restingPose(at.offset) };
  } else if (at.segment === 'exit') {
    page = { index: at.section, pose: exitPose(at.p, track.pageScroll[at.section], d) };
  }

  // The sheet is the section whose ENTRANCE WINDOW contains the position —
  // which during an exit is the section after the one leaving, and only once
  // the overlap has started.
  let sheet: TrackLayout['sheet'] = null;
  const unroll = (k: number): void => {
    const w = enterWindow(track, k);
    sheet = { index: k, pose: sheetPose((y - w.from) / (w.to - w.from), d) };
  };
  if (at.segment === 'enter') unroll(at.section);
  else if (at.segment === 'exit' && at.section + 1 < n) {
    if (y >= enterWindow(track, at.section + 1).from) unroll(at.section + 1);
  }

  return {
    page,
    sheet,
    // Commits at the hand-off: during section k's entrance the page you last
    // read is still the one the hash and the letterhead name.
    activeIndex: at.segment === 'enter' ? Math.max(0, at.section - 1) : at.section,
    segment: at.segment,
    progress: at.segment === 'page' ? 0 : at.p,
  };
}
