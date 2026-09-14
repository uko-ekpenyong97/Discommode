import type { Block, Media, Section, Stat } from '../blocks/types';
import ASSETS from './placeholder-assets.json';

/**
 * The placeholder SECTIONS — so the paper's mechanics can be eye-tested before
 * any real project exists.
 *
 * Length is the point. A section's height is what decides how long you scroll
 * before the track hands over to the turn, so the placeholders are built to
 * land on deliberate lengths — a section and a half, five sections' worth —
 * rather than to whatever a fixed block list happens to measure. `beats` is
 * that control: a count of blocks drawn from one repeating cycle, with a run
 * break every few, so asking for a longer section gives you a longer section
 * and not a different one.
 *
 * Every media block takes its dimensions from `placeholder-assets.json`, the
 * same table the generator script writes the files from. That is what keeps a
 * section the same height before and after its assets load.
 *
 * Replacing any of this with a real project is a data change and nothing else:
 * write the sections and register them in `projects/index.ts`.
 */
const M = '/projects/placeholder';

type MediaFile = keyof typeof ASSETS.media;

/** An image's src + intrinsic size, from the shared table. */
function image(file: MediaFile): { src: string; w: number; h: number } {
  const { w, h } = ASSETS.media[file];
  return { src: `${M}/${file}`, w, h };
}

const imageMedia = (file: MediaFile): Media => ({ kind: 'image', alt: '', ...image(file) });

const stat = (file: MediaFile, label: string): Stat => ({ ...image(file), label });

/** Two columns of image + paragraph, the frames turning in from depth. */
const twoUp = (): Block => ({
  type: 'twoUp',
  flip: true,
  columns: [
    {
      media: imageMedia('two-up-a.webp'),
      text: 'Two columns, each a frame and a paragraph. The frames flip in from depth; the paragraphs follow on the standard reveal.',
    },
    {
      media: imageMedia('two-up-b.webp'),
      text: 'The two halves are six of the page\u2019s twelve columns each, so they meet on the same grid line every other block lands on — and the gutter between them is the page\u2019s own.',
    },
  ],
});

const stats = (): Block => ({
  type: 'statGrid',
  stats: [
    stat('stat-1.webp', 'FIRST'),
    stat('stat-2.webp', 'SECOND'),
    stat('stat-3.webp', 'THIRD'),
    stat('stat-4.webp', 'FOURTH'),
  ],
});

const video = (): Block => ({
  type: 'video',
  src: `${M}/${ASSETS.video.file}`,
  poster: `${M}/video-poster.webp`,
  w: ASSETS.video.w,
  h: ASSETS.video.h,
  caption: 'Muted, looping, and paused the moment it leaves the scroller.',
});

/** A list row: text across seven columns, media pinned to the right across
 *  five. The shape a project takes when it is listing things. */
const row = (i: number): Block => ({
  type: 'row',
  heading: ROWS[i % ROWS.length][0],
  text: ROWS[i % ROWS.length][1],
  media: imageMedia('two-up-a.webp'),
});

const ROWS: [string, string][] = [
  [
    'A row reads as a line in a table',
    'Seven columns of text and five of media, pinned to the right edge of the measure. Stack a few and they read as a list of things rather than as a stack of separate blocks.',
  ],
  [
    'The grid is the same twelve throughout',
    'A row lays the page\u2019s twelve columns out again inside itself rather than splitting seven-twelfths off the measure — seven twelfths of a width is not seven columns once the gutters are counted.',
  ],
];

const rive = (): Block => ({
  type: 'rive',
  src: `${M}/loop.riv`,
  artboard: 'Main',
  stateMachine: 'State Machine 1',
  label: 'RIVE',
  w: ASSETS.riveArtboard.w,
  h: ASSETS.riveArtboard.h,
});

/** Prose the placeholder uses, cycled so a long section is not one paragraph
 *  eight times. Each entry is a heading and its body. */
