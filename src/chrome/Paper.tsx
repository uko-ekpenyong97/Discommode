import type { CSSProperties, ReactNode } from 'react';
import SHAPES from './shapes.json';
import { applyChrome } from './chromeDials';
import './chrome.css';

/**
 * THE PAPER SHAPES — the faces of the reader's and the detail view's buttons.
 * Uko's hand-cut outlines, used as they were drawn (never redrawn): each is a
 * CSS mask (`public/ui/chrome/<shape>-paper.svg`, from `npm run chrome`) over a
 * fill that is the sky's colour made paper, and the glyph is a second mask
 * over the ink. The colours arrive as `--paper`, `--paper-press` and `--ink`
 * on the element carrying `data-paper` (`useSkyChrome`).
 *
 * These are FACES, not buttons: the caller owns the element (a `<button>`, or
 * the card pill's `<div>` with its native `<select>`), gives it `paper` and
 * `data-paper`, and puts a face in it. The face lays out the frame's BASE — the
 * circle, or the pill's rounded rect: 58, 46, 131×46 at `chromeScale` 1 — and
 * lets the scalloped edge overhang it, as it does in the file.
 */

// Published once, so the stylesheet and the dials agree from the first paint.
// The stylesheet's fallbacks are the same numbers.
if (typeof document !== 'undefined') applyChrome();

export type ShapeName = 'cover' | 'back-cover' | 'prev' | 'next';

type Box = { x: number; y: number; w: number; h: number };
const S = SHAPES as unknown as Record<string, { viewBox: [number, number]; base: Box; hairline?: Box }>;
const pct = (n: number) => `${n * 100}%`;

/**
 * A round shape: cover, back cover, prev, next. `flip` turns the PAPER over
 * (top for bottom, about the base's centre) and leaves the glyph as it is —
 * the back pill is the prev shape cut again, so it is not the same piece twice.
 */
export function ShapeFace({ shape, flip = false }: { shape: ShapeName; flip?: boolean }) {
  const { viewBox: [vw, vh], base } = S[shape];
  const layer: CSSProperties = {
    left: pct(-base.x / base.w),
    top: pct(-base.y / base.h),
    width: pct(vw / base.w),
    height: pct(vh / base.h),
  };
  const style = { '--base-w': base.w, '--base-h': base.h } as CSSProperties;
  return (
    <span className="paper__shape" style={style} aria-hidden="true">
      <span
        className="paper__fill"
        style={{
          ...layer,
          maskImage: `url(/ui/chrome/${shape}-paper.svg)`,
          transformOrigin: `50% ${pct((base.y + base.h / 2) / vh)}`,
          transform: flip ? 'scaleY(-1)' : undefined,
        }}
      />
      <span className="paper__ink" style={{ ...layer, maskImage: `url(/ui/chrome/${shape}-ink.svg)` }} />
    </span>
  );
}

const PILL = S.pill;
const [PW, PH] = PILL.viewBox;
const PB = PILL.base;
/** The two caps are the pill's round ends (half its height either side of the
 *  base's straight run); the MIDDLE between them is what stretches. */
const CUT_L = PB.x + PB.h / 2;
const CUT_R = PW - (PB.x + PB.w) + PB.h / 2;
const MID = PW - CUT_L - CUT_R;
const HAIR = PILL.hairline!;

const PILL_VARS = {
  '--pill-vw': PW,
  '--pill-vh': PH,
  '--pill-bx': PB.x,
  '--pill-by': PB.y,
  '--pill-bw': PB.w,
  '--pill-bh': PB.h,
  '--pill-bleed-r': PW - (PB.x + PB.w),
  '--pill-cut-l': CUT_L,
  '--pill-cut-r': CUT_R,
  // The middle slice's mask is the whole outline stretched so that its middle
  // run fills the slice: `vw / mid` of the slice's width, positioned (CSS's
  // percentage alignment) so the run starts at the slice's left edge.
  '--pill-mid-scale': PW / MID,
  '--pill-mid-pos': pct(CUT_L / (PW - MID)),
  '--hair-x': HAIR.x,
  '--hair-y': HAIR.y,
  '--hair-w': HAIR.w,
  '--hair-h': HAIR.h,
} as CSSProperties;

/**
 * A pill: Uko's pill outline, of ANY WIDTH, by stretching its middle. The two
 * round ends are drawn exactly as exported and only the straight run between
 * them is stretched (a 3-slice of the one SVG, done with three masks — pure
 * CSS, so the pill follows its content's width with no measuring). At the
 * frame's 131 it is the export, unstretched.
 *
 * `numbers` draws the frame's "01 | 02": two numbers in Bowlby One either side
 * of the file's own hairline, at a fixed 131 wide so nothing moves as they
 * count. Otherwise `children` is the label and the pill is as wide as it needs.
 */
export function PillFace({ numbers, children }: { numbers?: [string, string]; children?: ReactNode }) {
  return (
    <span className={`paper__shape paper-pill${numbers ? ' paper-pill--numbers' : ''}`} style={PILL_VARS} aria-hidden={numbers ? true : undefined}>
      <span className="paper-pill__paper">
        <span className="paper__fill paper-pill__l" />
        <span className="paper__fill paper-pill__m" />
        <span className="paper__fill paper-pill__r" />
      </span>
      {numbers ? (
        <span className="paper-pill__text">
          <span className="paper-pill__num">{numbers[0]}</span>
          <span className="paper__ink paper-pill__hair" />
          <span className="paper-pill__num">{numbers[1]}</span>
        </span>
      ) : (
        <span className="paper-pill__text">{children}</span>
      )}
    </span>
  );
}

// DEV: the contrast probe and sweep (`scripts/sky-contrast.mjs`).
if (import.meta.env.DEV) void import('./chromeContrast');
