/**
 * The page track — the pure geometry behind the project's sheets of paper.
 *
 * A SECTION IS A SHEET. It unrolls flat toward you and becomes the page you
 * read; at the end of its run it PEELS off the ground like a sticky note —
 * lifted at its bottom-right corner, bent across itself, and taken up and back
 * out of the frame — and then there is half a screen of empty ground before the
 * next sheet arrives.
 *
 * ONE POSITION drives all of it. Each section gets FOUR SEGMENTS:
 *
 *   enter 0 │ page 0 │ tear 0 │ dwell 0 │ enter 1 │ page 1 │ tear 1 │ dwell 1
 *   ├──────>├───────>├───────>├────────>├────────>├───────>├───────>├───────>
 *  -enter   0                                                        …
 *
 *   enterDistance   the sheet unrolls              (dial, 900)
 *   pageScroll[k]   the section's own vertical run (measured)
 *   exitDistance    the sheet peels away           (dial, 700)
 *   dwellDistance   ground alone                   (dial, 0.5 × the page rect)
 *
 *   start[k]     the position at which section k's PAGE is at its top — where a
 *                deep link and a letterhead click both land
 *   start[k+1]   = start[k] + enter + pageScroll[k] + exit + dwell
 *   minPosition  = -enterDistance, which is section 0's entrance: the sheet
 *                rolled and out of frame, before there is anything to read
 *   maxPosition  = start[n-1] + pageScroll[n-1]
 *
 * The four segments PARTITION the track, and now they also partition the
 * SCREEN: the previous model had the next sheet start unrolling partway through
 * the last page's exit, so two sections were live at once. The dwell replaces
 * that overlap. One section leaves completely, the ground is empty for half a
 * screen, and then the next one arrives — which is the beat the overlap was
 * hiding, and which is what makes a tear read as a thing that finished.
 *
 * Kept free of React and of the DOM so the mapping can be unit-tested: it is
 * the one place where "where is everything at position y" is decided, and every
 * frame of the view is a call to {@link layout}.
 */

/** Which of a section's four segments a position falls in. */
export type Segment = 'enter' | 'page' | 'exit' | 'dwell';

/** Which capture the sheet is wearing. A section has two: its first viewport,
 *  which the entrance unrolls, and its last, which the tear peels away. */
export type SheetKind = 'sheet' | 'tail';

export interface TrackMetrics {
  /** Content height of each section's page, in px. Its length is the count. */
  heights: number[];
  /** The page rect's height — what a section's content is measured against. */
  pageHeight: number;
  /** Scroll spent on one entrance (px). A feel, not a length. */
  enterDistance: number;
  /** Scroll spent on one tear (px). */
  exitDistance: number;
  /** Scroll spent on empty ground between one section and the next (px). */
  dwellDistance: number;
}

export interface Track {
  /** How far each section scrolls internally: `max(0, height - pageHeight)`. A
   *  section shorter than the frame has a zero-length run and goes straight
   *  from its entrance into its tear, which is a legitimate state. */
  pageScroll: number[];
  /** Track position at which each section's PAGE sits at its top. */
  start: number[];
  /** The measured content heights, kept for the dev log. */
  heights: number[];
  pageHeight: number;
  enterDistance: number;
  exitDistance: number;
  dwellDistance: number;
}

/**
 * WHERE YOU ARE, in the project's own terms rather than in pixels.
 *
 * The pixel position is meaningless across a rebuild: a section growing by
 * 400px moves every start behind it, so the same `y` is a different place. This
 * is what survives — the section, which of its four segments, and how far
 * through. Re-derive `y` from it after a rebuild ({@link resolve}) and the
 * reader has not moved.
 */
export interface TrackPosition {
  section: number;
  segment: Segment;
  /** How far down the page, in px. Only meaningful for `page`. */
  offset: number;
  /** 0…1 through an `enter`, an `exit` or a `dwell`; 0 on a `page`. */
  p: number;
}

/**
 * THE SHEET'S POSE. Angles in degrees; `y` in PAGE HEIGHTS; `pivot` in plane
 * units, where (0, 0) is the centre and (−0.5, 0.5) the top-left corner.
 *
 * One shape covers the entrance and the tear, because the shader's bend does:
 * `curl` is how far the flap has turned and `curlOrigin` is where the fold is.
 * The entrance holds the fold still near the bottom edge and relaxes the bend;
 * the tear drives the fold across the sheet and lets the bend peak.
 */
