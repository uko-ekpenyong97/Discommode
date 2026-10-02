import type { Block, Media, Project, Section } from '../blocks/types';
import { captures } from './captures';
import ASSETS from './drex-assets.json';

/**
 * DREX — card 03, and the third real project in here. It replaces the last
 * placeholder.
 *
 * The one-section placeholder that stood at `#view-03` becomes FIVE sections,
 * and like cards 02 and 04 the swap is a DATA CHANGE AND NOTHING ELSE: same
 * block model, same capture set, same track. `Scroller`, `SheetCanvas` and
 * `pageTrack` do not know the difference.
 *
 * THE COPY IS NOT WRITTEN HERE. It is `~/Discommode-pages/projects/drex/
 * copy.md`, split at its own section breaks, word for word, under the rules
 * card 04 set down: a bold lead-in ("**Logo.** The mark had to…") becomes a
 * block's `heading` and the rest its body, straight quotes and apostrophes are
 * typeset curly, and markdown emphasis and link syntax are dropped because the
 * page has its own type for both. Nothing is paraphrased and nothing is cut.
 *
 * TWO LINKS ARE LINKS: the intro's "Live: drex.style" and the website
 * section's "Visit: drex.style". Each is the last words of its own line rather
 * than a call to action under it, so it is a paragraph that ends in a link (see
 * `Paragraph` in `types.ts`) rather than a link pill, and it opens in a new tab.
 *
 * THE MEDIA IS NOT WRITTEN HERE EITHER. `npm run projects` encodes
 * `~/Discommode-pages/projects/drex/media/` into `public/projects/drex/` and
 * writes `drex-assets.json` beside this file; the intrinsic sizes come from
 * that table and never from a number typed in. The cover's own files in the
 * same folder (`cover-logo.svg`, the shader's handoff) are PR #37's and are not
 * this page's.
 *
 * The CAPTURES live under the project ID (`/projects/03/`), because that is
 * what `#view-NN` names and what the capture script walks.
 */

/** Where `npm run projects` put this project's media. */
const M = '/projects/drex';

type MediaFile = keyof typeof ASSETS.media;

/**
 * A clip, in both encodes, with its poster and its intrinsic size — the same
 * helper cards 02 and 04 use, so a clip that is in the folder cannot be
 * half-wired here.
 */
function clip(file: MediaFile): {
  kind: 'video';
  src: string;
  webm: string;
  poster: string;
  w: number;
  h: number;
} {
  const { w, h } = ASSETS.media[file];
  return {
    kind: 'video',
    src: `${M}/${file}.mp4`,
    webm: `${M}/${file}.webm`,
    poster: `${M}/${file}-poster.webp`,
    w,
    h,
  };
}

/** The same clip as a standalone block rather than as a composite's media. */
const clipBlock = (file: MediaFile, rest: Partial<Block> = {}): Block => {
  const { kind, ...media } = clip(file);
  void kind;
  return { type: 'video', ...media, ...rest } as Block;
};

const videoMedia = (file: MediaFile): Media => clip(file);

/** The page's own letterhead — the block that makes a capture read as a
 *  document. Every section opens with one. */
const letterhead = (index: number, title: string): Block => ({
  type: 'letterhead',
  no: `SECTION ${String(index + 1).padStart(2, '0')}`,
  title,
  ref: 'DREX · LU & KO STUDIO',
});

const LIVE = { label: 'drex.style', href: 'https://drex.style/' };

/**
 * 01 — THE INTRO, THE CLUB, THE STANCE.
 *
 * The intro block is the same five labelled lines card 04 opens with, in the
 * same block, and its last line is the link out. The source's H1 is the
 * project's title and the letterhead's, the way card 04's is.
 *
 * THE CLUB CLIP IS RIGHT UNDER IT, at the full measure: it shows what Drex is
 * — a club and its zines — which is what the intro has just said in words, so
 * it is the picture that sentence wants beside it before the argument starts.
 * The stance is its own run under the clip, because it is the first thing the
 * copy argues rather than states.
 */
