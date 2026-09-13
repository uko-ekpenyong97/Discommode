import type { Block, Media, Section, Stat } from '../blocks/types';
import ASSETS from './placeholder-assets.json';

/**
 * The placeholder SECTIONS — so the notebook's mechanics can be eye-tested
 * before any real project exists.
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
      'There is no gesture to learn and no control to find: the wheel does the whole project. Where the vertical run of a section ends, the turn begins, and the position is the same number throughout.',
    ],
  ],
  [
    'A section can be any length',
    [
      'The track derives its extent from the measured height of each section, so a long one simply scrolls for longer before the turn. Nothing is fixed to a viewport count, and nothing here is a page in the printing sense.',
    ],
  ],
  [
    'Media settles in',
    [
      'Images crossfade from their placeholder tint as they decode, but their boxes were the right size all along — nothing below them moves when they arrive. The video plays only while it is on screen and pauses the moment it leaves.',
    ],
  ],
  [
    'The stack underneath',
    [
      'The section before this one did not leave. It is directly underneath, still at the line you stopped reading, and its tab is still on the left. Click that tab and the track scrolls back: the sections turn out to the right in order, and you land on its title.',
    ],
  ],
  [
    'Nothing runs behind the glass',
    [
      'The artboard mounts only once it is within one viewport of the scroll position and is torn down again on the way out. Closing the sheet unmounts every section, so a project can never leave a render loop running under the grid.',
    ],
  ],
  [
    'Edge to edge',
    [
      'The page runs to an inset on either side and no further, so a bleed image has only that inset to escape — out to the folder\u2019s own edges, which is the frame the cabinet holds.',
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

/** How many beats sit in one run before the hairline divider. */
const BEATS_PER_RUN = 3;

export interface SectionSpec {
  title: string;
  hue: number;
  /** Roughly how many viewports tall, at 996px with the default page layout. */
  viewports: number;
}

/**
 * Beats per viewport, and the fixed cost of a section on top.
 *
 * MEASURED, not derived, and re-measured whenever the page's layout changes —
 * the full-width page nearly doubled what a beat costs, because a beat is
 * mostly media and media now spans the measure. Fitting the rendered heights of
 * six sections at 1728×996 gives 0.57 viewports a beat over a 0.45 floor (the
 * header, the caption and the link pill), so a beat is `1 / 0.57`. See the
 * `viewports` figures in the project files and the `[pv:track]` log that prints
 * what they came out as.
 */
const BEATS_PER_VIEWPORT = 1.77;
const SECTION_FLOOR_VIEWPORTS = 0.45;

export function placeholderSection({ title, hue, viewports }: SectionSpec): Section {
  const count = Math.max(
    1,
    Math.round((viewports - SECTION_FLOOR_VIEWPORTS) * BEATS_PER_VIEWPORT),
  );
  // No title block: the page opens with the folder's own number and title, at
  // the size the reference gives it, and a project should not say its name
  // twice running.
  const blocks: Block[] = [
    { type: 'caption', text: `PLACEHOLDER — ${viewports} VIEWPORTS` },
  ];
  for (let i = 0; i < count; i++) {
    const block = beat(i);
    blocks.push(i > 0 && i % BEATS_PER_RUN === 0 ? { ...block, newRun: true } : block);
  }
  blocks.push({ type: 'linkPill', label: 'View the reference', href: 'https://halfof8.com/#space' });
  return { title, hue, blocks };
}

export function placeholderSections(specs: SectionSpec[]): Section[] {
  return specs.map(placeholderSection);
}
