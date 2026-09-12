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
      text: 'The gap is 52px between the columns and 24px between a frame and its text — the two rhythms the reference uses.',
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
      'A bleed image escapes the 656px column and runs the full width of the page — the page, not the viewport, because the page is the frame the notebook holds.',
    ],
  ],
];

/**
 * One beat of a section. The cycle is fixed so a length is reproducible, and
 * ordered so that even the SHORTEST section any placeholder asks for carries
 * the video and the Rive artboard — the two blocks with a lifecycle worth
 * watching, and the two that would otherwise only appear in long projects.
 */
function beat(i: number): Block {
  switch (i % 8) {
    case 0: {
      const [heading, body] = PROSE[Math.floor(i / 8) % PROSE.length];
      return { type: 'text', heading, body };
    }
    case 1:
      return twoUp();
    case 2:
      return { type: 'image', alt: '', caption: 'Full column width.', ...image('wide.webp') };
    case 3: {
      const [heading, body] = PROSE[(Math.floor(i / 8) + 3) % PROSE.length];
      return { type: 'text', heading, body };
    }
    case 4:
      return video();
    case 5:
      return rive();
    case 6:
      return stats();
    default:
      return { type: 'image', alt: '', bleed: true, ...image('bleed.webp') };
  }
}

/** How many beats sit in one run before the hairline divider. */
const BEATS_PER_RUN = 3;

export interface SectionSpec {
  title: string;
  hue: number;
  /** Roughly how many viewports tall, at 900px with the default page width. */
  viewports: number;
}

/**
 * Beats per viewport, measured: the cycle above averages ~330px a block at the
 * 656px column, plus a 140px run break every three. Tuned against the real
 * rendered heights rather than derived — see the `viewports` figures in the
 * project files and the `[pv:track]` log that prints what they came out as.
 */
const BEATS_PER_VIEWPORT = 2.1;

export function placeholderSection({ title, hue, viewports }: SectionSpec): Section {
  const count = Math.max(1, Math.round((viewports - 0.25) * BEATS_PER_VIEWPORT));
  const blocks: Block[] = [
    { type: 'title', text: title },
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
