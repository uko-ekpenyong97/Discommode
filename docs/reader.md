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
| `ReaderPage.tsx` | The stage: the chrome (the back shape, the row), the hash ↔ spread sync, Escape, the dev docks. |
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
6. **Chrome** — the back shape (top-centre) and the row (bottom-centre): paper
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

**There is one way out.** The back shape and Escape both call `exit` in
`ReaderPage`: land any jump in the air, then `requestExit → closeReader`. The
back shape is first in the DOM so it is the first thing Tab reaches — this is a
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

Captures in `docs/chrome/`, 1440×900 @2x, a clear sky: `reader-noon`,
`reader-dusk`, `reader-night` and the detail view's three; `reader-hover` and
`detail-hover` (the row at rest over the row with one shape hovered, at
dusk); `pills` (the three pill widths: 131, "Read issue" 158, "Open project"
174).

### The shapes

Five floating shapes in a row, bottom-centre, and one at the top — no band
behind any of them:

| | shape | size (the base) | action |
| --- | --- | --- | --- |
| top | back ‹ | 46×46 | the way out (Escape) |
| row | cover-jump (book) | 58×58 | the riffle to spread 0 (Home) |
| | ‹ prev | 46×46 | Prev (←) |
| | spread pill "07 \| 22" | 131×46 | — (this spread \| all of them) |
| | next › | 46×46 | Next (→) |
| | back-cover-jump (book) | 58×58 | the riffle to the last spread (End) |

The row's shapes are 26 apart (`chromeGap`), on one centre line; its bottom
edge, and the top shape's top edge, are 35 from the viewport's
(`chromeMargin`). All of it scales with `chromeScale`.

**Each shape is its outline, not a redraw.** An export is a BASE (a circle, or
the pill's rounded rect) plus a scalloped EDGE around it (an outlined stroke),
both Figma grey, and the glyph in white on top. The site uses the paper as one
CSS mask and the glyph as a second, over colours that come from the sky. The
base is the size the frame gives and the layout box; the edge overhangs it by
3–4 units, as in the file.

**The back shape** has no export. It is the prev shape cut again: the same ‹
glyph, with the paper turned top for bottom about the base's centre, so the
top of the screen and the row do not carry the same piece twice.

**The pill's text is live**: Bowlby One 15px (`public/fonts/bowlby-one-latin-400.woff2`,
fontsource 5.3.0, OFL — `BowlbyOne-OFL.txt` beside it), two digits either
side of the file's own hairline (the thin wobbly vertical, kept from the
export as the pill's ink), 18 units off it, centred on the capitals
(`text-box: trim-both cap alphabetic`) as the frame has them.

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
identical files. 296 KB of exports ship as 228 KB, 57 KB gzipped.

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
4. **The clamp.** If a glyph would be under 4.5:1 on its paper, the paper's
   lightness is moved away from the ink, 0.005 at a time, until it is not. It
   is reported: the probe and the sweep print every one.
5. **The cross-fade.** A shape whose paint changes by 3 levels or more on any
   channel (the wake and the twinkle move the mean by a level or two all the
   time) eases to the new one over `chromeColorEase` (600ms), writing a
   variable only on the frames its rounded value changes, held to the bar on the way (an ink flipping from
   white to black crosses grey on grey, so the mixture's paper is clamped
   too). A snap under reduced motion.

Each shape is painted from the sky under ITSELF, so the chrome carries the
sky's own gradient: at a clear dusk the row runs from a deeper amber on the
left to a lighter one toward the sun, and the back shape at the top is violet.

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
(`#item-NN?intro`) and the app's dev dock at `#item-NN`; one id, persisted.
**Copy** writes a paste-ready `CHROME_DEFAULTS` to the clipboard.
`src/chrome/chromeDials.ts` is the source of truth.

| dial | shipped | |
| --- | --- | --- |
| `chromeFillLightness` | 0.22 | the paper's HSL lightness; ~0.92 is paper-white (the ink follows) |
| `chromeFillSaturation` | 1 | × the sky's saturation |
| `chromeInkMix` | 0.12 | how much of the paper's hue gets into the ink |
| `chromeColorEase` | 600 | the cross-fade, ms |
| `chromeSampleMs` | 500 | how often the sky under the chrome is read back |
| `chromeHoverLift` | 1.04 | hover scale |
| `chromeHoverTilt` | 2 | hover tilt, degrees |
| `chromeHoverMs` | 120 | hover in and out |
| `chromePressNudge` | 0.05 | press: lightness away from the ink |
| `chromeScale` | 1 | the whole chrome × the frame's sizes |
| `chromeMargin` | 35 | the row's bottom / the top shape's top, px from the edge |
| `chromeGap` | 26 | between shapes in a row, px |

There is no `chromeEdgeWobble`: the edge is Uko's, not generated (above).

### Not done

- **The row overlaps the book at 1440×900.** The hero (and so the book) is
  `detailCardScale` 0.82 of the viewport's height, which leaves 81px bands at
  900 tall; the row needs 93 (35 + the 58 book icons), so it sits ~12px over
  the pages' bottom edge, plus the scallops' overhang, and the back shape's
  edge touches the top. At 1728×996 the bands are 90: the row overlaps by ~3px
  and the top is clear. The detail view's row is 46 tall and just fits at 900.
  Nothing was changed about the hero: it is the doorway's shared rect and the
  detail view's size. Levers, all dials: `detailCardScale` ≤ 0.78 clears it at
  900; or `chromeMargin` / `chromeScale`; or raising `MIN_BAND` in
  `layout/hero.ts` to the new chrome (it still describes the old 40px chip).
- **Paper against the sky is not measured.** Only glyph against paper is. Where
  the sky under a shape is itself near L 0.22 — a clear dusk's violet zenith
  behind the back shape, a clear night's warm horizon behind the row — the
  paper's cut edge is faint against the sky (the glyph still reads 12–14:1).
  If that should read louder, it wants a dial of its own (a minimum lightness
  step between paper and sky), which the brief did not ask for.

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
at `#item-NN?intro` and the app's dev dock at plain `#item-NN`: one panel id,
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

## Navigation

The row: cover-jump, ‹ prev, the spread pill ("07 | 22": this spread | all of
them), next ›, back-cover-jump ([Chrome](#chrome)). Keys: ←/→ turn, Home/End
jump, Escape leaves. Drag turns (release past t 0.42 commits). Cover and Prev
disable at spread 0, Next and Back cover at the last. The pill is a fixed 131
wide so the buttons never move under the cursor; the pages it used to name
("pages 11 – 12") are read out to a screen reader with the spread.

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
```

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
npm run verify:reader        # --url <origin>, --runs N (default 5), --only frames,zorder,nav,exit,hover,life,sky
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
- **Back shape vs Escape.** The doorway exit from each, opened from `#item-01`,
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
