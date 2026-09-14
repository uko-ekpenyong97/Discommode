# The portfolio view

`#view-NN` opens a project over the grid. Everything lives in `src/portfolio/`.
This is the handoff: what the pieces are, what the non-obvious decisions were,
and the things that are not done.

**A section is a sheet of paper.** It stands curled in the frame, unrolls flat
toward you and becomes the page you read; at the end of its run it tilts away
and the next section's sheet unrolls behind it. There are no tabs, no folders
and no pile — see [What went away with the cabinet](#what-went-away-with-the-cabinet)
for what that replaced and why the lessons from it are still written down.

References: <https://www.virgilabloh.com/> (the unroll; its constants are
measured into `LOOK` below), `docs/prototypes/folder-prototype.html` and
`docs/prototypes/notebook-prototype.html` (the two models this replaced).

> **On the numbers in this file.** Architecture and dials are as shipped.
> Anything reported as a *measurement* names the run that produced it. The
> sheet model's own measurements come from `npm run verify:pv`; where a figure
> is a threshold rather than a result, it says "target".

## Map

| File | What it is |
| --- | --- |
| `PortfolioGate.tsx` | Outermost gate. Renders `ReaderGate` (which renders `App`) plus the view layer when the hash is `#view-…`. |
| `PortfolioView.tsx` | Scrim + close pill + ground + the scroller. Owns the section index and the hash. |
| `Scroller.tsx` | The one scroller. Measures, builds the track, applies a layout every frame. |
| `Ground.tsx` | The opaque field the paper sits on: colour, grain, letterhead. |
| `SheetCanvas.tsx` | The one fixed WebGL canvas. Mounts three.js, owns the plane, runs only during an entrance. |
| `curlMaterial.ts` | The `ShaderMaterial` — cylindrical curl in the vertex stage, two point lights in the fragment stage. |
| `fitPlaneToRect.ts` | Plane size from camera + target rect, so scale 1 lands on the page's pixels. |
| `SectionPage.tsx` | The live HTML page. The scroll container for one section's vertical run. |
| `pageTrack.ts` | Pure geometry. The whole model, unit-tested in `pageTrack.test.ts`. |
| `portfolioMotion.ts` | `LOOK` (every dial), the open/close storyboard, the `--pv-*` variables. |
| `usePortfolioMotion.ts` | Production driver for scrim/page/pill. |
| `PortfolioDialKit.tsx` | Dev dock (`#view-NN?intro`). |
| `contrastProbe.ts` | Dev-only WCAG probe. Tree-shaken from production — verified. |
| `blocks/` | The content model: one block type per kind of thing a project says. |
| `projects/` | Placeholder content. Replacing it is a data change and nothing else. |

## Anatomy

Three things are on screen, front to back:

1. the **page** — live HTML on an opaque paper surface, the thing you read;
2. the **sheet** — the same page as a texture on a curled plane in WebGL,
   visible only while it is unrolling;
3. the **ground** — a full-viewport opaque field with a letterhead across the
   top, which never moves.

