import type { Block, Media, Project, Section } from '../blocks/types';
import { captures } from './captures';
import ASSETS from './nosey-assets.json';

/**
 * NOSEY — card 04, and the second real project in here.
 *
 * It replaces the three placeholder sections that stood at `#view-04` with
 * FIVE, and like card 02 the swap is a DATA CHANGE AND NOTHING ELSE: same block
 * model, same capture set, same track. The only thing outside this folder that
 * knows card 04 grew two sections is `projects.test.ts`, which counts them.
 *
 * THE COPY IS NOT WRITTEN HERE. It is `~/Discommode-pages/projects/nosey/
 * copy.md`, split at its own headings, word for word — the same rule card 02
 * follows, including the one about a bold lead-in: "**Scenario 1** — one agent
 * (Nosey) does something…" becomes a row's `heading` and its `text`, because
 * that is what the bold was doing. Nothing is paraphrased and nothing is cut.
 *
 * TWO CHANGES ARE MADE TO CHARACTERS OF IT, and no others: straight quotes and
 * apostrophes are typeset as curly, and where a bold lead-in is followed by a
 * lower-case clause — "**Scenario 1** — one agent…" — the clause's first letter
 * is capitalised, because once the lead-in is the heading the clause is a
 * sentence. Markdown emphasis, code ticks and link syntax are dropped the way
 * card 02 drops them; the page has its own type for all three.
 *
 * THE MEDIA IS NOT WRITTEN HERE EITHER. `npm run projects` encodes
 * `~/Discommode-pages/projects/nosey/` into `public/projects/nosey/` and writes
 * `nosey-assets.json` beside this file; the intrinsic sizes come from that table
 * and never from a number typed in.
 *
 * VIDEO AND NOTHING ELSE. Six clips, no artboard: this project's own medium is
 * a site scrolled in front of you, and there is no `.riv` in its source folder
 * to ship. The lazy-mount path is still exercised by cards 03's placeholders —
 * see the note in `projects.test.ts`.
 *
 * THE SOURCE FOLDER SPELLS THE TWO SCENARIO CLIPS `03-scenerio-N.mp4`, and the
 * outputs carry that spelling. The name here is the name on disk: the masters
 * live outside the repo and are the reader's own working folder, so renaming
 * one to tidy a stem in here is a change to somebody else's files for no gain
 * a reader of the page can see.
 *
 * The CAPTURES still live under the project ID (`/projects/04/`), because that
 * is what `#view-NN` names and what the capture script walks — the slug is the
 * source folder's name, not the view's.
 */

/** Where `npm run projects` put this project's media. */
const M = '/projects/nosey';

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
  ref: 'NOTION · CHARACTER SYSTEM PITCH',
});

/**
 * 01 — THE CASE IN THE MEDIUM OF THE CASE.
 *
 * THE WHOLE PITCH SITE, scrolled top to bottom, directly under the header and
 * at the full measure. The project's argument is that the case was made in the
 * medium of the case, so the first thing in the first capture — after the
 * letterhead that makes it a document — is the thing itself.
 *
 * It is the one place on this card where media comes before prose, which is the
 * opposite of the page's usual order and is the same exception card 02's two
 * buttons take: what the section is about has to be in the first viewport with
 * the sentence describing it.
 *
 * FULL WIDTH RATHER THAN A NARROWER SPAN, and it is measured rather than
 * assumed. A span only sets how WIDE a block is — the letterhead above it is
 * the same height either way — so the clip's top sits at the same y at span 8
 * as at span 12: **353px** into an 844px page rect at 1728×996, and **443px**
 * into a 748px one at 1440×900. It is inside the first viewport at both, with
 * the whole header above it, so there is nothing a narrower span would buy.
 */
const section01 = (): Section => ({
  title: 'The case in the medium of the case',
  blocks: [
    letterhead(0, 'The case in the medium of the case'),
    clipBlock('01-site-scroll', {
      caption: 'The pitch site, scrolled top to bottom.',
    }),
    {
      type: 'text',
      newRun: true,
      body: [
        'What it is: A self-directed pitch project. Not a client engagement, not an application — a proof-of-concept I built to show Notion’s design leadership what a next generation of their character work could look like, made real enough to react to.',
        'Timeline: ~2 weeks, self-directed',
        'Live: nosey-demo-pitch.vercel.app/pitch',
        'Stack: Next.js · Rive · framer-motion · TypeScript · Vercel',
      ],
    },
    {
      type: 'text',
      newRun: true,
      heading: 'The premise',
      body: [
        'Nosey is a character Buck Studio created for Notion. Buck did great work. But there’s a real difference between an external studio shipping a set of character files at a moment in time, and an internal team owning the character system as something that evolves week over week alongside the rest of the product.',
        'The tools have moved on. Rive — the animation platform Notion uses for its characters — has been shipping big changes: newer, more flexible ways to give characters state, memory, and awareness of what’s around them. Keeping up with that is a full-time job, not a project you hand off.',
        'I’m a contractor. I don’t work at Notion. But I could see the distance between what Nosey is today and what it could be if someone inside Notion was pushing on it every day. So I built the case — end to end — with the goal of putting it in front of Randy Hunt, who was VP of Design at Notion at the time.',
      ],
    },
  ],
  ...capturesFor(0),
});

