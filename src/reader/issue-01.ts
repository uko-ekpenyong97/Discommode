/**
 * Page manifest for Issue 01.
 *
 * Pages are stored in reading order; SPREADS are derived (`buildSpreads`), never
 * stored, so adding a cover later is a data change only — flip `hasCover` to
 * true and prepend the file, and every spread re-pairs itself.
 */

export interface Page {
  /** Reading position. The cover is 0 and the back cover is PAGE_COUNT + 1, so
   *  ordering stays meaningful; `label` is what keeps them out of the caption. */
  n: number;
  src: string;
  /** Caption override. Numbered pages leave this unset and fall back to `n`. */
  label?: string;
  /**
   * The same page at half resolution (1000px wide), for the inner leaves of a
   * riffle — every leaf but the first and last (flipEngine `isFast`): a riffle
   * crosses too many pages too fast for each to be decoded at full size at a new
   * scale. Written by `npm run pages`; absent on the cover and back.
   */
  riffle?: string;
}

export interface Issue {
  id: string;
  /** Intrinsic page size in px. Only the RATIO matters — see the note below. */
  pageW: number;
  pageH: number;
  /** First page shown alone on the right. */
  hasCover: boolean;
  /** Last page shown alone on the left. */
  hasBack: boolean;
  /** Reading order. */
  pages: Page[];
  /**
   * Hover-state plate for the grid card — artwork with transparency that floats
   * in front of the cover on hover. Not a page: it never enters `pages`, so the
   * reader never sees it. Absent when the issue has no overlay drawn yet.
   */
  overlay?: string;
  /**
   * The DRAWN cover at REST, as opposed to the photographed one in `pages[0]`.
   * Built by `npm run anims`: the plate (objects hidden) with every animated
   * object's FIRST frame composited back on. This is the face the detail view,
   * the grid→detail morph and the reader's closed book show; the grid card keeps
   * the photo. Absent when an issue has no illustrated cover.
   *
   * It is deliberately the resting state and not `cover-illustrated.png`, which
   * carries whatever frame each object happened to be drawn at. Several loops
   * build up — the shelf of books starts empty — so resting on the drawn state
   * made the hover play backwards.
   */
  coverRest?: string;
  /**
   * The back cover at REST — `coverRest`'s counterpart, for an issue whose back
   * carries hover objects: the back plate with each object's first frame
   * composited on (`npm run anims`). The reader's closed book shows it, so the
   * back's hover layer mounting and unmounting is invisible.
   */
  backRest?: string;
  /**
   * URL of the cover-animation manifest written by `npm run anims`. It is
   * FETCHED rather than bundled: it is generated output living in `public/`
   * beside the WebPs it indexes, and only the two views that mount the hover
   * layer ever need it. It carries the plate URL too. Absent when no animations
   * are built.
   */
  anims?: string;
}

/** One spread: [left, right]. A null slot renders empty (cover / back page). */
export type Spread = [Page | null, Page | null];

/** Numbered pages. The cover and back cover are separate entries below. */
const PAGE_COUNT = 40;

// Every page is 2000x2600. Only the RATIO is load-bearing: the page slot is
// exactly `bw/2` by `0.65 * bw`, i.e. 2000/2600, so `object-fit: contain` on the
// static page and `background-size: calc(var(--bw) * 0.5) auto` on a curl face
// resolve to the same box — the flip has no size jump at either end.
// `scripts/optimize-pages.mjs` (npm run pages) writes the .webp files the app
// loads from ~/Discommode-pages/01/ and warns if an export is the wrong size.
export const issue01: Issue = {
  id: '01',
  pageW: 2000,
  pageH: 2600,
  hasCover: true,
  hasBack: true,
  pages: [
    { n: 0, src: '/issues/01/cover.webp', label: 'COVER' },
    ...Array.from({ length: PAGE_COUNT }, (_, i) => ({
      n: i + 1,
      src: `/issues/01/${String(i + 1).padStart(2, '0')}.webp`,
      riffle: `/issues/01/riffle/${String(i + 1).padStart(2, '0')}.webp`,
    })),
    { n: PAGE_COUNT + 1, src: '/issues/01/back.webp', label: 'BACK' },
  ],
  overlay: '/issues/01/overlay.webp',
  coverRest: '/issues/01/cover-rest.webp',
  backRest: '/issues/01/back-rest.webp',
  anims: '/issues/01/anim/manifest.json',
};

/** How a page reads in the caption: 'COVER', 'BACK', or a zero-padded number. */
export function pageLabel(page: Page): string {
  return page.label ?? String(page.n).padStart(2, '0');
}

