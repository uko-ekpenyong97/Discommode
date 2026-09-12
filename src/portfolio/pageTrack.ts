/**
 * The page track — the pure geometry behind the project's folder stack.
 *
 * A project is a PILE OF FOLDERS. Each section is a folder: a tab on its top
 * edge, a 45° chamfer down to the body, the body holding the content. Folders
 * alternate sides — even index on the left, odd on the right — and the two with
 * the same `row` sit at the same height, so the pile reads as two columns.
 *
 * Three regions, top to bottom:
 *
 *   ┌ read pile ─────────────┐  rows you have been through, docked as tabs
 *   │ ▤ Overview  ▤ Research │  row 0
 *   │ ▤ Motion    ▤ Build    │  row 1
 *   ├ the open folder ───────┤
 *   │                        │  the one you are reading
 *   │                        │
 *   ├ unread pile ───────────┤  rows still to come, stacked at the bottom
 *   │ ▤ Outcome   ▤ Appendix │
 *   └────────────────────────┘
 *
 * ONE POSITION drives all of it. You scroll the open folder; at its end the
 * scroll carries into a TURN, and what the turn does depends on which side you
 * are on:
 *
 *   even → odd   the partner's tab is already docked beside you, so its body
 *                UNFOLDS down from it over yours.
 *   odd → even   the next row RISES out of the unread pile and docks, its left
 *                folder opening as it arrives and its right partner docking
 *                closed beside it.
 *
 * So the track is the same alternating shape it has always been —
 *
 *   folder 0 vertical │ turn │ folder 1 vertical │ turn │ folder 2 vertical
 *   ├─────────────────>├─────>├─────────────────>├─────>├────────────────>
 *   0           scroll_0   +turnDistance                 trackLength - VH
 *
 * — and everything on screen is a function of where you are in it. There is no
 * per-folder state, which is why scrolling back un-stacks the pile for free.
 *
 * Kept free of React and of the DOM so the mapping can be unit-tested: it is
 * the one place where "where is everything at position y" is decided, and every
 * frame of the sheet is a call to {@link layout}.
 */

export type RiseEase = 'linear' | 'easeOut';

export interface TrackMetrics {
  /** Content height of each folder, in px. Its length is the folder count. */
  heights: number[];
  /** The sheet's height — the space the three regions share. */
  viewportHeight: number;
  /** Vertical step between docked rows. */
  rowPitch: number;
  /** Height of a folder's tab. */
  tabHeight: number;
  /** Scroll spent on one turn, whichever kind it is. */
  turnDistance: number;
  /** Curve for a rising row's POSITION. The scroll stays 1:1 either way — this
   *  only bends where the row is at a given point through the turn. */
  easeRise?: RiseEase;
}

export interface Track {
  /** How far each folder scrolls internally: `max(0, height - openBodyHeight)`. */
  pageScroll: number[];
  /** Track position at which each folder's vertical segment begins. */
  start: number[];
  /** Total scrollable extent, including the last folder's viewport. */
  length: number;
  turnDistance: number;
  viewportHeight: number;
  rowPitch: number;
  tabHeight: number;
  /** Number of rows: two folders to a row, the last possibly half empty. */
  rows: number;
  /**
   * The body height a folder has while it is the open one.
   *
   * The SAME for every folder, and not by luck: moving to the next row adds one
   * `rowPitch` to the read pile and takes exactly one away from the unread one,
   * so the space between them never changes. Which is what lets `pageScroll`
   * be a property of the folder rather than of where you are.
   */
  openBodyHeight: number;
  easeRise: RiseEase;
}

/**
 * WHERE YOU ARE, in the project's own terms rather than in pixels.
 *
 * The pixel position is meaningless across a rebuild: a folder growing by 400px
 * moves every start behind it, so the same `y` is a different place. This is
 * what survives — the folder, how far down it, and how far through the turn
 * that follows it. Re-derive `y` from this after a rebuild ({@link resolve})
 * and the reader has not moved.
 */