/**
 * 02 — FROM PUPPET TO SMALL MIND.
 *
 * The two-up is the section's claim with the evidence under it: the same
 * character, authored two ways, at the same size on the same grid line. A
 * two-up rather than two stacked clips because the comparison IS the argument —
 * "it works, but" against "suddenly the character can hold a moment" is one
 * sentence, and one block.
 *
 * The four-characters paragraph is its own run at the end rather than another
 * paragraph of the text above, because it is what the rebuild was FOR and it
 * only makes sense once you have watched the difference.
 */
const section02 = (): Section => ({
  title: 'From puppet to small mind',
  blocks: [
    letterhead(1, 'From puppet to small mind'),
    {
      type: 'text',
      heading: 'Rebuilding Nosey from the inside out',
      body: [
        'The first thing I did was rebuild how Nosey is authored under the hood.',
        'The original version worked by responding to individual signals — a poke here fires a wave, a poke there fires a blink. It’s like a puppet on a set of strings; you pull one, one thing happens. It works, but it makes it hard for the character to hold a state, remember what it’s doing, or coordinate with anything else on the page.',
        'The new version treats the character more like a small mind. It knows what it’s doing right now — idle, thinking, greeting, writing — and switches between those cleanly. The rest of the app can ask what state it’s in and tell it to change. Suddenly the character can hold a moment, take direction, and stay in sync with what’s happening around it.',
      ],
    },
    {
      type: 'twoUp',
      newRun: true,
      columns: [
        { media: videoMedia('02-nosey-old'), text: 'Trigger-driven' },
        { media: videoMedia('02-nosey-new'), text: 'State-driven' },
      ],
    },
    {
      type: 'text',
      newRun: true,
      body: [
        'I did this for four characters, all built the same way. Same underlying structure, same vocabulary. That’s what makes it possible for them to work together later.',
      ],
    },
  ],
  ...capturesFor(1),
});

/**
 * 03 — CHARACTERS THAT LIVE INSIDE THE DOC.
 *
 * Two ROWS, which is the block that reads as a line in a table: seven columns
 * of text and five of media pinned to the right inset. The copy already names
 * them as a numbered pair — "Two small demos inside the site show this in
 * action:" — so two rows stacked read as the list that sentence promises,
 * rather than as two separate arguments.
 *
 * Each row's heading is the paragraph's own bold lead-in and its text is the
 * remainder, which is the shape the source copy already had.
 */
const section03 = (): Section => ({
  title: 'Characters that live inside the doc',
  blocks: [
    letterhead(2, 'Characters that live inside the doc'),
    {
      type: 'text',
      heading: 'The design thesis',
      body: [
        'Most AI features in document tools follow the same pattern. There’s a chatbot in a sidebar. It doesn’t know what page you’re on. It doesn’t notice what you’re doing. You ask it something, it responds, you close the panel.',
        'The interesting version is different. The agent is on the page with you. It notices things. It greets you. You can see it thinking. When it produces something, that something appears where you’re working, not in some other window.',
        'Two small demos inside the site show this in action:',
      ],
    },
    {
      type: 'row',
      newRun: true,
      heading: 'Scenario 1',
      text: 'One agent (Nosey) does something in front of you: greets you, thinks about it, writes something on the page, and lets you know it’s done. Every step is visible.',
      media: videoMedia('03-scenerio-1'),
    },
    {
      type: 'row',
      heading: 'Scenario 2',
      text: 'Two agents working together. One greets you and starts thinking, hands off to a second one to write, then comes back to confirm. This is the moment where the case for internal ownership gets concrete. Choreographing two characters to work in sync — as a coordinated pair, not as isolated widgets — is the kind of thing a team inside the building can do. It’s much harder to specify to an outside vendor.',
      media: videoMedia('03-scenerio-2'),
    },
  ],
  ...capturesFor(2),
});

/**
 * 04 — ONE LONG SCENE.
 *
 * The site, then the build. The caption block under the new run is the source's
 * own italic line under "The build" — a thin mono one-liner is exactly what
 * that sentence is, and dropping it would be cutting copy to fit the block
 * model rather than choosing a block for the copy.
 *
 * THE DEV PANEL IS A ROW and its remaining two paragraphs are a text block
 * under it. A row carries one paragraph beside its media, which is the right
 * amount to read while watching a dial move; the two that follow are about why
 * the panel exists rather than about what is in the clip, and they read as
 * prose under it.
 */