/**
 * The cover image for an issue, or undefined if the id is unknown or the issue
 * has no cover. The cover is just the first page in reading order (see
 * `buildSpreads`), so this is the single source of truth the grid, detail view,
 * and reader all read from — no separate cover field to drift.
 */
export function issueCover(id: string): string | undefined {
  const issue = ISSUES[id];
  return issue?.hasCover ? issue.pages[0]?.src : undefined;
}

/**
 * The hover-state overlay plate for an issue, or undefined if the id is unknown
 * or no overlay has been drawn. Counterpart to `issueCover` — same single source
 * of truth, so only the grid needs to know the plate exists.
 */
export function issueOverlay(id: string): string | undefined {
  return ISSUES[id]?.overlay;
}

/**
 * The drawn cover at REST for an issue, falling back to the photographed one.
 * The detail view, the grid→detail morph, and the reader's closed book all read
 * this — the grid card is the one surface that deliberately keeps the photo.
 */
export function issueCoverRest(id: string): string | undefined {
  const issue = ISSUES[id];
  if (!issue) return undefined;
  return issue.coverRest ?? issueCover(id);
}

/** The cover-animation manifest URL for an issue, if any have been built. */
export function issueAnims(id: string): string | undefined {
  return ISSUES[id]?.anims;
}

export const ISSUES: Record<string, Issue> = {
  '01': issue01,
};

/**
 * Pair the reading order into spreads. A cover takes the right slot of its own
 * spread (left empty); a back page takes the left slot of the last one.
 *
 * The cover page is substituted for `coverRest` here rather than at every call
 * site. Doing it once, at the point the reader's page data is derived, means the
 * static slot AND the flip engine's curl faces (which read their background
 * images straight off these same page objects) both show the drawn cover, with
 * no change to either — and because `coverRest` is exactly what the hover layer
 * paints at rest, the strips the engine builds mid-turn match the layer that was
 * just unmounted. `issue.pages[0]` keeps the photograph, so the grid card is
 * unaffected.
 */
export function buildSpreads(issue: Issue): Spread[] {
  const spreads: Spread[] = [];
  let rest = issue.pages;

  if (issue.hasCover && rest.length) {
    const cover = issue.coverRest ? { ...rest[0], src: issue.coverRest } : rest[0];
    spreads.push([null, cover]);
    rest = rest.slice(1);
  }

  let back: Page | null = null;
  if (issue.hasBack && rest.length) {
    back = rest[rest.length - 1];
    // Same substitution as the cover, same reason.
    if (issue.backRest) back = { ...back, src: issue.backRest };
    rest = rest.slice(0, -1);
  }

  for (let i = 0; i < rest.length; i += 2) {
    spreads.push([rest[i], rest[i + 1] ?? null]);
  }

  if (back) spreads.push([back, null]);
  return spreads;
}

/**
 * What the reader's spread pill shows for one spread: the PRINTED page numbers
 * of the pages that are open, as the magazine paginates itself — not the
 * spread's index.
 *
 * The folios come from the page list, by position: the front cover is not a
 * page of the magazine and neither is the back, so the first page AFTER the
 * cover is 01, and every inside page counts whether or not a number is printed
 * on it (Issue 01's 01 and 02 carry none; 07 does, at its inner edge). A spread
 * shows both of its inside pages, "07 | 08", or the one if only one is open,
 * "03"; a closed book shows "Cover" or "Back".
 */
export type SpreadFolio = { kind: 'cover' } | { kind: 'back' } | { kind: 'pages'; folios: string[] };

export function spreadFolios(issue: Issue): SpreadFolio[] {
  const first = issue.hasCover ? 1 : 0;
  const end = issue.hasBack ? issue.pages.length - 1 : issue.pages.length;
  // By identity: `buildSpreads` passes the inside pages through untouched (it
  // only substitutes copies for the cover and the back).
  const folio = new Map<Page, number>();
  issue.pages.slice(first, Math.max(first, end)).forEach((p, i) => folio.set(p, i + 1));
  const spreads = buildSpreads(issue);
  return spreads.map(([l, r], i) => {
    const inside = [l, r].filter((p): p is Page => p !== null && folio.has(p));
    if (inside.length) return { kind: 'pages', folios: inside.map((p) => String(folio.get(p)).padStart(2, '0')) };
    return issue.hasCover && i === 0 ? { kind: 'cover' } : { kind: 'back' };
  });
}

/** A spread's folios as the pill reads them: "07 | 08", "03", "Cover", "Back". */
export function folioText(f: SpreadFolio): string {
  return f.kind === 'cover' ? 'Cover' : f.kind === 'back' ? 'Back' : f.folios.join(' | ');
}
