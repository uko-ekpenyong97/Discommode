/**
 * READER SIZE, DETAIL SIZE and READER CHROME SCALE — the dials of the hero
 * layout (layout/hero.ts): how far the chrome's gaps and faces may shrink on a
 * screen smaller than the Studio Display, and how much of the space they leave
 * the book and the detail card take. The gaps and faces as tuned at 2560×1440
 * are the MAXIMUMS; these are the floors.
 *
 * `SIZE` is the live object: the dev panels (src/dev/sizeDials.ts, at `?intro`
 * in the app's dock, the doorway's and READER NAV) write it, and the hero
 * layout reads it on every computation. Tuned values are pasted here: the
 * panels' Copy button writes the snippet.
 */
export interface SizeDials {
  /** READER SIZE: the share of the space the chrome leaves that the open book
   *  (or, one page at a time, the page) takes. 1 fills it to the floors. */
  readerFill: number;
  /** DETAIL SIZE: the same for the detail view's centre card. The card and the
   *  reader's closed cover are ONE rect (the doorway opens the one into the
   *  other), so where both are held by the same edge the smaller wins. */
  detailFill: number;
  /** Least gap from the viewport's top and bottom to the chrome, px. */
  marginMin: number;
  /** Least gap from the chrome to the book (or card), px. */
  gapMin: number;
  /** Least gap from the book (or card) to the viewport's sides, px. */
  sideMin: number;
  /** READER CHROME SCALE: the least size of the smallest face (the 46
   *  arrows and pills), px, with a fine pointer (a mouse or trackpad). Its
   *  hit area is the face. The other faces keep their proportion to it. */
  faceMinFine: number;
  /** The same on a touch screen (a coarse pointer). Its hit area never goes
   *  under 44×44 whatever this says (the face centres in it). */
  faceMinTouch: number;
  /** The viewport height at which the chrome and its gaps start shrinking
   *  with the height, px: they scale by the smaller of the width over 2560
   *  and the height over this. 1300 keeps the Studio Display with a
   *  browser's toolbars at the signed-off layout. */
  heightRef: number;
}

export const SIZE_DEFAULTS: SizeDials = {
  readerFill: 1,
  detailFill: 1,
  marginMin: 16,
  gapMin: 16,
  sideMin: 16,
  faceMinFine: 32,
  faceMinTouch: 44,
  heightRef: 1300,
};

export const SIZE: SizeDials = { ...SIZE_DEFAULTS };

type Listener = (d: SizeDials) => void;
const listeners = new Set<Listener>();

export function setSize(next: Partial<SizeDials>): void {
  Object.assign(SIZE, next);
  for (const fn of listeners) fn(SIZE);
}

export function subscribeSize(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** The paste-ready snippet the panels' Copy button writes. */
export function sizeSnippet(d: SizeDials = SIZE): string {
  const body = (Object.keys(SIZE_DEFAULTS) as (keyof SizeDials)[]).map((k) => `  ${k}: ${d[k]},`).join('\n');
  return `// tuned values — paste over SIZE_DEFAULTS in src/layout/sizeDials.ts\nexport const SIZE_DEFAULTS: SizeDials = {\n${body}\n};`;
}
