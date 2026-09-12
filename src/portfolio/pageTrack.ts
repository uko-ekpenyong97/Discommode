/**
 * The page track — the pure geometry behind the project notebook.
 *
 * A project is a tabbed notebook. ONE page surface, fixed and centred, with the
 * project's SECTIONS stacked in z behind it and a tab per section down the left
 * edge. You scroll a section to its end, keep scrolling, and the next section
 * turns in from the right and covers it, one to one with the wheel. Finished
 * sections stay in the stack, underneath.
 *
 * So the track is one dimension made of alternating segments:
 *
 *   section 0 vertical │ turn │ section 1 vertical │ turn │ section 2 vertical
 *   ├──────────────────>├─────>├──────────────────>├─────>├─────────────────>
 *   0            scroll_0   +turnDistance                  trackLength - VH
 *
 * The only thing that changed from the row model it replaces is what the
 * horizontal part of a segment DOES: the row slid every page left by one page
 * width; the notebook slides exactly one section in from the right, over a
 * stack that never moves. The track arithmetic is the same shape, which is why
 * `turnDistance` is its own dial rather than being tied to the page width.
 *
 * Kept free of React and of the DOM so the mapping can be unit-tested — it is
 * the one place where "where is everything at scroll y" is decided, and every
 * frame of the sheet is a call to {@link layout}.
 */

export interface TrackMetrics {
  /** Content height of each section, in px. Its length is the section count. */
  heights: number[];
  viewportHeight: number;
  /** Scroll spent turning one section in. */
  turnDistance: number;
}

export interface Track {
  /** How far each section scrolls internally: `max(0, height - viewportHeight)`. */
  pageScroll: number[];
  /** Track position at which each section's vertical segment begins. */
  start: number[];
  /** Total scrollable extent, including the last section's viewport. */
  length: number;
  turnDistance: number;
  viewportHeight: number;
}

/**
 * WHERE YOU ARE, in the project's own terms rather than in pixels.
 *
 * The pixel position is meaningless across a rebuild: a section growing by
 * 400px moves every start behind it, so the same `y` is a different place. This
 * is what survives — the section, how far down it, and how far through the turn
 * that follows it. Re-derive `y` from this after a rebuild ({@link resolve})
 * and the reader has not moved.
 */
export interface TrackPosition {
  /** The section whose SEGMENT the position falls in (during a turn, the one
   *  being covered — the turn belongs to the section it follows). */
  section: number;
  /** How far down that section, in px. */
  offset: number;
  /** 0…1 through the turn after that section; null while the position is vertical. */
  turn: number | null;
}