export interface SheetPose {
  /** 0…1 through the segment that owns the sheet. */
  p: number;
  kind: SheetKind;
  /** Degrees CLOCKWISE, the way a CSS rotation is measured — which is the
   *  convention every angle in this view uses, `curlAxis` excepted. */
  rotationZ: number;
  pivotX: number;
  pivotY: number;
  scale: number;
  /** `uCurlAmount`: −1 … 1, SIGNED. Positive bends toward the viewer. */
  curl: number;
  /** `uCurlOrigin`: where the fold sits along the roll direction, 0…1. */
  curlOrigin: number;
  /** `uCurlAxis`: the direction the fold TRAVELS, in degrees anticlockwise from
   *  +x with y up. 90 runs straight up the sheet, which is a horizontal fold. */
  curlAxis: number;
  /** Offset from the page's resting centre, in page heights. Positive is up. */
  y: number;
  opacity: number;
  /** Whether the pointer tilt applies. A sheet being pulled off a surface does
   *  not follow the cursor. */
  pointer: boolean;
}

/**
 * The live HTML page's pose — which is now two numbers, because the page no
 * longer moves at all. It reads, and then it hands over to the sheet and stops
 * existing. Every pixel of the tear is WebGL.
 */
export interface PagePose {
  /** What to write to the page's `scrollTop`. */
  scrollTop: number;
  opacity: number;
}

export interface TrackLayout {
  /** The live HTML page, or null. Null for every segment but `page` — the
   *  crossfades at either end of a run are the driver's, not the track's. */
  page: { index: number; pose: PagePose } | null;
  /** The sheet, or null. It unrolls on an `enter` and peels on an `exit`, and
   *  there is no segment where both a page and a sheet are painting. */
  sheet: { index: number; pose: SheetPose } | null;
  /**
   * The section you are IN. Commits at the HAND-OFF — during section k's
   * entrance it is still k − 1 — so the hash changes once, when the page it
   * names actually appears.
   */
  activeIndex: number;
  /** The section on its way, or null: the one whose sheet is unrolling, or the
   *  one the dwell is waiting for. The letterhead shows it dim. */
  pendingIndex: number | null;
  segment: Segment;
  /** 0…1 through {@link segment}. */
  progress: number;
}

/** Every number the two poses are shaped by. All of it comes off `LOOK`; the
 *  track holds none of it. */
export interface PoseDials {
  /* ── the entrance ──────────────────────────────────────────────────────── */
  /** The bend it arrives with, and where that bend sits. Negative bends away
   *  from the viewer; near the bottom edge, so the rest of the sheet is flat
   *  and a line of type stays readable across the curve. */
  enterCurl: number;
  enterCurlOrigin: number;
  /** Which edge the curve is on, as the direction the fold travels. */
  enterCurlAxis: number;
  startRotation: number;
  rotationEndAt: number;
  scaleBase: number;
  scaleTargetAt: number;
  curlOutAt: number;
  /** Where the sheet rises from, in page heights. */
  riseFrom: number;

