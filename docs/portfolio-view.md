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
**page** below.

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
| `bodyHPx` | 148 | |
| `tabHPx` | 40 | Tab sits 1px *into* the body, so `stripHeight = tabH - 1 + bodyH`. |
| `tabWPx` | 608 | **Preferred.** Clamped per column — see the clip-path note. |
| `chamferPx` | 40 | 45°, at the tab's far end. |
| `rowPitchPx` | 130 | Step between rows. Less than `stripHeight`, which is what makes rows overlap. |
| `splitA` / `splitB` | 50 / 38 | Column split, even / odd rows. Alternating so the cabinet never reads as a table. |
| `titleSizePx` | 64 | Fitted, not just scaled — see below. |
| `headerTitlePx` | 160 | The page's opening title. |
| `unfoldShare` | 0.3 | Fraction of a turn, at its end, over which the page unfolds. |
| `hoverLiftPx` / `dimOpacity` | 12 / 0.1 | |
| `turnDistancePx` | 720 | Scroll spent on one turn. |
| `easeRise` | `easeOut` | Curves the rising folder's *position*; scroll stays 1:1. |
| `riseDelayMs` / `riseMs` | 500 / 900 | Entrance. |
| `pageAlpha` / `pageBlurPx` / `pageSaturate` | 0.76 / 24 / 1.2 | The glass. |
| `columnPx` | 656 | Centred content column inside a page. |
| `lenisLerp` / `wheelMultiplier` | 0.1 / 1 | |
| `sliverClickMs` / `sliverReturn` | 1100 / `top` | Folder click → `positionOf(k)`; `bottom` lands where you left it. |
| `pageSurface` | `frosted` | `solid` for A/B. Forced by `prefers-reduced-transparency` / `prefers-contrast`. |

**Row positions** (`pageTrack.ts`):

```
cabinetTop(tabH, pitch, r) = tabH + r * pitch      // offset by a tab, or row 0's tab is off the sheet
pileTop(VH, pitch, rows, r) = VH - (rows - r) * pitch   // anchored to the bottom, last row lowest
```

The pile is anchored from the bottom so a row's place does not depend on how
many are left — the rows that stay put when one rises genuinely do not move.

**The title is fitted, not scaled.** The number (11px mono) and its padding
cannot shrink with the geometry and stay readable, so
`titleSize = min(titleSizePx * scale, face - FACE_CHROME)` where
`face = rowPitch - tabH` and `FACE_CHROME = 10 + 16 + 4`. Otherwise the title
overflows the part of the folder the row in front does not cover, and you read
half of every word.

## The track

`pageTrack.ts` is pure and has no DOM. One scroll position drives everything.

```
openBody[k] = pileTop(rowOf(k+1)) - (cabinetTop(rowOf(k)) + pitch)   // per folder
pageScroll[k] = max(0, contentHeight[k] - openBody[k])
start[k+1] = start[k] + pageScroll[k] + turnDistance
maxPosition = start[n-1] + pageScroll[n-1]
minPosition = -turnDistance
```

`openBody` is **per folder**, not one number: a left folder leaves its own
partner in the pile and a right folder does not, so the two alternate a row
pitch apart. Derive it before the track.

A **turn** always does the same thing: folder `k+1` alone rises from its pile
slot to its cabinet slot, and over the last `unfoldShare` its page unfolds from
under it. One folder per turn, so a row fills in two and a half-filled cabinet
row is an ordinary state.

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

## The painting rule

> A folder paints from its own top down to whatever is below it.

One row pitch when it is filed — less than the folder is tall, so the row in
front covers the rest, and that overlap is what makes a pile of paper look like
a pile of paper. A pitch plus its page when it is the one you are reading.

Implemented as: `.pv-folder` is `overflow: hidden`, `Sheet` writes its `top`
and `height`. Nothing else.

**On glass this is correctness, not an optimisation.** `backdrop-filter` samples
whatever is behind the element, so a folder left in the paint order under
another is blurred *into* it and its title ghosts through. At most two pages
ever paint: the one you are reading and the one unfolding over it.

How to check it (the unit tests cover the maths; this covers the screen):
repaint every folder without `data-open` magenta and invert its content —
neither touches layout, so the track is untouched — and screenshot. Frames must
be pixel-identical. Freeze the shader sky, the videos and all animations first
or you are measuring the clock. Current: 22 of 22 scroll positions identical.

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
| `.pv-folder__no` | 11px | 0.74 |

Targets: 4.5:1, or **7:1 under 18px**. Worst measured at shipped defaults:
7.28:1, over the grid on a cold `#view-NN` — the hardest backdrop, harder than
opening from the detail view. Re-measure after any hue or alpha change: the
palette gaining lighter hues is what pushed `.pv-folder__no` from 0.68 to 0.74.

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

`#view-NN?intro`. Panels: **PV STACK**, **PV FOLDERS**, **PV MOTION**,
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

No test runner drives the browser. The verification above was done with
Playwright scripts against `npm run dev` (`chromium.launch({ channel: 'chrome'
})`, viewport 1440×900 and 2560×1352). Worth rebuilding as committed scripts if
this view keeps changing — the unit tests cover `pageTrack` thoroughly and
nothing else, and every bug in this list was one only a browser could see.
