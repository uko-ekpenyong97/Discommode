# The reader

`#read-NN` opens an issue as a magazine lying on the sky — the same live weather
as the grid, the detail view and the project view. Everything lives in
`src/reader/`, plus the hover layer in `src/components/CoverAnimLayer.tsx`.
This is the handoff: what the pieces are, the contracts between them, and the
numbers that decided how they work.

> **On the numbers in this file.** Architecture and dials are as shipped.
> Anything reported as a *measurement* names the run that produced it — all of
> them are Chrome at 1728×996 on 2026-09-21, at 1× and 2× where it says so.

## Map

| File | What it is |
| --- | --- |
| `ReaderGate.tsx` | Outermost gate. The app is always mounted; the reader mounts as a fixed layer above it whenever the hash is `#read-…` (or, in dev, `#item-NN?intro`). |
| `ReaderPage.tsx` | The stage: the chrome (the close X, the row), the hash ↔ spread sync, Escape, the dev docks. |
| `FlipBook.tsx` | The static spread (two `<img>` slots), the host the engine builds its turn layers in, and the two hover layers (cover, back). |
| `flipEngine.ts` | Plain TS, no React. Turns, drags, jumps (riffle and cut). Writes CSS variables and inline styles; React hears back once per landed spread. |
| `jump.ts` | The jump dials (`JUMP`) and the riffle's pure schedule, `planRiffle`. |
| `ReaderGround.tsx` | The ground: the app's one sky canvas, claimed when the doorway's TABLE channel arrives, and the two washes over it. See [the ground](#the-ground). |
| `ground.ts` | The ground's dials (`READER_GROUND`). |
| `flipWake.ts` | A turning leaf's splat into the sky's wake. |
| `../chrome/` | The chrome, shared with the detail view: Uko's paper shapes, their colour from the sky, the dials, the probe and sweep. See [Chrome](#chrome). |
| `doorway.ts` | The entrance storyboard as data (`TIMING`, `EASE`), its sampler, and the `--doorway-*` channels. |
| `useDoorwayMotion.ts` | The production driver of the doorway: one linear clock sampling `doorway.ts`. |
| `DoorwayDialKit.tsx` | The dev authoring driver of the same doorway, at `#item-NN?intro`. |
| `ReaderNavDialKit.tsx` | The dev READER NAV dock, at `#read-NN?intro`. |
| `readerNav.ts` | `openReader` / `closeReader`: the opener, and how the reader leaves. |
| `issue-01.ts` | The issue: pages in reading order, `buildSpreads`, the resting cover and back. |
| `coverAnims.ts` | The hover-animation manifest's types and geometry (`faceOf`, `fitCover`, `hitTest`, leave timing). |
| `coverLife.ts` | Page hover and the boil: the COVER LIFE dials, the stepped boil signal, the stagger, and the registry the detail view's paper reads the boil from. |
| `cover-anim-placements.json` | INPUT to `npm run anims`: every animated object's rect, z and face. |
| `pageAnims.ts` | INPUT to `npm run anims` and the reader: where each inside page's animation sits. See [inside-page animations](#inside-page-animations). |
| `pageAnimPlayer.ts` | The inside pages' sprites on the open spread: the plate and one canvas per page, the settle, the preload. |
| `pageAnimGeometry.ts` | The atlas manifest's types and the pure geometry and timing the player draws by. |
| `../dev/pageAnimAlign.ts` | The PAGE ANIM ALIGN panel (dev): registering a sprite on its page. |
| `quotes.json` | The chapter-break quotes: settings, styles, each page's positions and lines in ES and EN. See [chapter-break quotes](#chapter-break-quotes). |
| `quotes.ts` | `quotes.json` typed, and the TRANSLATE dials' store. |
| `quoteMorph.ts` | The translate morph as pure functions: the layout, the letters the languages share, where each is at any moment. |
| `quotePlayer.ts` | The quotes on the open spread: the letter canvas over the plate, the bakes a turn shows, the button, the cursor. |
| `../dev/translateDials.ts` | The TRANSLATE panel (dev). |

## Layers

Bottom to top, while the reader is open:

1. **The app**, suspended (`inert`), exactly as it was — detail view, and the sky
   until the reader takes its canvas.
2. **`.reader-ground`** — the sky (the app's one canvas, once TABLE is 1), and
   black at `readerScrim` over it. Opacity `--doorway-table`. See
   [the ground](#the-ground).
3. **`.reader`** — transparent; holds the book and the chrome.
4. **`.book-stage`**, centred on the viewport, holding **`.book`**: two static page
   slots React renders, and `.book__turn-host`, which React keeps empty and the
   engine fills. `.book *` has `pointer-events: none`; the book element owns the
   drag.
5. **`.book-anim`** — the hover layer, a SIBLING of `.book` sitting on the hero
   rect. There are two, on mirrored rules: the cover's exists only at spread 0
   with nothing turning; the back's only at the last spread with nothing turning.
   At `data-pos="cover"` and `data-pos="back"` the book slides half a page so
   the one occupied slot lands on the hero rect, so both use the same box.
6. **Chrome** — the close X (top-centre) and the row (bottom-centre): paper
   shapes on the sky, no band behind them. They are the detail view's
   components (`src/chrome`), so the two cannot drift; `ReaderPage.css` only
   adds the doorway's gating. See [Chrome](#chrome).

A **turn layer** (`.book__turn`) is what the engine puts in the host for the
length of a turn: the revealed page, the 28-strip curl, and near the end a flat
landing plate that crossfades in over the curl. A riffle's turn layer is its own
thing (see [the riffle](#the-riffle)).

## The hash contract

- `#read-NN` opens issue NN at spread 0; `#read-NN/S` at spread S (clamped, bad
  values read as 0); a trailing `?debug` / `?intro` is preserved.
- **The hash mirrors the spread by `replaceState`**, never by assignment: it
  fires neither `hashchange` nor `popstate`, so the reader's own writes never
  bounce back through the listener that follows hand-edited URLs, and no history
  piles up. A riffle across twenty spreads writes twenty hashes and leaves the
  history length unchanged (measured 3 → 3).
- **The mirror writes only while the hash is still the reader's.** Escape during
  a jump lands the jump and closes in one handler; the render that lands it must
  not write `#read-01/21` back over the `#item-01` the close has just set.
- Opening from an item **assigns** `location.hash` (`openReader`): one history
  entry, so browser Back closes the reader. `closeReader` walks that entry back,
  or — opened directly by URL, with nothing to pop — sets `#item-01`.
- A hand-edited hash or back/forward within the reader is followed (the spread
  jumps to it); leaving the `#read-` prefix is ReaderGate's business.

## The doorway

Opening from an item plays a storyboard in which the card stays and the world
changes around it: the detail view's neighbours and chrome clear, the sky
ground arrives (its washes darken the same sky, and the reader takes the sky's
canvas), the cover's contact shadow sets down, the reader's chrome fades
in, and — on the first visit of a session — the cover turns to 01|02. It is five
channels (`clear`, `table`, `settle`, `chrome`, `open`) on one schedule in
`doorway.ts`, sampled by one of two drivers writing the same values: Motion in
production (`useDoorwayMotion`), DialKit in dev (`#item-NN?intro`). The exit is
the same schedule reversed at `EXIT_RATE`.

**Everything the reader draws over the detail view is gated by
`--doorway-chrome`**: invisible through the entrance and the exit, 1 at rest and
for the plain reader. The chrome's own opacity transition is taken off, since a
200ms transition on a value written every frame would trail the storyboard.

**There is one way out.** The close X and Escape both call `exit` in
`ReaderPage`: land any jump in the air, then `requestExit → closeReader`. The
close X is first in the DOM so it is the first thing Tab reaches — this is a
modal. At an identical playhead (table 0.4007) the pill's and Escape's exits
differ in 439 of 1.72M px, all JPEG noise and the live sky (measured with the
old pill, 2026-09-21).

None of the chrome exists while authoring at `#item-NN?intro`; the dock owns that
screen.

## The ground

**The ground is the sky.** The wood is retired: `public/backgrounds/wood.webp`
and `npm run backgrounds` are still in the repo, and nothing loads them. The
magazine now lies on the same live weather as every other view, and it is the
same sky, not a copy: the app has one WebGL2 canvas (`skyStage.ts`), and
`ReaderGround` claims it the way the project view's ground does. Opening the
reader makes no WebGL context and no second shader; the sky it shows is the
grid's, mid-drift, pixel for pixel.

**When it takes the canvas.** A crossfade between two layers that both show the
sky needs the sky in both, and there is one canvas. So the doorway does not
cross-fade the ground in. Through TABLE (200–460ms, the wood's own clip,
untouched) the ground holds nothing and is transparent: under it is the app's
sky, where the canvas has always been, with the washes arriving over it. What the
wood used to cover as it arrived — the detail panel's drop shadow and the
MiniMap — goes at 1 − TABLE instead (`ReaderGate.css`); CLEAR has already taken
the neighbours and the chrome, and the cover lies over the panel. The frame
TABLE reaches 1, only sky is under the ground, and the ground claims the canvas:
the same drawing buffer moving from one parent to another at the same place, so
nothing changes on screen. On the way out, the first frame under 1 hands it back.

Measured (`verify:reader`, `sky`): the claim follows TABLE to the frame both
ways, and the frame at TABLE 0.9999 and the frame at 1 differ in **0** pixels.
Before the panel's shadow went on TABLE it was a 70px halo round the cover that
popped out at the hand-over, up to 12 levels.

The plain reader (direct URL, reduced motion) has no TABLE, so it claims the
canvas at once and its layer cross-fades over the app, which for those 250ms
shows the sky's CSS fallback where the canvas was. That is what the project view
does on every open.

**One wash.** There were two, for the project view's two reasons
([two washes](portfolio-view.md#two-washes-because-there-are-two-questions)):
`readerScrim` over everything, and `readerChromeScrim` (0.75, measured) in two
72px bands the chips' type was held to 4.5:1 against. The chrome is paper
shapes now and carries its own contrast ([Chrome](#chrome)), so the bands and
their dial are gone. `readerScrim` stays:

| dial | shipped | |
| --- | --- | --- |
| `readerScrim` | 0.35 | Black over the whole ground: how far back the sky sits behind the book. **A look.** Defaults to the project view's `groundScrim` (read from it, not copied). |
| `readerBookShadow` | 0.22 | The book's contact shadow at full settle. The wood's was 0.35. |
| `readerFlipSplat` | 0.5 | How hard a turning leaf splats into the sky's wake, × `pageSplat`. 0 is off. |

`ground.ts` is the source of truth; the READER GROUND panel is in the READER NAV
dock (`#read-NN?intro`) and the doorway dock (`#item-NN?intro`), not persisted.

### The chrome over the sky

Until 2026-09-30 the chrome was the detail view's grey chips, and the sky
under them was darkened to hold their type: `readerChromeScrim` 0.75 over two
72px bands, measured against a pure white band (the caption's "SPREAD n / N",
white 0.5 on its chip, was the run that set the floor at 0.72). The chips are
gone, and with them the bands: each paper shape is opaque, its glyph sits
inside it, and the glyph is held to 4.5:1 against its own paper whatever the
sky does. See [Chrome](#chrome) for the model and the sweep that checks it.

### The book's shadow

On the wood the shadow was 0.35. On the sky under a 0.35 scrim that reads as a
dark halo, so it ships at 0.22. **On bright conditions it nearly disappears**
(fog and cloudy noon: a faint darkening a few px wide at the page edge) and at
night it cannot be seen at all. It never looks wrong — no halo, no dirty band —
it just stops being a shadow the eye finds; the page separates from the sky by
its own colour. That is the honest reading, and `readerBookShadow` is the dial.

### The flip moves the air

Every ordinary turn a person makes (Prev / Next, arrows, a drag, its commit or
cancel) and every leaf of a riffle splats its free edge — top, middle and bottom
of the page — into the sky's wake at the speed it crosses the screen
(`flipWake.ts`, keyed per leaf). The book hides the middle; what reads is the
air pushed past its top, bottom and outer edges. The doorway's own cover turn is
not included: it already splats the cover's edge from `useDoorwayMotion`, at the
strength it was tuned with. One flip at dusk leaves a single soft swirl beside
the book; a riffle, seventeen leaves at the speed cap, drags the horizon up in
plumes either side. `verify:sky` section 6 checks that each wakes the field on
its own, and `verify:reader` that at `readerFlipSplat` 0 a flip does not.

### The budget

Sky + fluid + a page flip ≤ 8ms a frame, and the flip's 60fps. Measured by
`verify:reader` (`sky`), fog noon (the sky's worst condition), 1728×996, with
the flip's wake keeping the fluid awake: the **main thread's work per frame**
(from the frame's first rAF callback to the first task after it — the flip's JS,
style, layout, paint and commit, and the sky's per-frame JS), plus the **sky's
GPU frame** with the fluid awake (its own benchmark, median p95 of three). The
two are added, which over-counts: they run in parallel.

| 2026-09-28, M1 Max | flip main p95 | sky GPU p95 | sum | riffle main p95 | riffle sum |
| --- | --- | --- | --- | --- | --- |
| 1× | 3.9–4.1 | 1.1–1.6 | **5.1–5.5** | 6.1–6.5 | 7.2–7.8 |
| 2× | 4.1–4.4 | 2.75–3.1 | **6.95–7.5** | 6.2–7.1 | 9.2–10.7 |

The flip is inside 8ms at both. **The riffle is not, at 2×, and was not before
this change**: its main thread alone is ~6.3ms at p95 on `main` too, and `main`
was already rendering the sky every frame under the wood (covered, not stopped),
so the same sum there is ~9.2. What this change adds is the fluid being awake
(+0.3ms GPU at 2×) and ~0.2ms of main thread. It is reported, not asserted. No
frame over 20ms through five flips and a 3→20 riffle at either DPR.

## Chrome

The reader's buttons, and the detail view's, are **hand-cut paper shapes that
take their colour from the sky**. The design is Uko's Figma frame "readerview"
(Discommode-Website, node 6:2); the outlines are his SVG exports, used as
drawn. Code is in `src/chrome/`, shared by both views
([docs/detail-paper.md, Chrome](detail-paper.md#chrome) has the detail view's
row).

> **On the numbers here.** The sizes are the frame's, as the brief gives them
> (the Figma file itself was not reachable from this session: no file key in
> the repo). Measurements are `scripts/sky-contrast.mjs` and captures of the
> dev build, headless Chrome on an Apple M1 Max, 2026-09-30.

Captures in `docs/chrome/`, 1440×900 @2x, a clear sky, re-shot 2026-09-30
after the second cut: `reader-noon`, `reader-dusk`, `reader-night` (the "07 |
08" spread) and the detail view's three; `reader-hover` and `detail-hover` (the
row at rest over the row with one shape hovered, at dusk); `pills` (the three
pill widths — 131, "Read issue" 158, "Open project" 174 at their natural size;
125, 151 and 166 in the capture, where the fit had the chrome at ×0.957).
They predate the close X and [the book yielding to the
chrome](#the-book-yields-to-the-chrome) (2026-10-01): the top shape in them is the
old back ‹, and at 1440×900 the book is larger and the chrome smaller than now.

### The shapes

Five floating shapes in a row, bottom-centre, and one at the top — no band
behind any of them:

| | shape | size (the base) | action |
| --- | --- | --- | --- |
| top | close ✕ | 58×58 | the way out (Escape), "Close" |
| row | cover-jump (book) | 58×58 | the riffle to spread 0 (Home) |
| | ‹ prev | 46×46 | Prev (←) |
| | page pill "07 \| 08" | 131×46 | — (the printed page numbers of the open pages; "Cover", "Back" closed) |
| | next › | 46×46 | Next (→) |
| | back-cover-jump (book) | 58×58 | the riffle to the last spread (End) |

The row's shapes are 26 apart (`chromeGap`), on one centre line; its bottom
edge, and the top shape's top edge, are 35 from the viewport's
(`chromeMargin`). All of it scales with `chromeScale`. The band it sits in is
reserved before the book is sized, so the book gives way to it, not the other
way round ([the book yields to the chrome](#the-book-yields-to-the-chrome)).

**Each shape is its outline, not a redraw.** An export is a BASE (a circle, or
the pill's rounded rect) plus a scalloped EDGE around it (an outlined stroke),
both Figma grey, and the glyph in white on top. The site uses the paper as one
CSS mask and the glyph as a second, over colours that come from the sky. The
base is the size the frame gives and the layout box; the edge overhangs it by
3–4 units, as in the file.

**The close X** is Uko's `escape.svg` (2026-10-01), used as drawn: a 58 circle
like the book icons, its own scalloped edge and an ✕ glyph. It replaced the
back shape, which had no export of its own (it was the prev shape with its
paper turned over). It is labelled "Close" in both views and does what the back
shape did: Escape and the same exits.

**The pill's text is live**: Bowlby One 15px (`public/fonts/bowlby-one-latin-400.woff2`,
fontsource 5.3.0, OFL — `BowlbyOne-OFL.txt` beside it), two digits either
side of the file's own hairline (the thin wobbly vertical, kept from the
export as the pill's ink), 18 units off it, centred on the capitals
(`text-box: trim-both cap alphabetic`) as the frame has them.

**The reader's pill reads the magazine's own page numbers** — not the
spread's index (`spreadFolios` in `issue-01.ts`). The front cover is not a
page of the magazine and neither is the back, so the first page after the
cover is 01, and every inside page counts whether or not a folio is printed
on it (Issue 01's 01 and 02 carry none; 07 carries "07" at its inner edge).
The numbers come from the page list, by position among the inside pages —
no offset is written down anywhere. A spread with two inside pages open
reads "07 | 08"; with one, that one alone ("03"), at either end; the closed
book reads "Cover" or "Back" in the same type at the same 131. Issue 01
opens from its cover onto 01 | 02, so on it the lone-page case never
arises; `issue-01.test.ts` holds it on an issue where it does. A screen
reader hears "Pages 7 and 8", "The cover", "The back cover".

### The assets pipeline

```
npm run chrome     # ~/Discommode-pages/ui/reader-bar/*.svg → public/ui/chrome/, src/chrome/shapes.json
```

`scripts/make-chrome.mjs`. The sources stay outside the repo, like the pages.
It does not redraw or recolour anything: it sorts each export's elements by
the fill Figma gave them — grey is paper, white is ink — and writes each set to
its own file with the export's viewBox, so the two masks stay registered. What
it does change: numbers are rounded to 2 decimals (0.01 of a Figma px);
`preserveAspectRatio="none"` goes on the root (so the pill can stretch —
at the viewBox's own ratio it is the same picture); and the pill's two
numbers are dropped (they are live text). The manifest records each shape's
viewBox and base box. Byte-stable: a re-run on unchanged sources writes
identical files. Six exports, 302 KB, ship as 220 KB, 62 KB gzipped (each
file on its own, 2026-10-01).

**Re-exported 2026-09-30.** Uko's second cut of the shapes changed three
glyphs and no outline: `cover-ink`, `back-cover-ink` and `prev-ink` (a bolder
arrow, a narrower book). Every paper file, `next` and `pill` came out
byte-identical, and the manifest did not move; every export still splits
cleanly into paper and ink by fill. **The new `back-cover.svg` is
byte-identical to `cover.svg`**, so the two ends of the row now carry the same
book (the first cut's back-cover book had its spine on the other side). The
pipeline ships what it is given.

**The close X, 2026-10-01.** `escape.svg` is new: a 58 circle with its own
scalloped edge (not the book icons' — its paper differs from both), the ✕ in
white. It split cleanly; the run wrote `escape-paper.svg`, `escape-ink.svg`
and one manifest entry, and every other file came out byte-identical.

### The pills: the middle stretched, not generated

The detail view needs pills of other widths ("Read issue", "Open project"),
and the brief offered two ways: 9-slice the pill's SVG, or generate the
scalloped edge procedurally with a `chromeEdgeWobble` dial. **It is the
stretch** (`PillFace` in `Paper.tsx`). The pill's two round ends — half its
height either side of the straight run — are drawn exactly as exported, and
only the run between them is stretched: three masks of the one SVG, the middle
one scaled `137 / 85` of its own width and aligned so the run starts at its
left edge, 1px into each cap so no half-covered seam shows. Pure CSS: the pill
follows its label's width with nothing measured.

Why: every edge on screen stays one Uko cut. At 131 it IS the export,
unstretched, and the numbers pills are 131. The cost is that the run's wobble
stretches with the pill — 1.3× on "Read issue" (158 wide), 1.5× on "Open
project" (174) — gentler waves along the top and bottom than at the ends.
Past about 2× it would start to read as stretched; nothing on the site is. A
procedural edge would make any width, and would not be his.

### Colour: the sky, made paper

`chromeColor.ts`, pure, with a unit test (`chromeColor.test.ts`).

1. **The sky under each shape.** About twice a second (`chromeSampleMs` 500)
   `useSkyChrome` asks the sky engine for the MEAN colour of the live canvas
   inside each shape's base box (`SkyEngine.readMeans`) — **the sky without
   its wake**: the weather, not the air a page turn or the pointer stirs. At
   the next frame the rects are drawn with the wake off, scissored, copied
   into a pixel buffer, and the frame is drawn over them; a fence is set, and
   the bytes are fetched once the GPU has passed it, a frame or two later: **no
   per-frame readback and no stall**. Where the shapes are is measured only
   when it can have changed (the set of shapes, a resize, a dial), never per
   sample: a `getBoundingClientRect` mid-riffle would force a layout the flip
   engine has just dirtied. With no WebGL2, and before the first
   read-back lands, the colour comes from the palette and cloud cover instead
   (`skyFallbackColorAt`: the same colours the CSS fallback paints).
2. **Paper.** The sky's HSL hue and saturation (× `chromeFillSaturation`), at
   lightness `chromeFillLightness`: 0.22 ships, ink-dark paper cut from the
   sky; ~0.92 is the paper-white direction.
3. **Ink.** Whichever of white and the site's ink-black (`#14120f`) reads harder
   on that paper, mixed `chromeInkMix` (0.12) of the way toward the paper's hue
   at the ink's own lightness, so a little of the sky gets into the glyphs.
4. **The sky step.** If the paper's lightness is within `chromeSkyStep`
   (0.08) of the sky's own under the shape, the paper is pushed out of it —
   darker under a dark sky (lighter where there is no room under it), lighter
   under a light one — so its cut edge never melts into the sky. Then the ink
   is chosen for the paper that will actually be painted.
5. **The clamp.** If a glyph would be under 4.5:1 on its paper, the paper's
   lightness is moved away from the ink, 0.005 at a time, until it is not. It
   is reported: the probe and the sweep print every one. It runs last and
   wins: a legible glyph comes before a crisp edge.
6. **The cross-fade.** A shape whose paint changes by 3 levels or more on any
   channel (the wake and the twinkle move the mean by a level or two all the
   time) eases to the new one over `chromeColorEase` (600ms), writing a
   variable only on the frames its rounded value changes, held to the bar on the way (an ink flipping from
   white to black crosses grey on grey, so the mixture's paper is clamped
   too). A snap under reduced motion.

Each shape is painted from the sky under ITSELF, so the chrome carries the
sky's own gradient: at a clear dusk the row runs from a deeper amber on the
left to a lighter one toward the sun, and the close X at the top is violet.

**What the sky decides is which paper, not whether the glyph reads.** The paper
is opaque and the glyph is inside it, so contrast is fill against ink and the
sky is not in it. That is why the band scrims could go.

### Contrast

`node scripts/sky-contrast.mjs` (with the dev server; `--chrome-only` skips the
letterhead) opens `#read-01/6` and `#item-01` at both signed-off viewports @2x,
and for every shape on screen prints, over each of the twenty-four states, the
glyph's ratio on the paper the chrome would make there — the shape's mean sky
read out of the back buffer (`__chromeProbe`) — with a `*` and a line for every
clamp. Then the whole day, the letterhead's way: every condition × every 5
minutes × two moons, at rest and through a swipe along each chrome line and a
diagonal through both, the wake's dials at their maxima, each shape's sky
reduced to its mean on the GPU (`sweepMeans`, `createRectMeans`). `--fill L`
measures at another `chromeFillLightness`, which is how to check a tuned value
before it is pasted. Exits non-zero under 4.5:1.

| 2026-09-30 | 24 states, worst | the sweep (3,456 skies), worst | clamps |
| --- | --- | --- | --- |
| reader, 1728×996 | 7.76 (clear dawn, cover) | **5.21** (clear 06:55, sun 0.14, prev) | 0 |
| reader, 1440×900 | 7.53 (clear dawn, cover) | **5.21** | 0 |
| detail, 1728×996 | 7.61 (clear dawn, prev) | **5.21** | 0 |
| detail, 1440×900 | 7.30 (clear dawn, prev) | **5.21** | 0 |

Re-run 2026-10-01 with the close X (`--chrome-only --sweep`, both views, both
viewports): the same — worst **5.21:1** (clear sunrise, on prev or the cover),
0 clamps anywhere. The X is well clear of the bar: its worst of the 24 states
is 11.42:1 (rain night).

The worst sky is a clear sunrise at the horizon: a golden hue, which at HSL
0.22 is the lightest-reading dark there is. **At the shipped dials nothing
clamps**, anywhere. The clamp is there for the dial:

| `--fill` | worst | clamps, 24 states (per view × viewport) | the sweep |
| --- | --- | --- | --- |
| 0.22 (ships) | 5.21 | 0 | 0 |
| 0.5 | **4.50** | reader 111 and 104 of 144, detail 106 and 107 of 120 | every condition clamps; the worst of every condition is 4.50 |
| 0.92 (paper-white, ink-black) | 13.43 | 0 | 0 |

Mid-lightness paper is where neither ink reaches 4.5 (a grey of luminance
0.18–0.20 is under it against white AND ink-black): there the paper is moved,
never more than 0.03 at 0.5 (0.47–0.52). `chromeColor.test.ts` holds every hue ×
saturation × lightness a sky could give, at lightness 0.05–0.98, ink mix 0–0.5
and saturation 0–1.5, to ≥ 4.5 after the clamp, and the cross-fade through an
ink flip.

**The sky step** (`chromeSkyStep` 0.08), measured the same way, 2026-09-30,
with Uko's fluid dials and the fit: the 24-state tables mark a `+` where it
moved the paper, and the sweep counts it. `--step S` runs at another value
(0 is off).

| | 24 states: steps | sweep: steps / all (sky, shape, sample)s | dusk: steps, closest paper–sky gap | night: steps, closest gap |
| --- | --- | --- | --- | --- |
| reader, 1728×996 | 43 | 324,893 / 1,181,952 | 14,935, 0.078 (clear 19:40, next) | 205,402, 0.078 (clear 02:25, back) |
| reader, 1440×900 | 41 | 337,557 / 1,161,216 | 14,373, 0.078 (partly 19:20, back-cover) | 220,870, 0.078 (clear 00:20, back) |
| detail, 1728×996 | 38 | 255,419 / 984,960 | 12,531, 0.078 (clear 19:40, next) | 155,530, 0.078 (clear 02:25, back) |
| detail, 1440×900 | 37 | 273,253 / 967,680 | 12,328, 0.078 (clear 19:40, action) | 175,100, 0.078 (clear 00:20, back) |

It is a night-and-dusk thing, as it should be: by day the paper at 0.22 is
far under any sky. Every step it takes is DOWN — the skies it meets are dark,
and the paper goes to sky − 0.08 (0.06–0.21) — so each one leaves the glyph
reading harder, not softer (a stepped clear night reads 17.6:1 where it read
13.5). The closest a painted paper comes to its sky is 0.078, the step less
the rounding of the paper to whole levels. The ink clamp never had to undo a
step, and the worst glyph anywhere is still **5.21:1** with **0 clamps**: the
step never fires on the golden sunrise that sets that number.

Disabled buttons keep their paper and dim their glyph to 0.3; WCAG exempts an
inactive control's text, and they are not measured.

### What it costs

A page flip is the moment that matters: `verify:reader`'s budget holds the
flip's main thread plus the sky's GPU frame to 8ms. The first cut failed it
at 2× — **+1.1ms of main thread at p95** against `main` (5.2–5.4 against
4.1–4.2, the two dev servers measured alternately, 2026-09-30). Bisected with
the section's own instrument, one change at a time:

| | flip main thread p95, 1× |
| --- | --- |
| `main` | 4.2 – 4.3 |
| the first cut | 5.3 – 5.5 |
| … with the masks off / each shape on its own layer | 5.2 – 5.3 (not the masks) |
| … with sampling off | 4.1 – 4.3 |
| … with `chromeColorEase` 0 | 4.3 |
| **as shipped** | **4.0 – 4.5** (sampling off in the same run: 4.0 – 4.2) |

Two things, both in the cross-fade. It wrote the row's paint on the hook's
ROOT too — `.reader` — and these are inherited properties, so every frame
of a fade restyled the whole book. And the flip's own wake stirs the sky
under the row, so reading the sky WITH the wake started a new fade on nearly
every sample: 1,340 colour writes in five flips (300 frames). Now the row's
paint goes on the row, the sky is read without the wake, the shapes' rects
are cached (a `getBoundingClientRect` mid-flip forces the layout the engine
has just dirtied), a repaint needs 3 levels of change, and a variable is only
written when its rounded value changes: ~310 writes in the same five flips.

The riffle, measured the way [the budget](#the-budget) was — interleaved
with `main`, run by run, 15 per DPR alternating 20→0 and 0→20: a frame over
20ms in **1 of 30 on the branch and 5 of 30 on `main`** (first cut,
2026-09-30). The misses are the machine's, as before.

### Interaction

- **Hover** (`chromeHoverLift` 1.04, `chromeHoverTilt` 2°, `chromeHoverMs`
  120): the shape scales and tilts, the sign alternating along the row. Nothing
  else. Under reduced motion, the scale without the tilt or the transition.
- **Press:** the paper steps `chromePressNudge` (0.05) further from the ink —
  so a press only ever adds contrast.
- **Focus:** a round ring outside the paper's overhang, 2px white inside 2px
  ink-black, so it reads on any sky and any paper. Tab order is unchanged.
- **Hit areas:** every control is at least 44×44 whatever `chromeScale` says
  (the face centres in it); at 1 they are 46, 58 and 131×46.

### Dials

CHROME panel — in the READER NAV dock (`#read-NN?intro`), the doorway dock
(`#item-NN?intro`) and the app's dev dock at `/?intro#item-NN`; one id, persisted.
**Copy** writes a paste-ready `CHROME_DEFAULTS` to the clipboard.
`src/chrome/chromeDials.ts` is the source of truth.

| dial | shipped | |
| --- | --- | --- |
| `chromeFillLightness` | 0.22 | the paper's HSL lightness; ~0.92 is paper-white (the ink follows) |
| `chromeFillSaturation` | 1 | × the sky's saturation |
| `chromeInkMix` | 0.12 | how much of the paper's hue gets into the ink |
| `chromeSkyStep` | 0.08 | least HSL lightness between the paper and the sky under it (0–0.3; 0 is off) |
| `chromeColorEase` | 600 | the cross-fade, ms |
| `chromeSampleMs` | 500 | how often the sky under the chrome is read back |
| `chromeHoverLift` | 1.04 | hover scale |
| `chromeHoverTilt` | 2 | hover tilt, degrees |
| `chromeHoverMs` | 120 | hover in and out |
| `chromePressNudge` | 0.05 | press: lightness away from the ink |
| `chromeScale` | 1 | the whole chrome × the frame's sizes (× k on a short screen); the band does not grow with it, so a larger chrome eats the gap to the book |
| `chromeMargin` | 35 | the row's bottom / the top shape's top, px from the edge (× k on a short screen); inside the band, like `chromeScale` |
| `chromeGap` | 26 | between shapes in a row, px |

There is no `chromeEdgeWobble`: the edge is Uko's, not generated (above).

### The book yields to the chrome

**The spacing is the Studio Display's**, where it was signed off, and every
screen keeps it in px. Measured on `main` at 2560×1440 on 2026-10-01, before
this change (the base of each shape; the scallops in brackets):

| 2560×1440 | detail | reader |
| --- | --- | --- |
| margin, top and bottom | 35 | 35 |
| top line | back ‹, 46 | back ‹, 46 |
| top line → hero / book | 48.6 (44.6) | 48.6 (44.6) |
| hero / book → row | 48.6 (44.4) | 36.6 (32.7) |
| row | 46 (arrows, pills) | 58 (book icons) |
| hero → each neighbour | 40.0 = 4.40% of the hero's 908.3 | — |

Each band, margin + line + gap, was **129.6** = 1440 × (1 − 0.82) / 2. The old
rule made the hero 0.82 of ANY viewport's height, so on a shorter screen the
band shrank with it while the chrome did not: at 1728×1117 the band was 100.5,
the gaps 19.5, and the reader's row sat **7.5px** under the book (3.7 to its
scallops); at 900 tall the chrome had to shrink and come toward the edge
(×0.957, margins down to 18.8) to clear it at all.

So the order is turned round (`src/layout/hero.ts`, `computeHeroLayout`; pure,
tested in `hero.test.ts`):

1. **The band is reserved first**: `REF_VH × (1 − detailCardScale) / 2` px
   over the hero and under it, the same on every screen. `detailCardScale` is
   still the dial; it now means the hero's share of the height at 1440 tall.
2. **The hero (10:13) takes the height that is left**, and the open book (two
   pages) must fit the width inside a side gap each side: the band's gap to
   the tallest line, 43.8. No listed screen is narrow enough for that to bind.
3. **Only a short screen shrinks the chrome**: where the hero would get less
   than `HERO_MIN_SHARE` (0.7) of the height, the WHOLE band — margin, chrome,
   gaps, the row's spacing — scales by one `k`, so the proportions stay the
   Studio Display's; `k` stops at the face floor (no face under 44px: ×0.957
   for the 46 arrows), and past it the hero gives way, not the chrome.
   `useChromeFit` writes `k` on both lines (`--chrome-fit`,
   `--chrome-line-margin`).
4. **The neighbours keep the ratio**: their gap is `detailGap` × the hero's
   height over the reference hero's, so 4.46% of the hero's width everywhere
   (4.40% at 0.82).

The detail panel, the grid → detail morph, the doorway and the reader's cover
slot all read the one layout, so none of them can drift from the others.

**The signed-off dials** (baked 2026-10-01, after the change above landed at
0.82): `detailCardScale` **0.81** and `detailSideScale` **1** (the
neighbours at the hero's size); `detailTransitionMs` 450, `detailSideOpacity`
0.85, `detailGap` 40, `detailHoverDim` 0.45, `detailScrimOpacity` 0.2,
`detailChromeFadeMs` 200 and `detailSlideMs` 420 as they were. At 0.81 the
band is **136.8** = 1440 × (1 − 0.81) / 2, and the hero at 2560×1440 is
897.2 × 1166.4.

With the close X at its drawn 58, the top gap is the band less 35 and 58:
**43.8**, the reader row's gap too. The detail row is 46, so its gap reads
55.8. 1440×900 now falls just under the share at k = 1, so its chrome shrinks
a little (×0.987, above the floor). Measured 2026-10-01 at 0.81
(`verify:detail` and `verify:reader`, `layout`):

| | hero (h, share) | k | top gap | row gap, reader / detail | neighbour gap |
| --- | --- | --- | --- | --- | --- |
| 2560×1440 | 1166.4, 0.81 | 1 | 43.8 | 43.8 / 55.8 | 40.0 |
| 1920×1080 | 806.4, 0.75 | 1 | 43.8 | 43.8 / 55.8 | 27.7 |
| 1728×1117 | 843.4, 0.76 | 1 | 43.8 | 43.8 / 55.8 | 28.9 |
| 1512×982 | 708.4, 0.72 | 1 | 43.8 | 43.8 / 55.8 | 24.3 |
| 1440×900 | 630.0, 0.70 | 0.987 | 43.2 | 43.2 / 55.1 | 21.6 |
| 1280×720 | 458.3, 0.64 | 0.957 (floor) | 41.9 | 41.9 / 53.4 | 15.7 |

Captures: `docs/chrome/layout-2560x1440.webp` and `layout-1728x1117.webp`, the
detail view beside the reader at 11 | 12, 1×, the dev overlays hidden.

The cost is the book: 6–13% smaller on the laptop screens than it was. What
went: the old fit's solver (`chromeFit.ts`: shrink until the paper clears by
`AIR` 3px, then give up margin down to `MIN_MARGIN` 8) — at the reserved band
it never had anything to do.

`layout`, in both suites (`scripts/layout-checks.mjs`), checks at those six
viewports — the reader at the cover, 07 | 08 and the back — that the margins,
the chrome's sizes and the gaps are the 2560×1440 numbers to ±2px (× k where
the chrome shrank), that both lines carry that k, that no paper (the scallops
included) is over the hero or book, the open book inside the side gaps, every
face ≥ 44px and every hit area ≥ 44×44, and the neighbours at 4.46%. The
numbers are written into the check, not read back from the code it checks. It
saves a screenshot per viewport to `.context/layout/` (`--shots` for another
place).

### Not done

- **The sky step measures lightness, not contrast.** `chromeSkyStep` keeps the
  paper's HSL lightness a step from the sky's mean under the shape, which is
  what a cut edge reads by; it is not a WCAG figure, and a busy sky (a deck's
  lit tops behind one corner of a shape) can still meet the paper locally.


## Cover and back animations

The illustrated cover carries twenty hand-drawn objects that animate on hover;
the back cover carries one (riddim). Both faces work the same way.

**Per face there are three images.** The *illustrated* face (objects drawn — a
build input only), the *plate* (objects hidden — what the layer draws onto) and
the *rest* (plate + every object's resting frame, flattened — what every surface
that cannot mount the layer shows instead). Rest is the same composite the
layer paints at rest, so the reader's closed book shows `cover-rest.webp` and
`back-rest.webp` — substituted once in `buildSpreads`, so the static slot and
the flip engine's curl faces agree — and the layer mounting over it is meant to
be invisible. It very nearly is: measured at 2× with the layer hidden and shown
over the rest page, the differing pixels are all on outlines, where sprites
placed at fractional offsets antialias differently from the flattened image —
150,830 on the cover (as it already shipped) and 36,117 on the back.

| | cover | back |
| --- | --- | --- |
| illustrated (registered against) | `cover-illustrated.png` | `back.png` |
| plate | `cover-plate.png`, exported | `back-plate.png` if exported, else **derived** |
| rest | `cover-rest.webp` | `back-rest.webp` |
| rects | Figma | **NCC registration** |

**The header line (2026-10-02).** `cover.png`, `cover-plate.png` and `overlay.png`
were re-exported with an "ISSUE 01 / AUG 2026" line at the top (y 104–138);
`cover-plate.png` differs from the old plate nowhere else. `cover-illustrated.png`
(2026-09-09) was **not** re-exported and does not have the line. It is still the
cover's registration input (`optimize-anims.mjs`), but registration only reads
around each object's rect, and the highest of those starts at y 614. A forced
`npm run anims` against it rebuilt all twenty sprites and stills byte for byte,
and the same manifest. Only `cover-rest.webp` moved, and only in the header
band. It would matter if the file were ever shown or used to build a rest face.

**The hover layer** (`CoverAnimLayer`, `face` prop) draws the plate and each
object's still, resolves hover from one `pointermove` on the book against the
hit rects (highest z wins), plays the animated WebP while active, and on leave
runs out the pass in flight before crossfading the still back (`leavePlan`).
With the page hovered every object on the face is active — see
[page hover and the boil](#page-hover-and-the-boil). An
object that rests on its LAST frame (`rest: "last"` — libros, the shelf that
rests full) dissolves in and out rather than cutting, since its still and its
frame 1 differ by design.

Per-object options live beside the frames in `fps.json`: `fps` (default 6),
`mode` (`loop` | `once`), `rest` (`first` | `last`). Editing `fps.json` now counts
as a change to the object; before, it rebuilt nothing.

### Page hover and the boil

`src/reader/coverLife.ts`. The pointer anywhere on a closed face (the cover
at spread 0, the back at the last spread, both at rest) brings the whole face
alive: every object on it loops, and the face itself **boils**, the stepped
wobble of hand-drawn animation.

**All on hover.** Each object is either in the active set or not, and the
active set is every object on the face while the page is hovered
(`allOnHover`), else the one under the pointer. Entering the set plays it (a
`rest: "last"` object uses its enter fade, as before); leaving it runs the
ordinary leave rule. So hovering one object while all are playing does
nothing extra, and with `allOnHover` off the layer is exactly what it was.
"The page" is the hover layer's own box, not the book: at `data-pos="cover"`
the book is two pages wide and its empty half is not the cover.

**The stagger.** When the whole face leaves at once, each object's fade is
held back by `staggerMs(i)`: the golden-ratio sequence over `[0, stagger)`,
so twenty loops that started on one frame fade home on twenty different ones.
Why a hold after the pass, and why it cannot be seen: a pass ends on frame 1,
which is the still, and every object on Issue 01 runs at 6fps, so frame 1 is on
screen for the first 167ms of each pass. A hold under that keeps the loop on
the very image the still fades in over. Only the moment of the fade moves.
A single object leaving (per-object hover) is not held.

**The boil.** One signal per face, stepped at `boilFps`: every 1/boilFps s a
new offset within ±`boilPx` (scaled with the card: `boilPx` is at the hero's
width at 1728×996, `HERO_REF_W` = 628.25px) and a rotation within
±`boilDeg`, held until the next step, no easing. The steps come from a
seeded sequence (mulberry32) in which each step is redrawn until it is at least
0.5 from the last in offset and 0.25 in rotation (both in units of the range),
so no two consecutive steps are ever the same drawing. The AMPLITUDE ramps,
linearly, in over `boilInMs` and out over `boilOutMs`; the steps do not. A
new hover restarts the step clock and continues the sequence where the last
boil stopped.

**Where it is applied.** The layer drives its face's boil in its own rAF, which
runs only while there is a boil. Each change is written, in one task, to the
layer (`translate` / `rotate`, CSS's individual properties, which compose
with and never overwrite a `transform`), to `boilWith` — in the reader, the
book's static slot under the face, whose contact shadow and edge the plate does
not cover — and to the registry, for the detail view's paper plane. Layer and
slot are the same rect and turn about their own centres, so they turn about
one point. At rest the properties are removed outright, and so is everything
when the layer unmounts mid-boil (a turn lifting the cover): rest is the page
exactly as it was.

**Reduced motion:** no boil. The objects still play on hover.

| dial | shipped | |
| --- | --- | --- |
| `allOnHover` | on | page hover plays every object on the face |
| `boilFps` | 6 | boil steps per second — the sprites' own frame rate |
| `boilPx` | 1.5 | largest offset either axis, CSS px at the hero size |
| `boilDeg` | 0.5 | largest rotation either way |
| `boilInMs` | 250 | amplitude ramp in |
| `boilOutMs` | 400 | amplitude ramp out |
| `stagger` | 120 | most extra hold before an object's fade on a page leave |

COVER LIFE panel, in the READER NAV dock at `#read-NN?intro`, the doorway dock
at `#item-NN?intro` and the app's dev dock at `/?intro#item-NN`: one panel id,
persisted, so all three open on the same values. `coverLife.ts` is the source
of truth. `docs/reader-nav/boil-steps.webp` is two consecutive steps of the
closed cover side by side, held at full amplitude, with a 4× crop of the top
corner under each.

### The registration step

Each object's frames are Procreate exports on their own canvas; the pipeline has
to find where, and at what scale, they sit on the face.

**On the cover**, Figma supplies a rect per object, and `cover-register.mjs`
refines around it by maximising pixel agreement between the frame and the
illustrated cover (a score that is stationary in scale, unlike a masked
correlation — see that file for why).

**On the back there are no Figma rects**, so the seed is found:
`scripts/face-register-ncc.mjs` takes frame 1 cropped to its alpha bounds,
flattens it onto the face's own background colour, and searches the whole face
over scale and position by normalized cross-correlation of luma (exhaustive at
1/16, refined at 1/4, 1/2 and full size). It reports the best peak and the best
spatially distinct second peak; a placement is only trusted when **the best is
≥ 0.9 and beats the second by more than 0.05** — otherwise a person supplies
the rect. riddim (2026-09-21):

| | NCC | scale | at |
| --- | --- | --- | --- |
| best | **0.9692** | 0.3615 | 702, 903 → rect 587×796 |
| second | 0.3016 | 0.1100 | 1158, 1628 |

The rect is recorded in the placements file's `back` section with those numbers,
and the ordinary agreement registration refines from it (94.5%, landing on the
seed exactly).

**The derived back plate.** With no `back-plate.png`, the pipeline fills each
back object's padded rect with the face's ground colour — only after checking
that every non-ground pixel in the rect belongs to the drawing. riddim: 0 stray
of 457,761. Anything else in the rect and the run stops and asks for an export.

**One thing to know about riddim at rest:** the back rests on frame 1 (the
object's `rest`), and frame 1's LCD dots and slider are not identical to what
the printed back draws there (frame 1 disagrees with back.png on 10.3% of its
opaque pixels; frames 2 and 3 on 24.9% and 20.3%). So `back-rest.webp` — what the
closed book shows — differs from `back.webp` in about 60k px, all inside the
device. Same trade the cover makes, for the same reason.

## Inside-page animations

Fifteen inside pages carry a hand-drawn Procreate loop, registered over the
illustration the page prints: xolo (03), hippo (04), badges (08), sfmoma (10),
cuffs (11), cubiculo (15), cuqui (17), highlander (18), the three sofas (24
green, 25 yellow, 27 pink), op1-animation (34), ipad (35), halfframe (36) and
carrito (37). xolo, hippo and the last four reuse the cover's frame folders;
nothing is copied. xolo and hippo are drawn larger than their pages: xolo runs
off 03's left and bottom edges, hippo off 04's right edge. They are cut at the
paper ([clipping](#the-runtime)).

**A turn never sees them.** While a page is in the air the strips, the landing
plate and the static slots all carry the full baked page, exactly as before —
`flipEngine.ts` does not know the animations exist. When the book settles, each
animated page shows its PLATE (the page with the drawing hidden) and one 2D
canvas drawing its sprites, over the baked `<img>` in the same static slot. On
the next turn they go before the strips move.

### The assets

```
~/Discommode-pages/01/anim/<id>/<Name>-<n>.png    frames (any canvas; -10 sorts after -9)
~/Discommode-pages/01/anim/<id>/fps.json          optional: fps, mode, rest (as the cover's)
~/Discommode-pages/01/plates/NN.png               the page, its animated drawing hidden

npm run plates    → public/issues/01/plates/NN.webp            (2000×2600, as `npm run pages`)
npm run anims     → public/issues/01/page-anim/<id>.webp        one atlas per animation
                    public/issues/01/page-anim/manifest.json    their geometry (generated)
npm run anims -- --pages-only    the inside pages alone, no cover registration
npm run anims -- --suggest       print a registered row for every animation
```

**Plates.** `npm run plates` is `optimize-pages.mjs --plates`: the same
encoder, quality, size check, up-to-date rule and `--force`, no riffle copies.
The plates must be exactly the pages `pageAnims.ts` animates and `quotes.json`
quotes ([chapter-break quotes](#chapter-break-quotes)); such a page with no
plate, or a plate with neither, stops the run and says which. `--only 05`
converts just the pages named and holds only them to that rule — for a
source folder that already has another branch's plates in it.

**Atlases.** The second phase of `npm run anims` (`scripts/page-anims.mjs`),
after the cover's, which it does not touch: the cover's sprites, stills, rests,
plates and manifest come out byte-identical with it (checked by hash against a
forced build before the change, 2026-10-01). Each animation's frames are
cropped to the box all their drawing covers together, scaled to the row's
placed size on the page × `PAGE_ANIM_SCALE` (1: the baked page's own
resolution, so a sprite is as sharp as the plate around it at any display
size), and laid out in a near-square grid with a 2px transparent gutter, WebP at
the cover's quality 85. Byte-stable: no timestamp, deterministic encode. An
animation rebuilds when a frame or its `fps.json` is newer than its atlas, or
when its row's width moved by a pixel or more.

A folder with no `fps.json` plays at the cover's boil rate, 6fps; the run lists
which did (all thirteen, today). The REST frame — what the page shows under
reduced motion, through the settle's fade, and in the align tool — is the row's
`rest` (the frame the baked page prints; [the manifest](#the-manifest)), else
the first frame with any drawing. It is copied into the build's manifest, and
changing it rewrites the manifest, not the atlas. **badges' first frame is
empty**; it rests on Badges-3 (both badges, as printed) and keeps the blank
frame in its loop.

The run reports what each spread costs (2026-10-01, ×1; spread 2 2026-10-02):

| spread | pages | atlases | plates | decoded atlases | ±1 window |
| --- | --- | --- | --- | --- | --- |
| 2 | 03 \| 04 | 1183 KB | 461 KB | **31.1 MB** | **31.1 MB** |
| 4 | 08 | 569 KB | 372 KB | 14.3 MB | 19.4 MB |
| 5 | 10 | 528 KB | 348 KB | 5.1 MB | 23.3 MB |
| 6 | 11 | 217 KB | 254 KB | 4.0 MB | 9.1 MB |
| 8 | 15 | 513 KB | 199 KB | 7.5 MB | 24.5 MB |
| 9 | 17 \| 18 | 807 KB | 709 KB | 17.0 MB | 24.5 MB |
| 12 | 24 | 285 KB | 401 KB | 2.9 MB | 5.9 MB |
| 13 | 25 | 332 KB | 412 KB | 3.1 MB | 9.3 MB |
| 14 | 27 | 300 KB | 125 KB | 3.3 MB | 6.4 MB |
| 17 | 34 | 458 KB | 148 KB | 4.6 MB | 20.0 MB |
| 18 | 35 \| 36 | 1107 KB | 488 KB | 15.3 MB | **27.8 MB** |
| 19 | 37 | 621 KB | 667 KB | 7.9 MB | 23.2 MB |

6.8 MB of atlases and 4.5 MB of plates in all. Only the open spread and one
either side are kept, and a neighbour is only fetched until the book settles
on it ([the runtime](#the-runtime)), so the "±1 window" column is the most
there can be decoded at once — at worst 31.1 MB, at 03 | 04 (35 | 36 was the
worst before it, at 27.8 MB, after paging through all three) — not what one
settle decodes.

03 | 04 is the heaviest spread because xolo and hippo are big: each atlas is
four cells of a drawing about 1000 px across (2×2 for three frames, one cell
empty), and the cells include the parts of the drawing that hang off the page.
About 40% of xolo's cell and 20% of hippo's is never on the paper. Cropping
atlases to the page would save that, but an atlas would then depend on the
row's x and y as well as its w, so the align tool could no longer move a sprite
without a rebuild. 03 | 04 is also the spread after 01 | 02, where the
doorway's first open lands. So that settle now FETCHES 1.2 MB of atlases and
461 KB of plates. They are not decoded until the book settles on 03 | 04.

What the heaviest spread costs a turn, measured against `main` (where 03 | 04
is a plain spread), interleaved run by run, 2026-10-02, load average about 5:
open on 03 | 04, idle 1.5 s, Next, Prev, 10 runs per DPR. No frame went over 20
ms in any phase, at 1× or 2×, on either side.

### The manifest

`src/reader/pageAnims.ts`, one row per animation, in page px (2000×2600):

```ts
{ page: 25, id: 'sofa-yellow', x: 1093.86, y: 2142.69, w: 612.83, h: 328.54, rotation: 0, flipX: true, rest: 1 }
```

The box is the drawing's (all frames together), turned `rotation` degrees
CLOCKWISE about its centre, mirrored left–right first if `flipX`. Its h is
always w over the drawing's own aspect (the build's manifest carries it); the
align tool keeps it so and `pageAnims.test.ts` holds every row to it within
1px. `rest` (0-based: `Name-3.png` is 2) is the frame the baked page prints;
absent, the first drawn frame. The file has no imports: the build scripts
import it directly.

**How the rows were placed (2026-10-01).** Through the registration the cover
uses (`cover-register.mjs`, wrapped by `scripts/page-anim-register.mjs`):
EVERY frame of the animation is registered against the BAKED page, which
prints the drawing, and the frame that agrees best is both the one the row is
registered on and its `rest`. A match is taken when it agrees ≥ 80% or peaks
by ≥ 15% (the cover's floors) and stays within 25% of the seed's scale and 15%
of its diagonal; otherwise the fallback is the drawing fitted inside the seed
box, centred (no row uses it now). The registration has no rotation or mirror
axis: a rotated or mirrored row is registered at that rotation and mirror (the
frames turned first, the result mapped back). First seeded from Figma's layer
boxes; then registered on every frame seeded from those rows.

| | rest | agree | margin | |
| --- | --- | --- | --- | --- |
| xolo | 0 | 98.2% | 13.4% | 2026-10-02; frames 2 and 3 agree 84.3% and 82.4% |
| hippo | 1 (Hippo-2) | 98.4% | 10.8% | 2026-10-02; frames 1 and 3 agree 86.8% and 83.6% |
| badges | 2 (Badges-3) | 92.6% | 5.5% | both badges, as printed |
| sfmoma | 1 | 96.7% | 11.5% | at its 16.36° |
| cuffs | 1 | **71.9%** | 26.1% | at −58.95°, found by a rotation search (below) |
| cubiculo | 1 | 95.0% | 14.0% | |
| cuqui | 1 | 94.4% | 33.7% | moved 7.6px: frame 2 agrees better than frame 1 did |
| highlander | 0 | 86.5% | 11.6% | |
| sofa-green | 0 | 96.1% | 13.8% | |
| sofa-yellow | 1 | 95.7% | 12.1% | mirrored |
| sofa-pink | 1 | 96.7% | 12.2% | |
| op1-animation | 1 | 93.3% | 21.1% | |
| ipad | 9 (frame 10) | 88.6% | 22.8% | the drawing on its screen |
| halfframe | 0 | 98.0% | 17.6% | |
| carrito | 9 (frame 10) | 91.0% | 31.6% | the full shelves |

**xolo and hippo (2026-10-02)** were seeded from Uko's numbers: xolo from Figma's
"Xolo 2" (2293:1387), x −120, y 1784, 1010×1301 in page-03 px, which is the
layer and not the drawing. Taken as the frame canvas it puts the drawing about
110 px low and 16% small. Two more seeds were tried: that box taken as the
drawing's own, and the bounds the drawing shows on the page (x 0–833, y
1824–2600). All three converge within 0.5 px, at x −77.8, y 1819.18, w 926.19.
That is a scale of 0.459 against 0.385 for the canvas reading, the same kind
of inset the cover's Figma rects have. hippo was seeded from its visible
bounds on 04 (x 1160–2000, y 419–1253). Composited at print resolution from
the shipped atlas (plate PNG + rest cell at the row), the drawing agrees with
the page PNG on 96.0% (xolo) and 96.4% (hippo) of its pixels.

**sofa-yellow is printed mirrored**: its Figma layer is flipped, and Figma
reports a flipped layer's x at its right edge (1722; the drawing runs
~1093–1707) — hence `flipX`.

**cuffs is printed turned**, and Figma's (931, 2234, 1013×1110) is a rotated
layer's origin, not its box. Its row came from a rotation search: frames 1 and
2 at every 0.5° from −50° to −20° (CSS sign, so anticlockwise), seeded on the
drawing's bounds measured from Uko's Figma reference of page 11 (x 1075–1873,
y 1659–2347), widened to −65° when the best sat at the end, then refined in
0.25°, 0.1° and 0.05° steps from the best fit's own box. Best: frame 2 at
**−58.95°, 71.9%** (peak margin 26.1%: pinned), which lands the drawing at x
1073–1871, y 1658–2342 — within 5px of the measured bounds. It cannot agree
better: **the print's chain is whole, and frame 2's is broken** (an open link
at the upper left, which the difference view lights up), and frame 1 is the
closed pair. The row is that best fit; the 90% the brief asked for is not
reached, and the art is the reason.

From now on `npm run anims` only SUGGESTS: for each animation it rebuilds (or
every one with `--suggest`) it prints the registered row beside the file's, and
never writes the file.

### The runtime

`pageAnimPlayer.ts`, plain TS like the engine; FlipBook renders, in each
animated page's static slot, a `.page-anim` wrapper (the plate `<img>`, the
canvas) keyed by page, hidden until the player shows it.

- **The turn.** `setTurning(true)` comes from the engine's `onTurnActive`
  synchronously — not through FlipBook's `turning` render, which can land a
  frame later. The engine reports a turn before the strips first move, and for
  its first two frames the static page IS what shows while the curl
  rasterises, so the wrapper must already be gone.
- **The settle.** When the turn layer comes down (after the landing plate's
  crossfade and the handoff), each animated page decodes its plate, draws every
  sprite on its **rest frame**, and fades its wrapper in over
  `SETTLE_FADE_MS` (80). The loops start when the fade has landed: each page
  has its own origin on the cover clock (`coverTime()`, untouched), so a loop
  always restarts on its rest frame and the fade dissolves the plate and the
  rest frame over the baked art they were registered against — not a sprite
  mid-motion over the printed object.
- **The clock.** `coverTime()` (src/covers/coverClock.ts) stops in a hidden tab
  and is 0 under reduced motion, which holds every page on its rest frame for
  good. Frames step on the boil's clock (`stepsIn`, coverLife.ts). There is no
  boil wobble on inside pages. A canvas is redrawn only when one of its frames
  changes (6 times a second); the rAF loop runs only while a page is shown, and
  not at all under reduced motion.
- **Preload.** On every settle the atlases of the open spread and one either
  side are FETCHED, and only the open spread's are decoded (off the main
  thread, `createImageBitmap` from the blob; the fade waits for them). Each
  spread decodes its own at its own settle — never ahead: a decoded
  neighbour resident at the next lift made that lift drop a frame about twice
  as often as `main` ([running the checks](#running-the-checks)). A spread already
  decoded stays so while it is within ±1. Anything beyond ±1 spread is
  dropped (its bitmap `close()`d).
  Neighbours' plates are fetched, not decoded. A riffle's inner landings preload nothing, and a
  wrapper's plate `<img>` has no `src` until the player shows its page — a
  riffle renders the wrapper of every animated spread it passes, and must not
  fetch a full-size plate for each.
- **Clipping.** One canvas per page, the size of its slot × DPR (≤ 2). The
  slot is the paper: the baked `<img>`, the plate and the canvas all fill the
  same 10:13 box, which has `overflow: hidden`. So a sprite that runs off its
  page (xolo, hippo) is cut at the page's edge. During a turn there is no
  sprite to clip: every turn path (a turn, a drag, a cut, a riffle) calls
  `setTurnActive(true)` before the strips move, and that hides the layer. A
  turning leaf only ever shows the baked page. `verify:reader`'s `pageclip`
  holds both, in pixels ([running the checks](#running-the-checks)).
- The cover's and the back's hover layers, and the closed book, are untouched.

### The align tool

PAGE ANIM ALIGN, in the READER NAV dock at `#read-01?intro`
(`src/dev/pageAnimAlign.ts`). Pick an animation: the book turns to its spread,
and its rest frame (the row's `rest`) is drawn over the **baked** page with
`mix-blend-mode: difference` — where it is off, its edges light up; registered,
it goes dark. `view: plate` shows it over the plate, as it ships. `x`, `y`, `w`
(h follows the drawing's shape) and `rotation` in 0.01 steps, and `flipX`.
Arrow keys nudge 1px, Shift+arrow 10px, while an animation is picked — ahead of
the engine's own listener, so they do not turn the page. **Copy row** puts the
`pageAnims.ts` row on the clipboard (and the console); **Reset to file** drops
the panel's row. What persists (`DIAL_STATE_VERSION` 7): the pick and the view
(the panel), and each animation's EDITED ROW, kept per id in localStorage
(`dialkit:page-anim-align-rows-v7`, so "Reset dials" and a version bump clear
it too): a reload draws it again, and a pick loads it into the sliders, until
**Copy row** (it belongs in the file then) or **Reset to file** clears it. Copy
keeps the row's `rest`. A row whose width changed rebuilds its atlas on the
next `npm run anims`; the reader draws any width meanwhile.

## Chapter-break quotes

Page 05 is a chapter break: a quote in Spanish, its attribution, and — new on
the page, not in the print — a green "ES ⇄ EN" line under it. A click or tap
on the quote translates it, letter by letter: the letters both languages share
slide to their new places on an arc, the rest scramble out and in. Again, and
it goes back. The design is Uko's prototype
(`~/Discommode-pages/01/translate/prototype.html`), ported behaviour for
behaviour; the data is his `quotes.json`. A later chapter break is a new entry
in `quotes.json`'s `pages` and a plate, and nothing else.

### The pieces

| | |
| --- | --- |
| `quotes.json` | The brief's file: `settings` (the morph's dials), `styles` (Space Mono Bold 45.833/68 for the quote, Lora Regular 33/42 for the attribution, the hint), and per page the quote's centre and top, the attribution's right edge and top, the hint's centre and top, the hit area, and every line in ES and EN broken as printed. Page px, 2000×2600. |
| `quoteMorph.ts` | Pure: the layout, the match, the plan, the frame at any ms. `quoteMorph.test.ts`. |
| `quotePlayer.ts` | The layer on the open spread, on the page animations' lifecycle; the bakes; the cursor; the button. |
| `plates/05.webp` | The page with the quote removed (`npm run plates -- --only 05`). |
| `public/fonts/space-mono-latin-700.woff2`, `lora-latin-400.woff2` | fontsource 5.3.0, OFL (`SpaceMono-OFL.txt`, `Lora-OFL.txt` beside them). Loaded as `FontFace`s before anything is measured. |

### The layer

FlipBook renders, in the quote page's static slot, a `.quote-layer`: the
plate, ONE canvas, and a `<button>` over the hit area. Everything is drawn on
the canvas — the letters at the slot's size × DPR (≤ 2), the hint with them —
so nothing is laid out in the DOM and nothing can reflow: the fonts are loaded
before the first measurement, and every letter's place is measured once
(`measureText` of the line up to it, so kerning is kept; the baseline at CSS's
half-leading in the line box) and never again.

It shows and hides on exactly the [page animations' rule](#the-runtime): hidden
synchronously from the engine's `onTurnActive` before the strips move, faded in
over 80ms when the book settles. A morph in flight when a turn starts jumps to
its end first.

### The morph

`quoteMorph.ts`, as the prototype has it:

- **Match**, block by block (the quote with the quote, the attribution with the
  attribution): the longest common subsequence of the two languages' letters,
  accent- and case-insensitive ("á" is "a"), so shared letters keep their
  order; then, with `reuseOutOfOrder`, each letter still new takes the nearest
  unused same letter within 650px. Spanish → English: 44 of the 67 English
  letters travel.
- **Move**: on the easing, lifted on an arc of `arcPx` scaled by the distance
  (full at 400px), swapping its accent halfway.
- **Enter / exit**: rise 8px while fading in / out, scrambling through random
  letters (every 55ms; a hash of the letter and the step, so a frame is a pure
  function of time) for the first 70% / after the first 15%.
- **Stagger** by reading order of where a letter ends up (a leaving one, where
  it was): 0.65 its line, 0.35 its x, × `staggerMs`. Exits start at half the
  stagger and take half the duration; entries start 35% in and take 65%.
- **The hint**: "ES" and "EN" in Space Mono Bold, as the prototype's `<b>`;
  the active language at full opacity, the other at 0.45, eased over 300ms
  (the prototype's CSS transition). The **⇄ is drawn**, not set — Space Mono
  has no U+21C4, and a fallback face would differ from machine to machine:
  `swapArrow` (`quoteMorph.ts`) draws a right arrow over a left one in one
  letter's cell, centred on half the cap height, the way Space Mono draws its
  own ↑ and ↓ (straight shafts, flat ends, flat-tipped 45° heads), in #519B66
  at Space Mono Bold's stem (0.126em; Regular's is 0.078em — measured from
  the faces, `arrowStrokeWeight` picks).
- **A click mid-morph** lands it, then starts the next.
- **Reduced motion**: a 300ms crossfade — nothing matched, nothing moves or
  scrambles; the old letters out over the first 180ms, the new in over the last.

### Clicks, drags and the cursor

A press on the book starts a turn at once, so the quote cannot take its clicks
the ordinary way (`.book *` has no pointer events). The engine asks
`tapTarget` at every press that would start a turn; over the quote the player
answers with its toggle, and the engine **holds the turn back**: the press
becomes the ordinary drag once it has moved 6px (`TAP_PX`, the engine's own
tap threshold), and released before that it is the quote's tap — no turn layer
on any frame. Everywhere else, and for the arrow keys, the row and the riffle,
nothing changed.

Over the hit area the cursor is the hint as a tag: "ES ⇄ EN" at 11px, laid
out and drawn by the hint's own code (the same drawn ⇄), in #519B66 on the
page's paper inside a #519B66 edge — on a green fill the green arrow would
not show. Drawn once the fonts are in and set as a CSS `image-set` cursor at
1× and 2×, its hotspot at its centre. Off the quote, the book's own
`grab`. A touch pointer never sets it.

### The button

The hit area is a real `<button>`, reached by Tab after the close X: Enter and
Space toggle (its own click), with the same turn-nothing rule. Its
`aria-label` is the action ("Translate the quote to English" / "Show the quote
in Spanish"); it is described by the quote itself, in a visually hidden span
whose `lang` is the language on the page; and a polite live region, its `lang`
the new language, reads the quote after each toggle.

### What a turn shows: the bakes

A turn must show the page in the language it is in, never the bare plate. The
page animations get that for free — the print IS the rest state. The quote's
English has no print, so the player BAKES the page: the plate with the letters
and the hint drawn on at 2000×2600 by the same code that draws the live layer,
encoded to WebP (q 0.92), once per language, at the page's first settle (the
layer waits for both). `mapSpreads` hands the engine and the static slot the
bake for the page's current language — so the curl's faces, the landing plate,
a riffle's slots and the static `<img>` under the layer all carry it — and the
printed page until there is one. A riffle's fast leaves keep the printed
half-size page in Spanish (it lacks only the hint, for under 150ms); in
English the bake.

On a first arrival the static slot swaps to the bake only once the layer has
faded in over it, so the hint fades in rather than popping.

**The language goes back to Spanish once page 05 is no longer on the open
spread** — at the commit that leaves it, or a riffle's inner landing. Not
under a morph: a slot leaving lands its morph first, and a turn has already
landed it.

### Matching the print

`quotes.json`'s positions came from Figma, and they do not reproduce the
printed page: drawn there, the quote sat **14.85px low and 0.85px right**, the
attribution **24.10px low and 4.10px right** (line pitch, size and widths
exact — a pure offset per block). Each block was registered against
`05.png` (subpixel, least squares on darkness) and the repo's `quotes.json`
carries the registered values: the quote's centre 1000.5 → **999.6** and top
1128 → **1113.05**; the attribution's right 1284 → **1279.95** and top 1387 →
**1362.65**. The hint has no print to register against; it moved up with the
attribution, 1540 → **1515.65**, so the space under the attribution is the
prototype's.

The second difference was weight: Chrome on macOS draws canvas text emboldened
by a device-pixel constant — +8% ink on the quote, +14% on the attribution
against the print at 2000px. `textRendering = 'geometricPrecision'` turns it
off (supersampling only got to +2.6% / +4.9% at 4×).

Measured (`verify:reader`, `quote`, 2026-10-02): page 05 in Spanish without
the hint, drawn by the layer's own code at 2000×2600 over the plate, against
the printed `05.png`:

| line | offset (px) | ink |
| --- | --- | --- |
| quote 1 | 0.00, 0.00 | 99.6% |
| quote 2 | 0.00, −0.10 | 99.5% |
| quote 3 | 0.00, −0.25 | 99.6% |
| attribution 1 | −0.05, −0.35 | 99.4% |
| attribution 2 | 0.10, −0.05 | 99.9% |

Of 5.2M pixels, 7,128 differ by more than 8 levels, 3,251 by 32, 1,016 by 64
and 86 by 128 (the print has 21,415 ink pixels); every one on a glyph's edge
(`.context/quote/print-diff.png`). The residual offsets are the baseline
snapping to whole pixels. On screen, the Spanish layer against the printed
page in the same slot: ink 99.5% at 1×, 99.0% at 2×.

### What it costs

The first settle on page 05 draws and encodes two 2000×2600 pages; no Long
Animation Frame (over 50ms) in it at 2× (two runs). A riffle passing page 05
fetches nothing (the plate and the fonts are fetched only at a settle within a
spread of it). The full `verify:reader` run on this change, 2026-10-02 (load
average 3.7–5.1, the plain-spread baseline missing in 5 of 5), missed three
frame checks: two riffles and the sky section's 2× "60fps", single 33–67ms
frames. Run against the change's base (e6bb66b) INTERLEAVED, `--only
frames,sky --runs 3` three times each, alternating:

| | riffle runs with a frame over 20ms | "60fps over the sky" misses | flip main p95 |
| --- | --- | --- | --- |
| this change | 2 of 36 | 0 of 6 | 4.0–4.2ms |
| base | 6 of 36 | 1 of 6 | 4.1–4.3ms |

The misses are the machine's, as [before](#running-the-checks).

### Dials

TRANSLATE panel, in the READER NAV dock (`#read-NN?intro`), persisted
(`DIAL_STATE_VERSION` 7). `quotes.json`'s `settings` are the source of truth;
**Copy** writes a paste-ready `"settings"` block, **Translate** toggles the
open quote (turning to page 05 if none is open).

| dial | shipped | range |
| --- | --- | --- |
| `durationMs` | 2400 | 400–4000 |
| `staggerMs` | 800 | 0–1500 |
| `arcPx` | 60 | 0–120 |
| `easing` | inOutCubic | also inOutQuint, outBack |
| `reuseOutOfOrder` | on | the nearest same-letter pass |
| `scramble` | on | |
| `showHint` | on | the ES ⇄ EN line (re-bakes) |
| `resetWhenPageLeaves` | on | |

`defaultLang` (es) is read from the file, not dialled.

## Navigation

The row: cover-jump, ‹ prev, the page pill (the printed page numbers of the
open pages, "07 | 08"; "Cover" and "Back" closed), next ›, back-cover-jump
([Chrome](#chrome)). Keys: ←/→ turn, Home/End
jump, Escape leaves. Drag turns (release past t 0.42 commits). Cover and Prev
disable at spread 0, Next and Back cover at the last. The pill is a fixed 131
wide so the buttons never move under the cursor.

**Jumps** — Cover, Back cover, Home, End — are `flipEngine.turnTo(index)`, in one
of two modes (`JUMP.mode`): the riffle, or a cut (the target spread's plates fade
in over 180ms while the static slots fade out under them on an ease-in). While a
jump runs, drag, arrows and Prev/Next are locked out; Escape lands it instantly
and then exits.

### The riffle

Every spread between here and the target turns — no folding — with several
leaves in the air at once and one curve over the whole run. The schedule is a
pure function (`planRiffle` in `jump.ts`); the engine runs it.

1. **Length.** `max(riffleMinMs, riffleMsPer20 · (n / 20)^0.7)` — 4000ms for 20
   spreads, sub-linear either side, never under 900ms.
2. **Lift times** are the run curve's inverse sampled evenly (`riffleCurve`,
   default `cubic-bezier(0.65, 0, 0.35, 1)`): the curve says what share of the
   leaves should be up by each moment, so the riffle gathers speed out of the
   first leaf and slows into the last.
3. **Each inner leaf lasts exactly long enough to have turned `riffleOverlap`
   of its travel** (under its own gentle in-out) as the next one lifts, clamped
   so it has landed before the leaf `riffleMaxInAir` places behind lifts, and
   before the leaf after it lands — landing order is lift order.
4. **The last leaf** follows the same rule as if one more leaf were due, never
   under 320ms, on an ease-out; it lands through the ordinary landing plate and
   handoff, so the book comes to rest exactly as after a Prev/Next.

20→0 with the shipped dials: first leaf 925ms, the middle 107–143ms each, the
last two 1283ms each, landing 600ms apart; at most 3 up at once. (4000ms is
Uko's tuning from the dock; the first cut shipped 1600.)
`docs/reader-nav/riffle-20-0.png` is every 4th frame of a 20→0 riffle at 60Hz,
from the probe below — captured at the earlier 1600ms, so it shows the same
choreography at 2.5× the speed.

**How the engine runs it.** The riffle has its own turn layer and one rAF
clock: two page slots (`near`, under the stack still to lift, and `far`, the top
of the landed stack) and one strip chain per leaf in the air, from a pool. Each
chain carries its own `--tt` / `--td` / `--shade` on its root rather than on the
book. Inner landings tell React the spread, so the caption and the hash count
along with the pages.

Three decisions, each measured (2026-09-21, 20→0 and 0→20):

- **Each leaf is in its own flat box with the book's perspective**
  (`.flip-leaf`), and front-to-back order is set by z-index by the physical rule
  — the leaf standing more upright (larger sin of its chain angle) is higher off
  the table. With every chain in the book's one 3D context, Chrome's depth sort
  drew the lower leaf on top over 2,499 (1×) / 13,075 (2×) overlap pixels on
  20→0; wrapped, 55 / 0, all on the shared hinge.
- **Leaves too fast to see use half-resolution pages** (`riffle/NN.webp`,
  1000px, from `npm run pages`): any leaf scheduled under
  `riffleHalfResBelowMs` (150ms). On 20→0 that is the middle nine (107–143ms);
  the first five and last six leaves (169ms up to 1283ms), and the page the book
  lands on, are full size, so nothing the eye follows is soft. Full
  size throughout dropped 1–6 frames of 33–50ms per run, all paint (none with the
  leaves painted flat colours).
- **Pages are decoded ahead**: the first six leaves' before the clock starts,
  then six ahead of each lift — and the chains the riffle will need are built in
  that same wait, not as leaves lift.

**What full size on the slow leaves costs.** Measured with `npm run
verify:reader` (2026-09-21). At the first cut's 1600ms, 10 runs each: 20→0 at
1× and 2× and 0→20 at 1× each dropped a frame in 1–2 of 10 runs (a single 33 or
50ms frame), 0→20 at 2× in none — the misses at the last leaf lifting two
full-size pages while the full-size penultimate leaf was still in the air. At
the shipped 4000ms, 5 runs each: 19 of 20 never went over 16.8ms; the one miss
was a single 33ms frame on 2× 20→0 — with eleven of the twenty leaves full size
now rather than five, because the longer run is also a slower one. For scale,
an ordinary Next from the cover dropped a frame in 3 of 5 runs at 1× and 0 of 5
at 2× in that session. The threshold is a dial; this is the trade it sets.

Z-order at 4000ms: 54 / 28 (1×) and 158 / 73 (2×) wrong-order pixels out of
3.9–15.9M overlap pixels over 180 pairs per run, all on the shared hinge.

**The dev probe.** In dev, `window.__flip` is the engine and `__flip.probe`
holds a running riffle at any ms (`hold(ms)`, `hold(null)` resumes), paints its
leaves flat hues (`colours(true)`), and reports each leaf's phase, t, chain
angle and z. The z-order check renders each overlapping pair alone and together
and counts the pixels where the lower leaf shows.

### Dials

READER NAV dock at `#read-NN?intro`; `jump.ts` is the source of truth.

| dial | shipped | |
| --- | --- | --- |
| `riffleMsPer20` | 4000 | run length for a 20-spread jump (Uko's tuning) |
| `riffleMinMs` | 900 | floor on the run length |
| `riffleOverlap` | 0.45 | how far a leaf has turned when the next lifts |
| `riffleMaxInAir` | 3 | most leaves up at once |
| `riffleCurve` | easeInOutCubic | also easeInOutSine, easeInOutQuint, linear |
| `riffleHalfResBelowMs` | 150 | leaves scheduled faster than this use the 1000px pages |
| `jumpMode` | riffle | or cut |

## The pages pipeline

```
npm run pages              # ~/Discommode-pages/<issue>/*.png → public/issues/<issue>/*.webp
npm run pages -- --force
npm run anims              # frame stacks → animations, stills, plates, rests, manifest
npm run anims -- --only libros
npm run plates             # ~/Discommode-pages/<issue>/plates/NN.png → public/issues/<issue>/plates/NN.webp
npm run plates -- --only 05
```

`npm run anims` also builds the inside pages' atlases, after the cover's
objects ([inside-page animations](#inside-page-animations)).

Sources live **outside the repo**, in `~/Discommode-pages/<issue>/`: gitignored
files inside a checkout are invisible to every git safety net. Only WebPs are
committed. Every page must be 2000×2600; the script warns on anything else.

**`npm run pages` converts nothing in a fresh worktree.** It skips a page whose
WebP is newer than its PNG, and a checkout stamps every committed WebP with the
checkout time. Use `--force` there: the encoder is deterministic (verified —
unchanged sources re-encode byte for byte), so only real changes show in git. A
re-export with identical pixels does not show at all. The same run writes each
numbered page's half-resolution riffle copy, on the same up-to-date rule.

`npm run anims` rebuilds an object when any of its frames — or its `fps.json` —
is newer than its output, and a face's plate and rest only when one of that
face's objects was rebuilt. So `--only libros` moves libros' animation and its
manifest entry and nothing else. QC sheets land beside the sources
(`anim/contact-sheet.png`, `anim/contact-sheet-back.png`): the artwork on a grey
wash, with every pixel of the registered still that disagrees with the face in
magenta.

## Running the checks

```
npm test && npx tsc -b && npm run lint
npm run dev                  # in another shell
npm run verify:reader        # --url <origin>, --runs N (default 5), --only frames,zorder,nav,folios,layout,exit,hover,life,sky,pageanims,pageclip,quote
```

`scripts/reader-verify.mjs` is the browser suite. Everything in it is a question
about what Chrome draws or when, which no unit test can answer. It drives the
reader through `window.__flip` (the dev-only engine handle) and its `probe`, and
exits non-zero on any ✗.

- **Riffle frame budget.** Real 20→0 and 0→20 riffles, `--runs` each at 1× and
  2×: no rAF interval over 20ms. An ordinary Next from the cover is measured
  alongside and REPORTED, not asserted — it lifts the same full-size leaf a
  riffle's first leaf does, so it is the baseline a miss should be read against.
- **Riffle landing.** After every one of those: hash, caption, `data-pos` and
  the rendered pages agree, and the turn layer is gone.
- **Riffle z-order, pixel-exact.** The riffle is held at every 60Hz frame with
  its leaves painted flat hues; each pair in the air is rendered alone and
  together, and wherever both cover a pixel the combined frame must show the
  more upright leaf. At most 1 in 10,000 overlap pixels may disagree (hinge
  antialiasing). Coverage is where the leaf-alone render differs from a
  no-leaves render AND carries the leaf's hue — hue alone picks up page artwork
  of the same colour, and a bounding rect of a curled chain inside a
  perspective box does not describe where it paints; both mistakes were made
  once and reported wrong-order pixels that were not there.
- **Navigation.** Prev / Next / arrows / drag / Home / End / Cover / Back cover
  land on one spread index; drag, arrows and Next during a riffle are ignored;
  Escape mid-riffle lands the riffle (the caption reaches 22/22) and then exits.
- **Folios** (`folios`). Every one of the 22 spreads, walked by hash: the
  pill must read the printed folios of the pages actually on screen — read
  off the page files shown (`07.webp` is printed 07), not off the pill's own
  code — "Cover" and "Back" closed, at one width throughout. Named rows for the
  cover, the first open spread, the 07 spread, the last open spread and the
  back.
- **Layout** (`layout`, replacing `chrome`). At 2560×1440, 1920×1080,
  1728×1117, 1512×982, 1440×900 and 1280×720, at the cover, 07 | 08 and the
  back: the margins, the chrome and the gaps to the book are the Studio
  Display's to ±2px (× k where the chrome shrank), no paper (the scallops
  included) over the book, the open book inside the side gaps, every face ≥
  44px and every hit area ≥ 44×44, the top shape "Close". A screenshot per
  viewport to `.context/layout/`
  ([the book yields to the chrome](#the-book-yields-to-the-chrome)).
- **Close X vs Escape.** The doorway exit from each, opened from `#item-01`,
  screencast three times over. Every exit must end on `#item-01` with the reader
  unmounted, and the Escape exit must pass through a frame the pill exit also
  shows, to under 0.1% of pixels. Frames are paired by IMAGE, not by the
  `--doorway-*` values logged beside them: a screencast frame can be a vsync
  behind the rAF that logged its channels, and pairing by value once put two
  different moments side by side (31.6% differing) — the kind of failure that
  says nothing about the exits. (Playwright's fake clock does not hold Motion's
  frame loop either, so pairing by time is out.)
- **Hover loops.** libros (cover) and riddim (back) keep changing frames for
  more than three passes while hovered (with the boil dialled to 0, so a
  changing frame is the loop); on leave the animation is still running, and
  the still is back within one pass. And the back's layer exists only at rest
  on the last spread — not at spread 20, not while turning in or out.
- **Cover life** (`life`), the closed cover and the closed back at 1× and 2×.
  At rest nothing is boiled or playing. Hovering the page on a point no hit
  rect covers has every object on the face (20; the back's 1) `playing` within
  200ms. During the boil, sampled 10 times ~110ms apart, the slot's laid-out
  transform (its computed `translate` / `rotate`) is taken as the face's, and
  every sprite's box and the slot's own box must sit where it puts them, to
  ≤ 0.5px. No frame over 20ms while boiling. On leave each object must be home
  within its pass + `stagger` + the 120ms fade (+60ms for timers), and 500ms
  later nothing carries a translate or a rotate. Writes
  `docs/reader-nav/boil-steps.webp`.

  Measured 2026-09-21, identical at 1× and 2×: all 20 cover objects `playing`
  16.6–16.8ms after the pointer reached the page (riddim 16.2–16.3ms); worst
  sprite 0.029px and slot 0.014px from where the slot's transform puts them
  (back: 0.014 / 0.002px), 10/10 samples boiled across 7 steps; worst frame
  16.8ms; slowest object home 1690–1707ms (freewrite's pass is 2338ms), fades
  spread from ~60ms to ~1580ms; nothing moved 500ms after.

- **The sky** (`sky`). Opening from `#item-01` moves the one sky canvas into
  the ground and makes no WebGL context (counted by wrapping `getContext`); the
  canvas is in the app on every frame TABLE is under 1 and in the reader on
  every frame it is 1, and back in the app after the exit. At the doorway dock,
  sky held still, the frame at TABLE 0.9999 and at 1 differ in no pixels. The
  grid's sky alone and the reader's with the book, chrome and washes hidden are
  the same pixels (cloudy noon and clear night, reduced motion). A flip and a
  riffle wake the field; at `readerFlipSplat` 0 a flip does not. And
  [the budget](#the-budget).

- **Inside-page animations** (`pageanims`), spread 17 | 18 at 1× and 2×:
  both sprite canvases draw (ink on each), backed at the DPR, and step while
  open; each loop's first drawn frame is its rest frame on open, after a
  cancelled turn and after a real Prev lands; held mid-turn, both wrappers are
  hidden, no plate is visible on the strips or under them, and the strips and
  static slots carry the baked 17 | 18; on every rAF frame of a real Next and
  Prev, no wrapper is shown while a turn layer is up; turning on to 21 | 22, a
  newly-neighbouring atlas (sofa-green) is fetched at the settle and still not
  decoded 1.5 s later, and on to 23 | 24 it is decoded at that settle; reduced motion holds the rest frame (1 draw). **The frame budget is gated on the machine**: the
  animated spread and a plain one (19 | 20), interleaved run by run, each idle
  1.5 s then a Next and a Prev; asserted only if the plain spread is clean,
  otherwise reported as "the machine is busy". The load average is printed.

  Measured 2026-10-01 (M1 Max, load average 5–8): every check green; the
  budget reported, not asserted — the plain spread's Next missed in every run.
  Split by phase, the animated spread's idle loop and its settle never went
  over 16.8 ms at either DPR; the misses are all in the Next's lift, and with
  the sprite layers removed from the DOM spread 9's Next missed in 8 of 8
  runs at 2× against 7 of 8 with them — the cost is the 18 → 19 leaf, not the
  sprites.

  **What the animations cost the existing budgets.** The `sky` section's
  flips run 3 → 8, onto badges, sfmoma, cuffs and cubiculo, then riffle to 20.
  Interleaved with `main` (2026-10-01), its "60fps over the sky" missed a
  single 33 ms frame in 5 of 6 runs on the first cut against 2 of 6 on `main`.
  Two causes, found by alternating configurations run by run:

  - a riffle rendered a plate `<img>` with its `src` for every animated spread
    it passed, fetching each full-size plate mid-riffle. The plate's `src` is
    now set when its page is shown. After it: 1 of 4 against `main`'s 1 of 4.
  - **the neighbours' decoded atlases** make the FIRST lift off a spread next
    to an animated one drop a frame more often. There is no long main-thread
    task in it (Long Animation Frames: none); the frame drops two frames into
    the lift, where the curl's faces rasterise — raster or GPU work, not
    script. First cut (fetch and decode at the settle): a long frame in the
    first lift in 5 of 12 runs, 2 of 12 with the preload off, 1 of 12 on
    `main`. Deferring the neighbours' decode to idle time 400 ms into a quiet
    settle did not help: pooled over three interleaved runs of that section's
    sequence (3 → 8, then a riffle to 20), 2026-10-01, load average ~6:

    | | first lift | riffle |
    | --- | --- | --- |
    | neighbours decoded after 400 ms, in idle time | 19 of 72 (26%) | 13 of 72 (18%) |
    | **neighbours fetched, never decoded ahead (shipped)** | 5 of 48 (10%) | 5 of 48 (10%) |
    | `main` | 9 of 72 (12.5%) | 9 of 72 (12.5%) |

    It is a decoded atlas being RESIDENT at the lift that costs it, not when
    it was decoded (both finish seconds before). So neighbours are fetched,
    not decoded, and each spread decodes its own at its own settle — the fade
    already waits for it — which brings the lift back to `main`'s rate, for
    a decode at every settle.

  `verify:reader`'s `sky` ≤ 8 ms budget holds at the same levels as `main`
  (flip main thread p95 3.8–4.2 ms on both).

- **Sprites cut at the paper** (`pageclip`), spread 2 (03 | 04) at 1× and 2×,
  on a flat ground. Even pinned, the sky redraws its weather when the DOM
  changes, so it cannot be the control for a pixel diff here. The checks: each
  sprite canvas is exactly its page's paper, in a slot that clips. Both
  drawings reach the edges they run off, so the cut is doing work. At rest,
  hiding the sprites changes no pixel off the paper, and nor does hiding the
  whole layer: pixels the paper only partly covers are counted apart as its
  antialiased edge. Each sprite agrees with the print over the drawing (pixels
  where either differs from the plate) at ≥ 85%. Through Next and Prev both
  ways, a drag and a riffle across the spread, the layer is never shown with a
  leaf up. Held mid-turn (04 and 03 lifting, t 0.3 and 0.7), removing the layer
  changes no pixel at all.

  Measured 2026-10-02: 0 px off the paper at either DPR, 0 px mid-turn, about
  480 turning frames with the layer shown in none. Agreement at 1× / 2× is xolo
  89.7% / 89.1% and hippo 98.4% / 98.0%. The baked page itself agrees 95.2% with
  `03.png` over xolo's drawing at 2×. The difference is all on xolo's thick,
  rough outlines, which antialias differently at this size. The floor was
  checked against a moved sprite: xolo 4 page px off scores 84.1%, 8 px off
  75.8%, and 1% too big 75.4%.
- **The chapter-break quote** (`quote`, `scripts/quote-checks.mjs`), page 05:
  the Spanish layer against the printed page at 2000×2600 — every line
  registered to ≤ 0.5px with its ink within 2%, the differing pixels reported
  and the difference written to `.context/quote/` — and on screen at 1× and
  2× within 4% of the print's ink. A click on the quote translates and turns
  nothing (no turn layer on any frame); the morph ends with every English
  letter where `quotes.json` puts it, measured in the check from the file,
  not read back from the player; the static slot carries the English bake,
  and the layer and the bake agree on screen as closely as the Spanish layer
  and the print do. A click mid-morph lands it and starts the next. A turn
  started mid-morph shows the English bake on the static slot and on the curl
  and never a plate; away and back, Spanish (the arriving leaf too). A click
  off the quote and a drag from it turn the page. The cursor tag over the
  quote and `grab` off it; Enter and Space on the button; a touch tap
  translates with no tag, a tap elsewhere turns; reduced motion draws no
  letter off the two layouts and settles in about 300ms.

The z-order and exit checks photograph the book over the sky now, so both hold
it still first (`__skyPinTime`, `__skyHoldFluid`): two captures must differ by
what the reader did, not by the weather.

A full run takes about fifteen minutes, most of it the z-order check.

**The riffle frame budget is not reliably green on this machine.** On
2026-09-21, with the cover-life change, a full run missed 3 of the 4 riffle
frame checks (single 33–50ms frames in 1–3 of 5 runs each) and a re-run missed
2 of 4. `origin/main` without the change, same machine, same session, missed 3
of 4. The riffle unmounts the hover layers before it lifts, and nothing boils
during one. So these misses are the ones described under [what full size on
the slow leaves costs](#the-riffle), not a new cost.

**Nor is the sky ground (2026-09-28).** The full run on this change missed all
four riffle frame checks (single 33ms frames in 1–3 of 5 runs each), and the
section re-run in alternation with `main` missed 2 and 4 of 4 on the branch
against 2 and 2 on `main`. So the two were run INTERLEAVED, riffle by riffle,
15 per DPR alternating 20→0 and 0→20: a frame over 20ms in **7 of 30 on
`main` and 7 of 30 on the branch**. With `readerFlipSplat` 0 against 0.5, on
the branch: 4 of 24 against 3 of 24. The fluid a riffle wakes costs no frames
that can be told from the machine; the misses are the riffle's own.

**Nor is 03 | 04 (2026-10-02).** The full run on this change missed 3 of the 4
riffle frame checks (single 33 ms frames in 1–3 of 5 runs each). Riffles
interleaved with `main`, 15 per DPR, alternating 20→0 and 0→20: a frame over
20 ms in **2 of 30 on the branch and 5 of 30 on `main`**.