const section04 = (): Section => ({
  title: 'One long scene',
  blocks: [
    letterhead(3, 'One long scene'),
    {
      type: 'text',
      heading: 'The site: one long scene, told through scroll',
      body: [
        'The pitch itself is a website. But it isn’t a set of pages you click between — it’s one long scene that transitions as you scroll. The characters are always there. They move, react, and change state as you move through the page. What you saw in the last section carries into the next.',
        'Fourteen moments make up the arc: the opening, Nosey’s entrance, a greeting, some visual atmosphere, the two demos, a scene where the characters orbit around a title, a scene where they race, a moment where they all gather together, and the closing pitch, delivered by the characters themselves. Then it loops back to the top.',
        'The whole thing runs on how far down the page you are. Scroll faster, everything responds faster. Scroll back up, it rewinds. It’s one connected experience.',
      ],
    },
    {
      type: 'text',
      newRun: true,
      heading: 'The build',
      body: ['For anyone curious about how it was made.'],
    },
    {
      type: 'row',
      heading: 'A control panel for every visual detail',
      text: 'The site has about ninety small settings that control how things look — how big each character is, how they’re spaced, how long a moment holds, when a transition starts, where things land. Every one of them is a dial you can turn.',
      media: videoMedia('04-dev-panel'),
    },
    {
      type: 'text',
      body: [
        'There’s a hidden mode (add ?dev=1 to the URL) where all those dials show up as a control panel. I used it to tune the whole site by eye, in real time. Change a number, see the result, adjust, save. The final polish pass adjusted around thirty-six dials in one sitting.',
        'Getting visual polish right by editing code and reloading doesn’t work. You have to be able to see what you’re changing. This let me.',
      ],
    },
    {
      type: 'text',
      newRun: true,
      heading: 'Five rules I now know to build with',
      body: [
        'Building a site where characters move through a whole scene together, remember their state, and coordinate with each other surfaces problems you can’t see coming. Every problem I ran into taught me a rule I now apply from the beginning. There are five of them. They’re written up in the code with the actual bugs that taught them, but the short version is: they’re about being careful in specific ways when many moving parts share the same brain.',
        'If you’re a designer or product person, you don’t need to know what they are. If you’re an engineer, they’re all documented in the project log with the bugs that produced them.',
      ],
    },
    {
      type: 'text',
      newRun: true,
      heading: 'A project log for everything',
      body: [
        'Every meaningful piece of work is written down. Each chunk of change has an ID, a description of what it was for, a note on what was tested before committing, and the reasoning behind the decision. Five known problems in the final build — things I chose not to fix — are documented with what they are, how to work around them, and why I decided to ship anyway.',
        'This isn’t paperwork. It’s what lets anyone else pick up the codebase and understand what happened. And it’s part of the pitch: the argument for internal ownership isn’t just “build the thing.” It’s “build the thing in a way that a team can inherit.”',
      ],
    },
  ],
  ...capturesFor(3),
});

/**
 * 05 — KNOWING WHEN TO STOP · WHAT IT WAS ABOUT.
 *
 * The two closing sections of the source under one sheet, the link out, and the
 * outcome. The link pill goes BEFORE the outcome rather than last, because the
 * outcome is the end of the writing and a pill after it would read as a footer:
 * "the site is live" is the sentence the pill belongs to.
 */
const section05 = (): Section => ({
  title: 'Knowing when to stop · What it was about',
  blocks: [
    letterhead(4, 'Knowing when to stop · What it was about'),
    {
      type: 'text',
      heading: 'Knowing when to stop',
      body: [
        'Not everything got fixed. Two small visual issues in the final scenes resisted three separate rounds of investigation. Each round found real things, and I fixed real things, but the visible symptoms wouldn’t go away completely. At a certain point, the right answer is to write down what’s wrong, document how to work around it, and ship.',
        'Shipping is knowing when the next fix isn’t worth the risk of breaking something that’s already working. This is one of the harder judgment calls in any project, and worth naming.',
      ],
    },
    {
      type: 'text',
      newRun: true,
      heading: 'What this project was really about',
      body: [
        'Making the case in the medium of the case.',
        'I could have written Notion a document arguing they should invest in owning their character system internally. I could have made slides. Neither would have shown them what the outcome could feel like. Neither would have proved that a small, focused team could actually pull it off.',
        'Building the whole thing end-to-end — the character rework, the site, the demos, the visual tuning, the deployment, the honest documentation of what didn’t get fixed — showed it directly. This is what one contractor can do in two weeks. What a real team could ship, with mandate and continuity, would be a lot more.',
        'That’s the case. The site is live. The code is on GitHub. The process is documented.',
      ],
    },
    {
      type: 'linkPill',
      label: 'nosey-demo-pitch.vercel.app/pitch',
      href: 'https://nosey-demo-pitch.vercel.app/pitch',
    },
    {
      type: 'text',
      newRun: true,
      body: [
        'Outcome: Presented to Randy Hunt, then VP of Design at Notion. He responded positively and asked for access to the repo.',
      ],
    },
  ],
  ...capturesFor(4),
});

/** The eight captures a section ships, under the PROJECT ID. */
function capturesFor(index: number): Pick<Section, 'sheets' | 'tails'> {
  return {
    sheets: captures('04', index, 'sheet'),
    tails: captures('04', index, 'tail'),
  };
}

export const nosey: Project = {
  id: '04',
  title: 'NOSEY — A character system for Notion',
  ref: 'PITCH · 2026',
  sections: [section01(), section02(), section03(), section04(), section05()],
};