export interface TrackLayout {
  /** What to write to each section's own `scrollTop`. */
  scrollTop: number[];
  /** What to write to each section's `translateX`, as a PERCENTAGE of the page
   *  width — the turn is a page sliding over a page, so it is naturally
   *  expressed in page widths and needs no pixel geometry to describe. */
  translateX: number[];
  /** Stacking order. Sections run in index order, so a later section always
   *  covers an earlier one and the incoming one covers them all. */
  zIndex: number[];
  /** False for sections that have not been reached: parked off to the right,
   *  and taken out of painting entirely so a long project costs nothing. */
  visible: boolean[];
  /** The section DRAWN ON TOP — what you are looking at. Flips the instant a
   *  turn begins, because from that instant the incoming section is what is in
   *  front of you. Drives the shadow, the reveal root and the probe. */
  topIndex: number;
  /** The section you are IN. Flips at the turn's halfway point, which is where
   *  the cover is more the new section's than the old one's. Drives the flush
   *  tab and the hash — the things that should commit once, not twice. */
  activeIndex: number;
  /** True while the scroll is driving a turn rather than a section's own scroll. */
  turning: boolean;
  /** 0…1 through the turn; 0 when not turning. */
  progress: number;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * Sub-pixel dead zone at the end of a section's vertical run. Landing EXACTLY
 * on a section's bottom is a routine position — it is where a tab click goes,
 * and where a smoothed scroll settles — and a float epsilon either side of the
 * boundary must not flip which section is the active one. Half a pixel into a
 * 700-odd pixel turn is invisible.
 */
const SEGMENT_EPSILON = 0.5;

/** The point in a turn at which the new section takes over as the one you are
 *  in. Half way: before it, the old section is still most of what you see. */
const HANDOVER = 0.5;

export function buildTrack({ heights, viewportHeight, turnDistance }: TrackMetrics): Track {
  // A project always has at least one section; an empty list would make every
  // derived array empty and `layout` unanswerable.
  const h = heights.length > 0 ? heights : [viewportHeight];
  const n = h.length;

  const pageScroll = h.map((height) => Math.max(0, height - viewportHeight));

  // Each section's vertical run, then one turn.
  const start = [0];
  for (let k = 0; k + 1 < n; k++) start.push(start[k] + pageScroll[k] + turnDistance);

  const length = start[n - 1] + pageScroll[n - 1] + viewportHeight;

  return { pageScroll, start, length, turnDistance, viewportHeight };
}

/** The track position at which section `k` begins — where a deep link and a tab
 *  click both land. */
export function positionOf(track: Track, k: number): number {
  return track.start[sectionIndex(track, k)];
}

/**
 * The track position at which section `k` ENDS.
 *
 * Kept for the `sliverReturn: 'bottom'` dial: a section is frozen at its bottom
 * while it is buried, so returning to its bottom is the shortest way back to
 * the line you stopped reading. The default returns to the top instead, which
 * makes the tab click the outward scroll run backwards.
 */
export function bottomOf(track: Track, k: number): number {
  const index = sectionIndex(track, k);
  return track.start[index] + track.pageScroll[index];
}

function sectionIndex(track: Track, k: number): number {
  return clamp(Math.round(k), 0, track.start.length - 1);
}

/** The maximum scroll position, i.e. the bottom of the last section. */
export function maxPosition(track: Track): number {
  return Math.max(0, track.length - track.viewportHeight);
}

/**
 * Where everything is at track position `y`.
 *
 * One number describes the whole arrangement: which section's segment `y` is
 * in, and how far through the turn that follows it. Everything before that
 * section is stacked underneath at rest; the one after it is the only thing
 * that ever moves, and it moves from one page width to the right down to zero.
 * There is no per-section state, which is why scrolling back un-turns the stack
 * for free.
 */
export function layout(track: Track, position: number): TrackLayout {
  const { start, pageScroll } = track;
  const n = start.length;
  const at = positionAt(track, position);
  const k = at.section;

  const turning = at.turn !== null;
  const progress = at.turn ?? 0;
  // The instant a turn starts, the incoming section is the one in front of you;
  // the section you are IN only changes at the half-way point.
  const topIndex = turning ? Math.min(k + 1, n - 1) : k;
  const activeIndex = turning && progress >= HANDOVER ? Math.min(k + 1, n - 1) : k;

  const scrollTop = start.map((_, j) =>
    j < k
      ? pageScroll[j] // buried: frozen at the bottom you left it at
      : j === k
        ? at.offset
        : 0,
  );

  // Everything up to and including the section being covered sits at rest; the
  // incoming one is mid-turn; everything beyond is parked off to the right and
  // not painted at all.
  const translateX = start.map((_, j) => (j <= k ? 0 : j === k + 1 ? (1 - progress) * 100 : 100));
  const visible = start.map((_, j) => j <= k + 1);
  const zIndex = start.map((_, j) => j);

  return { scrollTop, translateX, zIndex, visible, topIndex, activeIndex, turning, progress };
}

/**
 * Read a pixel position as a {@link TrackPosition}. The inverse of
 * {@link resolve}, and the only place the segment a position falls in is
 * decided — `layout` goes through here too, so the two can never disagree.
 */
export function positionAt(track: Track, position: number): TrackPosition {
  const { start, pageScroll, turnDistance } = track;
  const n = start.length;
  const y = clamp(position, 0, maxPosition(track));

  // The section whose segment (vertical, then the turn after it) contains y.
  let k = 0;
  while (k + 1 < n && y >= start[k + 1]) k++;

  const verticalEnd = start[k] + pageScroll[k];
  if (y > verticalEnd + SEGMENT_EPSILON) {
    return {
      section: k,
      offset: pageScroll[k],
      turn: clamp((y - verticalEnd) / turnDistance, 0, 1),
    };
  }
  return { section: k, offset: clamp(y - start[k], 0, pageScroll[k]), turn: null };
}

/**
 * Put a {@link TrackPosition} back into pixels against a (possibly rebuilt)
 * track. A section that got taller keeps you at the same distance down it; one
 * that got shorter than where you were puts you at its bottom.
 */
export function resolve(track: Track, at: TrackPosition): number {
  const index = sectionIndex(track, at.section);
  // A turn only exists where there is a section after this one to turn in.
  const turning = at.turn !== null && index + 1 < track.start.length;
  // A turn always begins at the BOTTOM of the section it follows, so that is
  // the base however tall that section has become — carrying the old offset
  // across would land the position back inside the section's vertical run.
  const offset = turning ? track.pageScroll[index] : clamp(at.offset, 0, track.pageScroll[index]);
  const turn = turning ? clamp(at.turn ?? 0, 0, 1) * track.turnDistance : 0;
  return clamp(track.start[index] + offset + turn, 0, maxPosition(track));
}

/**
 * Tab height once the column has been made to fit.
 *
 * The tabs are the project's table of contents and every one of them has to be
 * reachable without scrolling a second thing, so a notebook with more sections
 * than the viewport can hold at the preferred height gets shorter tabs rather
 * than a scrolling column.
 */
export function fitTabHeight(
  preferred: number,
  count: number,
  viewportHeight: number,
  tabTop: number,
  tabGap: number,
): number {
  const n = Math.max(1, count);
  const available = viewportHeight - tabTop - (n - 1) * tabGap;
  return Math.max(1, Math.min(preferred, available / n));
}
