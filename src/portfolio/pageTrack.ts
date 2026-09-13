/**
 * The page track — the pure geometry behind the project's folder cabinet.
 *
 * A project is a set of FOLDERS, and the screen is a filing cabinet. Each
 * folder is a tab on top of a body; folders alternate columns, left and right,
 * two to a row, and rows overlap so a row in front covers the bottom of the one
 * behind. There are three regions:
 *
 *   ┌ the cabinet ──────────────┐  folders you have read, docked from the top
 *   │ ▭ Overview   ▭ Research   │  row 0
 *   │ ▭ Motion     ▭ Build      │  row 1
 *   ├ the open folder ──────────┤
 *   │                           │  full sheet width, starting one row down
 *   │                           │
 *   ├ the pile ─────────────────┤  still to come, stacked at the bottom
 *   │ ▭ Outcome    ▭ Appendix   │
 *   └───────────────────────────┘
 *
 * ONE POSITION drives all of it. You scroll the open folder; at its end the
 * scroll carries into a TURN, and a turn is always the same thing: the NEXT
 * FOLDER, alone, rises out of the pile to its slot in the cabinet, and over the
 * last stretch of the rise its content unfolds out from under it to become the
 * new open body. One folder per turn, so a row fills in two turns — left, then
 * right — and a half-filled row is a perfectly ordinary state.
 *
 *   folder 0 vertical │ turn │ folder 1 vertical │ turn │ folder 2 vertical
 *   ├─────────────────>├─────>├─────────────────>├─────>├────────────────>
 *   0           scroll_0   +turnDistance                 trackLength - VH
 *
 * Everything on screen is a function of where you are in that. There is no
 * per-folder state, which is why scrolling back drops the folders into the pile
 * one at a time, in reverse, for free.
 *
 * Kept free of React and of the DOM so the mapping can be unit-tested: it is
 * the one place where "where is everything at position y" is decided, and every
 * frame of the sheet is a call to {@link layout}.
 */

export type RiseEase = 'linear' | 'easeOut';

export interface TrackMetrics {
  /** Content height of each folder's open body, in px. Its length is the count. */
  heights: number[];
  /** The sheet's height — the space the three regions share. */
  viewportHeight: number;
  /** Vertical step between rows, in both the cabinet and the pile. Less than
   *  `stripHeight`, which is what makes the rows overlap. */
  rowPitch: number;
  /** A folder's own height: its tab plus its body, less the 1px the tab sits
   *  into the body by. */
  stripHeight: number;
  /** The tab's height on its own. The cabinet is offset by it, so the first
   *  row's tab is on the sheet rather than above it. */
  tabHeight: number;
  /** Scroll spent on one turn. */
  turnDistance: number;
  /** The fraction of a turn, at its end, over which the risen folder's content
   *  unfolds. The rest of the turn is the rise. */
  unfoldShare: number;
  /** Curve for a rising folder's POSITION. The scroll stays 1:1 either way —
   *  this only bends where the folder is at a given point through the turn. */
  easeRise?: RiseEase;
}

export interface Track {
  /** How far each folder scrolls internally: `max(0, height - openBody)`. */
  pageScroll: number[];
  /** Track position at which each folder's vertical segment begins. */
  start: number[];
  /** Total scrollable extent, including the last folder's viewport. */
  length: number;
  /**
   * The content height each folder has WHEN IT IS THE OPEN ONE.
   *
   * Per folder, not one number: the open body runs from one row below the
   * folder's own row down to the top of the pile, and a left folder leaves its
   * partner in the pile while a right folder does not — so the two alternate,
   * a row pitch apart. This is what `pageScroll` is measured against, so it has
   * to be derived before the track is.
   */
  openBody: number[];
  turnDistance: number;
  viewportHeight: number;
  rowPitch: number;
  stripHeight: number;
  tabHeight: number;
  /** Number of rows: two folders to a row, the last possibly half empty. */
  rows: number;
  unfoldShare: number;
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
   *  which is folder 0 rising out of the pile before there is anything to read. */
  section: number;
  /** How far down that folder, in px. */
  offset: number;
  /** 0…1 through the turn after it; null while the position is vertical. */
  turn: number | null;
}

