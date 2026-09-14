# The portfolio view

`#view-NN` opens a project over the grid. Everything lives in `src/portfolio/`.
This is the handoff: what the pieces are, what the non-obvious decisions were,
and the things that are not done.

**A section is a sheet of paper.** It arrives bent like a sheet held in a hand,
unrolls flat toward you and becomes the page you read; at the end of its run it
PEELS off the ground like a sticky note — lifted at its bottom-right corner,
bent across itself, taken up and back out of the frame — and then there is half
a screen of empty ground before the next one arrives. There are no tabs, no
folders and no pile — see
[What went away with the cabinet](#what-went-away-with-the-cabinet) for what
that replaced and why the lessons from it are still written down.

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
| `SheetCanvas.tsx` | The one fixed WebGL canvas. Mounts three.js, owns the plane, paints only during an entrance or a tear. |
| `curlMaterial.ts` | The `ShaderMaterial` — an arc-and-flap bend in the vertex stage, two point lights, an ambient floor and a blank back face in the fragment stage. Plus `bentPoint`, the CPU port of the bend, unit-tested in `curlMaterial.test.ts`. |
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
2. the **sheet** — the same page as a texture on a bent plane in WebGL, visible
   while it is unrolling and while it is being peeled away;
3. the **ground** — a full-viewport opaque field with a letterhead across the
   top, which never moves.

The page and the sheet occupy **the same rectangle** and are never both visible.
The whole model is that swap, done at a moment where it cannot be seen — and it
is done TWICE now, once at either end of a vertical run. See
[The hand-offs](#the-hand-offs).

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
writing down. A sheet part-way through its tear turns about its pinned corner
and rides up over the strip. The obvious fix — chrome on top, the way the close
pill is — makes it worse: the strip is white mono, the paper is warm off-white,
and white on off-white is not navigation you can read. Paper covering what is
printed on the ground under it is also what paper does, and the strip is back
the moment the sheet has gone.

## The sheet

three.js, one fixed canvas over the page rect. It exists for the ENTRANCE and
the TEAR, and paints nothing at all for the whole vertical run or the whole
dwell. Not a cheap frame — no frame. Measured: `0` canvas frames over twenty rAF
ticks of a scroll down the middle of a section, and `0` across twelve samples of
a dwell.

The tear used to be CSS 3D on the live page element, which is why the sheet only
needed one capture and only painted on the way in. It is WebGL now because a
sticky-note peel is a bend, and a bend is not a thing a transform can do — which
is also what took the last transform off the HTML page.

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

### The bend

`PlaneGeometry(1, 1, 64, 96)`. Below that the bend facets where the curvature is
highest. The mesh's scale is `(planeWidth, planeHeight, planeHeight)`, so the
shader can work in page heights and the bend is round rather than elliptical —
except in z, deliberately; see `curlDepth` below.

**ONE SHAPE serves the entrance and the tear**, and it is the shape a sheet of
paper actually makes when you lift an edge of it off a surface: a flat part that
has not moved, an ARC of fixed radius, and a straight FLAP tangent to the arc's
far end.

```
────────────────────╮
the stuck part      ╰──╮   an arc of fixed radius
(flat, untouched)       ╲
                         ╲  a straight flap, tangent to the arc
```

Three numbers say all of it: `uCurlOrigin` is WHERE the fold is, `uCurlAmount`
is HOW FAR the flap has turned, and `uCurlTightness` is the arc's RADIUS. The
entrance holds the fold still near one edge and relaxes the bend; the tear
drives the fold across the sheet and lets the bend peak.

**This replaced wrapping the plane onto a cone, and the reason is the tear.** A
cone wrap curls EVERYTHING behind the front, so a front travelling across the
sheet coils more and more of it into a tube — which is a scroll being rolled up,
not a sticky note being peeled off. A peel is a local fold that travels and
leaves a flat flap behind it, and the flap has to stay flat or it reads as a
window blind. The cone's taper survives as `uCurlTaper`: the radius grows along
the fold line, so the bend is wider at the free corner than at the pinned one,
which is what the cone was for and what a real peel does anyway.

| Uniform | Default | Notes |
| --- | --- | --- |
| `uCurlAmount` | −0.55 … +0.6 | **Signed**, and the sign is which way it bends: POSITIVE is toward the viewer. The entrance arrives at −0.55, the tear peaks at +0.6. 1 is `MAX_BEND`, 3.4 rad. |
| `uCurlOrigin` | 0.15 / 0.08→0.53 | Where the fold sits along the roll direction, from the free corner. The entrance holds it; the tear travels it. |
| `uCurlAxis` | 270° / 125° | The direction the fold TRAVELS, anticlockwise from +x. The entrance runs down from the top edge; the tear runs diagonally at the pinned corner. |
| `uCurlTightness` | 0.35 | The arc's radius: 0 is the widest the shader draws (0.26 page heights), 1 the tightest (0.03). **The name is older than the meaning** — it used to mix a cone's half-angle. |
| `uCurlTaper` | 0.35 | How much the radius grows along the fold line. 0 is a cylinder. |
| `uCurlDepth` | 0.5 | How much of the bend's lift actually leaves the plane — see below. |
| `uCurlWrap` | 0 / 2.4 | The LEAST the peeled part must wrap, in radians; the radius tightens to meet it. The tear creases its free corner; the entrance sets 0 and keeps its wide curve. See below. |
| `uAspect` | derived | From `fitPlaneToRect`, not from the viewport. |
| `uMouse` / `uMouseTilt` / `uPointer` | ±1.5°, lerp 0.06 | Pointer tilt. **Scaled by the bend**, and switched off outright for the tear. Off under `prefers-reduced-motion`. |
| `uHairline` / `uEdgeInk` / `uEdgeAlpha` | 1px, ink, 0.18 | A pixel of ink along the sheet's edge, matching the page's inset ring. |
| `uOpacity` | 1 | The whole sheet's alpha. Only the tear's last tenth uses it. |
| `uBackShade` / `uGrain` | 0.86, 0.08 | The BACK of the sheet: the paper colour times the shade, with a grain of its own and no texture. |

**`curlDepth` is 0.5 because of the camera.** The lift is compressed into an
ellipse rather than a circle, and the reason is arithmetic: the camera is 50
units from a plane about 16 units tall, so a bend that lifts a whole page height
comes a third of the way to the lens and the projection grows by half. Measured
before it was added, a peel at `p` = 0.5 came out about twice the size it
started — which reads as a zoom rather than as a sheet coming away. Flattening
the bend keeps the silhouette, keeps the shading, and keeps the sheet the size it
is; paper seen nearly face-on does not give the ellipse away.

### The wrap floor, and why a corner lift needs one

How far the free corner comes off the surface is `r · (1 − cos(frontLen / r))`.
Read that again: it depends on the RADIUS and on how much sheet has peeled, and
**not on how far the flap has turned** — once the corner is inside the arc its
own angle is `frontLen / r`, and nothing past it can change that.

So winding `uCurlAmount` up at the start of a peel drives the fold deeper into
the sheet and leaves the corner exactly where it was. Measured, with the floor
off: the corner is **17.1px** from where a flat sheet would put it at `p` = 0.10
and **17.1px** at `p` = 0.15 — the same number, while the curl went from 0.33 to
0.45. A unit test holds that to a millionth of a pixel, because it is the
counter-intuitive fact the whole dial exists for.

`uCurlWrap` is the fix: while the peel is short the radius tightens to whatever
it takes for the peeled part to wrap that many radians, so the corner creases
rather than bulging. It is what a hand does anyway — you crease a corner much
tighter than you bend a whole sheet — and it **stops biting on its own** the
moment `frontLen` passes `r₀ · uCurlWrap`, about a fifth of the way through the
tear. Everything from `p` = 0.3 onward is untouched, which is why the mid-tear
pose and both silhouette checks are unchanged.

| `peelWrapMin` | corner at `p` = 0.10 | 0.15 | 0.30 |
| --- | --- | --- | --- |
| 0 (off) | 17.1px | 17.1px | 207.4px |
| 2.4 (shipped) | **38.8px** | **59.3px** | 207.4px |
| 2.8 | 41.6px | 65.8px | 209.4px ← starts moving the mid-tear |

2.8 was the better-looking number on its own and 2.4 is the one that ships: at
2.8 the floor is still biting at `p` = 0.3, which puts it inside the part of the
tear nothing was supposed to touch.

### The back of the sheet is not the front of it

Paper is opaque. Fold a page over and what you see is the blank reverse, not the
type read backwards — so the fragment stage branches on `gl_FrontFacing` and
gives the back `paperColor × backShade` with a grain of its own and **no
texture at all**.

Sampling the same texture on both faces was the shortcut the entrance could
afford, because an entrance never turns the sheet over. The tear does, at about
`p` = 0.3, and from there the shortcut hands the reader a mirrored paragraph.

The lighting is untouched by the branch — both faces are the same surface and
take the same ratio — which is also why a flat sheet, every fragment of which is
front-facing, is still exactly the texture and both hand-offs still hold. The
grain is procedural rather than sampled, seeded on the sheet's own uv in page
pixels so it sits ON the paper instead of swimming over it as the flap turns.

**Normals are recomputed from the bent surface** (`vWorldNormal`), by putting
two neighbouring points through the model matrix and crossing the tangents in
world space. Without that the bend is a silhouette — the right shape with no
shading inside it, which reads as a bent picture of paper rather than as paper.
It is crossed in *world* space and not through three's `normalMatrix`, which
would have given a view-space normal while the lights are in world space.

**The pointer tilt rides on the bend.** At `uCurlAmount` 0 it is zero, so a flat
sheet is exactly flat. A degree and a half of tilt on a 1632px-wide plane moves
its corners by about eight pixels, which is eight times a hand-off's whole
budget — the tilt and the invariant cannot both be unconditional. The tear turns
it off entirely: a sheet being pulled off a surface does not follow the cursor.

**Every angle in the view is measured the way a CSS rotation is** — clockwise
from horizontal — and the sign flips into three's frame in exactly one place, in
`SheetCanvas`. `peelAngle`, the tear's turn and the entrance's tilt are all read
off the same protractor, and a tear that lifts its free corner is a negative
number in the dock the way it would be in a stylesheet. (`uCurlAxis` is the
exception and says so: it is a shader uniform in the shader's own frame.)

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
have, it would show up in a hand-off diff and nowhere else, and it would put the
diff at several times its budget on every section forever. Lighting the
difference keeps the reference's rig for the bend (the second light is what
keeps the inside of a fold off black; lowering it is what makes the bend look
like a fold) and gives the flat state away for free.

**`paperAmbient` (0.34) is a floor under that ratio, not another light.** The
tear's flap turns its back on both lights as it folds, and a ratio with nothing
under it takes that face to pure black — which is not what paper does, and is
the one part of the tear the reference's two-light rig has nothing to say about.
It is applied as a MIX rather than an addition precisely so the invariant
survives: `mix(a, 1, x)` is 1 at `x` = 1 whatever `a` is, so a flat sheet is
still exactly the texture.

Colour management is **off** for the same reason: `LinearSRGBColorSpace` on the
output and `ColorManagement.enabled = false`, so the texture's bytes reach the
screen unchanged. Decoding to linear and encoding back would be more correct
about light and less correct about the only thing being asked — are these two
surfaces the same pixels.

### The textures are captures of the page — two per section, one each per viewport

A section ships FOUR captures: its **first viewport** (`sheet`) and its **last**
(`tail`), each at both signed-off widths. Both are screenshots of the live page
— paper colour, grain, the blocks that are there — generated by
`npm run placeholders` (the Playwright already in `devDependencies`), committed
alongside the other WebPs, and declared in the section's content file with their
intrinsic sizes.

**Two per section, because there are two hand-offs.** An entrance ends on a
section's first viewport and a tear begins on its last, and both moments are as
deterministic as each other: a tear always starts with the page scrolled to its
bottom, which is what the end of a vertical run IS. Without the tail the peel
would have to start from the wrong page and the reverse hand-off would be a cut.

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
  832 KB across thirty-six files.

And the consequence that has not gone away, now doubled: **this is a placeholder
pipeline, not a content pipeline.** Nothing fails if a section's first or last
viewport changes and its capture does not; the hand-off diffs catch it in the
verify run, which is the right signal in the wrong place. See
[Not done](#not-done).

## The page

The live HTML page, on an opaque paper surface: `.pv-page` background is
`paperColor` with a grain overlay, and **no `backdrop-filter`**. It occupies the
same rect as the sheet's flat state.

Three layers, and the order is the point:

```
.pv-page          the rect. Paper, the pixel-snapped box, the inset hairline.
                  It does not scroll, and it does not MOVE: every pixel of the
                  tear is WebGL, so nothing ever writes a transform to it.
.pv-page__scroll  inset over it, and the scroll container for the vertical run.
.pv-page__grain   over both, and outside the scroller, so the grain holds still
                  while the type moves under it — which is what grain on paper
                  does.
```

The page's only per-frame property is `opacity`, for the 120ms at either end of
a run. `pv-verify` asserts that no page ever carries a transform, because the
moment one does, the run of type inside it loses its subpixel antialiasing and
every line on the page comes back lighter.

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

## The hand-offs

The one trick the whole view rests on, and there are TWO of them — one at either
end of a vertical run.

**Forward**, at the end of an entrance: the HTML page fades in over the sheet
across `handoffMs` (120ms) at the identical rect. **Reverse**, at the start of a
tear: the same page fades out over a sheet wearing the section's LAST viewport,
and the peel takes over from there. Rewinding runs each of them the other way.
All four are the same plate-crossfade the reader uses for a page turn, and they
work for the same reason: two surfaces showing the same pixels, one replacing
the other, with no geometry in between.

**Only the page's alpha moves.** It would be tidier to describe this as "the
page fades out while the sheet fades in", and it would be wrong: two surfaces at
half alpha over a ground let a quarter of the ground through between them, which
is a flash of blue in the middle of the swap. The sheet sits underneath at full
alpha and the page dissolves off it.

Which means the invariant has to hold *before* either fade starts:

> The sheet's flat screen rect and the page's rect agree to ≤ 1px, on both
> signed-off viewports.

**Measured: 0px**, on both axes, at both viewports, on every hand-off of all
nine sections of the three cards. `fitPlaneToRect` is what makes it true;
`pv-verify` is what keeps it true; and a dev warning (`[pv:handoff]`) fires if
the two rects are ever more than a pixel apart at the moment of a fade, because
a silent miss here looks like a rendering bug anywhere else in the view.

The measurable version is the **diff**: screenshot one surface, screenshot the
other, and count the pixels inside the page rect that differ.

| | forward, worst | reverse, worst | mean absolute difference |
| --- | --- | --- | --- |
| 1728×996 | **1.456%** (card 02, the all-prose section) | **0%** | 2.2 levels |
| 1440×900 | **1.654%** (same section) | **0%** | 2.2 levels |
| budget | 2% | 2% | — |

The reverse diff is zero because it is the easier of the two: a tail capture is
taken from the same page at the same scroll the tear starts at, and at `p` = 0
the sheet is exactly flat — so the two screenshots are the same pixels through
two pipelines that happen to agree. The forward one has an entrance's last frame
on one side of it. **A zero that means nothing is worse than a number**, so the
suite also asserts that the second shot IS the sheet: every page hidden, the
canvas visible. Without that the check could pass at 0% by photographing the
same page twice, which is exactly the shape of failure a reverse crossfade has.

Three more things about the measurement are worth knowing.

**The "after" shot waits out the crossfade.** The spec said `p = 0.999` against
`p = 1.001`, and a frame past the swap the page is at one per cent opacity over
a canvas still showing the sheet — a diff there compares the sheet with itself
and passes on anything. What is worth comparing is the settled state on each
side.

**A pixel counts as different at a tolerance of 32, an eighth of the range.**
Below that the measurement is dominated by how the two rasterisers antialias a
glyph edge: the GPU sampling a texture one texel to one pixel, and the browser
drawing type. The all-prose page differs on 3.1% of its pixels at a tolerance of
14 and 1.4% at 32, the mean absolute difference over the whole page is 1.5
levels, and the two screenshots are indistinguishable at 4×.

**And the control:** the same measurement against the *wrong* section's page
comes out at **49 – 55%**. A check that cannot fail is not a check.

## The track

`pageTrack.ts` is pure and has no DOM. One scroll position drives everything.

Each section gets **four segments**:

```
enterDistance                 // 900px, dial — the sheet unrolls
pageScroll[k]                 // the section's own vertical run, measured
exitDistance                  // 700px, dial — the sheet peels away
dwellDistance                 // 0.5 × the VIEWPORT's height, dial — empty ground

start[k]      = the position at which section k's PAGE sits at its top
start[k+1]    = start[k] + enter + pageScroll[k] + exit + dwell
minPosition   = -enterDistance
maxPosition   = start[n-1] + pageScroll[n-1]
```

Measured: the dwell is **498px** at 1728×996 and **450px** at 1440×900, and card
02's whole track is 16,873px long against the 15,158 it was before.

`start[k]` is the **page's top**, not the entrance's start, and the spec is
ambiguous between the two — it gives `minPosition = -enterDistance` and
`scrollTo(start[k])` for a letterhead click, which are both this reading, and a
`maxPosition` with an extra `enterDistance` in it, which is the other. This
reading is the one where a deep link, a letterhead click and `offset 0` are all
the same number; `maxPosition` lost the extra term.

`pageScroll[k]` is `max(0, contentHeight[k] - pageHeight)` — a section shorter
than the frame has a zero-length run and goes straight from its entrance into
its tear, which is a legitimate state and is what card 03 (one section) and the
short sections of 02 and 04 exercise. The last section has neither a tear nor a
dwell: there is nothing behind it to bring on.

`layout(track, y, dials)` returns `{ page, sheet, activeIndex, pendingIndex,
segment, progress }` — at most one live page OR one sheet, never both, each with
its pose. `activeIndex` commits at the hand-off rather than continuously, so the
hash changes once per section; `pendingIndex` names the section on its way, from
the moment the ground empties to the moment its page arrives, and is what the
letterhead marks dim.

### Nothing overlaps any more

The four segments partition the track, and **now they partition the screen
too**. The model this replaced had the next sheet start unrolling
`enterOverlap` of the way through the previous page's exit, so two sections were
live at once and `enterWindow(k)` was 1290px long against the segment's 900. The
dwell took that over: `enterOverlap` is gone, and `enterWindow(k)` is exactly
`[start[k] − enterDistance, start[k]]`.

That is not a simplification for its own sake. The overlap existed so the ground
would never be empty, and the dwell's whole job is that the ground IS empty for
half a screen — which is the beat the overlap was hiding, and which is what
makes a tear read as a thing that finished rather than as a transition to
something else.

### Entrance — `p` through `enterDistance`

Sheet visible, HTML page hidden (`visibility: hidden`, not `opacity: 0` — a
transparent page still composites and still runs its own animations).

| Window | What moves | From → to |
| --- | --- | --- |
| 0 → 0.16 | `rotationZ` | −28° → 0 (`startRotationDeg`) |
| 0 → 0.22 | `scale` | 0.41 → 1 (`scaleBase`, `scaleTargetAt`) |
| 0 → 0.60 | `uCurlAmount` | −0.55 → 0 (`enterCurl`, `curlOutAt`) |
| 0 → 1 | `positionY` | −0.51·H → the page's resting y (`riseFromH`) |
| = 1 | the hand-off | fade the page in over `handoffMs`, stop the canvas |

**It arrives bent, not rolled.** −0.55 rather than −1, a radius of 0.18 page
heights rather than a tube, and the fold held still at `enterCurlOrigin` — a
sixth of the way in from the sheet's edge — for the whole entrance, so the rest
of the sheet is flat and a line of type is readable across the curve the whole
way in. What moves is only how far the bend is turned.

**The curve is on the TOP edge**, which is not where the spec put it, and the
reason is `riseFromH`: the sheet rises into place from below, so its bottom edge
is off the frame for the whole entrance and a curve there is a curve nobody
sees. The top is the leading edge. It is a dial (`enterCurlAxisDeg`, 270°) so
that is one number to change, not a rewrite.

Every channel is **linear inside its window**. The scroll is the clock and Lenis
is the only smoothing there is; an eased channel would put the sheet somewhere
other than where the wheel left it.

The windows are staggered deliberately and the order is the point: the sheet
stops tumbling first, reaches full size second, and **finishes straightening
well before the hand-off** — `uCurlAmount` is 0 for the last 40% of the window.
`pv-verify` checks it at `p` = 0.6, 0.8 and 0.95 and it is `0` at all three. A
bend still resolving at the swap is a shape the flat HTML cannot match, so the
crossfade would have to hide a shape change rather than a surface change. It
cannot. Moving `curlOutAt` down is the first thing to check if a hand-off starts
showing.

`positionY` is the one channel that runs the full window, so the sheet is still
rising into place when everything else has settled. That is what makes the last
third read as a sheet being laid down rather than as a finished graphic waiting.

### Vertical run

The HTML page scrolls under Lenis, the canvas is idle, and reveal classes fire.
**The canvas does no work here at all** — measured at zero frames. It is the
longest segment by far and the only one where the reader is actually reading; a
WebGL context spinning under a page of type is a battery cost with nothing on
the other side of it.

### The tear — `p` through `exitDistance`

A sticky note coming off a surface. The sheet is stuck at its **top-left corner**
and you peel the **bottom-right** one; the fold line runs at `peelAngle` (−35°,
clockwise like a CSS rotation) and the peel travels at right angles to it,
toward the pin.

Four movements, overlapping at the joints:

| `p` | What happens | corner, off the page |
| --- | --- | --- |
| 0 → 0.15 | The free corner LIFTS. `uCurlAmount` 0 → +0.45 with the fold right at the corner (`peelOriginFrom` 0.08) and `uCurlWrap` 2.4 creasing it; nothing translates and nothing turns. A peel starts as a bend, not as a move. | 0 → **59px** |
| 0.15 → 0.6 | The fold TRAVELS across the sheet (`peelTravel`), the bend peaks at +0.6 around `p` = 0.4, the sheet turns −12° about the pin and lifts 0.12·H. The wrap floor lets go around `p` = 0.2. | 207px at 0.3 |
| 0.6 → 0.8 | It comes FREE: up and back to +0.9·H, 0.85 scale, −18°, and the bend relaxes to +0.2 as paper springs. | 896px at 0.5 |
| 0.8 → 1 | Off the top of the frame. `opacity` 1 → 0 over the last tenth ONLY. | — |

The corner column is measured, at 1728×996, through the shader's own geometry:
`bentPoint` puts the vertex at uv (1, 0) through the same bend and the same
camera the GPU does, and the figure is its distance from where a FLAT sheet
would have put it — so the sheet's own turn, lift and scale are in both and
cancel. At 1440×900 it is 3.8 / 33.3 / **50.6** / 169.8px at `p` = 0.05 / 0.10 /
0.15 / 0.30. `pv-verify` holds `p` = 0.15 to 40px, because the tear's first
movement is a corner lifting and a lift nobody can see is a beat of the
choreography spent on nothing.

**The rotation is about the PINNED CORNER**, not the centre, which is the whole
difference between a sheet being peeled and a sheet being spun — three turns a
mesh about its own origin, so `SheetCanvas` places the centre wherever it has to
be for the pivot to land back on the point it occupies at rest. It keeps that
pivot after the pin releases too: nothing about the way it is travelling changes
at that moment except that it is no longer held, and a pivot that jumped to the
centre would put a kink in the path.

**Every tear window is a smoothstep**, and only the tear's. The easing is on the
scroll mapping and nowhere else, so the settle's rules still hold — the sheet is
exactly where the wheel put it — but the joints between four movements have no
corner in them. A linear ramp into and out of each reads as four gestures with a
jolt between them, and a peel is one gesture. The unit tests hold the first
difference of `curlOrigin`, `y` and `rotationZ` bounded across all three joints.

`peelTravel` is **0.45, not the 0.82 it started at**, and that is a measurement:
past about half the sheet the un-peeled part is a thin triangle in one corner
and the frame reads as a collapsed fan rather than as paper. Taken with
`curlDepth`, the two of them are what make the middle of the tear legible.

Measured in pixels, with the ground repainted flat magenta so the sheet's own
silhouette can be counted: at `p` = 0.1 / 0.3 / 0.5 the sheet never reaches left
of the pinned corner (0px past it at all three) and never sags below the page
(1, 25 and 92px clear of its bottom edge); by `p` = 0.9 what is left is 818px
clear above the page and 2,177px of paper against the 1,220,736 it started with.

**Videos and Rive pause at `p` = 0**, on the `data-exiting` flag the reverse
hand-off sets — the page is still on screen for those 120ms, but nobody is
reading it.

### The dwell — `p` through `dwellDistance`

Ground alone. No page, no sheet, no canvas frame: `pv-verify` repaints the
ground magenta and counts **0 pixels** of paper at `p` = 0.5, and 0 canvas
frames across twelve samples of it.

The one thing that does paint is the **letterhead**, and it changes what it
says: the number of the section on its way is marked pending — a dotted rule
rather than a solid one — and the strip beside the numbers names that section
instead of the one that has gone. Half a screen of bare blue with nothing on it
reads as the view having stopped rather than as a beat between two sheets, and
the strip is the only thing that says otherwise.

### Rewind, and the settle

Rewind is the same mapping run backwards: the sheet comes back down, re-sticks,
and the HTML page fades back in. Nothing is special-cased for direction — the
hand-offs fire on the page being SHOWN changing, which happens in both.

**The settle stays, and `settleAt` decides where a half-done move should
finish.** There are two kinds of move between one page and the next now, and
they settle differently because they end differently:

- **A TEAR goes to its nearer end.** Both ends are somewhere — back to the page
  you were reading, or on to the empty ground the peel finishes on. A sheet
  stopped halfway off is the one state that is neither.
- **A DWELL AND THE ENTRANCE AFTER IT go forward, always, and are one unit.**
  Empty ground is a beat you pass through rather than a place to sit, and the
  only thing on the far side of it is the next page. Settling "back to the start
  of the dwell" would leave the reader staring at nothing; settling "to the
  start of the next entrance" — which is what the spec says literally — would
  leave them looking at a rolled sheet, which is exactly what the settle exists
  to prevent. So "to the next entrance" is read as *through* it.

The one asymmetry worth naming: the ground a tear finishes on IS a resting
place, and the settle leaves you there. `p` = 0 of a dwell is below `settleLow`,
so nothing pushes you off it; it is only once you have started into the dwell
that it carries you on.

When the scroll has been quiet for `settleIdleMs` with a move between
`settleLow` and `settleHigh`, the track tweens over `settleMs` through
`lenis.scrollTo`. Measured, at both viewports: **509 – 541ms** to come to rest
from a tear at `p` = 0.25 and 0.75, a dwell at 0.5 and an entrance at 0.5, and
**484ms** after a real wheel gesture stopped part-way through a tear. Outside
the band nothing moves — parked at `p` = 0.07 and 0.93 of a tear, the position
after 900ms of quiet is 0.07 and 0.93.

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

### Three half-pixel guards

`SEGMENT_EPSILON = 0.5` is used at every boundary that is a RESTING PLACE, and
there are three:

- at the top and the bottom of a **vertical run**, so a smoothed scroll settling
  on either does not flicker into the segment beyond it. The one at the top is
  the load-bearing one: a scroller quantises to device pixels, so
  `scrollTo(start[k])` can come back a fraction short, and without the guard a
  deep link reads as "the entrance, 99.98% done" — which means **the hand-off
  has not fired and you are looking at a texture instead of a live page**, with
  no way to scroll it;
- at the end of a **tear**, which is where the settle parks a half-done peel and
  is the start of the dwell.

That first one is strictly worse than it was under the cabinet, where the
failure was two folders open. Here it is a page you cannot use.

The tear's end needs one more thing, and it is the same problem one layer down:
the settle lands through Lenis and Lenis quantises, so parking at the end of a
tear can come back a thousandth short — an opacity of 0.001, which rounds to
nothing on an 8-bit surface and is a sheet that never goes away. `layout` drops
a sheet below **one 255th** of alpha rather than below zero.

## What paints, and when

> One surface at a time. There is no "except" any more but the two 120ms swaps.

- **Entrance:** the canvas paints; the page is `visibility: hidden` and out of
  the paint order entirely.
- **Hand-off, either way:** both, for 120ms, at the same rect.
- **Vertical run:** the page only. The canvas is hidden and paints nothing, so
  the compositor has one less layer to blend under a scroll.
- **Tear:** the canvas only. The page went out at `p` = 0 and every pixel of
  the peel is WebGL.
- **Dwell:** the ground, and the letterhead on it. Nothing else — measured at 0
  pixels of paper and 0 canvas frames.

Everything about paint order is now this list, because there is no overlapping
geometry left to reason about at all: the previous model had a page leaving and
a sheet arriving at once, and the dwell took that over. The seam-and-smear pass
the folder model needed is gone; what replaced it is the two hand-off diffs and
the magenta pass, which are tighter checks of smaller surfaces.

**Both edges of the page snap to the device pixel grid.** The rect comes out of
a viewport size and two dials, so it lands wherever it lands, and half a device
pixel of offset re-rasterises every run of type on it. It is the RECT that is
snapped — and now it is the only thing there is: **no page ever carries a
transform**, because the tear is WebGL rather than CSS 3D, so no run of type on
this view ever loses its subpixel antialiasing. `pv-verify` asserts it.

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
    sheets: { src: string, width: number, height: number }[],   // first viewport,
    tails:  { src: string, width: number, height: number }[],   // …and last, one
  }[],                                                          // of each per width
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
dial change, and anything a project puts on the page later. A drag (>4px) is
still not a click, and both ends of the press have to be on the ground.

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

## What went away with the tilt

The exit used to be CSS 3D on the live page element: scale to 0.58, rotate 16°,
translate up, fade over the last 30%, with the next section's sheet unrolling
behind it from 35% of the way through. Four things went with it, and the reasons
are worth keeping.

- **The page's transform.** It was the one place on this view where a run of
  type lost its subpixel antialiasing, and it was accepted because "the page is
  leaving and nobody is reading it". The tear is WebGL, so the page never moves
  at all now and `pv-verify` asserts that no page carries a transform. That also
  collapsed `PagePose` from five numbers to two.
- **`enterOverlap`.** It existed so the ground would never be empty. The dwell's
  whole job is that the ground IS empty for half a screen, so the overlap had
  nothing left to do — and with it went the one place two sections were live at
  once, and the only reason `enterWindow` was not just the `enter` segment.
- **The cone.** Wrapping the plane onto a cone curls everything behind the
  front, which is a scroll being rolled up. A peel is a local fold that travels
  and leaves a flat flap behind it. The taper survived as a dial because a real
  peel does taper; the wrap did not.
- **One capture per section.** A tear that starts from the section's last
  viewport needs that viewport, and the first one is a different page. The
  content model grew a second list rather than a second field, because the
  reason there is one capture per viewport is the same reason there is one per
  end of a run: a capture is a picture of a particular frame, and there is no
  resampling between two of them.

## Not done

The first two are live — they are the next things to do to this view, not
observations about it.

1. **The entrance's ROLL is to come back.** This PR softened it to a bend a
   sheet makes in a hand — `uCurlAmount` −0.55, `curlTightness` 0.35,
   `startRotation` −28° — and the look that is wanted is the tube it replaced:
   **`uCurlAmount` −1, `curlTightness` 1, `startRotation` −45°**.

   Two things make it more than three numbers.

   **`curlTightness` is shared.** It is a material dial on `PV PAPER`, read off
   `look` once and written to the uniform, while `curl`, `curlOrigin`,
   `curlAxis` and `curlWrap` come off the POSE. So setting it to 1 for the
   entrance sets it to 1 for the tear as well, and the tear's arc would go from
   0.18 page heights to 0.03 — a crease across the whole peel. It has to move to
   the pose first, the way `curlWrap` did and for exactly the same reason: the
   radius is a property of the gesture, not of the paper.

   **The bend has to be out by `curlOutAt`,** which is the constraint the
   entrance has had all along. At amount −1 with `enterCurlOrigin` 0.15 the
   fold is a tube at the top edge; check the hand-off diff after, because a
   shape still resolving at the swap is the one thing the crossfade cannot hide.
   `pv-verify` already asserts the sheet is flat and square by `p` = 0.60 and
   will say so.

2. **Everything the canvas draws is a 1× image on a 2× screen.** Measured, at
   1728×996: the page rect is 1632 × 748 CSS px, the captures are 1632 × 748
   DEVICE px — one texel per CSS pixel — and on a 2× display the renderer is at
   `setPixelRatio(2)`, so its framebuffer is 3456 × 1992. The sheet therefore
   samples a 1× texture into a 2× buffer and every glyph on it is magnified two
   to one, next to an HTML page whose type is drawn at 2×. It is soft, and it is
   soft at exactly the moment the two surfaces swap.

   **The suite cannot see this.** `pv-verify` and `npm run placeholders` both
   run at `deviceScaleFactor: 1`, so the rect match, both hand-off diffs and the
   capture pipeline are all measured on a display where the mismatch does not
   exist. That is the first thing to change.

   The fix is a second set of captures at 2× and a `SheetCanvas.captureFor` that
   picks on DPR as well as width — today it picks the nearest `width` alone, and
   `sheetSrc` names a file by width alone, so the scale needs a name of its own.
   Both have consequences worth costing first: the capture set goes from 832 KB
   across 36 files to something near four times that, and the argument in
   [The first-open lock](#the-first-open-lock-and-layout-stable-media) for
   keeping the textures off the critical path gets stronger rather than weaker.

3. **The captures are not a build step.** `npm run placeholders` takes them, and
   nothing fails if a section's first or last viewport changes and its capture
   does not. The hand-off diffs catch it *in the verify run*, which is the right
   signal in the wrong place. A content hash of each captured frame, checked at
   build, is the fix — and it now has to cover four captures per section rather
   than two.
4. **three.js is 539 KB of the bundle.** Measured: 367 KB → 912 KB raw,
   119 KB → 257 KB gzipped. It is a static import for the reason the view itself
   is one — the open is a storyboard that has to start on the click, and a chunk
   fetch in front of the first entrance is a blank ground. Splitting it behind
   the view's own 600ms fade would probably be invisible and has not been
   measured.
5. **Close reversal.** The spec asked for the page to drop back the way it came
   as the view closes, trailing the scrim by 100ms. It currently leaves with the
   view. The entrance machinery — a tween driving the track position — is what
   to reuse: run it from the current position to `minPosition` on `requestExit`,
   100ms behind the scrim.
6. **A hash change while the view is open does nothing.** A deep link works on a
   fresh open; editing `#view-02/3` to `#view-02/5` in place, or a `popstate`
   that lands on a different section, leaves the scroller where it was.
   `PortfolioView` has the handle to fix it in one line — it did not seem worth
   doing without a case that wanted it.
7. **The tear's flap is rigid.** Past the arc it is a straight plane, so a peel
   that travelled the whole sheet would put a stiff flag several page heights
   long into the frame. `peelTravel` is dialled to 0.45 to stay well inside
   that, and `curlDepth` flattens what is left. A flap that DROOPED — a second,
   much larger radius past the first — would take the constraint off, and is the
   obvious next thing to try if the tear ever wants to run further.

## Running the checks

```
npm run dev          # in one shell
npm test             # pageTrack + fitPlaneToRect + the bend, in node
npm run placeholders # regenerate the captures after a page change (needs the dev server)
npm run verify:pv    # the same view, in Chrome
```

`scripts/pv-verify.mjs` is the browser suite, and it exists because the unit
tests cover `pageTrack`, `fitPlaneToRect` and the bend's geometry thoroughly and
nothing else, while every bug this view has had was one only a browser could
see. It runs both
signed-off viewports (1728×996, 1440×900) on card 02 (five sections), card 03
(one — the section with no tear and no dwell) and card 04 (three), and checks:

- **the rect match, both ways** — the sheet's flat screen rect, as three.js
  projects it, against the page's rect, ≤ 1px on both axes, at both hand-offs of
  every section;
- **both hand-off diffs** — the last frame of an entrance against the settled
  page, and the settled page against the first frame of a tear, ≤ 2% of pixels
  differing inside the page rect. Plus the **control** (the same measurement
  against the wrong section's page, which must be large) and a guard that the
  reverse one is photographing the sheet at all;
- **the tear, in pixels**, with the ground repainted flat magenta and the chrome
  hidden so the sheet's own silhouette can be counted: it paints something at
  every point before it comes free, never reaches left of the pinned corner and
  never sags below the page while it is held, is clear above the page once it is
  free, and is smaller going out than it was coming in;
- **the corner lift** — the free corner ≥ 40px off the page by `p` = 0.15, and
  only ever further off, measured through the shader's own geometry;
- **the back of the sheet is blank**, asked as a controlled comparison: two
  different sections at `p` = 0.5 of their tear are the same geometry in the
  same rect wearing two different documents, so the flap's pixels agree to the
  LEVEL if it is paper and differ if it is a texture. Measured at 0 levels apart
  over 40 – 46 points; run against a build with the branch removed, 6 to 9 of
  them differ by up to 202;
- **the dwell paints nothing but ground** — zero pixels of paper at `p` = 0.5,
  zero canvas frames across it — and the letterhead names the section it is
  waiting for, dim;
- **the canvas is idle** during a vertical run: zero frames, not merely cheap
  ones;
- **the frame budget** — no frame over 20ms through an entrance and through a
  tear with the canvas active, sampled off rAF;
- **the entrance is flat and square by `p` = 0.60** and bends the soft way;
- **contrast ≥ 7:1**, ink on paper and mono on the ground, via `__pvProbe`,
  sampled down a whole section;
- the page's layout: the letterhead block on the inset line, content filling the
  measure from inset to inset, nothing centred, **no page carrying a transform**,
  the two-up halves meeting at the gutter, a list row's seven and five, a bleed
  block reaching the page's edges — measured across **every** page, because no
  one section carries every kind of block and a check that looked at one would
  report "no row on this page" and mean nothing by it;
- page heights identical before and after the media lands, with the media held
  back until after the track has armed, and the track arming with the captures
  cold;
- the settle, on all four of its cases: a tear left before and after halfway, a
  dwell, and an entrance. Outside the dials nothing moves, the ground a tear
  finishes on is left alone, a letterhead click is not grabbed, and a real wheel
  gesture stopped mid-tear finishes;
- deep link (`#view-02/4` lands flat on section 3 with no entrance replay and no
  canvas frame), resize (the reader keeps their section AND the plane re-fits),
  `inert`, Escape, and the reader still opening.

It drives the track through `window.__pv`, a dev-only handle. `seek` parks the
position and holds it, which is the only way to hold a mid-tear frame still: the
position is not the scrollTop, and Lenis owns the scrollTop. `park` is the
opposite — a real scroll that lets go, so the settle's idle timer counts exactly
as it would after a wheel. `scrolling()` reports Lenis's own state, because its
smoothing runs on for most of a second after the last wheel event and a check
that reads the position before then reads it in flight. `sheetRect()` and
`pageRect()` are the two halves of the hand-off invariant; `enterWindow(k)` and
`dwellWindow(k)` are how the suite steers to a segment without duplicating the
track's arithmetic; `canvasFrames()` is how "the canvas does nothing" is asked
rather than assumed; and `sheetPoint(u, v)` / `cornerLift()` are how a question
about a VERTEX gets an answer, since the bend happens in a shader and the CPU
cannot otherwise know where one ended up.

**Anything that asks the canvas what it is showing has to seek and then WAIT.**
For the 120ms of a hand-off the canvas is holding the flat sheet — that is the
whole point of it — so a probe that lands inside the swap measures a flat sheet
and reports, quite correctly and quite uselessly, that nothing has bent. It cost
an hour of thinking the corner lift was zero.
