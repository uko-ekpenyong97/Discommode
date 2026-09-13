# The portfolio view

`#view-NN` opens a project over the grid. Everything lives in `src/portfolio/`.
This is the handoff: what the pieces are, what the non-obvious decisions were,
and the two things that are not done.

References: `docs/prototypes/folder-prototype.html` (current model),
`docs/prototypes/notebook-prototype.html` (the model it replaced), and
wildyriftian.com/works for the pile.

## Map

| File | What it is |
| --- | --- |
| `PortfolioGate.tsx` | Outermost gate. Renders `ReaderGate` (which renders `App`) plus the view layer when the hash is `#view-…`. |
| `PortfolioView.tsx` | Scrim + close pill + sheet. Owns the section index and the hash. |
| `Sheet.tsx` | The one scroller. Measures, builds the track, applies a layout every frame. |
| `FolderStack.tsx` | The folders' DOM. No logic beyond hover. |
| `pageTrack.ts` | Pure geometry. The whole model, unit-tested in `pageTrack.test.ts`. |
| `portfolioMotion.ts` | `LOOK` (every dial), the open/close storyboard, the `--pv-*` variables. |
| `usePortfolioMotion.ts` | Production driver for scrim/sheet/pill. |
| `PortfolioDialKit.tsx` | Dev dock (`#view-NN?intro`). |
| `contrastProbe.ts` | Dev-only WCAG probe. Tree-shaken from production — verified. |
| `blocks/` | The content model: one block type per kind of thing a project says. |
| `projects/` | Placeholder content. Replacing it is a data change and nothing else. |

## Anatomy

