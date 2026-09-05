/**
 * Page manifest for Issue 01.
 *
 * Pages are stored in reading order; SPREADS are derived (`buildSpreads`), never
 * stored, so adding a cover later is a data change only — flip `hasCover` to
 * true and prepend the file, and every spread re-pairs itself.
 */

export interface Page {
  n: number;
  src: string;
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
}

/** One spread: [left, right]. A null slot renders empty (cover / back page). */
export type Spread = [Page | null, Page | null];

/** Pages exported so far. Bump as more land in public/issues/01/. */
const PAGE_COUNT = 12;

// Every page is 2000x2600. Only the RATIO is load-bearing: the page slot is
// exactly `bw/2` by `0.65 * bw`, i.e. 2000/2600, so `object-fit: contain` on the
// static page and `background-size: calc(var(--bw) * 0.5) auto` on a curl face
// resolve to the same box — the flip has no size jump at either end.
// `scripts/optimize-pages.mjs` (npm run pages) writes the .webp files the app
// loads and warns if an export is the wrong size.
export const issue01: Issue = {
  id: '01',
  pageW: 2000,
  pageH: 2600,
  hasCover: false,
  hasBack: false,
  pages: Array.from({ length: PAGE_COUNT }, (_, i) => ({
    n: i + 1,
    src: `/issues/01/${String(i + 1).padStart(2, '0')}.webp`,
  })),
};

export const ISSUES: Record<string, Issue> = {
  '01': issue01,
};

/**
 * Pair the reading order into spreads. A cover takes the right slot of its own
 * spread (left empty); a back page takes the left slot of the last one.
 */
export function buildSpreads(issue: Issue): Spread[] {
  const spreads: Spread[] = [];
  let rest = issue.pages;

  if (issue.hasCover && rest.length) {
    spreads.push([null, rest[0]]);
    rest = rest.slice(1);
  }

  let back: Page | null = null;
  if (issue.hasBack && rest.length) {
    back = rest[rest.length - 1];
    rest = rest.slice(0, -1);
  }

  for (let i = 0; i < rest.length; i += 2) {
    spreads.push([rest[i], rest[i + 1] ?? null]);
  }

  if (back) spreads.push([back, null]);
  return spreads;
}