The page and the sheet occupy **the same rectangle** and are never both visible.
The whole model is that one swap, done at a moment where it cannot be seen. See
[The hand-off](#the-hand-off).

## The ground

Full-viewport and opaque. The grid behind it is still rendering — the scrim
keeps its dark tint so the card you opened from is where you left it — but
nothing shows through, because paper on glass is a contradiction and the frosted
surface is what the previous model spent its contrast budget on.

| Dial | Default | Notes |
| --- | --- | --- |
| `groundColor` | `#1f3a8a` | Deep ink blue. The paper reads as paper against it. |
| `groundAlpha` | 1 | Below 1 the grid shows through, for A/B only. **Ship at 1.** |
| `grainOpacity` | 0.08 | Film grain over the ground. Animated noise — a small canvas, or SVG turbulence with a stepped seed. |
| `paperColor` | warm off-white | The page surface, and the sheet's albedo. |

The **letterhead** is a mono strip across the top: project title · section *n*
of *N* · section title · a date/ref line. The section numbers are links, and
they are the only navigation in the view — clicking one is
`lenis.scrollTo(start[k])` with the dial's duration, the same call a deep link
resolves to. It sits on the ground, not on the paper, so it does not move when
a sheet does and it never has to be part of a texture.

`groundAlpha` below 1 is a debugging affordance, not a look. The contrast
figures below are measured at 1.

## The sheet

three.js, one fixed canvas over the page rect. It exists for the entrance and
nothing else: **no texture is needed for the exit**, which is CSS 3D on the live
page element, and the canvas is paused for the whole vertical run.

### The camera is nearly flat, on purpose

`fov 20` at `z = 50` (the reference's numbers). At that field of view the
perspective divide across the plane is small enough that a flat plane's screen
rect is a rectangle rather than a keystone — which is the only reason the
hand-off can be a crossfade instead of a morph. `fitPlaneToRect` derives the
plane's width and height from the camera and the target rect, so **at scale 1
the plane's screen rect equals the HTML page rect to the pixel**. That equality
is an invariant, not a coincidence, and `pv-verify` asserts it.

Widen the fov and the hand-off starts to show at the plane's corners first.

### The curl

`PlaneGeometry` at 64×96 segments or better — below that the roll facets along
its tight end, where the curvature is highest. The vertex shader wraps the plane
onto a **cone** whose half-angle mixes from π/2 (a cylinder, i.e. flat) toward a
tight value as `uCurlTightness` rises; a cone rather than a cylinder is what
makes the roll taper the way a real sheet's does.

| Uniform | Range | Notes |
| --- | --- | --- |
| `uCurlAmount` | −1 … 0 | **Signed.** −1 fully rolled, 0 flat. Sign carries which way it rolls; do not clamp it to a magnitude. |
| `uCurlTightness` | dial | Mixes the cone's half-angle away from π/2. |
| `uCurlOrigin` / `uCurlOriginEdge` | dial | Where the roll starts and which edge it runs from. |
| `uAspect` | derived | From `fitPlaneToRect`, not from the viewport. |
| `uMouse` | ±1.5° | Optional pointer tilt, lerped at 0.06. Off under `prefers-reduced-motion`. |

**Normals are recomputed from the curled surface** (`vWorldNormal`), not passed
through from the flat geometry. Without that the roll is a silhouette — the
right shape with no shading inside it, which reads as a bent picture of paper
rather than paper.

The fragment stage is `map` times two point lights, intensity 1.14 at ≈`[13, 5,
10]` and 0.8 at ≈`[8, 5, 10]`, matte roughness 0.25 and a small reflective term
at 0.37. These are the reference's constants and they are worth keeping
together: the second light exists to keep the inside of the roll from going to
black, and lowering it is what makes the curl look like a fold.

All of the above are dials on **PV PAPER**.

### The texture is a capture of the page

`sheet.webp` for a section is a screenshot of that section's **first viewport of
the live page** at 1440×900 — paper colour, grain, letterhead block, first
blocks. It is generated by `npm run placeholders` (the Playwright already in
`devDependencies`), committed alongside the other WebPs, and declared in the
section's content file with its intrinsic size, exactly like every other media
block.

Two consequences worth knowing:

- **This is a placeholder pipeline, not a content pipeline.** For real content
  the capture becomes a build step: the texture has to be regenerated whenever
  the section's first viewport changes, and nothing currently enforces that. A
  stale `sheet.webp` shows up as a hand-off diff, which is the check that
  catches it.
- **One capture serves both viewports.** It is taken at 1440×900 and sampled up
  ≈1.2× at 1728×996. That is fine for a surface that is moving and curled for
  all but the last frame, and it is the last frame that the hand-off diff
  measures — if the upscale ever becomes visible, it becomes visible there
  first.

Materials otherwise: `paperColor` as the albedo, page grain baked into the
texture rather than added in the shader (it has to match the HTML page's grain,
and the cheapest way to match it is to be it), and a 1px hairline along the
sheet's edge so the plane has a border rather than dissolving into the ground.

## The page

The live HTML page, on an opaque paper surface: `.pv-page` background is
`paperColor` with the grain overlay, and **no `backdrop-filter`**. It occupies
the same rect as the sheet's flat state, and it is the scroll container for the
section's vertical run.

A page is **not a column**. It is the page rect less `pageInsetPx` each side,
and a twelve-column grid on a `gridGapPx` gutter inside what is left. Text runs
to the right inset; media spans the measure; a `bleed` block escapes both insets
to the page's edges. The reference is a Notion page set to full width, and
wildyriftian's works list for the rows.

**The grid is on the RUN, not on the page.** A run is what carries the hairline
and the vertical rhythm; putting the grid one level down leaves both untouched
and gives every block a grid area without a wrapper.

| Block | Span | |
| --- | --- | --- |
| `title`, `caption`, `text` | 12 | Left-aligned, no max-width. `.pv-body` takes `--pv-measure` when `textMeasureCh` is on. |
| `image`, `video`, `rive` | 12 | `bleed: true` → the page's edges. |
| `twoUp` | 6 + 6 | |
| `row` | 7 + 5 | Text left, media pinned right. The list row. |
| `statGrid` | 4 × 3 | |
| `linkPill` | 12 | Inline inside it. |
| `letterhead` | 12 | Number, title, a mono date/ref line. **Every section opens with one**, so the captured sheet reads as a document rather than as a crop. |

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

`pageInsetPx` no longer has a strip to line up with, so it is free to scale now.
It does not, for the same reason it did not before: it is a margin on a page and
margins do not grow with the paper the way type does.

## The hand-off

The one trick the whole view rests on. At the end of an entrance the HTML page
fades in over the sheet across `handoffMs` (120ms) **at the identical rect**,
and the canvas pauses. It is the same plate-crossfade the reader uses for a page
turn, and it works for the same reason: two surfaces showing the same pixels,
one replacing the other, with no geometry in between.

Which means the invariant has to hold *before* the fade starts, not after:

> The sheet's flat screen rect and the page's rect agree to ≤ 1px, on both
> signed-off viewports.

If they do not, the swap shows as a jump — and it shows at the corners, where a
one-pixel disagreement is a visible step against the ground. `fitPlaneToRect` is
what makes it true; `pv-verify` is what keeps it true; and a dev warning fires
if the two rects are ever more than a pixel apart at the moment of the fade,
because a silent miss here looks like a rendering bug anywhere else in the view.

The measurable version, which is the one that matters: screenshot at
`p = 0.999` and at `p = 1.001` of an entrance, and **≤ 2% of the pixels inside
the page rect may differ** (target). Above that the texture is stale, the rects
have drifted, or the lighting is leaving a gradient the flat HTML does not have.

## The track

`pageTrack.ts` is pure and has no DOM. One scroll position drives everything.

Each section gets **three segments**:

```
enterDistance                 // 900px, dial — the sheet unrolls
pageScroll[k]                 // the section's own vertical run, measured
exitDistance                  // 600px, dial — the page tilts away

start[k+1]  = start[k] + enterDistance + pageScroll[k] + exitDistance
maxPosition = start[n-1] + enterDistance + pageScroll[n-1]
minPosition = -enterDistance
```

`pageScroll[k]` is `max(0, contentHeight[k] - pageHeight)` — a section shorter
than the frame has a zero-length run and goes straight from its entrance to its
exit, which is a legitimate state and is what card 03 (one section) exercises.

`layout(track, y)` returns `{ segment, p, sheet, page }` — the segment the
position is in, progress through it, the sheet's transform and curl, and the
page's transform and opacity — plus `activeIndex` for the hash, which commits at
the hand-off rather than continuously.

### Entrance — `p` through `enterDistance`

Sheet visible, HTML page hidden.

| Window | What moves | From → to |
| --- | --- | --- |
| 0 → 0.16 | `rotationZ` | −45° → 0 (`startRotation`) |
| 0 → 0.22 | `scale` | 0.41 → 1 (`scaleBase`, `scaleTargetAt`) |
| 0 → 0.60 | `uCurlAmount` | −1 → 0 |
| 0 → 1 | `positionY` | −0.51·H → the page's resting y |
| = 1 | the hand-off | fade the page in over `handoffMs`, pause the canvas |

The windows are staggered deliberately and the order is the point: the sheet
stops tumbling first, reaches full size second, and **finishes uncurling well
before the hand-off** — `uCurlAmount` is 0 for the last 40% of the entrance. A
curl still resolving at the swap is a curl the flat HTML cannot match, so the
crossfade would have to hide a shape change rather than a surface change. It
cannot. Moving `0.60` up is the first thing to check if the hand-off starts
showing.

`positionY` is the one channel that runs the full segment, so the sheet is still
rising into place when everything else has settled. That is what makes the last
third read as a sheet being laid down rather than as a finished graphic waiting.

### Vertical run

The HTML page scrolls under Lenis, the canvas is idle, and reveal classes fire
as before. **The canvas does no rAF work here at all** — not a cheap frame, no
frame. It is the longest segment by far and the only one where the reader is
actually reading; a WebGL context spinning under a page of type is a battery
cost with nothing on the other side of it.

### Exit — `p` through `exitDistance`

CSS 3D on the live page element. No texture, no canvas.

| `p` | Property | From → to |
| --- | --- | --- |
| 0 → 1 | `scale` | 1 → 0.58 |
| 0 → 1 | `rotateZ` | 0 → +16° |
| 0 → 1 | `translateY` | 0 → −0.3·H |
| 0.7 → 1 | `opacity` | 1 → 0 |

`transform-origin: center`, `will-change: transform`. The opacity runs late so
the page is a solid object for most of its departure and only dissolves once it
is small and off-axis — fading it from the start turns a sheet being taken away
into a layer being switched off.

**The next sheet starts its entrance at `p = 0.35` of this exit** (`enterOverlap`).
That overlap is the reason the view never shows an empty ground: the new sheet
is already unrolling behind the leaving page. It also means two sections are
live at once for a stretch, which is what the covered-section rule below is for.

**Videos and Rive pause the moment a page starts exiting** — the same
covered-section rule as before, now keyed on the exit segment beginning rather
than on a folder being covered.

### Rewind, and the settle

Rewind is the same mapping run backwards: the page comes back out of its exit
pose, and the sheet re-rolls. Nothing is special-cased for direction.

**The settle from #14 stays**, and it now guards the two new segments. When the
scroll has been quiet for `settleIdleMs` with an entrance or an exit between
`settleLow` and `settleHigh`, the track tweens to the nearer end of that segment
over `settleMs`, through `lenis.scrollTo`. Outside those bounds it does nothing.

A half-finished unroll is worse than a half-finished turn ever was: it is a
sheet stopped mid-air with a curl in it, which reads as a stall rather than as a
position. The four things the settle must not do, and what stops each, are
unchanged:

| Must not | What stops it |
| --- | --- |
| Fire while the reader is scrolling | The idle timer is armed from the scroll itself, and Lenis emits every frame while its own lerp runs out — so it cannot fire until the wheel AND the smoothing have finished. `wheel` / `touchmove` / `keydown` arm it too, so a gesture that moves nothing still counts as a hand on the controls. |
| Fire during the entrance to the view | `introRef` owns the position there. |
| Fight a letterhead click | Lenis carries the `userData` of whatever asked for the scroll; the click tags itself and the settle reads the tag. Lenis clears it on landing and replaces it when anything else — the reader's wheel included — takes the scroll over, so the tag cannot stick. |
| Fight the reader afterwards | Lenis replaces a running `scrollTo` with the wheel's own the moment one arrives. Nothing to do. |

### Semantic position

The pixel position is meaningless across a rebuild: a section growing moves
every `start` behind it. `positionAt(track, y) → { section, segment, offset }`
and `resolve(track, pos) → y` are the round trip. **Every rebuild goes through
them**, in the same frame as the height change. Never carry a pixel position.

### The negative-track entrance

The track starts at `-enterDistance`, which is section 0's sheet fully rolled
and out of frame. Arriving from the detail view, the sheet slides and fades in
from the right — the storyboard in `portfolioMotion.ts`, unchanged — and then
section 0's entrance runs from the negative track. So the unroll you see on the
way in is the same unroll the wheel gives you later, and scrolling back to the
top re-runs it.

A deep link skips it: `#view-02/3` asks for a section, not for the opening of a
project, and **lands flat on section 3 with no entrance replay**. So does
`prefers-reduced-motion`, which lands every section flat and keeps only the
opacity of the hand-off.

Consequence: **the position is not the scrollTop.** It lives in the driver's
`positionRef`; the scroller drives it most of the time and the intro drives it
first. A scroller cannot go negative.

### Two half-pixel guards

`SEGMENT_EPSILON = 0.5` is used twice, and both still matter:

- at the end of a vertical run, so a smoothed scroll settling on a section's
  bottom does not flicker into the exit;
- at the end of an **entrance**, because a scroller quantises to device pixels
  and `scrollTo(start[k] + enterDistance)` can come back a fraction short.
  Without it a deep link reads as "the entrance, 99.98% done" — which now means
  **the hand-off has not fired and you are looking at a texture instead of a
  live page**, with no way to scroll it.

That second one is strictly worse than it was under the cabinet, where the
failure was two folders open. Here it is a page you cannot use.

## What paints, and when

> One surface at a time, except for `handoffMs` and the exit overlap.

- **Entrance:** the canvas paints; the page is `visibility: hidden` and out of
  the paint order entirely (not `opacity: 0` — a transparent page still
  composites, and it still runs its own animations).
- **Hand-off:** both, for 120ms, at the same rect.
- **Vertical run:** the page only. The canvas is paused and its element is
  hidden, so the compositor has one less layer to blend under a scroll.
- **Exit:** the leaving page, plus the *next* section's canvas once the overlap
  starts. Never two live HTML pages — the next section's page does not exist
  until its own hand-off.

Everything about paint order is now this list, because there is no overlapping
geometry left to reason about. The seam-and-smear pass that the folder model
needed is gone with it; what replaced it is the hand-off diff, which is a
tighter check of a smaller surface.

**Both edges of the page snap to the device pixel grid.** Carried over
unchanged, and for the same reason: the page's top moves with the scroll, and
un-snapped it re-rasterises type at a different subpixel offset every frame.
It is `top` that is snapped and not a `translateY` — moving the page by
transform was measured and the text inside a transformed box loses subpixel
antialiasing, so every run of type comes back lighter. (The **exit** is a
transform, and does lose it; that is acceptable there and only there, because
the page is leaving and shrinking and nobody is reading it.)

## Contrast, on paper

The surface is opaque now, so the ratio under a run of text is a property of two
colours rather than of whatever the compositor happened to blur behind it. This
is a large simplification and it retires most of `contrastProbe.ts`: the
backdrop-rebuild path is no longer needed for the page, and what is left is the
sampling — the worst tenth of the ratios under each run — which is still worth
having because the grain moves the paper's local luminance.

**Target: 7:1 for everything on paper.** Not 4.5:1 with a size exception — the
page is dark ink on warm off-white and there is no reason to spend the margin.
`pv-verify` fails the build below it.

Two things the old glass findings do *not* carry over to:

- `pageAlpha`, `pageBlurPx` and `pageSaturate` are gone. The finding they came
  from — that darkening translucent glass does nothing for small type, because
  the ink blends with the very backdrop it is compared against — was a fact
  about translucency and does not apply to paper. Ink alpha is a free lever
  again.
- The **letterhead is not on paper.** It is mono type on `groundColor`, and it
  is the one run of text in the view the paper target says nothing about. It
  needs its own measurement against the ground, at `groundAlpha: 1`.

## The first-open lock, and layout-stable media

The track is derived from **measured** page heights, so two rules:

1. The scroller stays locked (`data-locked` → `overflow-y: hidden`, plus
   `lenis.stop()`) until fonts are ready and every section has been through at
   least one `ResizeObserver` callback. A guess you can scroll is a guess that
   throws you onto the wrong section. Gate opens in ~30–50ms; there is a 1s
   fallback that arms anyway.
2. Every rebuild preserves the semantic position (above).

**The textures are not part of that gate.** `sheet.webp` decoding does not
affect any layout, so the lock must arm before paint *with the textures cold* —
waiting on them would put a WebGL asset on the critical path of a scroll lock,
which is the wrong dependency in the wrong direction. The first entrance renders
with whatever is decoded; the sheet is a rolled tube for the first 60% of it and
there is very little of the texture to see.

`pv-verify` proves the lock rather than asserting it: it opens the view in a
cold context with every `/projects/placeholder/` response held back 1500ms,
measures each page at the moment the track arms, lets the media through and
measures again — heights must be identical to the pixel.

Neither rule should ever have to do anything, because **every media block
reserves its box from intrinsic dimensions** carried in the block data
(`projects/placeholder-assets.json` is the same table the generator script
writes the files from). `contain: layout` on `.pv-block` stops anything inside
one changing the height of anything else. The section's `sheet` entry carries
its intrinsic size for the same reason, even though nothing lays out around it.

Dev log `[pv:track]` prints on arm and warns loudly if a rebuild changes the
active section — that is THE bug this path exists to prevent.

## The content model

```ts
{
  title: string,
  sections: {
    title: string,
    blocks: Block[],
    sheet: { src: string, width: number, height: number },
  }[],
}
```

Placeholders: card 02 is five sections (Overview 2vp, Research 4vp, Motion 3vp,
Build 5vp, Outcome 1.5vp), card 03 is one, card 04 is three. The spread is
deliberate — 1.5vp and 2vp sections are the short runs that stress the
entrance-straight-into-exit path, and 5vp is the one long enough to forget there
is a sheet involved.

Every section's `blocks` opens with a `letterhead` block. That is what makes
`sheet.webp` a picture of a document.

## Lenis

Lenis owns `scrollTop` on the scroller, scoped via its `wrapper`/`content`
options. The grid keeps its own feel. It honours `prefers-reduced-motion` itself
by dropping to 1:1.

- Never write `sc.scrollTop` while Lenis is live — use `lenis.scrollTo(y, {
  immediate: true, force: true })`, and only when the position actually moved
  (an unconditional call kills an in-flight smooth scroll every re-measure).
- Letterhead clicks use `lenis.scrollTo` with the dial's duration and an
  explicit ease-out; Lenis's default easing is not the dial's.
- A native `scroll` listener runs alongside Lenis's so programmatic writes are
  applied too.

## Pointer targets

The canvas is `pointer-events: none` throughout — it is never a target, even
during an entrance, because the only thing you can do to a sheet mid-unroll is
scroll it and the scroller is underneath. `uMouse` reads pointer position from
the window, not from the canvas.

Click-out lives on the **scrim**, with no hit-testing. The ground is opaque and
full-viewport, so unlike the sheet-beside-a-glass-column model there is no band
of visible app to click on: the scrim's hit area is the ground itself, minus the
page. A drag (>4px) is not a click. Escape returns as before, and the rest of
the app stays `inert` while the view is open.

## The dev dock

`#view-NN?intro`. Panels: **PV GROUND**, **PV PAPER**, **PV PAGE**,
**PV MOTION**, **PV PILL**, **PV TRACK**, **PV REVEAL**, and **PORTFOLIO**
(Replay Open / Replay Close / Copy motion). The timeline is the open storyboard;
the close is a separate storyboard (page leads, scrim trails 100ms) so "Replay
Close" plays it on its own rAF.

`PV STACK`, `PV FOLDERS` and `PV GLASS` are gone with the cabinet and the
frosted surface. `PV PAPER` holds every shader uniform and the two lights;
`PV GROUND` holds `groundColor`, `groundAlpha` and `grainOpacity` plus the
contrast readout that used to live on `PV GLASS`; `PV MOTION` gains
`enterDistance`, `exitDistance`, `enterOverlap` and `handoffMs`.

**Copy motion** puts a paste-ready snippet on the clipboard for `TIMING.enter`
and `LOOK` in `src/portfolio/portfolioMotion.ts`. That file is the source of
truth; the dock is a preview.

## What went away with the cabinet

Recorded because the reasons outlived the code, and two of them will come back
as soon as anything on this view is clipped or translucent again.

- **The folders, the tabs and the pile.** Sections are sheets; there is nothing
  docked and nothing stacked. `FolderStack.tsx`, `folderClipPath`, `pageTop`,
  `pageFoot`, the per-column step, the odd-count partner rule and the whole
  `cabinetTop` / `pileTop` geometry are deleted, along with their tests.
- **`clip-path`, and its two traps.** `clip-path: path()` takes SVG path data,
  which is **unitless** — a `px` suffix makes the whole declaration invalid, not
  an error, just a dropped declaration and a full-width rectangle. And a
  **self-crossing** outline is *not* invalid: the browser takes it and clips to
  something nobody asked for, which is much harder to spot than nothing
  happening. Both cost a day. The general form of the third trap is still live
  and is why `pv-verify` exists at all: **only the browser can say whether a
  visual declaration took.** A unit test on a string cannot catch a dropped one.
- **The frosted glass.** `backdrop-filter` on the page, `pageAlpha` /
  `pageBlurPx` / `pageSaturate`, `pageSurface: frosted | solid`, and the
  `prefers-reduced-transparency` / `prefers-contrast` overrides that forced
  `solid`. The scrim keeps its dark tint and drops its own `backdrop-filter`.
  The rule that came with it — a surface left in the paint order under another
  is blurred *into* it, so its content ghosts through — is why "one surface at a
  time" above is written as a rule rather than as an optimisation.
- **The seam-and-smear paint pass.** Repainting every folder in a flat colour
  and counting stray pixels only made sense when a dozen clipped translucent
  shapes had to tile a sheet. Two rectangles that must agree to a pixel is a
  better-posed problem, and the hand-off diff is the check for it.

## Not done

1. **The texture is not a build step.** `npm run placeholders` captures
   `sheet.webp`, and nothing fails if a section's first viewport changes and the
   capture does not. The hand-off diff catches it *in the verify run*, which is
   the right signal in the wrong place. A content hash of the section's first
   viewport, checked at build, is the fix.
2. **Close reversal.** The spec asked for the page to drop back the way it came
   as the view closes, trailing the scrim by 100ms. It currently leaves with the
   view. The entrance machinery — a tween driving the track position — is what
   to reuse: run it from the current position to `minPosition` on `requestExit`,
   100ms behind the scrim.
3. **The letterhead's contrast is unmeasured.** See
   [Contrast](#contrast-on-paper). It is mono type on `groundColor` and the
   paper target does not cover it.

## Running the checks

```
npm run dev          # in one shell
npm test             # pageTrack, in node
npm run placeholders # regenerate sheet.webp after a page change
npm run verify:pv    # the same view, in Chrome
```

`scripts/pv-verify.mjs` is the browser suite, and it exists because the unit
tests cover `pageTrack` thoroughly and nothing else, while every bug this view
has had was one only a browser could see. It runs both signed-off viewports
(1728×996, 1440×900) on card 02 (five sections), card 03 (one — the section with
no vertical run) and card 04 (three), and checks:

- **rect match at the hand-off** — the sheet's flat screen rect against the
  page's rect, ≤ 1px on both axes, on both viewports;
- **the hand-off diff** — screenshots at `p = 0.999` and `p = 1.001` of every
  entrance, ≤ 2% of pixels differing inside the page rect;
- **frame budget** — no frame over 20ms through an entrance and through an exit
  with the canvas active, sampled off rAF;
- **the canvas is actually idle** during a vertical run: zero rAF callbacks, not
  merely cheap ones;
- **contrast on paper** ≥ 7:1, via `__pvProbe`;
- the page's layout: the letterhead block on the inset line, content filling the
  measure from inset to inset, nothing centred, the two-up halves meeting at the
  gutter, a list row's seven and five, a bleed block reaching the page's edges;
- page heights identical before and after the media lands, with the media held
  back until after the track has armed, and **the track arming with the textures
  cold**;
- the settle: an entrance or an exit left part done runs to the nearer end and
  gets there promptly, outside the dials nothing moves, a letterhead click is
  left alone, and a real wheel gesture stopped mid-entrance completes;
- the curl is out by `p = 0.60` and stays out;
- deep link (`#view-02/3` lands flat on section 3, no entrance replay), resize,
  `inert`, Escape, and the reader still opening.

It drives the track through `window.__pv`, a dev-only handle. `seek` parks the
position and holds it, which is the only way to hold a mid-entrance frame still:
the position is not the scrollTop, and Lenis owns the scrollTop. `park` is the
opposite — a real scroll that lets go, so the settle's idle timer counts exactly
as it would after a wheel. `scrolling()` reports Lenis's own state, because its
smoothing runs on for most of a second after the last wheel event and a check
that reads the position before then reads it in flight.