export interface TrackPosition {
  /** The folder whose SEGMENT the position falls in; `-1` during the entrance,
   *  which is row 0 rising out of the pile before there is anything to read. */
  section: number;
  /** How far down that folder, in px. */
  offset: number;
  /** 0…1 through the turn after it; null while the position is vertical. */
  turn: number | null;
}

export interface FolderLayout {
  /** Top of the folder's slot, in px from the sheet's top. */
  top: number;
  /** How much of it paints, measured down from `top`. `tabHeight` means the tab
   *  and nothing else. */
  clipHeight: number;
  /** What to write to its body's `scrollTop`. */
  scrollTop: number;
  zIndex: number;
  /**
   * True when the folder is showing CONTENT rather than just its tab and the
   * sliver of body edge that makes the pile read as a stack. A docked row is
   * exactly one `rowPitch` tall, so the few pixels below its tab are the edge
   * of its own body — the look of a folder behind a folder — and not a body
   * anyone can read. Anything taller than that is.
   */
  bodyVisible: boolean;
}

export interface TrackLayout {
  folders: FolderLayout[];
  /** The folder you are IN. Flips at the turn's halfway point — the point where
   *  the new one is more of what you see than the old. Drives the hash and
   *  which tab reads as current: the things that should commit once, not twice. */
  activeIndex: number;
  /** The folder drawn on top. Flips the instant a turn starts, because from
   *  that instant it is the thing arriving in front of you. */
  topIndex: number;
  /** True while the scroll is driving a turn rather than a folder's own scroll. */
  turning: boolean;
  /** 0…1 through the turn; 0 when not turning. */
  progress: number;
  /** True when the turn is a whole row rising from the pile, false when it is a
   *  docked partner unfolding in place. */
  rising: boolean;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * Sub-pixel dead zone at the end of a folder's vertical run. Landing EXACTLY on
 * a folder's bottom is a routine position — it is where a tab click goes, and
 * where a smoothed scroll settles — and a float epsilon either side of the
 * boundary must not flip which folder is the active one. Half a pixel into a
 * 700-odd pixel turn is invisible.
 */
const SEGMENT_EPSILON = 0.5;

/** The point in a turn at which the new folder becomes the one you are in. */
const HANDOVER = 0.5;

/** Which row a folder sits in — two to a row, even on the left. */
export function rowOf(k: number): number {
  return Math.floor(k / 2);
}

/** How many rows a project of `n` folders makes. */
export function rowCount(n: number): number {
  return Math.max(1, Math.ceil(n / 2));
}

export function buildTrack({
  heights,
  viewportHeight,
  rowPitch,
  tabHeight,
  turnDistance,
  easeRise = 'linear',
}: TrackMetrics): Track {
  // A project always has at least one folder; an empty list would make every
  // derived array empty and `layout` unanswerable.
  const h = heights.length > 0 ? heights : [viewportHeight];
  const n = h.length;
  const rows = rowCount(n);

  // The read pile at its deepest, plus one tab, is what the open body has to
  // clear — and since the piles trade row for row, that is the whole story.
  const openBodyHeight = Math.max(0, viewportHeight - (rows - 1) * rowPitch - tabHeight);

  const pageScroll = h.map((height) => Math.max(0, height - openBodyHeight));

  const start = [0];
  for (let k = 0; k + 1 < n; k++) start.push(start[k] + pageScroll[k] + turnDistance);

  const length = start[n - 1] + pageScroll[n - 1] + viewportHeight;

  return {
    pageScroll,
    start,
    length,
    turnDistance,
    viewportHeight,
    rowPitch,
    tabHeight,
    rows,
    openBodyHeight,
    easeRise,
  };
}

/** The track position at which folder `k` begins — where a deep link and a tab
 *  click both land. */
export function positionOf(track: Track, k: number): number {
  return track.start[folderIndex(track, k)];
}

/**
 * The track position at which folder `k` ENDS.
 *
 * Kept for the `sliverReturn: 'bottom'` dial: a folder is frozen at its bottom
 * while it is buried, so returning to its bottom is the shortest way back to
 * the line you stopped reading. The default returns to the top instead, which
 * makes a tab click the outward scroll run backwards.
 */
export function bottomOf(track: Track, k: number): number {
  const index = folderIndex(track, k);
  return track.start[index] + track.pageScroll[index];
}

function folderIndex(track: Track, k: number): number {
  return clamp(Math.round(k), 0, track.start.length - 1);
}

/** The maximum scroll position: the bottom of the last folder. */
export function maxPosition(track: Track): number {
  return Math.max(0, track.length - track.viewportHeight);
}

/** The minimum: one turn BEFORE the start, which is the entrance — row 0 still
 *  in the pile, on its way up. The scroller cannot go there; the intro tween
 *  drives it and hands over at 0. */
export function minPosition(track: Track): number {
  return -track.turnDistance;
}

const easeOutCubic = (x: number): number => 1 - Math.pow(1 - x, 3);

/**
 * Where everything is at track position `y`.
 *
 * Two rules do all the work:
 *
 *  1. A row's y is its docked slot if you have passed it, its slot in the
 *     unread pile if you have not, and somewhere between the two while it is
 *     rising.
 *  2. A folder paints from its own top down to the NEXT ROW'S top, whatever
 *     state that row is in.
 *
 * Rule 2 is what makes the regions tile with no arithmetic: a docked row is one
 * `rowPitch` tall because the row below it is one pitch down; the open folder
 * runs all the way to the unread pile because that is where the next row is;
 * and while a row rises, the body it is uncovering grows to follow it exactly.
 * No glass ever overlaps glass, which on a translucent page is not an
 * optimisation but the difference between a stack and a smear.
 */
export function layout(track: Track, position: number): TrackLayout {
  const { start, pageScroll, rowPitch, tabHeight: T, viewportHeight: VH, rows: R } = track;
  const n = start.length;
  const at = positionAt(track, position);
  const a = at.section;
  const p = at.turn ?? 0;
  const turning = at.turn !== null;
  const ra = a < 0 ? -1 : rowOf(a);
  // Even → odd is an unfold inside the row you are already in. Odd → even (and
  // the entrance, which is "→ folder 0") brings a whole new row up.
  const rising = turning && (a < 0 || a % 2 === 1);
  const riseRow = ra + 1;
  const ease = track.easeRise === 'easeOut' ? easeOutCubic : (x: number): number => x;

  const dockY = (r: number): number => r * rowPitch;
  // The unread pile is anchored to the BOTTOM, last row lowest — so a row's
  // place in it does not depend on how many are left, and the rows that stay
  // put when one rises genuinely do not move.
  const pileY = (r: number): number => VH - (R - r) * rowPitch;
  const rowY = (r: number): number => {
    if (r <= ra) return dockY(r);
    if (rising && r === riseRow) return pileY(r) + (dockY(r) - pileY(r)) * ease(p);
    return pileY(r);
  };
  const rowBottom = (r: number): number => (r + 1 < R ? rowY(r + 1) : VH);

  /** Which folder of a row owns the strip below the tabs: the last one in it
   *  you have opened, or — in a row you have not reached — the left one, which
   *  is the one that will open when the row arrives. */
  const ownerOf = (r: number): number => {
    const right = 2 * r + 1;
    return right < n && right <= a ? right : 2 * r;
  };

  const folders: FolderLayout[] = [];
  for (let k = 0; k < n; k++) {
    const r = rowOf(k);
    const top = rowY(r);
    let clipHeight = ownerOf(r) === k ? rowBottom(r) - top : T;
    // The unfold: the partner's body comes down from its already-docked tab,
    // 1:1 with the scroll, over the body of the folder it is covering — which
    // keeps its own full height underneath and is simply hidden as it goes.
    if (turning && !rising && k === a + 1) clipHeight = T + p * (rowBottom(r) - top - T);

    folders.push({
      top,
      clipHeight: Math.max(0, clipHeight),
      scrollTop: k < a ? pageScroll[k] : k === a ? at.offset : 0,
      zIndex: k + 1,
      bodyVisible: clipHeight > rowPitch + SEGMENT_EPSILON,
    });
  }

  const next = Math.min(Math.max(a, 0) + (a < 0 ? 0 : 1), n - 1);
  return {
    folders,
    activeIndex: turning && p >= HANDOVER ? next : Math.max(a, 0),
    topIndex: turning ? next : Math.max(a, 0),
    turning,
    progress: p,
    rising,
  };
}

/**
 * Read a pixel position as a {@link TrackPosition}. The inverse of
 * {@link resolve}, and the only place the segment a position falls in is
 * decided — `layout` goes through here too, so the two can never disagree.
 */
export function positionAt(track: Track, position: number): TrackPosition {
  const { start, pageScroll, turnDistance } = track;
  const n = start.length;
  const y = clamp(position, minPosition(track), maxPosition(track));

  // Before the beginning: the entrance, which is row 0 rising into an empty
  // screen. Expressed as a turn "into folder 0" so it needs no separate state.
  if (y < 0) return { section: -1, offset: 0, turn: clamp(1 + y / turnDistance, 0, 1) };

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
 * track. A folder that got taller keeps you at the same distance down it; one
 * that got shorter than where you were puts you at its bottom.
 */
export function resolve(track: Track, at: TrackPosition): number {
  if (at.section < 0) return -(1 - clamp(at.turn ?? 1, 0, 1)) * track.turnDistance;
  const index = folderIndex(track, at.section);
  // A turn only exists where there is a folder after this one to turn to.
  const turning = at.turn !== null && index + 1 < track.start.length;
  // A turn always begins at the BOTTOM of the folder it follows, so that is the
  // base however tall that folder has become — carrying the old offset across
  // would land the position back inside its vertical run.
  const offset = turning ? track.pageScroll[index] : clamp(at.offset, 0, track.pageScroll[index]);
  const turn = turning ? clamp(at.turn ?? 0, 0, 1) * track.turnDistance : 0;
  return clamp(track.start[index] + offset + turn, 0, maxPosition(track));
}

/**
 * The folder's outline: a tab on one half of the top edge, a 45° chamfer down
 * to the body, and the full width below it.
 *
 * The two folders of a row have to TILE the tab band rather than overlap in it,
 * or the pair is two sheets of glass on top of each other and the corner where
 * they meet goes dark and double-blurred. Left to themselves the chamfers do
 * cross — at the default 48% / 52% split the gap between the tabs is 4% of the
 * sheet, and a 45° chamfer eats that in the first 2% of its descent — so the
 * right-hand folder's outline is notched to follow its partner's chamfer from
 * the crossing point down. Above the crossing the two are separated by the gap;
 * below it they abut exactly, with nothing between and nothing doubled.
 */
export function folderClipPath({
  side,
  sheetWidth: W,
  tabWidth,
  tabHeight: T,
  height: H,
}: {
  side: 'left' | 'right';
  sheetWidth: number;
  tabWidth: number;
  tabHeight: number;
  height: number;
}): string {
  const r = (v: number): string => `${Math.round(v * 100) / 100}px`;
  if (side === 'left') {
    return `polygon(0 0, ${r(tabWidth)} 0, ${r(tabWidth + T)} ${r(T)}, ${r(W)} ${r(T)}, ${r(W)} ${r(H)}, 0 ${r(H)})`;
  }
  const rightStart = W - tabWidth;
  const tail = `${r(W)} 0, ${r(W)} ${r(H)}, 0 ${r(H)}, 0 ${r(T)}`;
  if (rightStart - tabWidth >= 2 * T) {
    // A gap wide enough that the chamfers never meet: the plain mirror image.
    return `polygon(${r(rightStart)} 0, ${tail}, ${r(rightStart - T)} ${r(T)})`;
  }
  const yc = (rightStart - tabWidth) / 2;
  const xc = (rightStart + tabWidth) / 2;
  return `polygon(${r(rightStart)} 0, ${tail}, ${r(tabWidth + T)} ${r(T)}, ${r(xc)} ${r(yc)})`;
}