const PROSE: [string, string[]][] = [
  [
    'One scroll, no modes',
    [
      'There is no gesture to learn and no control to find: the wheel does the whole project. Where the vertical run of a section ends, its sheet tilts away and the next one unrolls behind it, and the position is the same number throughout.',
    ],
  ],
  [
    'A section can be any length',
    [
      'The track derives its extent from the measured height of each section, so a long one simply scrolls for longer before its sheet leaves. A section shorter than the frame has no vertical run at all and goes straight from its entrance into its exit, which is a state the mechanics have to reduce to cleanly.',
    ],
  ],
  [
    'Media settles in',
    [
      'Images crossfade from their placeholder tint as they decode, but their boxes were the right size all along — nothing below them moves when they arrive. The video plays only while it is on screen and pauses the moment it leaves.',
    ],
  ],
  [
    'The sheet before this one',
    [
      'It did not go anywhere you can get back to by looking: it tilted away and stopped existing, and its number is still in the letterhead. Click that number and the track runs backwards through every sheet in between, each one re-rolling as the page in front of it comes back.',
    ],
  ],
  [
    'Nothing runs behind a sheet',
    [
      'The artboard mounts only once it is within one viewport of the scroll position and is torn down again on the way out. A page that is not the live one is out of the paint order entirely, and so is one part-way through its exit — the video on it stops the moment it starts leaving.',
    ],
  ],
  [
    'Edge to edge',
    [
      'The page runs to an inset on either side and no further, so a bleed image has only that inset to escape — out to the paper\u2019s own edges, and no further than that, because past them is ground.',
    ],
  ],
];

/**
 * One beat of a section. The cycle is fixed so a length is reproducible, and
 * ordered by how much a block is worth seeing. The video and the Rive artboard
 * come first after the two-up, because they are the two with a LIFECYCLE — they
 * mount, play and tear down as they cross the viewport — and `projects.test.ts`
 * holds every project to carrying both. The ninth slot is a repeat, so the
 * longest placeholder section shows every kind of block there is exactly once.
 */
function beat(i: number): Block {
  const cycle = Math.floor(i / 9);
  switch (i % 9) {
    case 0: {
      const [heading, body] = PROSE[cycle % PROSE.length];
      return { type: 'text', heading, body };
    }
    case 1:
      return twoUp();
    case 2:
      return video();
    case 3:
      return rive();
    case 4:
      return row(cycle);
    case 5:
      return { type: 'image', alt: '', caption: 'The full measure.', ...image('wide.webp') };
    case 6:
      return stats();
    case 7:
      return { type: 'image', alt: '', bleed: true, ...image('bleed.webp') };
    default: {
      // The ninth slot, and the only one a section has to be genuinely long to
      // reach: a second helping of prose. Everything a project can SAY is in
      // the first eight, so the longest placeholder section shows all of it.
      const [heading, body] = PROSE[(cycle + 3) % PROSE.length];
      return { type: 'text', heading, body };
    }
  }
}

/** How many blocks sit in one run before the hairline divider. */
const BEATS_PER_RUN = 3;

export interface SectionSpec {
  title: string;
  /** How many page heights tall the section should come out, near enough. See
   *  {@link BLOCK_VP} for what "near enough" is and why it cannot be exact. */
  viewports: number;
}

/**
 * WHAT EACH BLOCK COSTS, in page heights. MEASURED at 1728×996 with the shipped
 * page rect (748px), including the block's own 28px margin, and re-measurable
 * from the `[pv:track]` log any time the page's layout moves.
 *
 * A table rather than an average, because the average is useless here: a stat
 * grid is half a page and a Rive block is one and a half. Sizing a section by a
 * mean beat made a 1.5-viewport section and a 2-viewport one come out the same
 * length, which takes the spread out of the placeholder — and the spread IS the
 * placeholder. The short sections are what stress the
 * entrance-straight-into-exit path and the long one is what is long enough to
 * forget there is a sheet involved.
 *
 * So a section is FILLED: take beats from the cycle while the next one gets you
 * nearer the target than it overshoots it, then top up with paragraphs, which
 * are a sixth of a page each and are the fine adjustment. It still cannot be
 * exact — the last beat either fits or it does not — but it lands within about
 * a third of a page rather than within a whole one.
 */
const BLOCK_VP: Record<string, number> = {
  letterhead: 0.255,
  text: 0.164,
  twoUp: 1.33,
  video: 1.237,
  rive: 1.421,
  row: 1.027,
  image: 1.314,
  imageBleed: 1.037,
  statGrid: 0.535,
  linkPill: 0.053,
};

/** A run's own padding, and the page's inset — the two costs that are not a
 *  block's. */
const RUN_VP = 0.187;
const PAGE_VP = 0.182;

/** What a section costs before it says anything: the letterhead block, the link
 *  pill, the first run's padding and the page's inset. */
const FLOOR_VP = BLOCK_VP.letterhead + BLOCK_VP.linkPill + RUN_VP + PAGE_VP;