  /* ── the tear ──────────────────────────────────────────────────────────── */
  /** The fold line's angle in degrees, measured CLOCKWISE from horizontal the
   *  way a CSS rotation is. The peel travels at right angles to it, from the
   *  bottom-right corner toward the pinned top-left one. */
  peelAngle: number;
  /** The three joints of the choreography, as fractions of the tear. */
  peelLiftAt: number;
  peelTravelAt: number;
  peelFreeAt: number;
  /** Where the fold starts and ends, along the roll direction. */
  peelOriginFrom: number;
  peelOriginTo: number;
  /** The bend: at the lift, at its peak, and what it relaxes back to when the
   *  sheet comes free and the paper springs. */
  peelCurlLift: number;
  peelCurlPeak: number;
  peelCurlPeakAt: number;
  peelCurlRelax: number;
  /** The rotation about the pinned corner, at the travel's end and at the end. */
  peelRotateMid: number;
  peelRotateEnd: number;
  /** The lift, in page heights, at the travel's end and at the end. */
  peelLiftMid: number;
  peelRiseEnd: number;
  /** How far it recedes once it is free. */
  peelScaleEnd: number;
  /** Where in the tear the opacity starts to go. The last tenth, on purpose. */
  peelFadeFrom: number;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const clamp01 = (v: number): number => clamp(v, 0, 1);

/** 0→1 across `[0, end]` of `p`, then held. The entrance's staggered windows
 *  are all this, and the stagger IS its choreography. */
const window01 = (p: number, end: number): number => (end <= 0 ? 1 : clamp01(p / end));

/**
 * 0→1 across `[a, b]`, eased in and out — the tear's windows are all this.
 *
 * The easing is on the SCROLL MAPPING and nowhere else, which is what keeps the
 * settle's rules true: the sheet is still exactly where the wheel put it, it is
 * just that the joints between the tear's four movements have no corner in
 * them. A linear ramp into and out of each window reads as four separate
 * gestures with a jolt between them, and a peel is one gesture.
 */
function ramp(p: number, a: number, b: number): number {
  if (b <= a) return p >= b ? 1 : 0;
  const t = clamp01((p - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** Walk a keyframe list. Each pair is `[p, value]`, in order, eased between. */
function track01(p: number, keys: [number, number][]): number {
  if (p <= keys[0][0]) return keys[0][1];
  for (let i = 0; i + 1 < keys.length; i++) {
    const [pa, va] = keys[i];
    const [pb, vb] = keys[i + 1];
    if (p <= pb) return va + (vb - va) * ramp(p, pa, pb);
  }
  return keys[keys.length - 1][1];
}

/**
 * Sub-pixel dead zone at a segment boundary. Every boundary that is a RESTING
 * PLACE gets one, and all three are:
 *
 *  - at the top and the bottom of a vertical run, so a smoothed scroll settling
 *    on either does not flicker into the segment beyond it. The one at the top
 *    is the load-bearing one: a scroller quantises to device pixels, so
 *    `scrollTo(start[k])` can come back a fraction short, and without the guard
 *    a deep link reads as "the entrance, 99.98% done" — which means the hand-off
 *    has not fired and you are looking at a texture instead of a live page, with
 *    no way to scroll it;
 *  - at the end of a TEAR, which is where the settle lands a half-done peel and
 *    is the start of the dwell.
 */
export const SEGMENT_EPSILON = 0.5;

export function buildTrack({
  heights,
  pageHeight,
  enterDistance,
  exitDistance,
  dwellDistance,
}: TrackMetrics): Track {
  // A project always has at least one section; an empty list would make every
  // derived array empty and `layout` unanswerable.
  const h = heights.length > 0 ? heights : [pageHeight];
  const pageScroll = h.map((height) => Math.max(0, height - pageHeight));

  const start = [0];
  for (let k = 0; k + 1 < h.length; k++) {
    start.push(start[k] + enterDistance + pageScroll[k] + exitDistance + dwellDistance);
  }

  return { pageScroll, start, heights: h, pageHeight, enterDistance, exitDistance, dwellDistance };
}

/** The position at which section `k`'s page sits at its top. */
export function positionOf(track: Track, k: number): number {
  return track.start[sectionIndex(track, k)];
}

/** The position at which section `k`'s vertical run ENDS — where its tear
 *  begins, and where a rewind out of the tear lands. */
export function bottomOf(track: Track, k: number): number {
  const i = sectionIndex(track, k);
  return track.start[i] + track.pageScroll[i];
}

/** The position at which section `k`'s tear ends and its dwell begins: the
 *  sheet gone, the ground empty. A resting place, and the settle's forward end
 *  for a half-done peel. */
export function dwellStart(track: Track, k: number): number {
  return bottomOf(track, k) + track.exitDistance;
}

function sectionIndex(track: Track, k: number): number {
  return clamp(Math.round(k), 0, track.start.length - 1);
}

/** The bottom of the last section's vertical run. The last section has neither
 *  a tear nor a dwell: there is nothing behind it to bring on. */
export function maxPosition(track: Track): number {
  const n = track.start.length;
  return track.start[n - 1] + track.pageScroll[n - 1];
}

/** One entrance BEFORE the start: section 0's sheet rolled and out of frame.
 *  The scroller cannot go there — the intro tween drives it and hands over at
 *  0. */
export function minPosition(track: Track): number {
  return -track.enterDistance;
}

/**
 * The stretch of track over which section `k`'s sheet unrolls, which is now
 * exactly its `enter` segment.
 *
 * It was not, under the model this replaces: a sheet started unrolling partway
 * through the previous page's exit, so the window was longer than
 * `enterDistance` and two sections were on screen at once. The dwell took that
 * over. Kept as a function because the verify steers by it and because the
 * distinction is worth being able to look up.
 */
export function enterWindow(track: Track, k: number): { from: number; to: number } {
  const to = track.start[sectionIndex(track, k)];
  return { from: to - track.enterDistance, to };
}

/**
 * Read a pixel position as a {@link TrackPosition}. The inverse of
 * {@link resolve}, and the only place a segment boundary is decided.
 */
export function positionAt(track: Track, position: number): TrackPosition {
  const { start, pageScroll, enterDistance: E, exitDistance: X, dwellDistance: D } = track;
  const n = start.length;
  const y = clamp(position, minPosition(track), maxPosition(track));

  // The boundary between one section's dwell and the next's entrance is
  // `start[k+1] - E`, and it is not a resting place — no epsilon is wanted
  // there.
  let k = 0;
  while (k + 1 < n && y >= start[k + 1] - E) k++;

  if (y < start[k] - SEGMENT_EPSILON) {
    return { section: k, segment: 'enter', offset: 0, p: clamp01((y - (start[k] - E)) / E) };
  }
  const bottom = start[k] + pageScroll[k];
  if (y <= bottom + SEGMENT_EPSILON) {
    return { section: k, segment: 'page', offset: clamp(y - start[k], 0, pageScroll[k]), p: 0 };
  }
  const tearEnd = bottom + X;
  if (y <= tearEnd + SEGMENT_EPSILON) {
    return { section: k, segment: 'exit', offset: pageScroll[k], p: X > 0 ? clamp01((y - bottom) / X) : 1 };
  }
  return {
    section: k,
    segment: 'dwell',
    offset: pageScroll[k],
    p: D > 0 ? clamp01((y - tearEnd) / D) : 1,
  };
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
  // A tear and a dwell only exist where there is a section after this one to
  // bring on, and both are anchored to the BOTTOM of the section they follow —
  // so that is the base however tall it has become. Carrying the old offset
  // across would land the position back inside the vertical run.
  if (at.segment === 'exit') {
    if (i + 1 >= track.start.length) return maxPosition(track);
    return fit(bottomOf(track, i) + clamp01(at.p) * track.exitDistance);
  }
  if (at.segment === 'dwell') {
    if (i + 1 >= track.start.length) return maxPosition(track);
    return fit(dwellStart(track, i) + clamp01(at.p) * track.dwellDistance);
  }
  return fit(track.start[i] + clamp(at.offset, 0, track.pageScroll[i]));
}

/**
 * WHERE A HALF-DONE MOVE SHOULD FINISH, and how far through it you are.
 *
 * There are two kinds of move between one page and the next, and they settle
 * differently because they end differently.
 *
 * THE TEAR settles to its NEARER END. Both of those ends are somewhere: back to
 * the page you were reading, or on to the empty ground the peel finishes on. A
 * sheet stopped halfway off is the one state neither.
 *
 * THE DWELL AND THE ENTRANCE settle FORWARD, always, and are one unit. Empty
 * ground is a beat you pass through rather than a place to sit, and the only
 * thing on the far side of it is the next page — settling "back to the start of
 * the dwell" would leave the reader staring at nothing, and settling "to the
 * start of the next entrance" would leave them looking at a rolled sheet, which
 * is exactly what the settle exists to prevent.
 *
 * Null during a vertical run, which is the one segment that is already a rest.
 */
export interface SettlePlan {
  /** 0…1 through the move. The dials bound which part of it is worth
   *  finishing. */
  p: number;
  /** Where it should land. */
  target: number;
  /** `true` for the tear, which is the only one that can settle backwards. */
  reversible: boolean;
}

export function settleAt(track: Track, position: number): SettlePlan | null {
  const { start, enterDistance: E, dwellDistance: D } = track;
  const n = start.length;
  const at = positionAt(track, position);
  if (at.segment === 'page') return null;
  const y = clamp(position, minPosition(track), maxPosition(track));

  if (at.segment === 'exit') {
    const from = bottomOf(track, at.section);
    const to = dwellStart(track, at.section);
    const p = to > from ? clamp01((y - from) / (to - from)) : 1;
    return { p, target: p < 0.5 ? from : to, reversible: true };
  }

  // The dwell of section k brings on k + 1; the entrance of section k brings on
  // k. Either way the unit is the same stretch of track, and it runs from the
  // moment the ground went empty to the moment the next page is there.
  const next = at.segment === 'dwell' ? at.section + 1 : at.section;
  if (next >= n) return null;
  const to = start[next];
  const from = to - E - (next > 0 ? D : 0);
  return { p: to > from ? clamp01((y - from) / (to - from)) : 1, target: to, reversible: false };
}

/* ── the poses ───────────────────────────────────────────────────────────── */

/**
 * The sheet, `p` through its entrance.
 *
 * The windows are staggered deliberately and the ORDER is the point: the sheet
 * stops tumbling first, reaches full size second, and **finishes straightening
 * well before the hand-off** — `curl` is 0 for the last 40% of the entrance. A
 * bend still resolving at the swap is a shape the flat HTML cannot match, so
 * the crossfade would have to hide a shape change rather than a surface change.
 * It cannot. Moving `curlOutAt` down is the first thing to try if the hand-off
 * starts showing.
 *
 * `y` is the one channel that runs the full window, so the sheet is still
 * rising into place when everything else has settled. That is what makes the
 * last third read as a sheet being laid down rather than as a finished graphic
 * waiting for its cue.
 *
 * THE FOLD DOES NOT MOVE. It sits a sixth of the way in from the sheet's TOP
 * edge and only the bend relaxes. That is what makes this a sheet held in a
 * hand rather than a scroll being unrolled: a wide curve at one edge, the rest
 * of it flat, and the type readable across the curve the whole way in.
 *
 * The top edge and not the bottom, because the sheet rises into place from
 * below: its bottom edge is off the frame for the whole entrance, so a curve
 * there is a curve nobody sees. The top is the leading edge. See
 * `enterCurlAxis`.
 *
 * Every channel is LINEAR inside its window, because the scroll is the clock
 * and Lenis is the only smoothing there is.
 */
export function sheetPose(p: number, d: PoseDials): SheetPose {
  const t = clamp01(p);
  return {
    p: t,
    kind: 'sheet',
    rotationZ: d.startRotation * (1 - window01(t, d.rotationEndAt)),
    pivotX: 0,
    pivotY: 0,
    scale: d.scaleBase + (1 - d.scaleBase) * window01(t, d.scaleTargetAt),
    // Signed, and it stays signed: the sign is which way it bends.
    curl: d.enterCurl * (1 - window01(t, d.curlOutAt)),
    curlOrigin: d.enterCurlOrigin,
    curlAxis: d.enterCurlAxis,
    y: d.riseFrom * (1 - t),
    opacity: 1,
    pointer: true,
  };
}

/**
 * THE TEAR, `p` through the exit. A sticky note coming off a surface.
 *
 * The sheet is stuck at its top-left corner and you peel the bottom-right one.
 * Four movements, and they overlap at the joints rather than running in
 * sequence:
 *
 *   0 → peelLiftAt      the free corner lifts. The fold is right at the corner
 *                       and nothing translates: a peel starts as a bend, not as
 *                       a move.
 *   → peelTravelAt      the fold TRAVELS across the sheet toward the pinned
 *                       corner, the bend peaks and starts to ease, and the
 *                       sheet turns about the pin and lifts a little.
 *   → peelFreeAt        the pin lets go: it goes up and back, keeps turning,
 *                       and the bend relaxes as paper springs.
 *   → 1                 off the top of the frame, and only then does it fade.
 *
 * The rotation is about the PINNED CORNER and not the centre, which is the
 * whole difference between a sheet being peeled and a sheet being spun. It
 * keeps its pivot after the pin releases too: nothing about the way it is
 * travelling changes at that moment except that it is no longer held, and a
 * pivot that jumped to the centre would put a kink in the path.
 *
 * The fold line runs at `peelAngle`, and the sheet's own `curlAxis` is the
 * direction the fold TRAVELS — a right angle from the fold line, pointing at
 * the pinned corner. `peelAngle` is measured the way a CSS rotation is,
 * clockwise from horizontal, which is why the sign flips on the way in.
 */
export function tearPose(p: number, d: PoseDials): SheetPose {
  const t = clamp01(p);
  const lift = d.peelLiftAt;
  const travel = d.peelTravelAt;
  const free = d.peelFreeAt;
  return {
    p: t,
    kind: 'tail',
    rotationZ: track01(t, [
      [0, 0],
      [lift, 0],
      [travel, d.peelRotateMid],
      [free, d.peelRotateEnd],
      [1, d.peelRotateEnd],
    ]),
    // The top-left corner: the one that is stuck.
    pivotX: -0.5,
    pivotY: 0.5,
    scale: track01(t, [
      [0, 1],
      [travel, 1],
      [free, d.peelScaleEnd],
      [1, d.peelScaleEnd],
    ]),
    curl: track01(t, [
      [0, 0],
      [lift, d.peelCurlLift],
      [d.peelCurlPeakAt, d.peelCurlPeak],
      [travel, d.peelCurlPeak],
      [free, d.peelCurlRelax],
      [1, d.peelCurlRelax],
    ]),
    curlOrigin: track01(t, [
      [0, d.peelOriginFrom],
      [lift, d.peelOriginFrom],
      [travel, d.peelOriginTo],
      [1, d.peelOriginTo],
    ]),
    // Clockwise on screen, anticlockwise in the shader's y-up frame; and the
    // roll direction is a right angle from the fold line.
    curlAxis: 90 - d.peelAngle,
    y: track01(t, [
      [0, 0],
      [lift, 0],
      [travel, d.peelLiftMid],
      [free, d.peelRiseEnd],
      [1, d.peelRiseEnd],
    ]),
    opacity: 1 - ramp(t, d.peelFadeFrom, 1),
    // A sheet being pulled off a surface does not follow the cursor.
    pointer: false,
  };
}

/** The page at rest: its own scroll, and nothing else. */
export function restingPose(scrollTop: number): PagePose {
  return { scrollTop, opacity: 1 };
}

/**
 * Where everything is at track position `y`.
 *
 * ONE THING AT A TIME, and that is new. A vertical run is a page; an entrance
 * and a tear are a sheet; a dwell is neither. Nothing here ever returns both,
 * and the two 120ms crossfades at either end of a run — where a page and a
 * sheet showing the same pixels swap places — belong to the driver rather than
 * to the track, because they are a duration and everything here is a distance.
 */
export function layout(track: Track, position: number, d: PoseDials): TrackLayout {
  const n = track.start.length;
  const y = clamp(position, minPosition(track), maxPosition(track));
  const at = positionAt(track, y);

  const page =
    at.segment === 'page' ? { index: at.section, pose: restingPose(at.offset) } : null;

  let sheet: TrackLayout['sheet'] = null;
  if (at.segment === 'enter') sheet = { index: at.section, pose: sheetPose(at.p, d) };
  else if (at.segment === 'exit') {
    const pose = tearPose(at.p, d);
    // A tear ends on a sheet that has faded to nothing, and the last half-pixel
    // of it belongs to the tear rather than to the dwell (see
    // {@link SEGMENT_EPSILON}) — which is also exactly where the settle parks a
    // half-done peel. Reporting that as a sheet would have the canvas paint a
    // frame nobody can see, at the one position the view is meant to be empty.
    //
    // A 255th is the threshold and not zero, because the settle lands through
    // Lenis and Lenis quantises: parking at the tear's end can come back a
    // thousandth short, which is an opacity that rounds to nothing on an 8-bit
    // surface and a sheet that would otherwise never go away.
    if (pose.opacity >= 1 / 255) sheet = { index: at.section, pose };
  }

  return {
    page,
    sheet,
    // Commits at the hand-off: during section k's entrance the page you last
    // read is still the one the hash names.
    activeIndex: at.segment === 'enter' ? Math.max(0, at.section - 1) : at.section,
    // …and the one on its way is named dim, from the moment the ground empties.
    pendingIndex:
      at.segment === 'enter'
        ? at.section
        : at.segment === 'dwell'
          ? Math.min(at.section + 1, n - 1)
          : null,
    segment: at.segment,
    progress: at.segment === 'page' ? 0 : at.p,
  };
}
