import type { Block, Media, Project, Section } from '../blocks/types';
import { captures } from './captures';
import ASSETS from './rive-site-assets.json';

/**
 * THE RIVE HOMEPAGE REDESIGN — card 02, and the first real project in here.
 *
 * It replaces the five placeholder sections that stood at `#view-02`, and the
 * swap is a DATA CHANGE AND NOTHING ELSE: same five sections, same block model,
 * same capture set, same track. Nothing in `Scroller`, `SheetCanvas` or
 * `pageTrack` knows the difference, which is what the placeholder was built to
 * prove and is the one thing worth saying about the diff.
 *
 * THE COPY IS NOT WRITTEN HERE. It is `~/Discommode-pages/projects/rive-site/
 * copy.md`, split at its own headings, word for word. Where a paragraph in the
 * source opens with a bold lead-in — "**The hero keeps the magic.** A redesign
 * that…" — the lead-in becomes the block's `heading` and the remainder its
 * body, because that is what the bold was doing. Nothing is paraphrased and
 * nothing is cut except the one finding named in the commit.
 *
 * THE MEDIA IS NOT WRITTEN HERE EITHER. `npm run projects` encodes
 * `~/Discommode-pages/projects/rive-site/` into `public/projects/rive-site/`
 * and writes `rive-site-assets.json` beside this file; the intrinsic sizes come
 * from that table and never from a number typed in. See
 * `scripts/optimize-projects.mjs` for why that has to be true rather than
 * merely tidy.
 *
 * The CAPTURES still live under the project ID (`/projects/02/`), because that
 * is what `#view-NN` names and what the capture script walks — the slug is the
 * source folder's name, not the view's.
 */

/** Where `npm run projects` put this project's media. */
const M = '/projects/rive-site';

type MediaFile = keyof typeof ASSETS.media;

/**
 * A clip, in both encodes, with its poster and its intrinsic size.
 *
 * One helper rather than four fields at every call site: the four are derived
 * from the stem by the same rules the script names the files by, so a clip that
 * is in the folder cannot be half-wired here.
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
  ref: 'RIVE.APP · REDESIGN STUDY',
});

/**
 * 01 — A BUTTON.
 *
 * The Loop artboard is Uko's own character, the loading ring with a face, and
 * it is the first thing on the page for the reason the copy gives: a Rive file
 * running live is the argument, and a screenshot of one is the opposite of it.
 *
 * It takes FOUR of the twelve columns rather than the measure. The artboard is
 * square, so a full-width block would be 1536px tall on a page that is 844 —
 * the character would be the whole first viewport and the sentence it is there
 * to introduce would be below the fold.
 */
const section01 = (): Section => ({
  title: 'A button',
  blocks: [
    letterhead(0, 'A button'),
    {
      type: 'rive',
      src: `${M}/loop.riv`,
      artboard: 'Loop',
      // NOT `BeatMachine`, which is the artboard's only state machine and would
      // be the right entry point if it were usable. It paints the EDITOR'S
      // SELECTION HANDLES over the character — four blue corner squares, four
      // edge dots and a centre crosshair — and draws less than half the
      // character's ink while it does it. Verified against a bare page with
      // nothing on it but the runtime and this file, so it is the file rather
      // than anything here. Every other entry point on the artboard is clean.
      //
      // `LoadingSustain` is the one the copy is about: the orange loading arc
      // with the face, sustained. Re-export the state machine without that
      // layer and this becomes `stateMachine: 'BeatMachine'` again.
      animation: 'LoadingSustain',
      label: 'LOOP',
      // Loop is a light ring and a light face with nothing behind it — drawn
      // for a dark product UI, which is where it lives on the redesign. On this
      // page's paper it all but disappears, so it gets the plate it was drawn
      // against rather than a recolour it was not.
      surface: 'ink',
      span: 4,
      w: 240,
      h: 240,
    },
    {
      type: 'text',
      heading: 'It started with a button',
      body: [
        'There’s a button on Rive’s homepage that says GET STARTED, with a tiny rocket idling above it. Hover, and it fires. Up in the corner there’s another one, and when your cursor drifts toward it, a cat leans your way.',
        'Neither is a video. They’re Rive files running live in the browser, the same way Rive runs inside Duolingo and Spotify Wrapped. The button is the product demonstrating itself.',
        'That’s what made me pay attention to Rive years ago. Not the feature list. A cat.',
        'I’m a design engineer, and Rive is the tool I reach for most. So rebuilding their homepage wasn’t a speculative redesign of a company I admire from a distance. It was closer to rearranging a room I spend all day in.',
      ],
    },
  ],
  ...capturesFor(0),
});

