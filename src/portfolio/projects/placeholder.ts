import type { Block, Media, Stat } from '../blocks/types';
import ASSETS from './placeholder-assets.json';

/**
 * The placeholder PAGE SHAPES — three lengths, between them using every block
 * type once, so the sheet's mechanics can be eye-tested before any real project
 * exists.
 *
 * The lengths are the point: a page's height is what decides how long you
 * scroll before the track hands over to the horizontal slide, so the
 * placeholders deliberately cover a short page, a long one and a middling one.
 * Targets are in viewports at 1440x900 with the default 44vw page — see the
 * comment on each.
 *
 * Every media block takes its dimensions from `placeholder-assets.json`, the
 * same table the generator script writes the files from. That is what keeps a
 * page the same height before and after its assets load.
 *
 * Replacing any of this with a real project is a data change and nothing else:
 * write the pages and register them in `projects/index.ts`.
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

const opener = (title: string, caption: string): Block[] => [
  // Every page opens on its own title.
  { type: 'title', text: title },
  { type: 'caption', text: caption },
];

/** ~2.5 viewports. The page a project opens on. */
export function shortPage(title: string): Block[] {
  return [
    ...opener(title, 'PLACEHOLDER — 2026 — MECHANICS ONLY'),
    twoUp(),
    {
      type: 'text',
      newSection: true,
      heading: 'Where a page ends',
      body: [
        'Scroll to the bottom of this page and keep going: the scroll carries on into a horizontal slide that brings the next page in, one page-width, one to one with the wheel.',
        'Nothing about that is a separate animation — it is the same track position, read through a different segment.',
      ],
    },
    { type: 'image', alt: '', caption: 'Full column width.', ...image('wide.webp') },
    {
      type: 'text',
      heading: 'One scroll, no modes',
      body: [
        'There is no gesture to learn and no control to find: the wheel does the whole project. Where the vertical run of a page ends, the horizontal one begins, and the position is the same number throughout.',
      ],
    },
    { type: 'image', alt: '', bleed: true, ...image('bleed.webp') },
    { type: 'linkPill', label: 'View the reference', href: 'https://halfof8.com/#space' },
  ];
}

/** ~5 viewports. Carries the Video and the Rive artboard. */
export function longPage(title: string): Block[] {
  return [
    ...opener(title, 'THE LONG ONE — FIVE VIEWPORTS'),
    {
      type: 'text',
      heading: 'A page can be any length',
      body: [
        'The track derives its extent from the measured height of each page, so a long page simply scrolls for longer before the slide. Nothing is fixed to a viewport count.',
      ],
    },
    twoUp(),
    {
      type: 'text',
      newSection: true,
      heading: 'Media settles in',
      body: [
        'Images crossfade from their placeholder tint as they decode, but their boxes were the right size all along — nothing below them moves when they arrive. The video plays only while it is on screen and pauses the moment it leaves.',
      ],
    },
    {
      type: 'video',
      src: `${M}/${ASSETS.video.file}`,
      poster: `${M}/video-poster.webp`,
      w: ASSETS.video.w,
      h: ASSETS.video.h,
      caption: 'Muted, looping, and paused the moment it leaves the scroller.',
    },
    { type: 'image', alt: '', ...image('wide.webp') },
    {
      type: 'text',
      newSection: true,
      heading: 'And nothing runs behind the glass',
      body: [
        'The artboard below mounts only once it is within one viewport of the scroll position and is torn down again on the way out — watch it start and stop as you pass it.',
        'Closing the sheet unmounts every page, so a project can never leave a render loop running under the grid.',
      ],
    },
    {
      type: 'rive',
      src: `${M}/loop.riv`,
      artboard: 'Main',
      stateMachine: 'State Machine 1',
      label: 'RIVE',
      w: ASSETS.riveArtboard.w,
      h: ASSETS.riveArtboard.h,
    },
    stats(),
    { type: 'image', alt: '', bleed: true, newSection: true, ...image('bleed.webp') },
    {
      type: 'text',
      heading: 'Edge to edge',
      body: [
        'A bleed image escapes the 656px column and runs the full width of the page — the page, not the viewport, because the page is the frame.',
      ],
    },
    stats(),
    {
      type: 'text',
      newSection: true,
      heading: 'The stack on the left',
      body: [
        'The page before this one did not leave: it clamped at its resting slot and stacked as a sliver. Click one and the track scrolls back to where you stopped reading it — the row un-stacks through exactly the same mapping, in reverse.',
        'With more pages than the gutter can hold at the preferred width, the slivers narrow to fit. The gutter never widens.',
      ],
    },
    twoUp(),
    { type: 'image', alt: '', caption: 'Still page two.', ...image('wide.webp') },
  ];
}

/** ~3 viewports. The page a project ends on. */
export function mediumPage(title: string): Block[] {
  return [
    ...opener(title, 'AND IT ENDS HERE'),
    { type: 'image', alt: '', ...image('wide.webp') },
    {
      type: 'text',
      newSection: true,
      heading: 'The last page',
      body: [
        'A project ends where its pages do: the scroll simply stops, with nothing waiting on the right.',
        'A project with one page is the same thing with the middle taken out — no stack, no slide, just a page you scroll to the end of.',
      ],
    },
    twoUp(),
    {
      type: 'text',
      newSection: true,
      heading: 'Then you close it',
      body: [
        'There is no way from here to another project, and there should not be: the pages either side of this one are this project’s. Escape, or the pill on the left, takes you back to the card you came from with the grid exactly as you left it.',
      ],
    },
    { type: 'image', alt: '', ...image('wide.webp') },
    stats(),
    {
      type: 'text',
      heading: 'Nothing left running',
      body: [
        'Every page unmounts on the way out, videos included, so the grid behind the glass gets its frames back the moment the sheet goes.',
      ],
    },
    { type: 'linkPill', label: 'View the reference', href: 'https://halfof8.com/#space' },
  ];
}