const section01 = (): Section => ({
  title: 'A creative community that feels handmade',
  blocks: [
    letterhead(0, 'A creative community that feels handmade'),
    {
      type: 'text',
      body: [
        'What it is: Drex is a home for creator clubs: small craft communities of about 15 people who take on challenges, meet up, and build portfolios together. Each club’s activity becomes a digital zine its members can read and keep.',
        'My role: Lead designer alongside Lucero, as Lu & Ko Studio, working directly with Drex’s founder and CEO, Chielo. I owned the full zine experience: how issues get made, both in the editor and through zine generation, and how they get read, in the zine reader and its stack system.',
        'What we made: Brand guidelines · logo · type system (Test Pitch, TAY Birdie) · color · website · app UI · issue editor · zine generation flow · zine reader · investor pitch deck',
        'Timeline: February–October 2026',
        { text: 'Live: ', link: LIVE },
      ],
    },
    clipBlock('01-club', { newRun: true }),
    {
      type: 'text',
      newRun: true,
      heading: 'The stance',
      body: [
        'Most software today looks the same: clean, minimal, and frictionless. Those systems made products easier to use, but they also made them interchangeable. Nothing feels like a person made it.',
        'Drex is about people making things together, so the product couldn’t feel sterile. We set out to do the opposite of the current trend and make something warm, tactile, and handmade.',
        'Before designing anything, we sat with Chielo to answer one question: why does Drex exist? His answer: most platforms creators use are built to keep them consuming, not learning together. Drex is a place to make things in community, where people learn from each other and support each other’s work. That answer became the test for every design decision after it.',
      ],
    },
  ],
  ...capturesFor(0),
});

/**
 * 02 — THE BRAND.
 *
 * The idea, then the brand in motion, then the four parts of it as the list
 * the copy already makes of them. The clip sits between the two because the
 * scrapbook the prose describes is something to watch before it is taken apart
 * into logo, type, colour and texture.
 */
const section02 = (): Section => ({
  title: 'The brand',
  blocks: [
    letterhead(1, 'The brand'),
    {
      type: 'text',
      heading: 'The brand: an art studio, mid-project',
      body: [
        'Walk into an artist’s studio and it’s a mess, but the mess is intentional. It means work is happening.',
        'The internet has trained us to see creativity as clean and linear. It isn’t. It’s trying ideas that shouldn’t work, changing direction halfway through, and finding out the detour was the best part. We wanted Drex to look like that process, so we landed on a scrapbook aesthetic: layered, cut, taped, and a little imperfect on purpose.',
      ],
    },
    clipBlock('02-brand', { newRun: true }),
    {
      type: 'text',
      newRun: true,
      heading: 'Logo',
      body: [
        'The mark had to be recognizable and unlike anything else. It starts as an open zine, but it also reads as a butterfly: people’s gifts flourishing when they grow together.',
      ],
    },
    {
      type: 'text',
      heading: 'Type',
      body: [
        'Test Pitch and TAY Birdie. We chose them for how they look together. The first things you should feel are warmth, community, and arts and crafts, with a playfulness you rarely see in modern apps. Minimal, serious design can feel exclusionary; Drex should feel like anyone is welcome to make something.',
      ],
    },
    {
      type: 'text',
      heading: 'Color',
      body: [
        'Grass Field green (#1CAB5B) leads the palette. It earned that spot through the warmth it carries; it simply felt like Drex. It also happens to be Chielo’s favorite color.',
      ],
    },
    {
      type: 'text',
      heading: 'Texture and detail',
      body: [
        'Cream paper textures, line-boil animation, cork boards and pins, washi tape and stickers. They run through everything: the app, the website, down to the UI buttons, interactions and animations.',
      ],
    },
  ],
  ...capturesFor(1),
});

/**
 * 03 — THE ZINE READER.
 *
 * The reasoning, then the stack itself, then the result. THE CLIP RUNS TO ITS
 * END SCREEN — "You’ve read all of the Fresh book" — and is shipped whole for
 * that reason: that screen is the claim the next line makes ("Readers know when
 * they’re done"), so it goes directly above that line, and the clip is never
 * trimmed to its swipe.
 */
const section03 = (): Section => ({
  title: 'The zine reader',
  blocks: [
    letterhead(2, 'The zine reader'),
    {
      type: 'text',
      heading: 'The zine reader: reading without the endless scroll',
      body: [
        'Every club event produces a zine, so the app had to show many of them at once without turning reading into a feed.',
      ],
    },
    {
      type: 'text',
      newRun: true,
      heading: 'The problem',
      body: [
        'An endless scroll makes everything feel disposable. Zines are meant to be finished, and a feed never lets you finish anything.',
      ],
    },
    {
      type: 'text',
      heading: 'The inspiration',
      body: [
        'Webtoons showed that a new screen format can create a new way of reading a story. I asked what the equivalent would be for a zine.',
      ],
    },
    {
      type: 'text',
      heading: 'The idea',
      body: [
        'I first tried a deck of cards, one card per issue, that you could swipe through. It looked uninspiring, and it didn’t scale: zines vary in length, and a fixed card made those differences stick out. I landed on a stack: zines sit on top of each other like a pile on a table. You can see there’s more to read, but each zine is its own object with a clear beginning and end. The stack also scales: a short zine and a long one sit together without the difference showing.',
      ],
    },
    {
      type: 'text',
      heading: 'How it works',
      body: [
        'You swipe through the stack, and when one catches your eye, you pick it and it opens into a webtoon-style view. From there you scroll, and the story isn’t locked to a set grid. That freedom leaves room for the mess of a real scrapbook, something you won’t see on most social apps.',
      ],
    },
    clipBlock('03-stack', { newRun: true }),
    {
      type: 'text',
      newRun: true,
      heading: 'The result',
      body: [
        'Each zine holds one event, start to finish. Readers know when they’re done, and they can still see what’s waiting next.',
      ],
    },
  ],
  ...capturesFor(2),
});