export interface FolderLayout {
  /** Top of the folder's slot, in px from the sheet's top — the top of its tab. */
  top: number;
  /** How much of it paints, measured down from `top`. One `rowPitch` is the
   *  folder alone, with the row in front covering the rest of its body. */
  clipHeight: number;
  /** What to write to its content body's `scrollTop`. */
  scrollTop: number;
  zIndex: number;
  /** True when the folder is showing its open body and not just its own strip. */
  bodyVisible: boolean;
}

export interface TrackLayout {
  folders: FolderLayout[];
  /** The folder you are IN. Flips at the turn's halfway point — the point where
   *  the new one is more of what you see than the old. Drives the hash and
   *  which folder reads as current: the things that should commit once. */
  activeIndex: number;
  /** The folder drawn on top: the one rising, the moment a turn starts. */
  topIndex: number;
  /** True while the scroll is driving a turn rather than a folder's own scroll. */
  turning: boolean;
  /** 0…1 through the turn; 0 when not turning. */
  progress: number;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * Sub-pixel dead zone at the end of a folder's vertical run. Landing EXACTLY on
 * a folder's bottom is a routine position — it is where a tab click goes, and
 * where a smoothed scroll settles — and a float epsilon either side of the
 * boundary must not flip which folder is the active one.
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

/**
 * Where row `r` docks in the cabinet, measured to the top of its TAB.
 *
 * Offset by one tab height, because the tab is the part of a folder that sticks
 * up above its body: dock the first row at zero and its tab is off the top of
 * the sheet, which is the one part of a folder you most need to see.
 */
export function cabinetTop(tabHeight: number, rowPitch: number, r: number): number {
  return tabHeight + r * rowPitch;
}

/**
 * Where row `r` sits in the pile: counted from the BOTTOM, last row lowest, so
 * a row's place does not depend on how many are left and the rows that stay put
 * when one rises genuinely do not move.
 */
export function pileTop(viewportHeight: number, rowPitch: number, rows: number, r: number): number {
  return viewportHeight - (rows - r) * rowPitch;
}

export function buildTrack({
  heights,
  viewportHeight,
  rowPitch,
  stripHeight,
  tabHeight,
  turnDistance,
  unfoldShare,
  easeRise = 'linear',
}: TrackMetrics): Track {
  // A project always has at least one folder; an empty list would make every
  // derived array empty and `layout` unanswerable.
  const h = heights.length > 0 ? heights : [viewportHeight];
  const n = h.length;
  const rows = rowCount(n);

  // The open body runs from one row below the folder's own row down to the top
  // of the pile — and what is at the top of the pile is whatever is NOT read
  // yet, which for a left folder includes its own partner.
  const openBody = h.map((_, k) => {
    const next = k + 1;
    const top = next < n ? pileTop(viewportHeight, rowPitch, rows, rowOf(next)) : viewportHeight;
    return Math.max(0, top - (cabinetTop(tabHeight, rowPitch, rowOf(k)) + rowPitch));
  });

  const pageScroll = h.map((height, k) => Math.max(0, height - openBody[k]));

  const start = [0];
  for (let k = 0; k + 1 < n; k++) start.push(start[k] + pageScroll[k] + turnDistance);

  const length = start[n - 1] + pageScroll[n - 1] + viewportHeight;

  return {
    pageScroll,
    start,
    length,
    openBody,
    turnDistance,
    viewportHeight,
    rowPitch,
    stripHeight,
    tabHeight,
    rows,
    unfoldShare,
    easeRise,
  };
}

/** The track position at which folder `k` begins — where a deep link and a tab
 *  click both land. */
export function positionOf(track: Track, k: number): number {
  return track.start[folderIndex(track, k)];
}

/** The track position at which folder `k` ENDS — kept for the `sliverReturn`
 *  dial, which lands a click on the line you left rather than on the title. */
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

/** The minimum: one turn BEFORE the start, which is the entrance — folder 0
 *  still in the pile, on its way up. The scroller cannot go there; the intro
 *  tween drives it and hands over at 0. */
export function minPosition(track: Track): number {
  return -track.turnDistance;
}

const easeOutCubic = (x: number): number => 1 - Math.pow(1 - x, 3);

/**
 * Where everything is at track position `y`.
 *
 * Three states and one moving part. Folders you have read are docked in the
 * cabinet; folders you have not are in the pile; and during a turn exactly ONE
 * folder is between the two, travelling from its pile slot to its cabinet slot
 * and unfolding its content over the last stretch of the journey.
 *
 * A folder paints one row pitch of itself, which is less than it is tall — the
 * row in front covers the rest, and that overlap is what makes a stack of paper
 * look like a stack of paper. The exception is the folder you are reading,
 * which paints its strip AND the open body below it, out to the top of the
 * pile.
 */
export function layout(track: Track, position: number): TrackLayout {
  const { start, pageScroll, rowPitch, tabHeight: T, openBody, viewportHeight: VH, rows: R } = track;
  const n = start.length;
  const at = positionAt(track, position);
  const a = at.section;
  const p = at.turn ?? 0;
  const turning = at.turn !== null;
  const riser = Math.min(a + 1, n - 1);
  const ease = track.easeRise === 'easeOut' ? easeOutCubic : (x: number): number => x;
  // The rise takes all of the turn but the last stretch; the content unfolds
  // over that stretch, from under the strip that has just landed.
  const unfold = clamp((p - (1 - track.unfoldShare)) / track.unfoldShare, 0, 1);

  const folders: FolderLayout[] = [];
  for (let k = 0; k < n; k++) {
    const r = rowOf(k);
    let top: number;
    let clipHeight: number;

    if (k <= a) {
      // Docked. The one you are reading keeps its open body; the rest are a row
      // pitch of themselves, the remainder covered by the row in front.
      top = cabinetTop(T, rowPitch, r);
      clipHeight = rowPitch + (k === a ? openBody[k] : 0);
    } else if (turning && k === riser) {
      const from = pileTop(VH, rowPitch, R, r);
      top = from + (cabinetTop(T, rowPitch, r) - from) * ease(p);
      clipHeight = rowPitch + openBody[k] * unfold;
    } else {
      top = pileTop(VH, rowPitch, R, r);
      clipHeight = rowPitch;
    }

    folders.push({
      top,
      clipHeight: Math.max(0, clipHeight),
      scrollTop: k < a ? pageScroll[k] : k === a ? at.offset : 0,
      zIndex: k + 1,
      bodyVisible: clipHeight > rowPitch + SEGMENT_EPSILON,
    });
  }

  return {
    folders,
    activeIndex: turning && p >= HANDOVER ? riser : Math.max(a, 0),
    topIndex: turning ? riser : Math.max(a, 0),
    turning,
    progress: p,
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

  // Before the beginning: the entrance, which is folder 0 rising into an empty
  // cabinet. Expressed as a turn "into folder 0" so it needs no separate state.
  if (y < 0) return { section: -1, offset: 0, turn: clamp(1 + y / turnDistance, 0, 1) };

  // The same half-pixel guard at the END of a turn as at the end of a vertical
  // run, and for the same reason: a scroller quantises to device pixels, so a
  // programmatic scroll to a boundary — a deep link, a tab click — lands a
  // fraction short of it and the turn reads as 99.98% done rather than done.
  let k = 0;
  while (k + 1 < n && y >= start[k + 1] - SEGMENT_EPSILON) k++;

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
  // A turn only exists where there is a folder after this one to bring up.
  const turning = at.turn !== null && index + 1 < track.start.length;
  // A turn always begins at the BOTTOM of the folder it follows, so that is the
  // base however tall that folder has become — carrying the old offset across
  // would land the position back inside its vertical run.
  const offset = turning ? track.pageScroll[index] : clamp(at.offset, 0, track.pageScroll[index]);
  const turn = turning ? clamp(at.turn ?? 0, 0, 1) * track.turnDistance : 0;
  return clamp(track.start[index] + offset + turn, 0, maxPosition(track));
}

/* ── the folder's outline ────────────────────────────────────────────────── */

export interface FolderShape {
  /** Left and right edges of the folder's COLUMN, in px from the sheet's left. */
  left: number;
  right: number;
  /** Sheet width, for the open body, which is not in a column at all. */
  sheetWidth: number;
  /** PREFERRED tab width. Clamped to what the column can hold — see
   *  {@link folderClipPath}. */
  tabWidth: number;
  tabHeight: number;
  chamfer: number;
  /** Tab plus body, less the 1px overlap between them. */
  stripHeight: number;
  /** Where the open body starts, measured from the folder's own top. */
  bodyTop: number;
  /** How far down the shape runs when the body is fully out. */
  height: number;
  radius?: number;
}

/**
 * The folder's outline, as one `clip-path`.
 *
 * ONE path, not two elements, for the reason e4047d4 established: two adjacent
 * `backdrop-filter` elements do not join, because each blurs its own backdrop
 * with its own edge clamping and the junction seams however exactly the tints
 * match. So the tab, the body and — when the folder is open — the full-width
 * page below it are all cut from a single sheet of glass.
 *
 * The tab is a plain strip at the column's left edge with a 45° chamfer at its
 * far end, and it sits one pixel INTO the body, so there is no seam between
 * them to hide. Two corners are rounded: the tab's outer one and the body's.
 */
export function folderClipPath(shape: FolderShape, open: boolean): string {
  const { left: L, right: R, sheetWidth: W, tabHeight: T, chamfer: C } = shape;
  const r = shape.radius ?? 6;
  // The tab has to END inside its own column, with the chamfer's run and a
  // notch of clear body after it. Otherwise the chamfer walks out past the
  // column's edge and the outline doubles back on itself — which is exactly
  // what a narrow column does to a preferred width: at 2560 the 38% column and
  // the tab are the same 730px, and the shape crossed itself.
  const tw = Math.max(r * 2, Math.min(shape.tabWidth, R - L - C - Math.max(C, r * 2)));
  // SVG path data, which is UNITLESS — `path()` takes a `<string>` of path
  // commands, not CSS lengths, and a stray `px` makes the whole declaration
  // invalid and the clip silently disappear.
  const px = (v: number): string => String(Math.round(v * 100) / 100);
  // The tab's bottom edge is also the body's top edge, one pixel up.
  const lip = Math.max(0, T - 1);
  const bottom = open ? shape.height : shape.stripHeight;

  // Tab: rounded outer corner, along the top, then the chamfer down to the body.
  const head =
    `M ${px(L + r)} 0 ` +
    `H ${px(L + tw)} ` +
    `L ${px(L + tw + C)} ${px(lip)} ` +
    `H ${px(R - r)} ` +
    `A ${px(r)} ${px(r)} 0 0 1 ${px(R)} ${px(lip + r)} `;

  const tail = `H ${px(L)} V ${px(r)} A ${px(r)} ${px(r)} 0 0 1 ${px(L + r)} 0 Z`;

  if (!open) {
    return `path('${head}V ${px(bottom)} ${tail}')`;
  }
  // Open: the column's strip down to where the page begins, then the page — the
  // full width of the sheet — and back up the other side.
  return `path('${head}V ${px(shape.bodyTop)} H ${px(W)} V ${px(bottom)} H 0 V ${px(shape.bodyTop)} ${tail}')`;
}
