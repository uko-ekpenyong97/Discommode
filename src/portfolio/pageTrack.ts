/**
 * The page track — the pure geometry behind the project sheet.
 *
 * A project is an ordered list of PAGES. One scroll position `y` walks the
 * whole project: you scroll a page down to its bottom, and the scroll keeps
 * going into a HORIZONTAL segment that slides the row left until the next page
 * is centred. Pages you have finished don't leave — they clamp at a resting
 * slot on the left and stack as slivers, each one clickable to scroll back.
 *
 * So the track is one dimension made of alternating segments:
 *
 *   page 0 vertical │ slide │ page 1 vertical │ slide │ page 2 vertical
 *   ├──────────────>├──────>├───────────────>├──────>├──────────────>
 *   0          scroll_0   +W                            trackLength - VH
 *
 * Kept free of React and of the DOM so the mapping can be unit-tested — it is
 * the one place where "where is everything at scroll y" is decided, and every
 * frame of the sheet is a call to {@link layout}.
 *
 * GEOMETRY (all lengths in px; the caller resolves vw/vh first)
 *   W   pageWidth        the centred page's width
 *   G   leftGutter       (viewportWidth - W) / 2 — the band a sliver stack lives in
 *   S   effective sliver min(preferred, G / (pages - 1)); the stack shrinks to
 *                        fit the gutter rather than the gutter widening
 *   rest_j              page j's resting translate, so its left edge lands at
 *                        viewport x = j * S
 */

export interface TrackMetrics {
  /** Content height of each page, in px. Its length is the page count. */
  heights: number[];
  viewportWidth: number;
  viewportHeight: number;
  /** The centred page's width, px. */
  pageWidth: number;
  /** PREFERRED sliver width, px — the stack may end up narrower (see `sliver`). */
  sliverWidth: number;
}

export interface Track {
  /** How far each page scrolls internally: `max(0, height - viewportHeight)`. */
  pageScroll: number[];
  /** Track position at which each page's vertical segment begins. */
  start: number[];
  /** Total scrollable extent, including the last page's viewport. */
  length: number;
  /** `(viewportWidth - pageWidth) / 2` — where a centred page's left edge sits. */
  gutter: number;
  /** The sliver width actually used, after fitting the stack into the gutter. */
  sliver: number;
  /** Per-page resting translateX once it is stacked. */
  rest: number[];
  pageWidth: number;
  viewportHeight: number;
}

export interface TrackLayout {
  /** What to write to each page's own `scrollTop`. */
  scrollTop: number[];
  /** What to write to each page's `translateX`, in px. */
  translateX: number[];
  /** The page being read (during a slide, the one being slid TO). */
  activeIndex: number;
  /** True while the scroll is driving the horizontal slide between two pages. */
  movingHorizontal: boolean;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
/** `-k * W` is a negative zero at k = 0, which reads badly in a transform and
 *  in a test. Normalise it away at the one place the value escapes. */
const norm = (v: number): number => (v === 0 ? 0 : v);

/**
 * Sub-pixel dead zone at the end of a page's vertical run. Landing EXACTLY on a
 * page's bottom is a routine position — it is where a sliver click goes, and
 * where a smoothed scroll settles — and a float epsilon either side of the
 * boundary must not flip which page is the active one. Half a pixel into a
 * 600-odd pixel slide is invisible.
 */
const SEGMENT_EPSILON = 0.5;

export function buildTrack({
  heights,
  viewportWidth,
  viewportHeight,
  pageWidth,
  sliverWidth,
}: TrackMetrics): Track {
  // A project always has at least one page; an empty list would make every
  // derived array empty and `layout` unanswerable.
  const h = heights.length > 0 ? heights : [viewportHeight];
  const n = h.length;

  const pageScroll = h.map((height) => Math.max(0, height - viewportHeight));

  // Each page's vertical run, then one page-width of horizontal slide.
  const start = [0];
  for (let k = 0; k + 1 < n; k++) start.push(start[k] + pageScroll[k] + pageWidth);

  const gutter = Math.max(0, (viewportWidth - pageWidth) / 2);
  // The stack has to fit the gutter: with more pages than it can hold at the
  // preferred width the slivers narrow, and the gutter never widens to suit.
  const sliver = Math.min(sliverWidth, gutter / Math.max(1, n - 1));

  // Page j at rest has its left edge at viewport x = j * S. Its left edge is
  // otherwise at `gutter + j * W`, so the translate closing that gap is:
  const rest = h.map((_, j) => j * sliver - gutter - j * pageWidth);

  const length = start[n - 1] + pageScroll[n - 1] + viewportHeight;

  return { pageScroll, start, length, gutter, sliver, rest, pageWidth, viewportHeight };
}

/** The track position at which page `k` begins — where a deep link lands. */
export function positionOf(track: Track, k: number): number {
  return track.start[pageIndex(track, k)];
}

/**
 * The track position at which page `k` ENDS — where clicking its sliver lands.
 *
 * A stacked page is frozen at its bottom, which is exactly where you left it, so
 * returning to its bottom makes the click the reverse of the scroll that stacked
 * it: the row slides right and the page you clicked is back under you, at the
 * line you stopped reading. Landing on its top instead would be a different
 * place from the one the sliver is showing you.
 */
export function bottomOf(track: Track, k: number): number {
  const index = pageIndex(track, k);
  return track.start[index] + track.pageScroll[index];
}

function pageIndex(track: Track, k: number): number {
  return clamp(Math.round(k), 0, track.start.length - 1);
}

/** The maximum scroll position, i.e. the bottom of the last page. */
export function maxPosition(track: Track): number {
  return Math.max(0, track.length - track.viewportHeight);
}

/**
 * Where everything is at track position `y`.
 *
 * The row offset is the ONE number the whole horizontal arrangement comes from:
 * `-k * W` while page k is being read, sliding on past it during the segment
 * that follows. Every page follows that offset, and a finished page simply
 * stops at its resting slot — `max(rowOffset, rest_j)` — which is why stacking
 * needs no state of its own and un-stacks for free when you scroll back.
 */
export function layout(track: Track, position: number): TrackLayout {
  const { start, pageScroll, rest, pageWidth: W } = track;
  const n = start.length;
  const y = clamp(position, 0, maxPosition(track));

  // The page whose segment (vertical, then the slide after it) contains y.
  let k = 0;
  while (k + 1 < n && y >= start[k + 1]) k++;

  const verticalEnd = start[k] + pageScroll[k];
  const movingHorizontal = y > verticalEnd + SEGMENT_EPSILON;
  const rowOffset = movingHorizontal ? -(k * W + (y - verticalEnd)) : -k * W;
  // During a slide the page being slid TO is the one you are reading: it is
  // what the preview fade, the z-order and the hash all follow.
  const activeIndex = movingHorizontal ? k + 1 : k;

  const scrollTop = start.map((_, j) =>
    j < activeIndex
      ? pageScroll[j] // finished: frozen at its bottom
      : j === activeIndex
        ? clamp(y - start[j], 0, pageScroll[j])
        : 0,
  );
  const translateX = rest.map((r) => norm(Math.max(rowOffset, r)));

  return { scrollTop, translateX, activeIndex, movingHorizontal };
}