/**
 * 04 — MAKING A ZINE.
 *
 * The two ways a zine gets made, described, and then shown as a PAIR: a
 * two-up, because the section's point is that there are two and they sit side
 * by side as equals. "Why both" closes it under the pair, the way card 04's
 * four-characters paragraph closes its own two-up.
 */
const section04 = (): Section => ({
  title: 'Making a zine',
  blocks: [
    letterhead(3, 'Making a zine'),
    {
      type: 'text',
      heading: 'Making a zine: the editor and the generator',
      body: ['Reading is only half of it. Zines have to get made, and I designed both ways that happens.'],
    },
    {
      type: 'text',
      newRun: true,
      heading: 'The issue editor',
      body: [
        'Each member adds their own section to the issue, in a way that’s fun and interactive. They place and layer photos, text, stickers and washi tape, and the scrapbook look comes easily, even for people who aren’t designers. Then an editor compiles everyone’s submissions into one finished issue.',
      ],
    },
    {
      type: 'text',
      heading: 'Zine generation',
      body: [
        'Drex can also put a zine together from a club’s challenges and meetups. It takes the photos, writing, and answers that members share and turns them into a finished zine. We trained it toward a distinct look so the results feel handmade, not templated. The point is to capture the moment a community builds together and give it an artifact to keep.',
      ],
    },
    {
      type: 'twoUp',
      newRun: true,
      columns: [
        { media: videoMedia('04-zine-editor'), text: 'Made in the issue editor' },
        { media: videoMedia('04-zine-generated'), text: 'Made by zine generation' },
      ],
    },
    {
      type: 'text',
      newRun: true,
      heading: 'Why both',
      body: [
        'People should get to choose. Some want to craft every page themselves; others just want a way to capture the moment. Drex makes room for both.',
      ],
    },
  ],
  ...capturesFor(3),
});

/**
 * 05 — THE WEBSITE · WHERE IT LANDED.
 *
 * The two closing sections of the source under one sheet, the way cards 02 and
 * 04 close: "Where it landed" has no media and is two paragraphs, and on a
 * sheet of its own it would be a page of air. The site, then the link to it,
 * then the outcome.
 */
const section05 = (): Section => ({
  title: 'The website · Where it landed',
  blocks: [
    letterhead(4, 'The website · Where it landed'),
    {
      type: 'text',
      heading: 'The website',
      body: [
        'The handmade world doesn’t stop at the app. The Drex website shows people what Drex is all about and carries the same paper, tape, and line-boil motion, so the first impression already feels like the product.',
        'The intro is meant to be fun, and little easter eggs are tucked all over the site. I won’t list them here; they’re there to be discovered.',
      ],
    },
    clipBlock('05-website', { newRun: true }),
    { type: 'text', body: [{ text: 'Visit: ', link: LIVE }] },
    {
      type: 'text',
      newRun: true,
      heading: 'Where it landed',
      body: [
        'Drex launched publicly on October 2, 2026, after a beta that people responded to warmly. Seven clubs have formed and ten zines have been made so far, and Drex is now raising a $2 million round to grow what those first clubs started.',
        'Next, we build on that momentum: growing community through the app and bringing the club formula to more people who want an alternative to what’s out there now.',
      ],
    },
  ],
  ...capturesFor(4),
});

/** The fourteen captures a section ships, under the PROJECT ID. */
function capturesFor(index: number): Pick<Section, 'sheets' | 'tails'> {
  return {
    sheets: captures('03', index, 'sheet'),
    tails: captures('03', index, 'tail'),
  };
}

export const drex: Project = {
  id: '03',
  title: 'DREX — A creative community that feels handmade',
  ref: 'LU & KO STUDIO · 2026',
  sections: [section01(), section02(), section03(), section04(), section05()],
};