/**
 * 02 — THE GAP · THE IDEA.
 *
 * The two-up is the whole argument of the section in one block: their homepage
 * on the left, this one on the right, at the same size on the same grid line.
 * Two clips rather than two stills, because the claim is about motion.
 */
const section02 = (): Section => ({
  title: 'The gap · The idea',
  blocks: [
    letterhead(1, 'The gap · The idea'),
    {
      type: 'text',
      heading: 'The gap',
      body: [
        'Rive is the animation engine behind products used by billions of people, and their team ships constantly.',
        'But their homepage opens with a category claim — the interactive experience engine — standing next to nothing. The proof exists. Duolingo rebuilt every character in Rive. Spotify Wrapped reached hundreds of millions with it. You just have to go hunting for it across subpages. Meanwhile the most persuasive thing on the site is that cat, which most visitors never consciously notice.',
        'Rive ships faster than it communicates. That’s not a criticism of a company doing something hard. It’s a description of a real job.',
      ],
    },
    {
      type: 'twoUp',
      newRun: true,
      columns: [
        { media: videoMedia('02-rive-current'), text: 'Rive today' },
        { media: videoMedia('02-redesign'), text: 'Redesign' },
      ],
    },
    {
      type: 'text',
      newRun: true,
      heading: 'The idea',
      body: [
        'One sentence guided everything: the site is made of the product.',
        'Rive sells interactive motion. A marketing site for interactive motion built from screenshots is quietly admitting the thing doesn’t survive contact with reality. So every section that could be a live Rive file became one.',
        'Stripe was the structural reference — a single page that answers your objections in order instead of scattering them across navigation. Linear was the surface reference, quiet enough to let the content be loud. And one rule: proof before claims. Name the customer, then make the argument.',
      ],
    },
  ],
  ...capturesFor(1),
});

/**
 * 03 — WHAT GOT BUILT.
 *
 * Three ROWS, which is the block that reads as a line in a table: seven columns
 * of text and five of media pinned to the right inset. Three of them stacked
 * read as a list of three things built, which is what the section is, rather
 * than as three separate arguments.
 */
const section03 = (): Section => ({
  title: 'What got built',
  blocks: [
    letterhead(2, 'What got built'),
    {
      type: 'row',
      heading: 'The hero keeps the magic',
      text: 'A redesign that discards what people already love is just a different site wearing the same name. Rive’s rocket and cat carried over, the actual files, running live. What changed is everything around them: honest copy that names Duolingo and Spotify before claiming a category, and a structure where those buttons are the demo rather than decoration beside one.',
      media: videoMedia('hero'),
    },
    {
      type: 'row',
      heading: 'The workflow section teaches with a character',
      text: 'Rive’s process is five steps. Instead of five illustrations, there’s one character I built, a loading ring with a face, that gains a capability at each step, beside cards that stack as you scroll. Each covered card leaves its title showing, so the stack becomes a table of contents of what you just learned.',
      media: videoMedia('03-workflow'),
    },
    {
      type: 'row',
      heading: '“Where Rive runs” shows, then proves',
      text: 'A grid of the places Rive actually lives: product interfaces, game menus, car dashboards, broadcast graphics, personalized campaigns. Each tile plays real footage. Click one and a panel opens with a live Rive file inside, a health bar you can drag, an assistant that changes mood as you click. Live where live proves the feeling; video where the claim is scale, because you can’t embed six hundred million Spotify Wrapped shares.',
      media: videoMedia('03-runs'),
    },
    {
      type: 'text',
      newRun: true,
      body: [
        'Around that: customer logos retuned so fifteen brand marks read as one line of type instead of fifteen competing sizes, case studies with real links, and a developer section where every platform points at its actual documentation page.',
        'That last one sounds trivial. It’s where the story turns.',
      ],
    },
  ],
  ...capturesFor(2),
});

/**
 * 04 — INSIDE THEIR FILES.
 *
 * Each finding is its bold lead-in as a heading and the rest as body, which is
 * the shape the source copy already had.
 *
 * THE LINKEDIN/STRAVA CLIP BLEEDS, and it is the only block in the project that
 * does. It is the one finding that is not an assertion — the card says LinkedIn
 * and the footage is Strava's, and you can watch it happen — so it gets the
 * page's full width and the reader gets to check the claim rather than take it.
 * A bleed block is also the one page-layout invariant `pv-verify` cannot
 * measure on a project that has none.
 */
