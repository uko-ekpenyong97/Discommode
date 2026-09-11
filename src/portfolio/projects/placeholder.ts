import type { Block } from '../blocks/types';

/**
 * The placeholder project — every block type exactly once, in a deliberate
 * order, so the sheet can be eye-tested and tuned before any real project
 * exists. Cards 02, 03 and 04 all point at it; only the title differs, so
 * switching between them is visible.
 *
 * Replacing this with real content is a data change and nothing else: write a
 * `Block[]` and register it in `projects/index.ts`.
 */
const MEDIA = '/projects/placeholder';

export function placeholderBlocks(title: string): Block[] {
  return [
    { type: 'title', text: title },
    { type: 'caption', text: 'PLACEHOLDER — 2026 — MECHANICS ONLY' },
    {
      type: 'twoUp',
      flip: true,
      columns: [
        {
          media: { kind: 'image', src: `${MEDIA}/two-up-a.webp`, alt: '' },
          text: 'Two columns, each a frame and a paragraph. The frames flip in from depth; the paragraphs follow on the standard reveal.',
        },
        {
          media: { kind: 'image', src: `${MEDIA}/two-up-b.webp`, alt: '' },
          text: 'The gap is 52px between the columns and 24px between a frame and its text — the two rhythms the reference uses.',
        },
      ],
    },
    {
      type: 'image',
      src: `${MEDIA}/wide.webp`,
      alt: '',
      caption: 'Full column width.',
    },
    { type: 'linkPill', label: 'View the reference', href: 'https://halfof8.com/#space' },
    {
      type: 'text',
      newSection: true,
      heading: 'A section starts here',
      body: [
        'Consecutive blocks group into one section. A block that asks for a new one gets the hairline divider above it, drawn from nothing with a scaleX as it comes into view.',
        'Body copy sits in the 656px column, centred in the article. Everything in this project is a stand-in — the point is the feel of the scroll, the stagger, and the switch between neighbours.',
      ],
    },
    {
      type: 'statGrid',
      stats: [
        { src: `${MEDIA}/stat-1.webp`, label: 'FIRST' },
        { src: `${MEDIA}/stat-2.webp`, label: 'SECOND' },
        { src: `${MEDIA}/stat-3.webp`, label: 'THIRD' },
        { src: `${MEDIA}/stat-4.webp`, label: 'FOURTH' },
      ],
    },
    {
      type: 'video',
      newSection: true,
      src: `${MEDIA}/loop.mp4`,
      poster: `${MEDIA}/video-poster.webp`,
      caption: 'Muted, looping, and paused the moment it leaves the scroller.',
    },
    {
      type: 'rive',
      src: `${MEDIA}/loop.riv`,
      artboard: 'Main',
      stateMachine: 'State Machine 1',
      label: 'RIVE',
    },
    { type: 'image', src: `${MEDIA}/bleed.webp`, alt: '', bleed: true },
    {
      type: 'text',
      newSection: true,
      heading: 'And it ends',
      body: [
        'The scroller is exactly one viewport tall; an invisible spacer behind it gives it the range of this article, so the wheel scrolls the project while the grid underneath never moves.',
      ],
    },
  ];
}
