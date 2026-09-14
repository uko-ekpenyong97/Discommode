# The portfolio view

`#view-NN` opens a project over the grid. Everything lives in `src/portfolio/`.
This is the handoff: what the pieces are, what the non-obvious decisions were,
and the things that are not done.

**A section is a sheet of paper.** It stands curled in the frame, unrolls flat
toward you and becomes the page you read; at the end of its run it tilts away
and the next section's sheet unrolls behind it. There are no tabs, no folders
and no pile — see [What went away with the cabinet](#what-went-away-with-the-cabinet)
for what that replaced and why the lessons from it are still written down.

References: <https://www.virgilabloh.com/> (the unroll; its camera and its two
lights are in `LOOK` below, and [the camera section](#the-camera-is-the-references-and-that-is-load-bearing)
is why they transfer), `docs/prototypes/folder-prototype.html` and
`docs/prototypes/notebook-prototype.html` (the two models this replaced).

> **On the numbers in this file.** Architecture and dials are as shipped.
> Anything reported as a *measurement* names the run that produced it — almost
> all of them come from `npm run verify:pv` on 2026-09-13, at both signed-off
> viewports. Where a figure is a threshold rather than a result, it says
> "budget" or "target".

## Map

| File | What it is |
| --- | --- |
| `PortfolioGate.tsx` | Outermost gate. Renders `ReaderGate` (which renders `App`) plus the view layer when the hash is `#view-…`. |
| `PortfolioView.tsx` | Scrim + close pill + ground + the scroller. Owns the section index and the hash. |
| `Ground.tsx` | The opaque field the paper sits on: colour, grain, letterhead. |
| `Scroller.tsx` | The one scroller. Measures, builds the track, applies a layout every frame. |
| `SheetCanvas.tsx` | The one fixed WebGL canvas. Mounts three.js, owns the plane, paints only during an entrance. |
| `curlMaterial.ts` | The `ShaderMaterial` — a conical curl in the vertex stage, two point lights in the fragment stage. |
| `fitPlaneToRect.ts` | Plane size from camera + target rect, so scale 1 lands on the page's pixels. Unit-tested. |
| `SectionPage.tsx` | The live HTML page. The scroll container for one section's vertical run. |
| `pageTrack.ts` | Pure geometry. The whole model, unit-tested in `pageTrack.test.ts`. |
| `portfolioMotion.ts` | `LOOK` (every dial), the open/close storyboard, the `--pv-*` variables. |
| `usePortfolioMotion.ts` | Production driver for scrim/pane/pill. |
| `useDismissOnGround.ts` | Click the ground to leave. |
| `useReveal.ts` | One IntersectionObserver per page. |
| `scrollerContext.ts` | The scroller element, shared down the block tree. |
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
| `groundColor` | `#142a63` | Deep ink blue. **Measured, not chosen** — see below. |
| `groundAlpha` | 1 | Below 1 the grid shows through, for A/B only. **Ship at 1.** |
| `grainOpacity` | 0.08 | Film grain over the ground and over the paper. One dial for both. |
| `paperColor` | `#f4efe6` | The page surface, and the sheet's albedo where no texture has decoded. |
| `inkColor` | `#14120f` | The ink, and the hairline along both surfaces' edges. |

The ground is **darker than it looks like it needs to be**, and the thing that
set it is not the paper. It is the letterhead: mono type on `groundColor` is
held to the same 7:1 the ink on the paper is, and the ground's grain is
source-over, so its worst patch is a *lighter* field under the same white. At
`#1f3a8a` the 11px numbers came out at 4:1. At `#142a63` with the dim state
raised to 0.80 white they clear at 7.64:1, which is the worst figure anywhere in
the view. See [Contrast](#contrast-on-paper-and-on-the-ground).

The **grain** is one tile of SVG turbulence, four times the viewport, stepped
around by a `transform` eight times a second. Stepping `background-position`
instead would repaint a full-viewport layer at every step — under a page of
type, during the one segment where nothing is supposed to be costing frames.

The **letterhead** is a mono strip across the top: project title · the section
numbers as links · the section you are on, *n* / *N* · a dateline. The numbers
are the only navigation in the view — clicking one is `lenis.scrollTo(start[k])`
with the dial's duration, the same call a deep link resolves to. It sits on the
ground, not on the paper, so it does not move when a sheet does and it never has
to be part of a texture.

It goes **under the paper**, and that is the one paint-order decision worth
writing down. A page part-way through its exit is turned 16° and rides up over
the strip. The obvious fix — chrome on top, the way the close pill is — makes it
worse: the strip is white mono, the paper is warm off-white, and white on
off-white is not navigation you can read. Paper covering what is printed on the
ground under it is also what paper does, and the strip is back the moment the
page has gone.

## The sheet

three.js, one fixed canvas over the page rect. It exists for the entrance and
nothing else: **no texture is needed for the exit**, which is CSS 3D on the live
page element, and the canvas paints nothing at all for the whole vertical run.
Not a cheap frame — no frame. Measured: `0` canvas frames over twenty rAF ticks
of a scroll down the middle of a section.

### The camera is the reference's, and that is load-bearing

`fov 20` at `z = 50`. Two things follow from keeping them.

The first is that **the flat plane's screen rect is exactly the page's rect, at
any field of view** — because the plane sits at z = 0 and the camera looks at
z = 0, so the plane is on the focal plane and the perspective divide is the same
constant for every point on it. `fitPlaneToRect` derives the plane's width,
height and position from the camera and the target rect; `fitPlaneToRect.test.ts`
closes the round trip to nine decimal places, and `pv-verify` measures what
three.js actually projects against what the page's `getBoundingClientRect`
says. **Measured: 0px apart, both axes, both viewports, all nine sections.**

So the narrow fov is *not* what makes the hand-off possible. What it buys is the
**curl**: the rolled part of the sheet leaves z = 0 by a good fraction of the
page's height, and at a wide angle that excursion splays — the near end of the
roll grows, the far end shrinks, and the tube reads as a cone nobody asked for.

The second is that **the reference's two lights transfer**. At fov 20 and z = 50
the visible world height at the focal plane is 17.6 units, so a plane fitted to a
page comes out about 25 × 16 units and a light at `[13, 5, 10]` rakes across it
from the same place it rakes across theirs. Change the camera and the lights are
meaningless.

### The curl

`PlaneGeometry(1, 1, 64, 96)` — more segments along y because the roll runs
along y, and below this the roll facets along its tight end where the curvature
is highest. The mesh's scale is `(planeWidth, planeHeight, planeHeight)`, so y
and z stay isotropic and the tube is round rather than elliptical.

The vertex shader wraps the plane onto a **cone** whose half-angle mixes from
π/2 — the degenerate case, a cylinder — toward 1.19 rad as `uCurlTightness`
rises. A cone rather than a cylinder is what makes the roll taper the way a real
sheet's does: one end coils tighter than the other, so the roll has a direction
instead of being a piece of extruded pipe.

The tube's **radius is derived, not dialled**: the rolled length always makes the
same 2.35 turns, so the tube shrinks as the sheet unrolls and vanishes at zero
rather than collapsing through a discontinuity. That is also what a scroll does.

| Uniform | Range | Notes |
| --- | --- | --- |
| `uCurlAmount` | −1 … 0 | **Signed.** −1 fully rolled, 0 flat. The sign is which way it rolls; do not clamp it to a magnitude. |
| `uCurlTightness` | 0.62 | Mixes the cone's half-angle away from π/2. |
| `uCurlOrigin` / `uCurlOriginEdge` | 1, 0 | How much of the sheet the roll reaches at full amount, and which edge it runs from. |
| `uAspect` | derived | From `fitPlaneToRect`, not from the viewport. |
| `uMouse` / `uMouseTilt` | ±1.5° | Pointer tilt, lerped at 0.06. **Scaled by the curl** — see below. Off under `prefers-reduced-motion`. |
| `uHairline` / `uEdgeInk` / `uEdgeAlpha` | 1px, ink, 0.18 | A pixel of ink along the sheet's edge, matching the page's inset ring. |

**Normals are recomputed from the curled surface** (`vWorldNormal`), by putting
two neighbouring points through the model matrix and crossing the tangents in
world space. Without that the roll is a silhouette — the right shape with no
shading inside it, which reads as a bent picture of paper rather than as paper.
It is crossed in *world* space and not through three's `normalMatrix`, which
would have given a view-space normal while the lights are in world space.

**The pointer tilt rides on the curl.** At `uCurlAmount` 0 it is zero, so a flat
sheet is exactly flat. A degree and a half of tilt on a 1632px-wide plane moves
its corners by about eight pixels, which is eight times the hand-off's whole
budget — the tilt and the invariant cannot both be unconditional.

### The lighting is a RATIO, and that is the hand-off

The fragment stage does not light the sheet. It lights the *difference* between
the sheet and a flat one:

```
colour = map × shade(N) / shade(flat)  +  (gloss(N) − gloss(flat))  +  hairline
```

so a flat sheet comes out as exactly the texture, texel for texel. This is not a
shortcut. The two lights are the reference's — intensity 1.14 at `[13, 5, 10]`
and 0.8 at `[8, 5, 10]` — and taken literally they leave a 0.74 → 1.22 gradient
across a flat plane, a 65% swing. That is a gradient the flat HTML does not
have, it would show up in the hand-off diff and nowhere else, and it would put
the diff at several times its budget on every section forever. Lighting the
difference keeps the reference's rig for the roll (the second light is what
keeps the inside of it off black; lowering it is what makes the curl look like a
fold) and gives the flat state away for free.

Colour management is **off** for the same reason: `LinearSRGBColorSpace` on the
output and `ColorManagement.enabled = false`, so the texture's bytes reach the
screen unchanged. Decoding to linear and encoding back would be more correct
about light and less correct about the only thing being asked — are these two
surfaces the same pixels.

### The texture is a capture of the page — one per viewport

A section's capture is a screenshot of that section's **first viewport of the
live page**: paper colour, grain, letterhead block, first blocks. It is
generated by `npm run placeholders` (the Playwright already in
`devDependencies`), committed alongside the other WebPs, and declared in the
section's content file with its intrinsic size.

**There is one capture per signed-off viewport, and the spec's "one serves
both" does not survive contact.** A page's type is a fixed number of pixels and
its measure is not, so a page at 1632 wraps its lines somewhere a page at 1344
does not: the two are different documents rather than the same document at two
scales, and no resampling turns one into the other. Measured, with a single
capture, at the viewport it was not taken at:

| capture | hand-off diff at 1728×996 | at 1440×900 |
| --- | --- | --- |
| taken at 1440×900 only | 8.1 – 13.9% | *(exact)* |
| taken at 1728×996 only | *(exact)* | 8.0 – 15.9% |
| one each | **≤ 1.46%** | **≤ 1.65%** |

`SheetCanvas` picks the capture whose `width` is nearest the live page's rect,
so a project that ships one still works — at one viewport. Because the right
capture is always an exact match, the textures carry **no mipmaps** and use
`LinearFilter`: a mipmap chain under a 1:1 mapping is a level-of-detail
calculation that can come back a hair above zero and blur every glyph for it.

Two more things the generator has to do, and both are findings:

- **Every video is paused at frame 0 before the shot.** A clip that is playing
  bakes whatever frame it was on, and the live page is never on that frame
  again — the diff would report a difference on every run and mean nothing by
  it. `pv-verify` parks them the same way before it measures.
- **Quality 90, not 82.** Lossy compression rings around a glyph edge, and the
  page that is all prose has more glyph edges than any other. The whole set is
  484 KB across eighteen files.

And the consequence that has not gone away: **this is a placeholder pipeline,
not a content pipeline.** Nothing fails if a section's first viewport changes and
its capture does not; the hand-off diff catches it in the verify run, which is
the right signal in the wrong place. See [Not done](#not-done).

## The page

The live HTML page, on an opaque paper surface: `.pv-page` background is
`paperColor` with a grain overlay, and **no `backdrop-filter`**. It occupies the
same rect as the sheet's flat state.

Three layers, and the order is the point:

```
.pv-page          the rect. Paper, the pixel-snapped box, the inset hairline,
                  and the element the EXIT transforms. It does not scroll.
.pv-page__scroll  inset over it, and the scroll container for the vertical run.
.pv-page__grain   over both, and outside the scroller, so the grain holds still
                  while the type moves under it — which is what grain on paper
                  does. Inside the page, so it tilts away with it.
```

The rect is the viewport less `pageMarginPx` (40) on the sides, less the
letterhead and a margin at the top, less `pageFootPx` (144) at the bottom. The
foot is deeper than the sides and not for taste: the close pill is 96px at a
40px inset, and a page that ran under it would put chrome over content. At
1728×996 that gives **1632 × 748**; at 1440×900, **1344 × 652**.

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
| `letterhead` | 12 | Number, title, a mono date/ref line. **Every section opens with one**, so the capture reads as a document rather than as a crop. It is the one block with no reveal — a block caught mid-reveal would bake a half-faded paragraph into the texture. |
| `title`, `caption`, `text` | 12 | Left-aligned, no max-width. `.pv-body` takes `--pv-measure` when `textMeasureCh` is on. |
| `image`, `video`, `rive` | 12 | `bleed: true` → the page's edges. |
| `twoUp` | 6 + 6 | |
| `row` | 7 + 5 | Text left, media pinned right. The list row. |
| `statGrid` | 4 × 3 | |
| `linkPill` | 12 | Inline inside it. |

A block can override with `span`; `spanOf` in `Blocks.tsx` holds the defaults.

**The composite blocks lay the twelve out again inside themselves** rather than
taking a share of the outer grid. It looks redundant and is not: seven twelfths
of a measure is not seven columns once the eleven gutters are counted, and a
nested grid on the same gutter lands on exactly the outer grid's lines. It also
keeps a two-up one block rather than two, which the reveal and the run's stagger
both depend on.

**`textMeasureCh` is off by default**, so a paragraph runs the full measure —
which at 16px is a long line. The dial is the lever if that reads too long: 90
is the figure to try. It caps the words without reintroducing a column.

## The hand-off

The one trick the whole view rests on. At the end of an entrance the HTML page
fades in over the sheet across `handoffMs` (120ms) **at the identical rect**,
and the canvas stops. It is the same plate-crossfade the reader uses for a page
turn, and it works for the same reason: two surfaces showing the same pixels,
one replacing the other, with no geometry in between.

Which means the invariant has to hold *before* the fade starts:

> The sheet's flat screen rect and the page's rect agree to ≤ 1px, on both
> signed-off viewports.

**Measured: 0px**, on both axes, at both viewports, on all nine sections of the
three cards. `fitPlaneToRect` is what makes it true; `pv-verify` is what keeps it
true; and a dev warning (`[pv:handoff]`) fires if the two rects are ever more
than a pixel apart at the moment of the fade, because a silent miss here looks
like a rendering bug anywhere else in the view.

The measurable version is the **diff**: screenshot the sheet a frame before the
swap, screenshot the settled page after it, and count the pixels inside the page
rect that differ.

| | worst | mean absolute difference |
| --- | --- | --- |
| 1728×996 | **1.456%** (card 02, the all-prose section) | 2.15 levels |
| 1440×900 | **1.654%** (same section) | 2.22 levels |
| budget | 2% | — |

Two things about that measurement are worth knowing.

**The "after" shot waits out the crossfade.** The spec said `p = 0.999` against
`p = 1.001`, and a frame past the swap the page is at one per cent opacity over
a canvas still showing the sheet — a diff there compares the sheet with itself
and passes on anything. What is worth comparing is the last frame of the sheet
against the settled page.

**A pixel counts as different at a tolerance of 32, an eighth of the range.**
Below that the measurement is dominated by how the two rasterisers antialias a
glyph edge: the GPU sampling a texture one texel to one pixel, and the browser
drawing type. The all-prose page differs on 3.1% of its pixels at a tolerance of
14 and 1.4% at 32, the mean absolute difference over the whole page is 1.5
levels, and the two screenshots are indistinguishable at 4×. So the suite also
runs a **control**: the same measurement against the *wrong* section's page, which
comes out at **49 – 55%**. A check that cannot fail is not a check.

## The track

`pageTrack.ts` is pure and has no DOM. One scroll position drives everything.

Each section gets **three segments**:

```
enterDistance                 // 900px, dial — the sheet unrolls
pageScroll[k]                 // the section's own vertical run, measured
exitDistance                  // 600px, dial — the page tilts away

start[k]      = the position at which section k's PAGE sits at its top
start[k+1]    = start[k] + enterDistance + pageScroll[k] + exitDistance
minPosition   = -enterDistance
maxPosition   = start[n-1] + pageScroll[n-1]
```

`start[k]` is the **page's top**, not the entrance's start, and the spec is
ambiguous between the two — it gives `minPosition = -enterDistance` and
`scrollTo(start[k])` for a letterhead click, which are both this reading, and a
`maxPosition` with an extra `enterDistance` in it, which is the other. This
reading is the one where a deep link, a letterhead click and `offset 0` are all
the same number; `maxPosition` lost the extra term.

`pageScroll[k]` is `max(0, contentHeight[k] - pageHeight)` — a section shorter
than the frame has a zero-length run and goes straight from its entrance to its
exit, which is a legitimate state and is what card 03 (one section) and the
short sections of 02 and 04 exercise.

`layout(track, y, dials)` returns `{ page, sheet, activeIndex, segment,
progress }` — at most one live page and at most one sheet, each with its pose.
`activeIndex` commits at the hand-off rather than continuously, so the hash and
the letterhead change once per section.

### The entrance window is longer than `enterDistance`

The three segments partition the track. What is on SCREEN does not: the next
section's sheet starts unrolling `enterOverlap` (0.35) of the way through the
previous page's exit, so it is already rising behind the page that is leaving.
That is the reason the ground is never empty, and it means the window a sheet
unrolls over is

```
enterWindow(k) = [ bottomOf(k-1) + enterOverlap · exitDistance , start[k] ]
```

which is `enterDistance + (1 − enterOverlap) · exitDistance` = **1290px** long,
against the 900px of section 0's — the one entrance with no exit in front of it.
`p` is progress through that window, and every figure below is in those terms.

### Entrance — `p` through the window

Sheet visible, HTML page hidden (`visibility: hidden`, not `opacity: 0` — a
transparent page still composites and still runs its own animations).

| Window | What moves | From → to |
| --- | --- | --- |
| 0 → 0.16 | `rotationZ` | −45° → 0 (`startRotationDeg`) |
| 0 → 0.22 | `scale` | 0.41 → 1 (`scaleBase`, `scaleTargetAt`) |
| 0 → 0.60 | `uCurlAmount` | −1 → 0 (`curlOutAt`) |
| 0 → 1 | `positionY` | −0.51·H → the page's resting y (`riseFromH`) |
| = 1 | the hand-off | fade the page in over `handoffMs`, stop the canvas |

Every channel is **linear inside its window**. The scroll is the clock and Lenis
is the only smoothing there is; an eased channel would put the sheet somewhere
other than where the wheel left it.

The windows are staggered deliberately and the order is the point: the sheet
stops tumbling first, reaches full size second, and **finishes uncurling well
before the hand-off** — `uCurlAmount` is 0 for the last 40% of the window.
`pv-verify` checks it at `p` = 0.6, 0.8 and 0.95 and it is `0` at all three. A
curl still resolving at the swap is a curl the flat HTML cannot match, so the
crossfade would have to hide a shape change rather than a surface change. It
cannot. Moving `curlOutAt` down is the first thing to check if the hand-off
starts showing.

`positionY` is the one channel that runs the full window, so the sheet is still
rising into place when everything else has settled. That is what makes the last
third read as a sheet being laid down rather than as a finished graphic waiting.

### Vertical run

The HTML page scrolls under Lenis, the canvas is idle, and reveal classes fire.
**The canvas does no work here at all** — measured at zero frames. It is the
longest segment by far and the only one where the reader is actually reading; a
WebGL context spinning under a page of type is a battery cost with nothing on
the other side of it.

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

**Videos and Rive pause the moment a page starts exiting**, keyed on
`data-exiting` and the `pv:shown` event rather than on visibility alone: an
IntersectionObserver notices neither a hidden page nor one tilting away at 58%.

A page that stops being the live one has its **pose cleared as well as being
hidden**. A page left in its exit pose is a box at 58% of the rect turned 16°,
and every page is laid out whether or not it paints — so the track's own rebuild
would measure that.

### Rewind, and the settle

Rewind is the same mapping run backwards: the page comes back out of its exit
pose, and the sheet re-rolls. Nothing is special-cased for direction.

**The settle from #14 stays, and it works on a TURN rather than on a segment.**
A turn is an exit and the entrance that overlaps it, taken as one move — because
that is what they are, and because the boundary between them is the one position
with nothing on screen but ground. "Settle to the nearer end of the exit" would
park the reader exactly there. The nearer end of a *turn* is always a page.

When the scroll has been quiet for `settleIdleMs` with a turn between
`settleLow` and `settleHigh`, the track tweens to the nearer end over
`settleMs`, through `lenis.scrollTo`. Measured: **481 – 503ms** to land from
p = 0.25, 0.5 and 0.75, and **551ms** after a real wheel gesture came to rest.
Outside the band nothing moves — parked at p = 0.075 and 0.925, the position
after 900ms of quiet is 0.07 and 0.92.

The four things the settle must not do, and what stops each, are unchanged:

| Must not | What stops it |
| --- | --- |
| Fire while the reader is scrolling | The idle timer is armed from the scroll itself, and Lenis emits every frame while its own lerp runs out — so it cannot fire until the wheel AND the smoothing have finished. `wheel` / `touchmove` / `keydown` arm it too, so a gesture that moves nothing still counts as a hand on the controls. |
| Fire during the entrance to the view | `introRef` owns the position there. |
| Fight a letterhead click | Lenis carries the `userData` of whatever asked for the scroll; the click tags itself `letterhead` and the settle reads the tag. Lenis clears it on landing and replaces it when anything else — the reader's wheel included — takes the scroll over, so the tag cannot stick. |
| Fight the reader afterwards | Lenis replaces a running `scrollTo` with the wheel's own the moment one arrives. Nothing to do. |

### Semantic position

The pixel position is meaningless across a rebuild: a section growing moves
every `start` behind it. `positionAt(track, y) → { section, segment, offset, p }`
and `resolve(track, pos) → y` are the round trip. **Every rebuild goes through
them**, in the same frame as the height change. Never carry a pixel position.

### The negative-track entrance

The track starts at `-enterDistance`, which is section 0's sheet fully rolled and
out of frame. Arriving from the detail view, the ground and the sheet region
fade in — the storyboard in `portfolioMotion.ts` — and then section 0's entrance
runs from the negative track. So the unroll you see on the way in is the same
unroll the wheel gives you later.

A deep link skips it: `#view-02/4` asks for a section, not for the opening of a
project, and **lands flat on section 3 with no entrance replay** — verified by
the canvas having painted `0` frames. So does `prefers-reduced-motion`, which
lands every section flat and keeps only the opacity: an entrance becomes the
incoming page fading up, an exit the outgoing one fading down, and the sheet is
never drawn at all.

Consequence: **the position is not the scrollTop.** It lives in the driver's
`positionRef`; the scroller drives it most of the time and the intro drives it
first. A scroller cannot go negative.

### Two half-pixel guards

`SEGMENT_EPSILON = 0.5` is used twice, and both still matter:

- at the end of a vertical run, so a smoothed scroll settling on a section's
  bottom does not flicker into the exit;
- at the end of an **entrance**, because a scroller quantises to device pixels
  and `scrollTo(start[k])` can come back a fraction short. Without it a deep
  link reads as "the entrance, 99.98% done" — which now means **the hand-off has
  not fired and you are looking at a texture instead of a live page**, with no
  way to scroll it.

That second one is strictly worse than it was under the cabinet, where the
failure was two folders open. Here it is a page you cannot use.

## What paints, and when

> One surface at a time, except for `handoffMs` and the exit overlap.

- **Entrance:** the canvas paints; the page is `visibility: hidden` and out of
  the paint order entirely.
- **Hand-off:** both, for 120ms, at the same rect.
- **Vertical run:** the page only. The canvas is hidden and paints nothing, so
  the compositor has one less layer to blend under a scroll.
- **Exit:** the leaving page, plus the *next* section's canvas once the overlap
  starts. Never two live HTML pages — the next section's page does not exist
  until its own hand-off, and `layout` is unit-tested against every position on
  the track for it.

Everything about paint order is now this list, because there is no overlapping
geometry left to reason about. The seam-and-smear pass that the folder model
needed is gone with it; what replaced it is the hand-off diff, which is a
tighter check of a smaller surface.

**Both edges of the page snap to the device pixel grid.** The rect comes out of
a viewport size and two dials, so it lands wherever it lands, and half a device
pixel of offset re-rasterises every run of type on it. It is the RECT that is
snapped, not a transform. (The **exit** is a transform, and the text inside a
transformed box does lose subpixel antialiasing; that is acceptable there and
only there, because the page is leaving and shrinking and nobody is reading it.)

## Contrast, on paper and on the ground

The surfaces are opaque, so the ratio under a run of text is a property of two
colours rather than of whatever the compositor happened to blur behind it. That
retires most of `contrastProbe.ts`: no backdrop to reconstruct, no sky to read
back out of a WebGL buffer, no stack of two translucent layers.

**What is left is the grain**, and it is worth keeping. Film grain over a surface
moves its local luminance, so "the ratio" is a distribution rather than a number
and a run of type is only as readable as its worst patch. The probe models it —
256 grain values per run, worst tenth reported — and the two surfaces composite
it differently:

- **paper** is `mix-blend-mode: multiply`, so the noise only ever darkens it;
- **ground** is plain source-over, so the noise *lightens* a dark field.

Either way the grain is painted over the type as well as under it, so both sides
of the comparison go through it.

**Target: 7:1 for everything, with no size exception**, on paper and on the
ground alike. The letterhead is the one run the paper target says nothing about,
and it is held to the same bar. `pv-verify` fails the build below it.

Measured, worst of each kind, sampled down a whole section at both viewports:

| run | on | px | ratio |
| --- | --- | --- | --- |
| `pv-letterhead__no`, `__ref` | ground | 11 | **7.64** |
| `pv-letterhead-block__no`, `__ref`, `pv-figcaption` | paper | 11 | 8.47 |
| `pv-letterhead__section` | ground | 11 | 8.87 |
| `pv-body` | paper | 16 | 9.01 |
| `pv-linkpill` | paper | 12 | 9.86 |
| `pv-letterhead__project` | ground | 11 | 10.94 |
| `pv-letterhead-block__title`, `pv-heading` | paper | 96, 22 | 14.06 |

Two numbers in that table were set by the measurement rather than by eye. The
small mono labels on paper are at **0.80** ink and not 0.74: the paper's grain
multiplies, so its worst patch is 8% darker paper under type that is 8% darker
too, and at 0.74 the 11px labels land on 6.94:1 — a miss by six hundredths. And
the letterhead's dim state is at **0.80 white** on a ground darkened to
`#142a63`, which is what leaves any room at all between "dim" and "white"; the
current section is marked with a rule as well as with a weight of light, because
0.80 to 1.0 is not much of a signal on its own.

Two things the old glass findings do *not* carry over to:

- `pageAlpha`, `pageBlurPx` and `pageSaturate` are gone. The finding they came
  from — that darkening translucent glass does nothing for small type, because
  the ink blends with the very backdrop it is compared against — was a fact
  about translucency and does not apply to paper. Ink alpha is a free lever
  again.
- The `text-shadow` on every run and the soft dark pool behind every text block
  are gone with them. They were a safety net under a ceiling that no longer
  exists.

## The first-open lock, and layout-stable media

The track is derived from **measured** page heights, so two rules:

1. The scroller stays locked (`data-locked` → `overflow-y: hidden`, plus
   `lenis.stop()`) until fonts are ready and every section has been through at
   least one `ResizeObserver` callback. A guess you can scroll is a guess that
   throws you onto the wrong section. It arms in ~20ms warm; there is a 1s
   fallback that arms anyway.
2. Every rebuild preserves the semantic position (above).

**The textures are not part of that gate.** A capture's decoding affects no
layout, so the lock must arm before paint *with the textures cold* — waiting on
them would put a WebGL asset on the critical path of a scroll lock, which is the
wrong dependency in the wrong direction. `pv-verify` proves it rather than
asserting it: in a cold context with every capture held back 3s and every block
asset held back 1.5s, the track **armed at 1754ms and the first capture landed
at 3352ms**, with 0 of 12 block images decoded at the moment it armed and 11
after. Page heights before and after: identical.

Neither rule should ever have to do anything, because **every media block
reserves its box from intrinsic dimensions** carried in the block data
(`projects/placeholder-assets.json` is the same table the generator script
writes the files from). `contain: layout` on `.pv-block` stops anything inside
one changing the height of anything else. Each capture carries its intrinsic
size for the same reason, even though nothing lays out around it — and here the
size is also how the right capture is *chosen*.

Dev log `[pv:track]` prints on arm and warns loudly if a rebuild changes the
active section — that is THE bug this path exists to prevent.

## The content model

```ts
{
  title: string,
  ref: string,                          // a dateline for the ground's letterhead
  sections: {
    title: string,
    blocks: Block[],
    sheets: { src: string, width: number, height: number }[],   // one per viewport
  }[],
}
```

`hue` is gone with the folders: sections were told apart by the colour of their
glass, and there is no glass.

Placeholders: card 02 is five sections, card 03 is one, card 04 is three. A
section's length is authored in **page heights** and filled to it — take beats
from a fixed nine-block cycle while the next one gets you nearer the target than
it overshoots it, then top up with paragraphs, which are a sixth of a page each
and are the fine adjustment. `BLOCK_VP` in `placeholder.ts` is the measured cost
of each kind of block; a beat is a coarse unit (a stat grid is half a page, a
Rive block is one and a half) and sizing by a mean beat made a 1.5-page section
and a 2-page one come out the same length, which takes the spread out of the
placeholder and the spread is the point of it.

Measured against what was asked for:

| card 02 | Overview | Research | Motion | Build | Outcome |
| --- | --- | --- | --- | --- | --- |
| asked | 2 | 4 | 3 | 5 | 1.5 |
| 1728×996 | 2.17 | 4.36 | 3.02 | 5.30 | 1.49 |
| 1440×900 | 2.23 | 4.24 | 2.98 | 5.25 | 1.71 |

Each section starts the cycle **two beats further along than the last**, and the
stride is measured rather than chosen: at these page sizes a section holds one
to four beats, so a stride of one leaves the back of the nine-block cycle
unreachable and a project would never once show a bleed image. Two covers the
cycle across a project of five sections, and it is also what stops any two
sections opening with the same thing.

Every section's `blocks` opens with a `letterhead` block. That is what makes a
capture a picture of a document. Prose comes before media in the body for the
same reason: the first viewport is what becomes the texture, and a page of type
is what makes a rolled sheet read as paper.

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

**Click-out moved off the scrim and onto the pane**, and it had to. Under the
old model the sheet covered all of the scrim but a column down the left, so the
only pointer events the scrim ever received were the ones that landed on glass —
no hit-testing at all. The ground is full-viewport and the SCROLLER is over all
of it, because the wheel has to work wherever the pointer is, so the scrim
beneath now hears nothing. `useDismissOnGround` asks one question of the DOM
instead: `closest('.pv-page')`. That is still a fact about the DOM rather than a
rectangle someone has to keep up to date — it stays right through a resize, a
dial change, an exit that shrinks the page to 58%, and anything a project puts on
the page later. A drag (>4px) is still not a click, and both ends of the press
have to be on the ground.

Escape returns as before, and the rest of the app stays `inert` while the view
is open.

## The dev dock

`#view-NN?intro`. Panels: **PV GROUND**, **PV PAPER**, **PV PAGE**,
**PV MOTION**, **PV PILL**, **PV TRACK**, **PV REVEAL**, and **PORTFOLIO**
(Replay Open / Replay Close / Copy motion). The timeline is the open storyboard;
the close is a separate storyboard (the pane leads, the scrim trails 100ms) so
"Replay Close" plays it on its own rAF.

`PV STACK`, `PV FOLDERS` and `PV GLASS` are gone with the cabinet and the
frosted surface. `PV PAPER` holds every shader uniform, both lights and the two
colours; `PV GROUND` holds `groundColor`, `groundAlpha` and `grainOpacity` plus
the contrast readout that used to live on `PV GLASS`; `PV MOTION` holds the two
distances, the overlap, `handoffMs`, all four entrance windows, all four exit
channels and the settle.

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
- **The frosted glass, and every `backdrop-filter` with it.** On the page:
  `pageAlpha` / `pageBlurPx` / `pageSaturate`, `pageSurface: frosted | solid`,
  and the `prefers-reduced-transparency` / `prefers-contrast` overrides that
  forced `solid`. On the scrim: `scrimBlurPx`. The scrim keeps its dark tint and
  drops its blur — past the 600ms of the open there is nothing to see through
  it, and a full-viewport backdrop root maintained for as long as the view is
  open is a cost with nothing on the other side of it. What that costs is a
  sharp grid behind a 40% black for the length of one fade, once per open. The
  rule that came with the glass — a surface left in the paint order under
  another is blurred *into* it, so its content ghosts through — is why "one
  surface at a time" above is written as a rule rather than as an optimisation.
- **The seam-and-smear paint pass.** Repainting every folder in a flat colour
  and counting stray pixels only made sense when a dozen clipped translucent
  shapes had to tile a sheet. Two rectangles that must agree to a pixel is a
  better-posed problem, and the hand-off diff is the check for it.

## Not done

1. **The texture is not a build step.** `npm run placeholders` captures the
   sheets, and nothing fails if a section's first viewport changes and the
   capture does not. The hand-off diff catches it *in the verify run*, which is
   the right signal in the wrong place. A content hash of the section's first
   viewport, checked at build, is the fix — and it now has to cover one capture
   per viewport rather than one.
2. **three.js is 539 KB of the bundle.** Measured: 367 KB → 906 KB raw,
   119 KB → 255 KB gzipped. It is a static import for the reason the view itself
   is one — the open is a storyboard that has to start on the click, and a chunk
   fetch in front of the first entrance is a blank ground. Splitting it behind
   the view's own 600ms fade would probably be invisible and has not been
   measured.
3. **Close reversal.** The spec asked for the page to drop back the way it came
   as the view closes, trailing the scrim by 100ms. It currently leaves with the
   view. The entrance machinery — a tween driving the track position — is what
   to reuse: run it from the current position to `minPosition` on `requestExit`,
   100ms behind the scrim.
4. **A hash change while the view is open does nothing.** A deep link works on a
   fresh open; editing `#view-02/3` to `#view-02/5` in place, or a `popstate`
   that lands on a different section, leaves the scroller where it was.
   `PortfolioView` has the handle to fix it in one line — it did not seem worth
   doing without a case that wanted it.

## Running the checks

```
npm run dev          # in one shell
npm test             # pageTrack + fitPlaneToRect, in node
npm run placeholders # regenerate the captures after a page change (needs the dev server)
npm run verify:pv    # the same view, in Chrome
```

`scripts/pv-verify.mjs` is the browser suite, and it exists because the unit
tests cover `pageTrack` and `fitPlaneToRect` thoroughly and nothing else, while
every bug this view has had was one only a browser could see. It runs both
signed-off viewports (1728×996, 1440×900) on card 02 (five sections), card 03
(one — the section with no exit and no turn) and card 04 (three), and checks:

- **the rect match** — the sheet's flat screen rect, as three.js projects it,
  against the page's rect, ≤ 1px on both axes, on every section;
- **the hand-off diff** — the last frame of the sheet against the settled page,
  ≤ 2% of pixels differing inside the page rect — plus the **control**, the same
  measurement against the wrong section's page;
- **the canvas is idle** during a vertical run: zero frames, not merely cheap
  ones;
- **the frame budget** — no frame over 20ms through an entrance and through an
  exit with the canvas active, sampled off rAF;
- **the curl is out by `p` = 0.60 and stays out**, and the sheet is flat and full
  size well before the swap;
- **contrast ≥ 7:1**, ink on paper and mono on the ground, via `__pvProbe`,
  sampled down a whole section;
- the page's layout: the letterhead block on the inset line, content filling the
  measure from inset to inset, nothing centred, the two-up halves meeting at the
  gutter, a list row's seven and five, a bleed block reaching the page's edges —
  measured across **every** page, because no one section carries every kind of
  block and a check that looked at one would report "no row on this page" and
  mean nothing by it;
- page heights identical before and after the media lands, with the media held
  back until after the track has armed, and the track arming with the textures
  cold;
- the settle: a turn left part done runs to the nearer end and gets there
  promptly, outside the dials nothing moves, a letterhead click is left alone,
  and a real wheel gesture stopped mid-turn completes;
- deep link (`#view-02/4` lands flat on section 3 with no entrance replay and no
  canvas frame), resize (the reader keeps their section AND the plane re-fits),
  `inert`, Escape, and the reader still opening.

It drives the track through `window.__pv`, a dev-only handle. `seek` parks the
position and holds it, which is the only way to hold a mid-entrance frame still:
the position is not the scrollTop, and Lenis owns the scrollTop. `park` is the
opposite — a real scroll that lets go, so the settle's idle timer counts exactly
as it would after a wheel. `scrolling()` reports Lenis's own state, because its
smoothing runs on for most of a second after the last wheel event and a check
that reads the position before then reads it in flight. `sheetRect()` and
`pageRect()` are the two halves of the hand-off invariant, and `canvasFrames()`
is how "the canvas does nothing" is asked rather than assumed.