const section04 = (): Section => ({
  title: 'Inside their files',
  blocks: [
    letterhead(3, 'Inside their files'),
    {
      type: 'text',
      heading: 'What I found inside their files',
      body: [
        'To use Rive’s rocket and cat, I had to take them apart. Once you read a company’s files closely, you learn how fast they’re moving.',
      ],
    },
    {
      type: 'text',
      newRun: true,
      heading: 'Their cat has five inputs. Their site uses two.',
      body: [
        'The other three exist in the file and are never called. I only learned this by watching which ones actually fired on their live page. My first version was more elaborate than the original, which is exactly why it felt wrong.',
      ],
    },
    {
      type: 'text',
      heading: 'Their rocket carries wiring that doesn’t fire.',
      body: [
        'Interactive triggers that produce no response under real input. The animation runs beautifully through a different path. The dead wiring ships today.',
      ],
    },
    {
      type: 'text',
      heading: 'One case study plays the wrong video.',
      body: [
        'The card titled “LinkedIn Year in Review” plays footage from Strava’s Year in Sport. I noticed while checking frame by frame what each clip actually showed.',
      ],
    },
    clipBlock('04-linkedin-strava', {
      bleed: true,
      caption: '“LinkedIn Year in Review”, playing Strava’s Year in Sport.',
    }),
    {
      type: 'text',
      newRun: true,
      heading: 'Their docs have traps.',
      body: [
        'Unity and Unreal sit under a different path than every other platform. iOS is filed under “Apple.” C++ has no docs page at all. Anyone guessing those URLs ships broken links to developers, who are the people most likely to click.',
      ],
    },
    {
      type: 'text',
      body: [
        'None of these are damning. Every one is what a fast-moving team leaves behind. But collected, they make the argument better than a cover letter could: the product is ahead of the story being told about it, and closing that gap is a real job. I found them by looking harder at Rive than anyone does who isn’t a little obsessed. That obsession is the qualification.',
      ],
    },
  ],
  ...capturesFor(3),
});

/** 05 — HOW IT'S BUILT · WHERE IT LANDED. The link out, and the credits as the
 *  thin mono line the caption block is for. */
const section05 = (): Section => ({
  title: 'How it’s built · Where it landed',
  blocks: [
    letterhead(4, 'How it’s built · Where it landed'),
    {
      type: 'text',
      heading: 'How it’s built',
      body: [
        'Nothing was guessed. Every measurement came from measuring Rive’s live site rather than eyeballing it, and when I needed to know how a file behaved I read the file instead of trusting its name. Three separate times, the name turned out to be the opposite of the truth.',
        'Anything I couldn’t reason my way to became a dial: how long a card holds, how much air a label needs, how fast the logos scroll. Tune it live, then lock it in.',
        'And the site checks its own work. That every link goes where its label promises, that the character is genuinely animating rather than frozen, that the layout holds at every size, and that the whole thing still works with the outside world switched off. It carries its own animation engine, typefaces, characters and footage, so it runs on conference wifi, behind a corporate firewall, on a phone with two bars. Which is exactly the condition under which someone finally looks at it.',
      ],
    },
    {
      type: 'text',
      newRun: true,
      heading: 'Where it landed',
      body: [
        'One scrolling page that opens with the buttons that made me love this tool, teaches the workflow through a character built in it, proves the reach with the product running live in six contexts, and sends every developer who clicks to the right page.',
        'An answer to a question nobody asked me: what would it look like if the product’s story moved as fast as the product?',
      ],
    },
    {
      type: 'linkPill',
      label: 'rive-redesign-study.vercel.app',
      href: 'https://rive-redesign-study.vercel.app',
    },
    {
      type: 'caption',
      text: 'Design, engineering, motion and copy: Uko Ekpenyong. Built with Rive, React and TypeScript. Rive’s brand animations appear as deliberate continuity from their current site; all customer footage is Rive’s own published showcase material.',
    },
  ],
  ...capturesFor(4),
});

/** The eight captures a section ships, under the PROJECT ID. */
function capturesFor(index: number): Pick<Section, 'sheets' | 'tails'> {
  return {
    sheets: captures('02', index, 'sheet'),
    tails: captures('02', index, 'tail'),
  };
}

export const riveSite: Project = {
  id: '02',
  title: 'RIVE — A homepage made of the product',
  ref: 'REDESIGN STUDY · 2026',
  sections: [section01(), section02(), section03(), section04(), section05()],
};
