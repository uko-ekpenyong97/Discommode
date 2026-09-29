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
| `ReaderPage.tsx` | The stage: chrome (back pill, page bar), the hash ↔ spread sync, Escape, the dev docks. |
| `FlipBook.tsx` | The static spread (two `<img>` slots), the host the engine builds its turn layers in, and the two hover layers (cover, back). |
| `flipEngine.ts` | Plain TS, no React. Turns, drags, jumps (riffle and cut). Writes CSS variables and inline styles; React hears back once per landed spread. |
| `jump.ts` | The jump dials (`JUMP`) and the riffle's pure schedule, `planRiffle`. |
| `ReaderGround.tsx` | The ground: the app's one sky canvas, claimed when the doorway's TABLE channel arrives, and the two washes over it. See [the ground](#the-ground). |
| `ground.ts` | The ground's dials (`READER_GROUND`). |
| `flipWake.ts` | A turning leaf's splat into the sky's wake. |
| `chromeFloor.ts`, `chromeContrast.ts` | The chrome over the sky: the arithmetic, and the dev probe and sweep. |
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
2. **`.reader-ground`** — the sky (the app's one canvas, once TABLE is 1), black
   at `readerScrim` over it, and black at `readerChromeScrim` in the chrome's two
   bands. Opacity `--doorway-table`. See [the ground](#the-ground).
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
6. **Chrome** — the back pill (top-centre) and the page bar (bottom-centre).
   They ARE the detail view's (`detail__back`, `detail__bar`, `detail__btn`), so
   the two grammars cannot drift; `ReaderPage.css` only adds what differs.

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

**There is one way out.** The back pill and Escape both call `exit` in
`ReaderPage`: land any jump in the air, then `requestExit → closeReader`. The
pill is first in the DOM so it is the first thing Tab reaches — this is a
modal. At an identical playhead (table 0.4007) the pill's and Escape's exits
differ in 439 of 1.72M px, all JPEG noise and the live sky.

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

**Two washes**, for the project view's two reasons
([two washes](portfolio-view.md#two-washes-because-there-are-two-questions)):

| dial | shipped | |
| --- | --- | --- |
| `readerScrim` | 0.35 | Black over the whole ground: how far back the sky sits behind the book. **A look.** Defaults to the project view's `groundScrim` (read from it, not copied). |
| `readerChromeScrim` | 0.75 | Black over the two 72px bands the back pill and the page bar sit in, flat across the band and faded out over the same height again. **Measured**; floor 0.72. |
| `readerBookShadow` | 0.22 | The book's contact shadow at full settle. The wood's was 0.35. |
| `readerFlipSplat` | 0.5 | How hard a turning leaf splats into the sky's wake, × `pageSplat`. 0 is off. |

`ground.ts` is the source of truth; the READER GROUND panel is in the READER NAV
dock (`#read-NN?intro`) and the doorway dock (`#item-NN?intro`), not persisted.

### The chrome over the sky

The back pill and the page bar are the detail view's chips, and they are held to
**4.5:1** (WCAG AA — it is chrome, not a page of reading) on every condition ×
time. The brightest thing a sky can put under them is a **pure white** band: the
lit top of a noon deck clips to it, and a star at its twinkle peak and the wake
both reach it ([the sweep](sky.md#the-sweep-the-letterhead-under-a-moving-sky)).
So the question is whether the chrome reads over white, under both washes.

The run that decides it is the caption's **"SPREAD n / N"**, white at 0.5 on a
grey 0.4 chip — the dimmest type on the chrome. Over white at `readerScrim`
0.35: 4.43:1 at a chrome wash of 0.70, **4.51 at 0.72**, 4.62 at 0.75. The
buttons (white on the same chip) pass from 0.1 and the pill from 0.
`ground.test.ts` fails under 0.72. If the bands ever have to be lighter, the
lever is the caption's colour (at white 0.72 the floor drops to about 0.3), not
`readerScrim`.

`scripts/sky-contrast.mjs` now walks the reader too (`#read-01/6`, all four
buttons live): the twenty-four states, and the whole-day sweep — 3,456 skies,
both moons, the wake's dials at their maxima, a swipe along each band and a
diagonal through both. 2026-09-28, Apple M1 Max:

| | 24 states, worst | sweep, worst | white band |
| --- | --- | --- | --- |
| 1728×996 @2x | 4.63 (clear dawn) | **4.62** | 4.62 |
| 1440×900 @2x | 4.62 (clear dawn) | **4.62** | 4.62 |

Every condition reaches the white floor; none goes under it. The worst run is
always the bottom band's caption. Disabled buttons (0.35 opacity) are not
measured: WCAG exempts an inactive control's text. The MiniMap is not reader
chrome — it is the app's, under the reader layer, and the reader never shows it.

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

The bar: `|‹ Cover`, `‹ Prev`, `SPREAD n / N · pages`, `Next ›`, `Back cover ›|`.
Keys: ←/→ turn, Home/End jump, Escape leaves. Drag turns (release past t 0.42
commits). Cover and Prev disable at spread 0, Next and Back cover at the last.
The caption chip is a fixed width so the buttons never move under the cursor.

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
- **Pill vs Escape.** The doorway exit from each, opened from `#item-01`,
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
