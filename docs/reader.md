# The reader

`#read-NN` opens an issue as a magazine lying on a wooden table. Everything lives
in `src/reader/`, plus the hover layer in `src/components/CoverAnimLayer.tsx`.
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
| `doorway.ts` | The entrance storyboard as data (`TIMING`, `EASE`), its sampler, and the `--doorway-*` channels. |
| `useDoorwayMotion.ts` | The production driver of the doorway: one linear clock sampling `doorway.ts`. |
| `DoorwayDialKit.tsx` | The dev authoring driver of the same doorway, at `#item-NN?intro`. |
| `ReaderNavDialKit.tsx` | The dev READER NAV dock, at `#read-NN?intro`. |
| `readerNav.ts` | `openReader` / `closeReader`: the opener, and how the reader leaves. |
| `issue-01.ts` | The issue: pages in reading order, `buildSpreads`, the resting cover and back. |
| `coverAnims.ts` | The hover-animation manifest's types and geometry (`faceOf`, `fitCover`, `hitTest`, leave timing). |
| `cover-anim-placements.json` | INPUT to `npm run anims`: every animated object's rect, z and face. |

## Layers

Bottom to top, while the reader is open:

1. **The app**, suspended (`inert`), exactly as it was — WebGL sky, detail view.
2. **`.reader`** — transparent. `::before` is the wood (opacity `--doorway-table`),
   `::after` the vignette over it.
3. **`.book-stage`**, centred on the viewport, holding **`.book`**: two static page
   slots React renders, and `.book__turn-host`, which React keeps empty and the
   engine fills. `.book *` has `pointer-events: none`; the book element owns the
   drag.
4. **`.book-anim`** — the hover layer, a SIBLING of `.book` sitting on the hero
   rect. There are two, on mirrored rules: the cover's exists only at spread 0
   with nothing turning; the back's only at the last spread with nothing turning.
   At `data-pos="cover"` and `data-pos="back"` the book slides half a page so
   the one occupied slot lands on the hero rect, so both use the same box.
5. **Chrome** — the back pill (top-centre) and the page bar (bottom-centre).
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
darkens to wood, the cover's contact shadow sets down, the reader's chrome fades
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
hit rects (highest z wins), plays the animated WebP while hovered, and on leave
runs out the pass in flight before crossfading the still back (`leavePlan`). An
object that rests on its LAST frame (`rest: "last"` — libros, the shelf that
rests full) dissolves in and out rather than cutting, since its still and its
frame 1 differ by design.

Per-object options live beside the frames in `fps.json`: `fps` (default 6),
`mode` (`loop` | `once`), `rest` (`first` | `last`). Editing `fps.json` now counts
as a change to the object; before, it rebuilt nothing.

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

1. **Length.** `max(riffleMinMs, riffleMsPer20 · (n / 20)^0.7)` — 1600ms for 20
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

20→0 with the shipped dials: first leaf 370ms, the middle ~43ms each, the last
two 513ms each, landing 240ms apart; at most 3 up at once.
`docs/reader-nav/riffle-20-0.png` is every 4th frame of it at 60Hz, from the
probe below.

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
- **Inner leaves use half-resolution pages** (`riffle/NN.webp`, 1000px, from
  `npm run pages`); the first and last leaves and the final slots are full size.
  Full size throughout dropped 1–6 frames of 33–50ms per run, all paint (none
  with the leaves painted flat colours); half size below a 150ms leaf still
  dropped 3 in 16 runs at the hand-over into the slow tail; 1300px copies
  dropped 2 in 8. First-and-last-only: 0 in 16. The price: the slow
  penultimate leaf is a touch soft at 2× while it moves.
- **Pages are decoded ahead**: the first six leaves' before the clock starts,
  then six ahead of each lift — and the chains the riffle will need are built in
  that same wait, not as leaves lift.

Frame times with all of that in (rAF intervals, real riffles): 20→0 and 0→20,
five runs each at 1× and 2×, then ten more of the worst two cases — 29 of 30
runs never went over 16.8ms. The one miss was a single 33ms frame as the first
leaf lifted off the cover at 2×, and it is not the riffle's: an ordinary Next
from the cover — code untouched here — drops that same frame in 6 of 20 runs.

**The dev probe.** In dev, `window.__flip` is the engine and `__flip.probe`
holds a running riffle at any ms (`hold(ms)`, `hold(null)` resumes), paints its
leaves flat hues (`colours(true)`), and reports each leaf's phase, t, chain
angle and z. The z-order check renders each overlapping pair alone and together
and counts the pixels where the lower leaf shows.

### Dials

READER NAV dock at `#read-NN?intro`; `jump.ts` is the source of truth.

| dial | shipped | |
| --- | --- | --- |
| `riffleMsPer20` | 1600 | run length for a 20-spread jump |
| `riffleMinMs` | 900 | floor on the run length |
| `riffleOverlap` | 0.45 | how far a leaf has turned when the next lifts |
| `riffleMaxInAir` | 3 | most leaves up at once |
| `riffleCurve` | easeInOutCubic | also easeInOutSine, easeInOutQuint, linear |
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
```

The browser checks for this reader were scripts driven through `window.__flip`
and are not yet a committed suite: frame times over real riffles, the z-order
check above, the landing's frame-to-frame diff against an ordinary turn, and a
walk through Prev / Next / arrows / drag / Home / End / Cover / Back cover
asserting caption, hash, `data-pos` and the rendered pages agree at every step.
Making those a `verify:reader` script is the obvious next thing.