function costOf(block: Block): number {
  if (block.type === 'image' && block.bleed) return BLOCK_VP.imageBleed;
  return BLOCK_VP[block.type] ?? BLOCK_VP.text;
}

/**
 * THE PAGE RECT AT EACH SIGNED-OFF VIEWPORT, widest first — which is what the
 * captures are, and what they are named after.
 *
 * MEASURED, from the shipped page dials: the viewport less `pageMarginPx` on
 * each side, less the letterhead and a margin at the top, less the pill's foot
 * at the bottom. One entry per viewport and not one in total, because a page's
 * type is a fixed size and its measure is not — see `Section.sheets`.
 */
export const SHEET_SIZES = [
  { width: 1632, height: 748 },
  { width: 1344, height: 652 },
];

/**
 * Where a section's captures live: TWO per section per viewport, the first
 * viewport of its page and the last. Written by `npm run placeholders` from the
 * live page and committed like every other WebP — see `docs/portfolio-view.md`
 * on why this is a placeholder pipeline rather than a content one.
 */
export function sheetSrc(
  project: string,
  index: number,
  width: number,
  kind: 'sheet' | 'tail',
): string {
  return `/projects/${project}/${kind}-${String(index + 1).padStart(2, '0')}-${width}.webp`;
}

export function placeholderSection(
  project: string,
  index: number,
  { title, viewports }: SectionSpec,
): Section {
  const beats: Block[] = [];
  const prose: Block[] = [];
  let total = FLOOR_VP;
  /** The padding a new run brings with it, which the fourth block in a section
   *  pays and the fifth does not. */
  const runCost = (n: number): number => (n > 0 && n % BEATS_PER_RUN === 0 ? RUN_VP : 0);
  /** Take it if it gets us nearer the target than it overshoots — which is
   *  rounding to the nearest whole block. */
  const fits = (cost: number): boolean => total + cost / 2 <= viewports;

  // Each section starts its cycle TWO beats further along than the last, and
  // the stride is measured rather than chosen: with the page rect these dials
  // give, a section of two to five page heights holds one to four beats, so a
  // stride of one leaves the back of the nine-block cycle unreachable and a
  // project would never once show a bleed image. Two covers the whole cycle
  // across a project of five sections — and it is also what stops any two
  // sections opening with the same thing.
  //
  // `projects.test.ts` holds every project to carrying the video and the Rive
  // artboard, the two blocks with a lifecycle worth watching, and this is what
  // makes those reachable for a project whose longest section is four page
  // heights.
  for (let i = 0; i < 32; i++) {
    const block = beat(index * 2 + i);
    const cost = costOf(block) + runCost(beats.length + prose.length);
    if (!fits(cost)) break;
    beats.push(block);
    total += cost;
  }
  for (let i = 0; i < 16; i++) {
    const [heading, body] = PROSE[(index * 2 + i) % PROSE.length];
    const cost = BLOCK_VP.text + runCost(beats.length + prose.length);
    if (!fits(cost)) break;
    prose.push({ type: 'text', heading, body });
    total += cost;
  }
  // A section always says at least one thing, however short it was asked to be.
  if (beats.length === 0 && prose.length === 0) beats.push(beat(index * 2));

  // Prose FIRST, media after. It is what makes the section's first viewport a
  // page of type rather than a photograph — and the first viewport is what
  // becomes `sheet.webp`, so it is what the rolled sheet reads as.
  const body = [...prose, ...beats];

  const blocks: Block[] = [
    {
      type: 'letterhead',
      no: `SECTION ${String(index + 1).padStart(2, '0')}`,
      title,
      ref: `PLACEHOLDER \u00b7 ${viewports} VIEWPORTS`,
    },
    ...body.map((block, i) =>
      i > 0 && i % BEATS_PER_RUN === 0 ? { ...block, newRun: true } : block,
    ),
    { type: 'linkPill', label: 'View the reference', href: 'https://www.virgilabloh.com/' },
  ];
  return {
    title,
    blocks,
    sheets: SHEET_SIZES.map((size) => ({ src: sheetSrc(project, index, size.width, 'sheet'), ...size })),
    tails: SHEET_SIZES.map((size) => ({ src: sheetSrc(project, index, size.width, 'tail'), ...size })),
  };
}

export function placeholderSections(project: string, specs: SectionSpec[]): Section[] {
  return specs.map((spec, index) => placeholderSection(project, index, spec));
}