A project is a set of **folders**, one per section. A folder is a **tab** on top
of a **body**, and — when it is the one you are reading — a full-sheet-width
**page** below. A page has no column: it is the folder's width less one inset
each side, twelve grid columns wide (see [The page](#the-page)).

Folders alternate columns: even index left, odd right, `row = floor(k/2)`.
Three regions top to bottom: the **cabinet** (read, docked from the top), the
**open page**, the **pile** (unread, stacked at the bottom).

### Geometry, and the scale basis

Every folder length in `LOOK` is measured at `referenceSheetPx: 1600` and scaled
by `sheetWidth / 1600` in `Sheet.measure`. The reference is a 2560-wide *page*;
this is a sheet beside a glass column. Scaling literally against the 1920 a 2560
viewport leaves gives a laptop 73px rows and a 36px title in a 50px gap — the
reference's proportions and none of its legibility. 1600 is the width the
proportions are treated as being for.

| Dial | Default | Notes |
| --- | --- | --- |
| `glassColumnVw` | 25 | Left band the sheet never covers. Grid shows through; close pill lives there. |
| `referenceSheetPx` | 1600 | Scale basis for everything below down to `headerTitlePx`. |
| `tabHPx` | 22 | Tab sits 1px *into* the body; that lip is where a left folder's page starts. |
| `tabWPx` | 608 | **Preferred.** Clamped per column — see the clip-path note. |
| `chamferPx` | 40 | 45°, at the tab's far end. |
| `stripHPx` | 40 | The **strip**: the labelled face, from the tab's top. Taller than the tab, so the label rides across the tab and the sliver of body under it. |
| `rowPitchPx` | 56 | Step between rows. Less than the slot a folder paints, which is what makes rows overlap. |
| `splitA` / `splitB` | 50 / 38 | Column split, even / odd rows. Alternating so the cabinet never reads as a table. |
| `titleSizePx` | 28 | Fitted to the strip, not just scaled — see below. |
| `headerTitlePx` | 160 | The page's opening title. |
| `hoverLiftPx` / `dimOpacity` | 12 / 0.1 | |
| `turnDistancePx` | 720 | Scroll spent on one turn. |
| `easeRise` | `linear` | Curve on the rising folder's *position*. Linear is the point — see below. |
| `settleLow` / `settleHigh` | 0.15 / 0.85 | The part of a turn worth finishing when the scroll stops. |
| `settleMs` / `settleIdleMs` | 450 / 120 | How long the settle takes, and how quiet the scroll must be first. |
| `riseDelayMs` / `riseMs` | 500 / 900 | Entrance. |
| `pageAlpha` / `pageBlurPx` / `pageSaturate` | 0.76 / 24 / 1.2 | The glass. |
| `pageInsetPx` | 24 | The page's inset each side — and the strip's text inset. One number, so they line up. Does not scale. |
| `gridGapPx` | 52 | The page grid's gutter. Scales. |
| `textMeasureCh` | 0 | Cap on the body's line length. 0 is off. |
| `headerScale` | 1 | Multiplier on the page's opening title. |
| `lenisLerp` / `wheelMultiplier` | 0.1 / 1 | |
| `sliverClickMs` / `sliverReturn` | 1100 / `top` | Folder click → `positionOf(k)`; `bottom` lands where you left it. |
| `pageSurface` | `frosted` | `solid` for A/B. Forced by `prefers-reduced-transparency` / `prefers-contrast`. |

**Row positions** (`pageTrack.ts`):

```
cabinetTop(tabH, pitch, r) = tabH + r * pitch      // offset by a tab, or row 0's tab is off the sheet
pileTop(VH, pitch, rows, r) = VH - (rows - r) * pitch   // anchored to the bottom, last row lowest
columnOf(k, n, …)        = k's half of its row — or all of it, if k has no partner
pageTop(tabH, strip, k)  = k even ? tabH - 1 : max(tabH - 1 + 6, strip)  // where an open page starts
pageFoot(…, piled)       = where it stops, PER COLUMN — a step, not a line
```

The pile is anchored from the bottom so a row's place does not depend on how
many are left — the rows that stay put when one rises genuinely do not move.

**`pageTop` is per column, and it has to be.** Whatever is beside an open page
in that band must be a folder rather than glass. A LEFT folder is the only one
docked in its row, so its page starts at its own tab's lip and takes the whole
width; when its partner docks later, the partner's strip paints over that band
(higher index, higher z). A RIGHT folder has its partner docked beside it, so
the page starts under the STRIP and the partner fills the other column. The
`+ 6` on the right-hand case is the corner radius: the page must clear the
rounded corner of its own column strip or the outline doubles back.

**`pageFoot` is per column, and it is a step.** The page stops where the pile
starts, and the pile does not start at the same height on both sides: a turn
raises ONE folder, so at any rest one column's pile is a row higher than the
other's. A single bottom edge has to pick one of them and either choice is
wrong — stop at the higher and a row-deep band of backdrop opens under the
lower column; stop at the lower and the page runs out under a folder that is
still piled. So in each column the page runs down to the tab top of the first
folder still piled there, and to the foot of the sheet where a column has none
left. Two columns, so usually one step; a project with an odd folder count can
make it two.

**Piled** means: not docked, and not the one in the air. During a turn the
rising folder is excluded, which is what fills the column it vacates — from the
frame it leaves, not at the end of the turn. The pile a folder stops at while
`k + 1` is rising is the pile `k + 1` will stop at, so `foot[k + 1]` is the only
extra profile the whole turn needs.

**A folder with no partner takes the whole row.** The last folder of an
odd-numbered project has no one beside it, and half a row of nothing at the
foot of the pile is both odd to look at and a hole: the divide moves row by
row, so the band between one row's divide and the next's would have no folder
over it and no page under it. Having a partner is a fact about the project, not
about how far you have read, so the column never moves.

**The title is fitted, not scaled.** Rows this compact have no room for a line
that overflows, so `titleSize = max(12, min(titleSizePx * scale, strip -
STRIP_CHROME))` with `STRIP_CHROME = 8` for the air above and below it. The
number is 9px on the strip (11px in the page's header, where there is room),
fixed rather than scaled — scaled, it would be 6px on a laptop.

## The track

`pageTrack.ts` is pure and has no DOM. One scroll position drives everything.

```
foot[k]       = pageFoot(piled = every folder after k)              // a step, per column
openBody[k]   = min(foot[k].y) - (cabinetTop(rowOf(k)) + pageTop(k))
pageScroll[k] = max(0, contentHeight[k] - openBody[k])
start[k+1] = start[k] + pageScroll[k] + turnDistance
maxPosition = start[n-1] + pageScroll[n-1]
minPosition = -turnDistance
```

`openBody` is measured against the **shallowest** run of the foot, not the
deepest. The content is a rectangle and the column of type straddles the divide,
so a page whose box ran to the deeper column would put half of its last lines
over the backdrop. The glass goes deeper on one side; the words do not. The
folder's SLOT runs to the deepest — the step has to have somewhere to be
painted.

A **turn** always does the same thing: folder `k+1` alone rises from its pile
slot to its cabinet slot, and it **carries its page** the whole way — the page
hangs from the rising strip with its foot pinned to the pile, column by column,
so it grows as the strip climbs and is already the size it will be when the
strip lands. Nothing unfolds at the end and there is nothing to pop. The folder
underneath keeps painting until `p = 1`: it is being covered, not hidden, and at
`p = 1` the cover is complete, so its collapse to a filed slot is invisible. One
folder per turn, so a row fills in two and a half-filled cabinet row is an
ordinary state.

### The rise is linear, and the settle is what makes that safe

`easeRise` defaults to `linear`: the folder is exactly where the scroll put it,
for the whole turn, and Lenis is the only smoothing there is. Curving the
position was a way of making a half-finished turn look deliberate. It is not,
and the honest fix is that a folder never rests half-finished.

**The settle.** When the scroll has been quiet for `settleIdleMs` with a turn
between `settleLow` and `settleHigh`, the track tweens to the nearer end of it —
back to the foot of the page you were reading, or on to the top of the next one
— over `settleMs`, through `lenis.scrollTo`. Outside those bounds it does
nothing: a folder that has barely left, or has all but landed, is better left
alone than twitched. A rewind is a turn run backwards, so it settles the same
way at no extra cost. At exactly half a turn either end is equally near and the
tie goes forward; in practice a scroller quantises to device pixels and never
lands on the tie.

Four things it must not do, and what stops each:

| Must not | What stops it |
| --- | --- |
| Fire while the reader is scrolling | The idle timer is armed from the scroll itself, and Lenis emits every frame while its own lerp runs out — so it cannot fire until the wheel AND the smoothing have finished. `wheel` / `touchmove` / `keydown` arm it too, so a gesture that moves nothing still counts as a hand on the controls. |
| Fire during the entrance | `introRef` owns the position there. |
| Fight a tab click | Lenis carries the `userData` of whatever asked for the scroll; the click tags itself `sliver` and the settle reads the tag. Lenis clears it on landing and replaces it when anything else — the reader's wheel included — takes the scroll over, so the tag cannot stick. |
| Fight the reader afterwards | Lenis replaces a running `scrollTo` with the wheel's own the moment one arrives. Nothing to do. |

`layout(track, y)` returns per folder `{ top, clipHeight, scrollTop, zIndex,
bodyVisible }` plus `activeIndex`, `topIndex`, `turning`, `progress`.
`topIndex` flips the instant a turn starts; `activeIndex` at the half-way point
(it drives the hash, which should commit once).

### Semantic position

The pixel position is meaningless across a rebuild: a folder growing moves every
`start` behind it. `positionAt(track, y) → { section, offset, turn }` and
`resolve(track, pos) → y` are the round trip. **Every rebuild goes through
them**, in the same frame as the height change. Never carry a pixel position.

### The negative-track entrance

The track starts at `-turnDistance`, which is folder 0 still in the pile. The
entrance is a tween running the position from there to 0 — so the rise you see
on the way in is the same rise the wheel gives you later, and scrolling back to
the top re-runs it. A deep link skips it (`#view-02/4` asks for a folder, not
for the opening of a project); so does `prefers-reduced-motion`.

Consequence: **the position is not the scrollTop.** It lives in
`Sheet`'s `positionRef`; the scroller drives it most of the time and the intro
drives it first. A scroller cannot go negative.

### Two half-pixel guards

`SEGMENT_EPSILON = 0.5` is used twice, and both matter:

- at the end of a vertical run, so a smoothed scroll settling on a folder's
  bottom does not flicker into the turn;
- at the end of a **turn**, because a scroller quantises to device pixels and
  `scrollTo(start[k])` can come back a fraction short. Without it a deep link
  reads as "the turn, 99.98% done" and **two folders are open at a resting
  position**.

## The page

A page is **not a column**. It is the folder's own width less `pageInsetPx` each
side, and a twelve-column grid on a `gridGapPx` gutter inside what is left. Text
runs to the right inset; media spans the measure; a `bleed` block escapes both
insets to the folder's edges. The reference is a Notion page set to full width,
and wildyriftian's works list for the rows.

**The inset is shared with the strip.** `pageInsetPx` is also the padding on
`.pv-folder__strip`, so the page's opening number sits at exactly the x the
cabinet's tab labels do and the two draw one line down the sheet. It is the one
folder length that does NOT scale with the sheet, because the labels it lines up
with do not either. (The large title sits at that x too; the strip's own title
is a number's width further in, since the number comes first on one line and
above on the other.)

**The grid is on the RUN, not on the page.** A run is what carries the hairline
and the vertical rhythm; putting the grid one level down leaves both untouched
and gives every block a grid area without a wrapper.

| Block | Span | |
| --- | --- | --- |
| `title`, `caption`, `text` | 12 | Left-aligned, no max-width. `.pv-body` takes `--pv-measure` when `textMeasureCh` is on. |
| `image`, `video`, `rive` | 12 | `bleed: true` → the folder's edges. |
| `twoUp` | 6 + 6 | |
| `row` | 7 + 5 | Text left, media pinned right. The list row. |
| `statGrid` | 4 × 3 | |
| `linkPill` | 12 | Inline inside it. |

A block can override with `span`; `spanOf` in `Blocks.tsx` holds the defaults.

**The composite blocks lay the twelve out again inside themselves** rather than
taking a share of the outer grid. It looks redundant and is not: seven twelfths
of a measure is not seven columns once the eleven gutters are counted, and a
nested grid on the same gutter lands on exactly the outer grid's lines. It also
keeps a two-up one block rather than two, which the reveal and the run's
stagger both depend on.

**`textMeasureCh` is off by default**, so a paragraph runs the full measure —
which at 16px is a long line. The dial is the lever if that reads too long: 90
is the figure to try. It caps the words without reintroducing a column, so the
block still owns its twelve.

## The painting rule

> A folder paints from its own tab down to the BODY of the row in front of it.

Its own pitch plus that row's tab. The row in front covers the overlap, and the
row behind fills the notch beside the front row's tab — which is the difference
between rows that overlap and rows with the backdrop showing between them. The
overlap is what makes a pile of paper look like a pile of paper. The exception
is the folder you are reading: its strip, and its page out to `pageFoot` —
which is a step, because the pile it meets is a step.

So slots in a column now overlap, deliberately, by exactly one tab. The
invariant is no longer "slots tile" but **"a folder paints nothing outside its
slot"**, with z-order (index order) deciding the rest. `assertSlotsTile` in
`Sheet` checks the tab-deep overlap and no more.

Implemented as: `.pv-folder` is `overflow: hidden`, `Sheet` writes its `top`
and `height`. Nothing else.

**Both edges snap to the device pixel grid.** A folder's top is a fraction of a
scaled row pitch, so on a linear rise the strip's title and the page's first
lines re-rasterise at a different subpixel offset every frame and the type
crawls. The height is derived from the snapped top rather than snapped on its
own, or the foot of a page drifts a pixel off the tab it is supposed to meet.
It is `top` that is snapped and not a `translateY`: moving the folder by
transform instead was measured, and the glass survives it, but the text inside a
transformed box loses subpixel antialiasing and every run of type on the sheet
comes back lighter. The height has to be written per frame either way, so there
is no layout saved to pay for that.

**On glass this is correctness, not an optimisation.** `backdrop-filter` samples
whatever is behind the element, so a folder left in the paint order under
another is blurred *into* it and its title ghosts through. At most two pages
ever paint: the one you are reading and the one rising over it.

**The glass that is supposed to be there** is one notch — a tab deep — above the
topmost tab of the cabinet and above each column's topmost tab in the pile. A
tab sticking up out of nothing is what a tab is. Anything else is a seam, and
`pv-verify` masks those rectangles explicitly rather than tolerating a count.

How to check it, on the screen rather than in the maths:
`npm run verify:pv` against `npm run dev`. It repaints every folder in a flat
opaque colour of its own and the scrim in flat green — neither touches layout,
so the track is the track — and then counts pixels: green inside the sheet is a
seam, a folder's blue outside its slot is a smear. Current: 0 and 0, on every
rest and at p = 0.05 / 0.2 / 0.5 / 0.8 / 0.95 of every turn, on a six-folder
project and a seven-folder one, at 1728×996 and 1440×900 — 136 frames.

## The clip-path lesson

A folder's outline — tab, chamfer, body, and the full-width page when open — is
**one** `clip-path` on one element. Two adjacent `backdrop-filter` elements do
not join: each blurs its own backdrop with its own edge clamping and the
junction seams however exactly the tints match.

Three things that cost time:

1. `clip-path: path()` takes SVG path data, which is **unitless**. A `px`
   suffix makes the whole declaration invalid — not an error, just a dropped
   declaration and a full-width rectangle. `pageTrack.test.ts` asserts the path
   contains no units.
2. A **self-crossing** outline is *not* invalid. The browser takes it and clips
   to something nobody asked for, which is harder to spot than nothing
   happening. This is what an unclamped tab did: at 2560 the 38% column and the
   preferred tab width are both 730px, so the chamfer ran past the column edge
   and the path doubled back. `folderClipPath` clamps the tab to leave the
   chamfer's run plus a notch inside its own column.
3. Only the browser can say whether a clip took. `assertSlotsTile` in
   `Sheet.tsx` (dev, one second after arming) reads
   `getComputedStyle(shape).clipPath` and reports which folder was given what.
   A unit test on the string cannot catch a dropped declaration.

## Contrast

`contrastProbe.ts` (dev only) rebuilds the actual backdrop at 1/8 scale — the
sky plus every visible cover at its on-screen rect — puts it through the same
blurs and tints the compositor does, and takes the **worst tenth** of the WCAG
ratios under each run of text. It ignores the text-shadow and the dark pool
behind each block, so a pass is a pass with margin. `window.__pvProbe(override)`
exists in dev for sweeping a hypothetical glass setting.

**The finding: `pageAlpha` is not the lever for small type.** Darkening the
glass from 0.5 to 0.7 moved a 12px caption from 5.29:1 to 5.31:1 — translucent
white ink blends with the very backdrop it is being compared against, so the two
move together. The lever is the **ink's own alpha**.

Current text alphas, all measured:

| Class | Size | Alpha |
| --- | --- | --- |
| `.pv-title` / `.pv-heading` / `.pv-folder__heading` | large | `#fff` |
| `.pv-folder__title` | fitted | 0.92 |
| `.pv-body` | 16px | 0.82 |
| `.pv-linkpill` | 12px | 0.85 |
| `.pv-caption` / `.pv-figcaption` / `.pv-twoup__text` / `.pv-stat__label` | 10–14px | 0.74 |
| `.pv-folder__no` | 9px on the strip, 11px in the header | 0.74 |

Targets: 4.5:1, or **7:1 under 18px**. Worst measured at shipped defaults:
7.9:1 at 1728×996 and 8.0:1 at 1440×900, over the grid on a cold `#view-NN` —
the hardest backdrop, harder than opening from the detail view. Size does not
move a ratio, so shrinking the strip's type cost nothing: `.pv-folder__no` reads
9.8:1 at 9px. Nor did widening the page: a full-measure paragraph crosses more
of the backdrop than a 656px one did, but the probe takes the worst tenth under
each run either way, and `.pv-body` came back at 9.61:1 / 9.43:1 against
9.40:1 / 9.32:1 at the 656px column.
Re-measure after any hue or alpha change — the palette gaining lighter hues is
what pushed `.pv-folder__no` from 0.68 to 0.74 — and after any change to how
wide or how tall a run of text is.

Hues alternate rather than running round the wheel (02: 14/200/42/150/280/330).
At 12% lightness two neighbouring hues are the same colour, and the pile reads
by colour as much as by label.

## The first-open lock, and layout-stable media

The track is derived from **measured** folder heights, so two rules:

1. The scroller stays locked (`data-locked` → `overflow-y: hidden`, plus
   `lenis.stop()`) until fonts are ready and every folder has been through at
   least one `ResizeObserver` callback. A guess you can scroll is a guess that
   throws you onto the wrong folder. Gate opens in ~30–50ms; there is a 1s
   fallback that arms anyway.
2. Every rebuild preserves the semantic position (above).

`pv-verify` proves this rather than asserting it: it opens the view in a cold
context with every `/projects/placeholder/` response held back 1500ms, measures
each page at the moment the track arms, lets the media through and measures
again. Last run: **0 of 22 images decoded when the track armed**, 12 after, and
the six page heights identical to the pixel.

Neither should ever have to do anything, because **every media block reserves
its box from intrinsic dimensions** carried in the block data
(`projects/placeholder-assets.json` is the same table the generator script
writes the files from). A folder's height is identical before and after its
assets load — verified with cache disabled. `contain: layout` on `.pv-block`
stops anything inside one changing the height of anything else.

Dev log `[pv:track]` prints on arm and warns loudly if a rebuild changes the
active folder — that is THE bug this path exists to prevent.

## Lenis

Lenis owns `scrollTop` on the sheet scroller, scoped via its `wrapper`/`content`
options. The grid keeps its own feel. It honours `prefers-reduced-motion` itself
by dropping to 1:1.

- Never write `sc.scrollTop` while Lenis is live — use `lenis.scrollTo(y, {
  immediate: true, force: true })`, and only when the position actually moved
  (an unconditional call kills an in-flight smooth scroll every re-measure).
- Folder clicks use `lenis.scrollTo` with the dial's duration and an explicit
  ease-out; Lenis's default easing is not the dial's.
- A native `scroll` listener runs alongside Lenis's so programmatic writes are
  applied too.

## Pointer targets

`.pv-folder` is `pointer-events: none`. Its element spans the whole sheet
whatever column it is drawn in (the open page needs that width), so as a target
it swallowed every hover and click over its neighbour. `.pv-folder__strip` and
`.pv-folder__content` take pointers; the rest is paint.

Click-out lives on the **scrim**, with no hit-testing: the sheet covers all of
it but the glass column, so the only pointer events the scrim receives are the
ones that landed on glass. A drag (>4px) is not a click.

## The dev dock

`#view-NN?intro`. Panels: **PV STACK**, **PV FOLDERS**, **PV PAGE**, **PV MOTION**,
**PV GLASS**, **PV PILL**, **PV TRACK**, **PV REVEAL**, and **PORTFOLIO**
(Replay Open / Replay Close / Copy motion). The timeline is the open storyboard;
the close is a separate storyboard (sheet leads, scrim trails 100ms) so "Replay
Close" plays it on its own rAF.

**Copy motion** puts a paste-ready snippet on the clipboard for
`TIMING.enter` and `LOOK` in `src/portfolio/portfolioMotion.ts`. That file is
the source of truth; the dock is a preview.

`PV GLASS` carries a contrast readout and a "Re-run contrast probe" action. It
reads "no text on screen" at the timeline's REST playhead, which is correct —
the sheet is parked off the right edge there.

## Not done

1. **Close reversal.** The spec asked for the folders to drop back into the pile
   as the sheet slides out, trailing it by 100ms. They currently leave with the
   sheet, because they are inside it. The entrance machinery (a tween driving
   the track position) is what to reuse: run it from 0 to `minPosition` on
   `requestExit`, 100ms behind the sheet's own slide.
2. **The thumbnail slot.** `.pv-folder__thumbs` renders three empty spans at
   −5° / +6° / −15° above the tab, `display: none`. The geometry around it is
   settled; it needs content and a hover rule.

## Running the checks

```
npm run dev          # in one shell
npm test             # pageTrack, in node
npm run verify:pv    # the same view, in Chrome
```

`scripts/pv-verify.mjs` is the browser suite, and it exists because the unit
tests cover `pageTrack` thoroughly and nothing else, while every bug this view
has had was one only a browser could see. It runs both signed-off viewports
(1728×996, 1440×900), on card 02 (six folders) and card 04 (seven — the odd
count, whose last folder has no partner), and checks:

- the paint pass (above) — seams and smears, as pixel counts, on every rest and
  five points of every turn;
- the page's layout: the header on the tab labels' line, content filling the
  measure from inset to inset, nothing centred, the two-up halves meeting at the
  gutter, a list row's seven and five, a bleed block reaching the folder's edges;
- page heights identical before and after the media lands, with the media held
  back until after the track has armed;
- the rising folder carries a page, and lands with no pop (`Δtop`, `Δheight`
  across the last hair of the turn);
- the rise is linear in `p`, to within the half device pixel snapping is
  allowed to move it;
- the settle: a turn left part done runs to the nearer end and gets there
  promptly, outside the dials nothing moves, a tab click is left alone, and a
  real wheel gesture stopped mid-turn docks;
- rows, strip, title size, and the share of the sheet the open page keeps;
- hover dims the piles and never the page — including a folder that OPENS under
  a resting pointer, which sends no `pointerleave` and used to leave the whole
  pile dimmed behind a page (`apply` sweeps the flag);
- contrast, via `__pvProbe`;
- fps over a scripted wheel scroll (60, vsync-capped, unchanged from `main`);
- deep link, resize, `inert`, Escape, and the reader still opening.

It drives the track through `window.__pv`, a dev-only handle on `Sheet`. `seek`
parks the position and holds it, which is the only way to hold a mid-turn frame
still: the position is not the scrollTop, and Lenis owns the scrollTop. `park`
is the opposite — a real scroll that lets go, so the settle's idle timer counts
exactly as it would after a wheel. `scrolling()` reports Lenis's own state,
because its smoothing runs on for most of a second after the last wheel event
and a check that reads the position before then reads it in flight.
