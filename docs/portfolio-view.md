# The portfolio view

`#view-NN` opens a project over the grid. Everything lives in `src/portfolio/`.
This is the handoff: what the pieces are, what the non-obvious decisions were,
and the things that are not done.

**A section is a sheet of paper.** It arrives ROLLED — a tube, which unrolls
flat toward you and becomes the page you read; at the end of its run it
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
> all of them come from `npm run verify:pv` on 2026-09-15, at both signed-off
> viewports and **both device pixel ratios**. Where a figure is a threshold
> rather than a result, it says "budget" or "target".

## Map

| File | What it is |
| --- | --- |
| `PortfolioGate.tsx` | Outermost gate. Renders `ReaderGate` (which renders `App`) plus the view layer when the hash is `#view-…`. |
| `PortfolioView.tsx` | Scrim + ground + the scroller. Owns the section index and the hash. |
| `Ground.tsx` | The field the paper sits on: the shared `SkyLayer`, the scrim over it, grain, letterhead. |
| `Scroller.tsx` | The one scroller. Measures, builds the track, applies a layout every frame. |
| `SheetCanvas.tsx` | The one fixed WebGL canvas. Mounts three.js, owns the plane, paints only during an entrance or a tear. |
| `curlMaterial.ts` | TWO `ShaderMaterial`s from one pair of vertex functions — the entrance's cone wrap and the tear's arc-and-flap — sharing one uniforms object; two point lights, an ambient floor and a blank back face in the fragment stage. Plus `bentPoint`, the CPU port of both, unit-tested in `curlMaterial.test.ts`. |
| `pageBuckets.ts` | The page-width buckets and the capture's height and scale, from `pageBuckets.json`, which the capture script and `pv-verify` read too. `bucketFor` is unit-tested. |
| `fitPlaneToRect.ts` | Plane size from camera + target rect, so scale 1 lands on the page's pixels. Unit-tested. |
| `SectionPage.tsx` | The live HTML page. The scroll container for one section's vertical run. |
| `pageTrack.ts` | Pure geometry. The whole model, unit-tested in `pageTrack.test.ts`; the exit's pose table is frozen in `tearPose.snapshot.test.ts`. |
| `portfolioMotion.ts` | `LOOK` (every dial), the open/close storyboard, the `--pv-*` variables. |
| `usePortfolioMotion.ts` | Production driver for scrim/pane. |
| `useDismissOnGround.ts` | Click the ground to leave. |
| `revealState.ts` | Putting a reveal in its final state without playing it — see [the rule](#a-hand-off-never-happens-mid-reveal). |
| `useReveal.ts` | One IntersectionObserver per page. |
| `scrollerContext.ts` | The scroller element, shared down the block tree. |
| `PortfolioDialKit.tsx` | Dev dock (`#view-NN?intro`). |
| `contrastProbe.ts` | Dev-only WCAG probe. Tree-shaken from production — verified. |
| `blocks/` | The content model: one block type per kind of thing a project says. |
| `projects/` | The content. `rive-site.ts` (card 02), `drex.ts` (card 03) and `nosey.ts` (card 04) are all real; `placeholder.ts` is no longer registered (see Not done). Replacing a placeholder is a data change and nothing else — three times over now. Media comes from `npm run projects`, which writes `<slug>-assets.json` beside each module. |

## Anatomy

Three things are on screen, front to back:

1. the **page** — live HTML on an opaque paper surface, the thing you read;
2. the **sheet** — the same page as a texture on a deformed plane in WebGL,
   visible while it is unrolling and while it is being peeled away;
3. the **ground** — a full-viewport opaque field with a letterhead across the
   top, which never moves. It is the sky ([docs/sky.md](sky.md)), under a dark
   scrim.

The page and the sheet occupy **the same rectangle** and are never both visible.
The whole model is that swap, done at a moment where it cannot be seen — and it
is done TWICE now, once at either end of a vertical run. See
[The hand-offs](#the-hand-offs).

## The ground

**The ground is the sky.** It was one flat ink blue until this change, and the
argument for that was never the colour — it was that the layer is *opaque*: the
grid behind it is still rendering and the scrim keeps its dark tint, so the card
you opened from is where you left it, but nothing shows through, because paper
on glass is a contradiction and the frosted surface is what the previous model
spent its contrast budget on.

All of that still holds. The sky layer is an opaque WebGL canvas and the grid is
as covered by it as it was by the blue. What changed is what the opaque thing
*is*: a page about a project is a page you put down somewhere, and the somewhere
the rest of the site already has is San Francisco's weather.

It is the **same** sky, not a copy of it. There is one WebGL2 context in the
app, and this layer claims its canvas off the grid while the view is open and
hands it back when it closes — see [One canvas](sky.md#one-canvas). So the sky
you scroll a project on is the sky you left, mid-drift, and opening a project
costs no second shader. Everything else about the sky is in **[docs/sky.md](sky.md)**.

| Dial | Default | Notes |
| --- | --- | --- |
| `groundScrim` | 0.35 | Black wash over the whole ground. **A look. Nothing is measured against it.** |
| `letterheadScrim` | 0.72 | Black wash over the letterhead's band only. **Measured** — see below. |
| `groundColor` | `#142a63` | What is under the sky. Shows only with no WebGL2, or in the frame before the canvas is claimed. |
| `groundAlpha` | 1 | Below 1 the grid shows through, for A/B only. **Ship at 1.** |
| `grainOpacity` | 0.08 | Film grain over the ground and over the paper. One dial for both. |
| `paperColor` | `#f4efe6` | The page surface, and the sheet's albedo where no texture has decoded. |
| `inkColor` | `#14120f` | The ink, and the hairline along both surfaces' edges. |

### Two washes, because there are two questions

A flat colour has one luminance. **A sky is a picture**: it has a sun in it, it
has a bright fog bank in it, and where daylight hits the top of the cloud deck
it is white. Two different things follow from that and they were run together at
first, which is the mistake worth writing down.

One is a **look**: how far back the sky sits behind the paper. That is
`groundScrim`, it covers the whole ground, and it is chosen by eye — **nothing
is printed on it**, so nothing is measured against it.

The other is a **bar**: 11px white mono at 7:1. That is the letterhead, and the
letterhead is a 56px band across the very top. Every run of type on the ground
is in it — the whole of `GROUND_SELECTORS` is `.pv-letterhead__*` — so the whole
contrast argument lives in one band, and so does the wash that answers it.
`letterheadScrim` is flat across the strip's own height and then fades out over
the same height again below it, where there is no type: flat keeps the probe's
model exact (the type sits on one value, not somewhere on a gradient) and the
fade keeps the band off the screen as an edge.

**One wash doing both jobs costs 0.78 of black over the entire view**, which is
a legible strip bought by throwing the weather away — and the weather is the
reason the ground is the sky. Split, the strip pays for itself and the sky is
at 0.35.

### What the bar is measured against, and why it is not a clear noon

`contrastProbe.ts` reads the ground's colour **out of the WebGL buffer**, in the
letterhead's band, as the **brightest pixel** in it — the strip runs the full
width and a run only has to cross the sun's glow once to be the run that fails.
It reads that sample against one forced sky, whatever the weather is actually
doing, because a bar that passes on a foggy Tuesday and fails in July is not a
bar.

This was first written to force a **clear noon**, on the reasoning that a clear
noon is the brightest sky there is. `scripts/sky-contrast.mjs` disproved it. A
clear noon measures **8.51:1**; an overcast noon measures **7.65**. The lit top
of the cloud deck is near-white before daylight scales it, the shader clamps to
1.0, and so any daylit sky with cloud in it puts **pure white pixels** in the
band. Every combination of `cloud` ≥ 0.5 and `sun` ≥ 0.5 ties at exactly the
same ratio — which makes it a *ceiling* rather than a bright example, and that
is what `WORST_CASE_SKY` is now.

The sweep that set the dial, worst of all twenty-four states:

| `letterheadScrim` | worst of 24 | |
| --- | --- | --- |
| 0.60 | 6.00 | fails |
| 0.66 | 6.78 | fails |
| 0.68 | 7.06 | passes, barely |
| 0.70 | 7.35 | |
| **0.72** | **7.65** | shipped |
| 0.75 | 8.11 | |

7.65 is where the flat blue's floor was (7.64), which is the right place for it
to land: the bar did not move, so the worst patch of type in the view should not
have either.

### All twenty-four states, worst run of letterhead type

`node scripts/sky-contrast.mjs`, at 1728×996 @2×. Identical at 1440×900 @2× to
within 0.05 except `clear night`, which reads 9.77 there. Bar is 7:1.

| | night | dawn | noon | dusk |
| --- | --- | --- | --- | --- |
| clear | 10.18 | 10.46 | 8.51 | 10.77 |
| partly | 10.77 | 10.47 | **7.65** | 10.54 |
| cloudy | 10.77 | 10.53 | **7.65** | 10.54 |
| fog | 10.76 | 10.51 | **7.65** | 10.53 |
| rain | 10.48 | 10.17 | 8.02 | 10.24 |
| storm | 10.45 | 10.38 | 9.90 | 10.29 |

The three that tie at the floor are the three that have a lit cloud deck at
noon. Storm is the *safest* daylit state, because a storm dims the whole scene
before the deck is shaded.

### …and every sky in a day, with a hand in it

The twenty-four are **still** skies at one twinkle phase, with the preview
moon. `scripts/sky-contrast.mjs` now runs **the sweep** after them: every
condition × every five minutes of a whole day, with the moon where it really
is and at FORCE UP, and with a synthetic swipe through the band while the wake's
dials are held at their maxima. It needs no page captures and takes about a
minute for both viewports. It is documented, with its table, in
[docs/sky.md](sky.md#the-sweep-the-letterhead-under-a-moving-sky).

What it found corrects one sentence above. **The cloud tops are not the
ceiling. A pure white pixel is**, and at the shipped washes a pure white band
reads **7.50:1**. The cloud tops clip just short of white, which is why they
read 7.65. A star at the top of its twinkle reaches white, and so does a hard
swipe with the dials at their maxima. With a hand in the sky, every condition
reaches 7.50 at some minute of the day. That is still over 7, so **nothing
failed and neither wash moved.** It also means the bar no longer depends on
the sky: at `letterheadScrim` 0.72 no sky the shader can paint can take the
letterhead under 7:1. That holds only while a white band clears the bar: 7.20
at 0.70, 7.05 at 0.69, 6.91 at 0.68. The sweep is the check that would say so,
and `src/portfolio/letterheadFloor.test.ts` fails `npm test` before that if the
shipped value ever drops under 0.70.

**If a state ever fails, `letterheadScrim` goes up and `groundScrim` does not.**
Paying a contrast bar with a wash that covers things nothing is printed on is
how this ended up at 0.78 the first time.

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
pill was — makes it worse: the strip is white mono, the paper is warm off-white,
and white on off-white is not navigation you can read. Paper covering what is
printed on the ground under it is also what paper does, and the strip is back
the moment the sheet has gone.

## The sheet

three.js, one fixed canvas over the page rect, with a backing store at the
display's own pixel ratio: `setPixelRatio(min(devicePixelRatio, 2))`, so at 2×
the framebuffer behind a 1728 × 996 element is **3456 × 1992**. That is the
resolution the browser draws the HTML page's type at, and the capture the sheet
wears has to match it — see
[the textures](#the-textures-are-captures-of-the-page--eight-per-section).

It re-checks on a **resize** and on a **DPR change**, which are not the same
event: dragging the window to a display of another density changes the ratio at
the same viewport size, and a `resize` is not guaranteed. A media query on the
current `dppx` fires once, on the way out of the value it was written for, so
each listener arms the next. It re-renders the last pose as well as resizing —
the canvas only paints when the scroll asks it to, so a reader stopped mid-
entrance would otherwise be left looking at the old framebuffer and the capture
picked for the old scale.

It exists for the ENTRANCE and the TEAR, and paints nothing at all for the whole
vertical run or the whole dwell. Not a cheap frame — no frame. Measured: `0`
canvas frames over twenty rAF ticks of a scroll down the middle of a section,
and `0` across twelve samples of a dwell.

The tear used to be CSS 3D on the live page element, which is why the sheet only
needed one capture and only painted on the way in. It is WebGL now because a
sticky-note peel is a bend, and a bend is not a thing a transform can do — which
is also what took the last transform off the HTML page.

It draws **two shapes from two programs**: the entrance's cone wrap and the
tear's arc. See
[the two shapes](#the-two-shapes-and-which-pose-uses-which).

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

### The two shapes, and which pose uses which

`PlaneGeometry(1, 1, 64, 96)`. Below that the deformation facets where the
curvature is highest. The mesh's scale is `(planeWidth, planeHeight,
planeHeight)`, so the shader can work in page heights and a round shape comes
out round.

**There are TWO shapes, because there are two gestures, and they are not the
same shape.**

| | `curlMode` 0 — the ROLL | `curlMode` 1 — the FOLD |
| --- | --- | --- |
| used by | the **entrance** (`sheetPose`) | the **tear** (`tearPose`) |
| what it is | the plane wrapped onto a CONE whose half-angle mixes from π/2 — a cylinder — toward a tight value | a flat part, an ARC of fixed radius, and a straight FLAP tangent to it |
| reads | `uCurlAmount`, `uCurlOrigin`, `uCurlOriginEdge`, `uCurlTightness` | `uCurlAmount`, `uCurlOrigin`, `uCurlAxis`, `uCurlTightness`, `uCurlTaper`, `uCurlDepth`, `uCurlWrap` |
| shipped in | the first paper release; recovered here | the tear release |

```
   mode 0, the ROLL              mode 1, the FOLD
   ╭──────────╮                  ──────────────╮
  ( the sheet  )  wound into a   the stuck part ╰──╮   an arc
   ╰──────────╯   tube, which    (flat, never       ╲
                  unrolls         moved)             ╲  a flat flap
```

**They share parameter NAMES and not parameter MEANINGS**, and that is the
whole hazard. `uCurlTightness` is an arc's radius in one and a cone's
half-angle mix in the other; `uCurlOrigin` is *where* the fold is in one and
*how much of the sheet* the roll reaches in the other; `uCurlAmount` is signed
in both and the two disagree about which sign lifts toward the lens. So the
roll's numbers put through the fold's formula compile, run, break nothing any
check was looking at, and produce **a flat sheet tilting in**. That shipped for
a release. Measured on that build: at 0.25s after the open the entrance was a
flat rectangle at −45° with a crease in one corner and no tube anywhere.

#### The switch is the PROGRAM, not a uniform

Both shapes live in one source file and both functions are compiled into both
programs; what differs is one line of `main`, which calls one of them. The
uniforms are **one object, shared by both materials**, so there is no copying
step to forget and the two cannot drift apart on anything but that line.
`SheetCanvas` puts the right material on the mesh from `pose.curlMode`, and
both programs are compiled at mount so the first tear does not pay for its own.

It was a `uCurlMode` uniform and a `? :` inside one program first, and that is
measured rather than preferred. Three points of the tear, both device pixel
ratios, against the frames the previous build produced:

| | `p` = 0.15 | `p` = 0.5 and 0.7 |
| --- | --- | --- |
| two functions in one program, **no branch** | byte-identical | byte-identical |
| …with the branch | byte-identical | **12 – 113 px** of 1.7M – 6.9M, by **1 level** |
| two programs (shipped) | byte-identical | byte-identical |

Byte-identical means the same SHA-256, not a diff under a threshold. The branch
only shows where the fold is deepest, which is what you would expect of a
scheduling difference and not of a behaviour one.

One level on a thousandth of a per cent of the frame is invisible and inside
every threshold this view has — the hand-off diff does not count a pixel as
different below 32 levels, so it would never have shown. It is still a change to
a surface that was signed off, made by a release that is not about it. The way
not to make it is not to ask the GPU to choose.

### The roll (mode 0) — the entrance

`TURNS` 2.35, `CONE_TIGHT` 1.19 rad.

**The tube's radius is DERIVED, not dialled**, and that is the part worth not
losing: the rolled length always makes the same number of turns, so
`radius = front / (TURNS · 2π)`. The tube shrinks as the sheet unrolls and
vanishes at zero instead of collapsing through a discontinuity — which is what a
scroll does. At `enterCurl` −1 with `enterRollReach` 1 the front is the whole
sheet and the radius is **0.068 page heights** — a tube **101px across** at
1728×996, seen at 41px where the entrance starts, because the sheet is still at
0.41 scale there.

**`uCurlTightness` is therefore NOT what makes it a tube.** It mixes the cone's
half-angle off π/2, and the radius is scaled along x by `1 + x · aspect ·
cos(cone)` — so on the centre line, where x is 0, it does nothing at all. At any
value of it the entrance is a tube; it only says whether the tube coils evenly
or tapers along its length. Mistaking it for the dial that produces a roll is
exactly how the roll got lost. `curlMaterial.test.ts` asserts the centre-line
profile is identical at tightness 0, 0.35, 0.62 and 1.

| Uniform | Entrance | Notes |
| --- | --- | --- |
| `uCurlAmount` | −1 → 0 over the first 60% | How rolled. **Negative rolls TOWARD the lens** in this mode — the fold's sign convention is the other way round, which is one more reason these are two functions. |
| `uCurlOrigin` | 1 (`enterRollReach`) | How much of the sheet the roll reaches at full amount. The front is `amount × reach`, so the tube eats its way out of the sheet as the amount comes off. |
| `uCurlOriginEdge` | 0 (`enterRollEdge`) | Which edge it rolls from: 0 the bottom, 1 the top. The bottom, as the first release had it — the free end is the leading edge as the sheet rises. |
| `uCurlTightness` | 1 (`enterCurlTightness`) | The cone's taper. The first release shipped 0.62; 1 is the hardest taper the shader draws, and both are tubes. |

Mode 0 reads none of `uCurlAxis`, `uCurlTaper`, `uCurlDepth` or `uCurlWrap`. The
two the POSE owns — `curlAxis` and `curlWrap` — the entrance writes to nothing
rather than leaving them alone, because every uniform is written on every frame
and a value left over from a tear must not be able to reach a roll through the
object the two programs share. The other two are material dials and are only
ever the fold's.

### The fold (mode 1) — the tear

**The shape a sheet of paper actually makes when you lift an edge of it off a
surface**: a flat part that has not moved, an ARC of fixed
radius, and a straight FLAP tangent to the arc's far end.

Three numbers say all of it: `uCurlOrigin` is WHERE the fold is, `uCurlAmount`
is HOW FAR the flap has turned, and `uCurlTightness` is the arc's RADIUS. All
three come off the pose.

**Why the tear could not keep the cone.** A cone wrap curls EVERYTHING behind
the front, so a front travelling across the sheet coils more and more of it into
a tube — a scroll being rolled up, not a sticky note being peeled off. A peel is
a local fold that travels and leaves a flat flap behind it, and the flap has to
stay flat or it reads as a window blind. That is why the tear needed a new
shape. It was never a reason for the entrance to lose its old one.

The cone's taper survives here as `uCurlTaper`: the radius grows along the fold
line, so the bend is wider at the free corner than at the pinned one, which is
what the cone was for and what a real peel does anyway.

| Uniform | Tear | Notes |
| --- | --- | --- |
| `uCurlAmount` | 0 → +0.6 | **Signed**, and POSITIVE bends toward the viewer here. 1 is `MAX_BEND`, 3.4 rad. |
| `uCurlOrigin` | 0.08 → 0.53 | Where the fold sits along the roll direction, from the free corner. The tear travels it. |
| `uCurlAxis` | 125° | The direction the fold TRAVELS, anticlockwise from +x — diagonally, at the pinned corner. |
| `uCurlTightness` | 0.35 | The arc's radius: 0 is the widest the shader draws (0.26 page heights), 1 the tightest (0.03). |
| `uCurlTaper` | 0.35 | How much the radius grows along the fold line. 0 is a cylinder. |
| `uCurlDepth` | 0.5 | How much of the bend's lift actually leaves the plane — see below. |
| `uCurlWrap` | 2.4 | The LEAST the peeled part must wrap, in radians; the radius tightens to meet it. |

### Everything both of them share

| Uniform | Default | Notes |
| --- | --- | --- |
| `uAspect` | derived | From `fitPlaneToRect`, not from the viewport. |
| `uMouse` / `uMouseTilt` / `uPointer` | ±1.5°, lerp 0.06 | Pointer tilt. **Scaled by the deformation**, so a flat sheet is exactly flat, and switched off outright for the tear. Off under `prefers-reduced-motion`. |
| `uHairline` / `uEdgeInk` / `uEdgeAlpha` | 1px, ink, 0.18 | A pixel of ink along the sheet's edge, matching the page's inset ring. |
| `uOpacity` | 1 | The whole sheet's alpha. Only the tear's last tenth uses it. |
| `uBackShade` / `uGrain` | 0.86, 0.08 | The BACK of the sheet: the paper colour times the shade, with a grain of its own and no texture. |

**NORMALS ARE RECOMPUTED from the deformed surface** in both, by evaluating it
at two neighbouring points and crossing the tangents in world space. It is the
same arithmetic in both because both versions always used the same arithmetic —
the same epsilon, the same two neighbours, the same cross. Each mode gets its
normals from its own surface; what they share is only the method. Without it the
shape is a silhouette: the right outline with no shading inside it, which reads
as a bent picture of paper rather than as paper.

**`curlDepth` is 0.5 because of the camera** — and it is the FOLD's only. The
lift is compressed into an ellipse rather than a circle, and the reason is
arithmetic: the camera is 50 units from a plane about 16 units tall, so a bend
that lifts a whole page height comes a third of the way to the lens and the
projection grows by half. Measured before it was added, a peel at `p` = 0.5 came
out about twice the size it started — which reads as a zoom rather than as a
sheet coming away. Flattening the bend keeps the silhouette, keeps the shading,
and keeps the sheet the size it is; paper seen nearly face-on does not give the
ellipse away. The roll is a true circle, as it always was.


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

### The page is laid out at a bucket, and the captures are per bucket

**The page is not as wide as the window.** It is as wide as the nearest
**bucket** at or below the window's width, less `pageMarginPx` each side,
centred on the ground; the ground's margins absorb whatever is left over. The
buckets are window widths, and the list is the dial:

```
src/portfolio/pageBuckets.json   { "buckets": [1280, 1440, 1600, 1728, 1920, 2240, 2560],
                                   "captureHeight": 1400, "captureScale": 2 }
```

One JSON file because three things read it: the app (`pageBuckets.ts`), the
capture script, and `pv-verify`. Bucket 1728 is the page a 1728px window has
always had (1632 wide at x = 48), and so is bucket 1440 at 1440, so the two
signed-off viewports lay out exactly as they did.

| window | bucket | page | left margin |
| --- | --- | --- | --- |
| 1366 × 768 | 1280 | 1184 × 616 | 91 |
| 1440 × 900 | 1440 | 1344 × 748 | 48 |
| 1512 × 982 | 1440 | 1344 × 830 | 84 |
| 1680 × 1050 | 1600 | 1504 × 894 | 88 |
| 1728 × 996 | 1728 | 1632 × 844 | 48 |
| 2000 × 1100 | 1920 | 1824 × 948 | 88 |

**Why a list and not the window.** A page's type is a fixed number of pixels
and its measure is not, so a page at one width wraps its lines somewhere a page
at another does not. The two are different documents rather than one document
at two scales, and no resampling turns one into the other. Measured with the
old per-viewport captures, at the viewport a capture was not taken at:

| capture | hand-off diff at 1728×996 | at 1440×900 |
| --- | --- | --- |
| taken at 1440×900 only | 8.1 – 13.9% | *(exact)* |
| taken at 1728×996 only | *(exact)* | 8.0 – 15.9% |
| one each | **≤ 1.46%** | **≤ 1.65%** |

With captures at two viewports, every other window size was the first two rows:
a capture of the nearest width, stretched onto a page of another, with type a
different size on either side of the swap. The swap is a cut under a moving
track now, and a cut is exactly where a change of type size shows. The suite
never saw it, because it only ever ran at the two sizes the captures were taken
at. A bucket makes the page a function of a list rather than of the window, and
a list can be captured.

**Every bucket is a real layout, not one layout stretched.** Nothing on the page
scales. The twelve-column grid is `fr` columns, a span is a count of them, the
measure is in `ch`, media boxes are `width: 100%` at their intrinsic ratio, and
a bleed is `100cqw` of the page's own container. All of them resolve at the
bucket's width. One rule used to read the WINDOW: `.pv-title` sized itself in
`vw`, which would have made two windows in one bucket two different documents.
It is `cqw` of the page now. Section 01 of card 02 at every bucket, at one
scale (`node scripts/pv-bucket-sheet.mjs`):

![Card 02, section 01, at every bucket](portfolio-view/buckets-02-01.webp)

It is 1252px long at 1280 and 1534px at 2560. The media boxes grow with the
width faster than the prose shortens, which is the reflow a stretched layout
would not have.

**Below the smallest bucket** there is nothing to snap down to. The page is the
window less its margins, and the sheet wears the 1280 capture resized to fit.
That is a stretch, the only one left, and it is on the Not done list.

**A resize is measured when it ends**, 150ms after the last `resize` event,
rather than on every event. Crossing a bucket re-lays every page and asks for
another bucket's captures. During a drag the page keeps its old rect. At the end
it re-lays once, and a reader part-way down a page keeps the same FRACTION of it
rather than the same pixel offset, which would now be somewhere else in the
text. The new bucket's captures are warmed at once. If a sheet is on screen when
the bucket changes, it keeps wearing the old bucket's capture until the new one
has decoded, rather than blank paper. `pv-verify` drags a window across buckets
both ways with the reader half way down a page. It checks four things: nothing
re-lays mid-drag; the reader is on the same section at the same fraction after;
every frame of it shows the page and only the page; and both hand-offs match
off the new bucket's captures.

### The textures are captures of the page, one pair per bucket

A section ships a **first viewport** (`sheet`) and a **last** (`tail`) per
bucket, all at 2×. They are screenshots of the live page, generated by
`npm run placeholders` and committed alongside the other WebPs. Every section
declares all of them with their sizes (`captures.ts`), and `SheetCanvas` binds
the pair for the live page's bucket.

**Two kinds per section, because there are two hand-offs.** An entrance ends on
a section's first viewport and a tear begins on its last. Both moments are as
deterministic as each other: a tear always starts with the page scrolled to its
bottom, which is what the end of a vertical run is.

**One tall height, cropped by uv.** A page's height is the window's (less the
letterhead and two margins), and a window's height is not a list anyone can
choose from. So each bucket is captured with the page **1400 CSS px tall**,
taller than any page the view draws at a signed-off size, and the shader
samples only the rows the live page shows (`uUvCrop`):

- a `sheet` is the capture's top `pageHeight` rows;
- a `tail` is the band that starts where the live page's last viewport does.
  The live page and the capture were scrolled to two different bottoms, and the
  browser keeps `scrollTop` in whole CSS pixels capped at
  `scrollHeight − clientHeight`. `scrollHeight` is a function of the width
  alone and the width is the bucket's, so the offset is
  `max(0, sh − H) − max(0, sh − 1400)`, exact, computed in `measure`;
- a row the capture does not have (a page taller than 1400) is paper, not the
  last row smeared down the sheet.

**One scale, 2×.** The capture is exactly two texels per CSS pixel. A flat
sheet at a pixel-aligned rect samples it one texel to one device pixel on a 2×
display, and at exactly 2:1 on a 1× display, where bilinear filtering averages
it. So there are **no mipmaps** and the filter is `LinearFilter`: a mipmap
chain under a mapping like that is a level-of-detail calculation that can come
back a hair above zero and blur every glyph for it. Measured, the 1× forward
diff off a 2× capture is **1.31 – 1.33%** at the signed-off sizes, against
**0.90 – 0.99%** off the old 1× ones; see [the hand-offs](#the-hand-offs).

**The files are named by bucket**, `sheet-01-1728@2x.webp`, not by page width.
The page width is the bucket less a margin dial, and a name that moved when a
dial did would be a name nobody could find the file by. The script deletes any
capture the list no longer names; that is how the old per-viewport set went.

Three more things the generator has to do, and all three are findings:

- **Every video is paused at frame 0 before the shot.** A clip that is playing
  bakes whatever frame it was on, and the live page is never on that frame
  again, so the diff would report a difference on every run and mean nothing
  by it. `pv-verify` parks them the same way before it measures.
- **Quality 90, not 82.** Lossy compression rings around a glyph edge, and the
  page that is all prose has more glyph edges than any other.
- **Headless Chrome gets a 4 GB raster budget** (`--force-gpu-mem-available-mb`).
  A 2× page 1400px tall, with the grain layer at nine times its area, went over
  the default. Chrome left tiles unrasterised, and the capture showed the sky
  through the paper in tile-shaped bands: 3.5% of the page on one run and 11.5%
  on the next, at bucket 1920. The off-bucket hand-off check is what caught it,
  at 9–73%. The flag is on the capture script, the contact sheet and
  `pv-verify`.

#### What the set costs

Two numbers, and they are not the same number.

| bucket | files | on disk | one capture on the GPU | worst window (six) |
| --- | --- | --- | --- | --- |
| 1280 | 22 | 5.9 MB | 25.3 MB | 152 MB |
| 1440 | 22 | 6.2 MB | 28.7 MB | 172 MB |
| 1600 | 22 | 6.5 MB | 32.1 MB | 193 MB |
| 1728 | 22 | 6.6 MB | 34.9 MB | 209 MB |
| 1920 | 22 | 6.9 MB | 39.0 MB | 234 MB |
| 2240 | 22 | 7.4 MB | 45.8 MB | 275 MB |
| 2560 | 22 | 7.8 MB | 52.6 MB | 316 MB |
| **all** | **154** | **47.2 MB** | | |

The per-viewport set this replaced was 88 files and 10.3 MB, with a worst
window of 126 MB at 2×.

The **bundle** is every bucket of every card, and none of it is on the critical
path: the first-open lock arms with every capture cold, and `pv-verify` proves
that at both ratios. A reader downloads one bucket, and only the sections near
them.

The **texture** is what the GPU holds: uncompressed RGBA at the file's own
pixels, `width × 2 × 2800 × 4`. That is **34.9 MB** for one capture at bucket
1728, where a 2× capture of the old 1632 × 844 page was 21.0 MB, and **52.6 MB**
at bucket 2560. It is the price of one capture serving every window height. The
resident set is still the reader's window, six captures, asserted on every
section of every card, and it still does not grow with the project. What grew
is what one capture costs.

#### What is resident, and what is let go

**The window is the section being read and its two neighbours** — six captures,
a sheet and a tail apiece. `SheetCanvas.loaded` is still a map keyed by src, and
what is new is that something takes entries out of it: everything further out is
`dispose()`d and dropped, and the bytes come back off the HTTP cache if the
reader ever rewinds that far.

**One section either side, and the rewind is what sets it.** `activeIndex`
commits at the forward hand-off, so during section *k*'s entrance it is still
*k* − 1 — the window has to reach a section FORWARD to hold the sheet that is
on screen at all. It has to reach a section BACK because a reader rewinding out
of a page runs into the previous section's tear, at `p` = 0, with no reading in
front of it to fetch anything in.

**Letting go and asking are one call**, `residentWindow` in `Scroller`, and it
runs at three moments:

| when | why |
| --- | --- |
| the reader commits to another section | the window moved |
| a hand-off lands | see below — a crossfade can outlive the window it started in |
| the first-open lock opens | nothing else would: `activeIndex` starts at the section being opened, so on a fresh open there is no change to hang a warm off, and the first tear of a visit would bind a tail nobody had asked for |

It **warms the whole window** rather than the two captures the reader is walking
towards, and the eviction is exactly what made that difference matter: the tail
of the section behind may have been disposed several sections ago. A warm is a
fetch and a decode with nothing bound and no frame painted, and it happens long
after the lock has armed, so the argument for keeping captures off the critical
path is untouched.

**Nothing bound is ever disposed**, and there is a guard in `evict` that says so
whatever the window says. Two findings sit behind it, and both came out of the
suite rather than out of reading the code:

- **`hide` has to say that nothing is bound.** The canvas keeps the src it last
  painted so a texture arriving late can be put on screen without waiting for a
  scroll tick — but the vertical run and the dwell are spent hidden, and a src
  left behind there is a capture the eviction will not touch. Measured: a reader
  two sections on from where the canvas last painted held **seven**.
- **A crossfade can outlive the window it started in.** A hand-off paints the
  flat sheet on every one of its 120ms of frames, and one already in flight when
  the position jumps goes on painting the section it was started for — so a
  letterhead click across three sections re-creates a capture the eviction has
  just disposed, and nothing would take it away again until the reader next
  changed section. Measured, stepping a section every 80ms: **seven** again. The
  prune when the hand-off lands is the other half of the fix, and the guard is
  what makes it safe to run there.

**What it costs is a re-fetch on a long rewind**, and the shape of the risk is
worth naming: a texture that has to come back is not instant. An entrance
renders with whatever has decoded (`uHasMap` 0 is blank paper) and for its first
60% the sheet is a tube with very little texture to show, so the visible case is
a rewind landing late in one — which is why the window is warmed on arrival
rather than on demand.

**And the view lets go of the whole context when it closes.** `renderer.dispose`
frees three's own resources and leaves the WebGL context live, to be collected
whenever the canvas element is; the view is opened and closed from the grid, so
"whenever" is a context per open, and Chrome keeps sixteen and then drops the
oldest — a leak that looks like a plateau rather than a ramp. The unmount takes
the context too, **but only once the element has actually gone**: a forced loss
is permanent for the element it is asked of, and React's StrictMode tears this
effect down and mounts it again on the same canvas, so a loss taken in the
cleanup kills the canvas the remount is about to use. It throws reading
`precision`, which is an obscure way to find that out. A macrotask later the
element is either back in the tree or detached, and that is the difference.

**Measured, 20 open/close cycles of card 02 at 2×**, sampling the GPU process
after each (`npm run verify:gpu`, headed Chrome, this machine):

| | first cycle | last cycle | range over the twenty |
| --- | --- | --- | --- |
| before | 195.1 MB | 193.7 MB | 174.1 – 230.4 MB |
| after | 199.2 MB | 188.7 MB | 184.7 – 200.7 MB |

**Both are flat, and that is the honest reading of it**: opening and closing the
view was never the leak. The unmount already disposed every texture, the
material, the geometry and the renderer, and the loop says so from both sides of
the change. What grew was the set held *inside* one open view — the resident
column of [what the set costs](#what-the-set-costs) — and that is what
`__pv.textures()` and the resident-set check in `pv-verify` measure. The after run is steadier — a 16 MB band against 56 MB — which is what
releasing the context at unmount looks like at this sample rate, and it is not a
number to lean on.

And the consequence that has not gone away, now four times over: **this is a
placeholder pipeline, not a content pipeline.** Nothing fails if a section's
first or last viewport changes and its capture does not; the hand-off diffs
catch it in the verify run, which is the right signal in the wrong place. See
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

The rect is the viewport less `pageMarginPx` (48) on EVERY side, plus the
letterhead's height at the top. At 1728×996 that gives **1632 × 844**; at
1440×900, **1344 × 748**.

**It used to be 96px shorter**, because the bottom was a deeper `pageFootPx`
(144) rather than an ordinary margin — a band the page was kept out of so it
could never run under the close pill. The pill is gone (see
[Chrome](#chrome-there-isnt-any)) and the band went with it. That is a viewport
of prose given back on a long section, and it is why every capture in
`public/projects/` was retaken.

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

**A paragraph can end in a link.** A `text` block's paragraph is a string, or
`{ text, link: { label, href } }` — the prose, then a link in the paragraph's
own ink, underlined, opening in a new tab like the pill does. It exists for
card 03's "Live: drex.style" and "Visit: drex.style", where the link is the
last words of a line of facts rather than a call to action under them; a pill
there would set one entry of a list as a button.

A block can override with `span`; `spanOf` in `Blocks.tsx` holds the defaults.

**A media caption is set like the prose beside it, wherever the media is.** A
single `image`/`video` caption used to be 11px mono with 0.1em of tracking while
a two-up's was 14px sans, so the same sentence was set two different ways
depending on which block it happened to be in — two rules written at different
times, not a distinction anybody chose. They share one now. **Mono is the
letterhead's voice in this view**: the strip on the ground, the block's eyebrow
and reference line, and the `caption` BLOCK, which is a dateline or a credit and
is a different thing from a caption on a picture. Moving the figure captions
moved them in the contrast table too — off the 11px mono row and onto the 14px
one, where they measure the same 9.01:1 the two-up's text does.

**The composite blocks lay the twelve out again inside themselves** rather than
taking a share of the outer grid. It looks redundant and is not: seven twelfths
of a measure is not seven columns once the eleven gutters are counted, and a
nested grid on the same gutter lands on exactly the outer grid's lines. It also
keeps a two-up one block rather than two, which the reveal and the run's stagger
both depend on.

**THE HEADER'S AIR IS THREE DIALS**, and the sizes in it are not. The letterhead
block is a masthead rather than prose — it is the first thing in every capture,
and the space in it is doing as much of the work as the type — so the three gaps
are tunable live like everything else in `PV PAGE`:

| dial | what it opens | was | is |
| --- | --- | --- | --- |
| `headEyebrowGapPx` | `SECTION NN` → the title | 10 | **15** |
| `headTitleGapPx` | the title → the reference line | 10 | **15** |
| `headRuleGapPx` | the air on EACH side of the hairline | 24 above, 28 below | **36** |

The first two were one 10px flex `gap`, which is why they could not differ: one
gap cannot tell the eyebrow-to-title distance from the title-to-reference one.
The rule had less air above it than below, because the space below was the block
grid's own 28px margin and nothing had chosen it; it is the same on both sides
now.

![The page header at 1728×996](header-spacing.png)

Moving these changes the height of every page on every card, so the captures are
retaken when they move — `BLOCK_VP.letterhead` in `placeholder.ts` is the
measured cost of the block and is deliberately NOT updated with them: it decides
how many blocks a placeholder section emits, and holding it still keeps cards 03
and 04 the same documents they were, half a block taller.

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
the other, with no geometry in between. That holds at ONE track position, and
under a moving track the crossfade becomes a cut; see
[the crossfade ends when the track leaves it](#the-crossfade-ends-when-the-track-leaves-it).

**Only the page's alpha moves.** It would be tidier to describe this as "the
page fades out while the sheet fades in", and it would be wrong: two surfaces at
half alpha over a ground let a quarter of the ground through between them, which
is a flash of blue in the middle of the swap. The sheet sits underneath at full
alpha and the page dissolves off it.

Which means the invariant has to hold *before* either fade starts:

> The sheet's flat screen rect and the page's rect agree to ≤ 1px, on both
> signed-off viewports and at both device pixel ratios.

**Measured: 0px**, on both axes, at both viewports, at both ratios, on every
hand-off of all nine sections of the three cards. `fitPlaneToRect` is what makes
it true; `pv-verify` is what keeps it true; and a dev warning (`[pv:handoff]`)
fires if the two rects are ever more than a pixel apart at the moment of a fade,
because a silent miss here looks like a rendering bug anywhere else in the
view.

The measurable version is the **diff**: screenshot one surface, screenshot the
other, and count the pixels inside the page rect that differ.

**IT IS TAKEN ON THE FRAME THE HAND-OFF HAPPENS ON, and that is load-bearing.**
`positionAt` turns the segment to `page` at `start[k] - SEGMENT_EPSILON`, so the
sheet is on screen up to but not including that line; the suite asks the app for
that frame (`__pv.handoffFrame(k)`) rather than carrying its own copy of the
number, and a boundary that moves takes the measurement with it.

It used to sample `p` = 0.999 of the entrance — a number rather than a
mechanism, and 0.9px short of the boundary at the shipped `enterDistance`. The
gap is not free, because the entrance eases in and the last of the easing is
where all of it is. Measured down the tail of one entrance at 1728×996:

| `p` | 0.6 | 0.8 | 0.9 | 0.95 | 0.99 | 0.999 | the hand-off frame |
| --- | --- | --- | --- | --- | --- | --- | --- |
| forward diff | 32.4% | 22.9% | 16.6% | 13.1% | 7.3% | 2.1% | **1.0%** |

**Real prose is what made it legible.** Nothing about the approach changed; what
changed is the page. A full measure of body type has glyph edges everywhere, and
every one of them resamples through whatever sub-pixel of the approach is left —
where the placeholder's flat colour plates and short paragraphs had almost no
edges to show it on, and sat under budget by accident rather than by being
right. Cards 03 and 04 are still placeholders and still improved, from ~0.7% to
~0.45%, which is how you can tell this is the mechanism rather than a fix for
one card.

| | forward, worst | reverse, worst | mean | residual at `p` = 0.999 |
| --- | --- | --- | --- | --- |
| 1728×996, 1× | **1.309%** (card 02) | 0.221% | 2.1 levels | 2.253% |
| 1440×900, 1× | **1.332%** (card 02) | 0.309% | 2.1 levels | 2.267% |
| 1728×996, 2× | **1.159%** (card 02) | 0.066% | 1.9 levels | 1.888% |
| 1440×900, 2× | **1.192%** (card 02) | 0.073% | 1.9 levels | 1.953% |
| cards 03 / 04 | 0.40 – 1.20% | 0 – 0.27% | 1.2 – 2.0 levels | 0.68 – 2.02% |
| four windows that are not buckets, both ratios | **≤ 1.445%** | ≤ 0.438% | ≤ 2.2 levels | not measured |
| budget | 2% | 2% | — | not asserted |

*Measured on the bucket captures, `npm run verify:pv`, 2026-09-23.* Card 04 is
real now, so it sits beside card 02 rather than with the placeholder.

**The residual is reported and never asserted.** It is the same comparison taken
at `p` = 0.999, printed on every run so the cost of the last sub-pixel of the
easing stays a number somebody can see — rather than one nobody measures again
the moment the check stops tripping over it. Card 02 is 1.95 – 2.10% of the page
there, which is the figure that used to be the hand-off's own and used to fail.

**1× costs a little now, and it is the capture.** Every capture is 2× (see
[the bucket model](#the-textures-are-captures-of-the-page-one-pair-per-bucket)),
so a 1× display samples it at 2:1 where it used to wear a 1× capture of its
own. Forward runs 1.31 / 1.33% at 1× against 0.99 / 0.90% off the old 1×
files, and the reverse diff is 0.22 – 0.31% against 0.03 – 0.04%. That is the
difference between the browser drawing type at 1× and a 2× drawing of it
averaged down, and it sits well inside the budget. At 2× nothing is resampled,
and the numbers are where they were.

What the table cannot show is the state it replaces: before the 2× captures
existed, this measurement at `deviceScaleFactor: 2` would have been a 1× texture
magnified two to one into a 2× framebuffer next to type drawn at 2× — and the
suite could not see it, because it only ever ran at 1×.

**The captures a reader is about to need are fetched while they read.** A
texture is otherwise requested the moment it is first BOUND, and for a tail that
moment is `p` = 0 of the tear — the frame the reverse crossfade lands on, where
a capture that has not arrived is blank paper. At 1× that race was rarely lost;
at 2× the files are four times the pixels and it was measurable, at **74.8% of
the page differing** on the first tail of a run at 1440×900. So when the reader
lands on a page the driver warms the whole resident window — this section and
its two neighbours, a `sheet` and a `tail` apiece: a fetch and a decode, nothing
bound and no frame painted, long after the first-open lock has armed. It is the
window rather than the two the reader is walking towards because the captures
behind them have been DISPOSED by then; see
[what is resident](#what-is-resident-and-what-is-let-go).

`pv-verify` asks the canvas which capture it is wearing and whether it has
decoded (`__pv.sheetTexture()`) before it photographs the sheet, because the
suite seeks straight to the frame and skips the reading the warm depends on —
and a failing diff now says which file, and whether it was cold.

The reverse diff is all but zero because it is the easier of the two: a tail
capture is taken from the same page at the same scroll the tear starts at, and
at `p` = 0 the sheet is exactly flat — so the two screenshots are the same
pixels through two pipelines that happen to agree. The forward one has an
entrance's last frame on one side of it. **A zero that means nothing is worse
than a number**, so the suite also asserts that the second shot IS the sheet:
every page hidden, the canvas visible. Without that the check could pass at 0%
by photographing the same page twice, which is exactly the shape of failure a
reverse crossfade has.

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

### A hand-off never happens mid-reveal

The rule, and it is the second invariant this view rests on. The first is about
GEOMETRY — the sheet's flat rect is the page's rect — and this one is about
TIME: at the moment of a swap, the live page has to be the page the capture is a
picture of, and a capture is a picture of a page that has finished arriving.

A reveal is 800ms of opacity, blur and offset. A page caught part-way through
one is not a different rendering of the same document, it is the same document
at a different moment, and a 120ms crossfade has nothing to say about that. So
at every point a page is about to change places with a sheet, whatever is on
screen is put into its finished state first — and put there with **no animation
at all**, because an animation that has to be allowed to finish is an animation
that can be caught. `is-instant` is what that means in CSS, and `revealState.ts`
is where it is applied. The reveal is otherwise untouched: a block scrolled into
view plays exactly as it always did, flip and all.

Three places, because there are three ways to arrive at a swap:

| when | what is settled |
| --- | --- |
| a page is first shown — a forward hand-off, a rewind, **or a deep link** | everything in its window, at the scroll position it is about to be shown at |
| past **80%** of a vertical run | everything in the window, a viewport ahead of it, and everything within a viewport of the page's end |
| the reverse hand-off, at `p` = 0 of a tear | **all of it**, synchronously, in the same frame the swap is started |

The 80% rule is the one that is about a reader rather than about a mechanism.
The last fifth of a run is what someone flicks through to reach the next
section, and it is also exactly what the TAIL capture is a picture of — so
without it the blocks most likely to be mid-flight are the blocks the reverse
hand-off is about to compare against. The tear's own settle would catch them,
but it would catch them by snapping, a frame before the crossfade.

**Measured, with the settles removed:**

| | |
| --- | --- |
| a deep link to `#view-02/4` | **3 of 10** blocks still animating at the moment it arrives |
| a fast scroll into a tear (mid-page → the tear in 360ms) | **2 of 8** still animating one frame into the peel |
| with the settles in | **0**, in both, at both viewports and both scales |

#### …and the suite had to be taught to see it

The pixel checks reported **0% on every one of those cases**, with the fix
removed, and the reason is worth the paragraph. Playwright's
`animations: 'disabled'` does not freeze a finite CSS animation — it
FAST-FORWARDS it to its end before the shutter opens. Every diff in `pv-verify`
is taken that way on purpose, because it is what makes the grain and the reveals
reproducible between runs, and it also means those shots **cannot photograph a
page mid-reveal**. The screenshot finishes the reveal for you.

So the reveal checks do two things instead. They ask the ANIMATIONS directly —
`getAnimations({ subtree: true })`, counting only `pv-reveal`, `pv-flip` and the
character and hairline transitions, because a block may legitimately contain
something else running (the Rive placeholder's spinner is infinite, and counting
it reported two moving blocks on a settled page). And where they do compare
pixels, they shoot with `animations: 'allow'` and pause the grain, which is the
one animation not under test.

The `stillFrame` helper that used to sit in front of every hand-off photograph —
shoot until two frames come back identical — is gone with them. It worked, and
it was measuring the wrong thing: it made the suite wait for a state the reader
never waits for. A hand-off happens when it happens.

### The crossfade ends when the track leaves it

The third invariant, and the one a real wheel found. The two surfaces show the
same pixels at one track position, the hand-off's `origin`: the page's top for a
`sheet` capture, its bottom for a `tail`. The crossfade used to run on a clock
alone, and the track does not stop for a clock. Lenis is still gliding at
15–20px a frame when a swap starts under a wheel. So for 120ms the flat sheet
held still while the page fading in over it scrolled away, **126px apart by the
end**, and the content **jumped 75–92px** in the frame the page crossed half
alpha. A reverse hand-off froze both surfaces while the track ran on, and the
tear jumped to catch up when it ended.

Rewinds had a second fault on top. The leaving page was repainted at its
BOTTOM for the whole crossfade, because the hand-off passed `pageScroll[k]` for
every page-to-sheet swap, including a rewind out of the page's top into its own
entrance. That jump was **488–1404px**, a whole different screen of the page for
120ms, on every rewind of every card. It now leaves from the end the capture
was taken at.

So the crossfade is as long as the clock says **or** as far as the track may
move from `origin`, whichever runs out first: `HANDOFF_SLIP_PX`, 1px, in
`Scroller`. At rest the clock runs out first and nothing has changed. That
covers the open landing, a letterhead click or a settle arriving, and every
`seek` in the suite. Under a wheel the track runs out first, and the swap is a
cut with the page already where the track puts it. A cut mid-scroll does not
show, because every glyph is moving 15px a frame and that hides the ≤2% of
antialiasing the two surfaces disagree on. The 1px limit leaves room under the
check's 2px for the browser rounding the page's inner `scrollTop`. Reduced
motion is exempt: its swap is halfway across a stretch where neither page
moves, so there is no `origin` to leave.

**None of the three suspects was it.** Lenis's target and animated values are
continuous across every swap, so no delta is applied twice. The scroller is not
locked after arming. And the one frame of lerp overshoot past
`SEGMENT_EPSILON` (≈7px at speed) was one part of the frozen-sheet error rather
than a cause on its own.

**Measured** per frame through CDP wheel events, bursts and trackpad-fine, down
and up cards 02 and 04 (and card 03, since it became real): each frame near a hand-off, against the picture the view
draws at rest at the same position. Before: **70–78px** worst going down,
**1174–1476px** going up, and 10–11px even on a trackpad. After: **≤1px** on all
eight walks. Every screenshot check passed throughout, because `seek` holds the
track still under the shutter.

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
its tear, which is a legitimate state and is what the short sections of the
cards exercise, and what `pageTrack.test.ts`'s one-section project does. The last section has neither a tear nor a
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

**It is the ROLL — `curlMode` 0, the cone wrap.** See
[the two shapes](#the-two-shapes-and-which-pose-uses-which).

| Window | What moves | From → to |
| --- | --- | --- |
| 0 → 0.16 | `rotationZ` | −45° → 0 (`startRotationDeg`) |
| 0 → 0.22 | `scale` | 0.41 → 1 (`scaleBase`, `scaleTargetAt`) |
| 0 → 0.60 | `uCurlAmount` | −1 → 0 (`enterCurl`, `curlOutAt`) |
| 0 → 1 | `positionY` | −0.51·H → the page's resting y (`riseFromH`) |
| = 1 | the hand-off | fade the page in over `handoffMs`, stop the canvas |

**It arrives as a tube and unrolls.** At `enterCurl` −1 with `enterRollReach` 1
the WHOLE sheet is wound: the front is `amount × reach`, so what the entrance
animates is how much of the sheet is still in the tube, and the radius —
derived from a fixed 2.35 turns — shrinks with it and reaches nothing exactly
when the amount does. The tube is **101px across** at 1728×996 (41px on screen
at the start, where the sheet is still at 0.41 scale) and it rolls from the
BOTTOM edge, the free end leading as the sheet rises into place.

Frames of it, and of what it replaced, are in
[`docs/paper-roll/`](paper-roll/README.md).

**Measured, down the sheet's own centre line**, through the same deformation and
the same camera the GPU uses, against where a flat sheet would have put the same
points — so the sheet's scale, turn and lift are in both and cancel:

| `p` | 0.05 | 0.1 | 0.2 | 0.3 | 0.45 | 0.60 |
| --- | --- | --- | --- | --- | --- | --- |
| how far it reaches, as a share of a flat sheet | **15%** | 23% | 38% | 54% | 77% | **100%** |

Identical at both viewports. That row is the check that was missing: **the pose
was right all through the release in which the entrance was a flat sheet tilting
in**, so nothing that looked at the pose could see it. A flat sheet, however far
it is tilted, comes back at 100% at every column.

**The softer entrance is `ENTRANCE_BENDS.held`** — `enterCurl` −0.55,
`enterCurlTightness` 0.35, `startRotationDeg` −28°. It is mode 0 too: a partial
roll, the sheet wound at its leading edge with the rest of it flat behind,
rather than a different shape. `PV PAPER` offers the two as a select and writes
the chosen one onto `PV MOTION`'s sliders, so the sliders stay the live values
and the select reads `custom` the moment one of them moves. `curlOutAt` is the
same 0.6 in both because it is a constraint rather than a taste.

Every channel is **linear inside its window**. The scroll is the clock and Lenis
is the only smoothing there is; an eased channel would put the sheet somewhere
other than where the wheel left it.

The windows are staggered deliberately and the order is the point: the sheet
stops tumbling first, reaches full size second, and **finishes unrolling well
before the hand-off** — `uCurlAmount` is 0 for the last 40% of the window.
`pv-verify` checks it at `p` = 0.6, 0.8 and 0.95 and it is `0` at all three, and
separately that the centre line is back to 100% by 0.60. A shape still resolving
at the swap is a shape the flat HTML cannot match, so the crossfade would have
to hide a shape change rather than a surface change. It cannot. Moving
`curlOutAt` down is the first thing to check if a hand-off starts showing.

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
| 0 → 0.15 | The free corner LIFTS. `uCurlAmount` 0 → +0.45 with the fold right at the corner (`peelOriginFrom` 0.08) and `uCurlWrap` 2.4 creasing it; nothing translates and nothing turns. A peel starts as a bend, not as a move. | 0 → **61px** |
| 0.15 → 0.6 | The fold TRAVELS across the sheet (`peelTravel`), the bend peaks at +0.6 around `p` = 0.4, the sheet turns −12° about the pin and lifts 0.12·H. The wrap floor lets go around `p` = 0.2. | 198px at 0.3 |
| 0.6 → 0.8 | It comes FREE: up and back to +0.9·H, 0.85 scale, −18°, and the bend relaxes to +0.2 as paper springs. | 896px at 0.5 |
| 0.8 → 1 | Off the top of the frame. `opacity` 1 → 0 over the last tenth ONLY. | — |

The corner column is measured, at 1728×996, through the shader's own geometry:
`bentPoint` puts the vertex at uv (1, 0) through the same bend and the same
camera the GPU does, and the figure is its distance from where a FLAT sheet
would have put it — so the sheet's own turn, lift and scale are in both and
cancel. At 1440×900 it is 3.3 / 33.9 / **52.3** / 160.9px at `p` = 0.05 / 0.10 /
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
(1, 28 and 104px clear of its bottom edge); by `p` = 0.9 what is left is 922px
clear above the page and 1,239px of paper against the 1,377,408 it started with.

Those are the figures for the TALLER page — the rect grew 96px when the close
pill went, and every one of them is a screen measurement, so every one of them
moved. The shape did not: the same checks, the same budgets, the same passes.
At 1440×900 it is 1 / 25 / 92px clear below, 818px clear above at `p` = 0.9, and
2,166px of paper out of 1,005,312.

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

#### The open tween is the one entrance the view paces itself

Everywhere else the wheel is the clock, and the entrance's channels are
staggered for exactly that: the reader decides how long to look at each part of
it. Run against a clock instead, that stagger is wrong — it spends the first few
frames on the tube, which is the whole idea of the thing, and the rest of the
tween on a flat sheet sliding the last of the way up.

So the open has a curve of its own, and a START of its own:

| | |
| --- | --- |
| `openDelayMs` | **400** — the pane is still fading up; nothing of the sheet moves under it yet. |
| `openRiseMs` | **2600**, against the 900 it was. The sheet climbs the better part of a viewport before it opens, and the travel has to be paid for. |
| `openStartBelowPx` | **40** — the clearance between the bottom of the frame and the top edge of the rolled sheet before anything moves. |
| `openSkipMs` | **350** — what a wheel during the open buys: the rest of it, this fast. |
| `EASE.open` | the tween's rhythm: a soft start, a long settle. |
| `OPEN_TRACK` | what that time is SPENT on — eased progress → how far through section 0's entrance the track has come. |

`OPEN_TRACK` has three phases, and they are the shape of the open:

```
0 → 0.30   THE RISE, AND THE HOLD   the sheet climbs into frame from below it
                                    while the track barely moves, so what
                                    travels up the screen is a TUBE at −45°
  → 0.75   THE UNROLL               the track runs to curlOutAt, where the
                                    entrance's own table has the bend out. The
                                    un-tilt is at the head of this, so the tube
                                    squares up just before it opens
  → 1      THE SETTLE               a flat sheet rising the last of the way in
```

**It arrives from outside the frame, and the depth is COMPUTED.** A
scroll-driven entrance follows a dwell — the ground is already empty, the reader
is already moving — so it can start half in shot and read correctly. The open
has nothing before it, and a sheet that is simply THERE when the ground arrives
has no arrival. `riseFromH` alone cannot say this: it is a fraction of the PAGE
height and the page is not the viewport, so the reference's −0.51 left most of
the tube on screen from the first frame. `openStartDepth` works from the frame
instead — the flat plane's bounding box at the start pose, against the live page
rect — and comes out at **1.03 page heights** at 1728×996, which is 438px deeper
than the shared dial gives. **Measured: the first sheet pixel to appear is 950px
down a 996px viewport.**

**The rise is a SECOND CHANNEL, and it has to be.** `y` and `curl` are both
driven by the entrance's own progress, at different rates: by the time `y` has
carried the sheet a viewport upward, `curl` is long since 0. A tube cannot
travel while holding its shape if the only thing moving is the track position.
So the extra depth is paid off over phase 1 on the same eased clock — it
decelerates into the unroll rather than gliding to a stop — and it exists only
while the open owns the position.

**Neither the curve nor the depth touches the pose table**, and that is the
whole reason either is safe to have. The entrance's poses are shared with every
scroll-driven entrance between sections; pacing the open by editing them would
have paced all of those too. Measured as SHA-256 of section 1's entrance at
`p` = 0.1 / 0.4 / 0.8, with the open tune reverted and restored:
**byte-identical**, all three points.

**The delay is measured from the CLICK, not from `arm`.** `arm` runs after fonts
and the first layout, which is 250–400ms here, and a delay counted from there
put every moment of the open that much later than the dial said — the sheet was
still below the frame at 0.6s when it was meant to be entering. What the dial
means is "how long after the click before anything moves", so that is what it
now is; arming for longer than the delay simply spends it.

Measured, from the click (1728×996, 2×):

| | | |
| --- | --- | --- |
| 0.2s | nothing — bare ground | `curl` −1, below the frame |
| 0.6s | the tube's tip, entering at the bottom edge | `curl` −0.98, −42° |
| 1.0s | the tube in frame, square, starting to open | `curl` −0.73, 0° |
| 1.6s | flat and sharp, rising | `curl` 0, `y` −0.16 |
| 2.2s | all but docked | `y` −0.04 |
| 2.6s | docked | `y` −0.01 |

`EASE.open` is `(0.3, 0.35, 0.2, 1)` and not the `(0.22, 0.6, 0.2, 1)` it was
specified as: that curve leaves the origin at a slope of 2.7, which is a fast
start rather than a soft one, and it had the tube gone by 0.87s.

**Nothing paints but the canvas until the hand-off.** The first layout of a
fresh open holds the ENTRANCE at `p` = 0 rather than section 0's page at its
top, so the rolled sheet is the first thing in the paint order. It is not only a
question of which position the first frame holds: the re-measure syncs the
scroller to the track position, a scroller cannot go negative, and the 0 it came
back with used to paint section 0's page and then crossfade it away again —
measured at full alpha **473ms** after the click and gone 130ms later. The rule
is that the open owns the position from the first layout, not from `arm`.

#### A wheel during the open runs the rest of it fast

The open is three seconds and the reader cannot scroll THROUGH it: every
position it holds is one whole `enterDistance` below zero, a scroller cannot go
negative, and there is no value to hand a wheel mid-tween that is not a jump of
the entire entrance. What there is instead is the rest of the tween, run fast.

The first wheel or touch **retargets** it: the clock stops where it is and a new
one runs from that exact progress to 1 in `openSkipMs` (**350**). The mapping is
untouched — same `OPEN_TRACK`, same lift, resumed from the same number — so the
tube finishes its unroll and docks, and the only thing that is discontinuous is
the clock. It fires **once**: the second wheel of a gesture must not restart the
retarget and stretch the ending it is trying to reach.

**The curve is an ease-IN-out, and it was asked to be an ease-out.** At the join
the open is barely moving in TRACK terms — the rise is carried by its own
channel, so phase 1 spends only 0.04 of the track and the position is doing 2px
a frame. An ease-out has its maximum velocity at the start by definition, so
whatever else it is, it is a step:

| `EASE.openSkip` | first frame | worst frame |
| --- | --- | --- |
| `(0, 0, 0.2, 1)` — a plain ease-out | **147px** modelled, **310px** measured | 310px |
| `(0.65, 0, 0.35, 1)` — easeInOutCubic | 2px | 118px |
| `(0.4, 0, 0.6, 1)` — **shipped** | **1px** | 120px |

Measured, with the wheel at 0.82s: the position is handed over at **1.25s** and
the page is docked at **1.21s**, against the 1.17s the dial asks for. The wheel
that asked does not itself scroll — Lenis is stopped until the hand-off, so the
first gesture that moves the track is the one after it. A wheel after the dock
is an ordinary scroll, and a wheel during the DELAY, before a frame has been
drawn, still lands cleanly.

**No frame over 20ms through the skip** — worst 16.8ms. That figure is taken on
a SYNTHETIC wheel, and the reason is worth writing down: Playwright's wheel goes
over CDP and costs a dropped frame all by itself, measured at **33.3ms with no
tween running at all**. A dropped frame makes the tween catch up, and the catch
up then reads as a 297px step that no user would ever see. Measuring the motion
on an event that does not go through the browser's input path is what isolates
this code from the harness.

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

The **paper** is opaque, so the ratio under a run of text on it is a property of
two colours rather than of whatever the compositor happened to blur behind it.
No backdrop to reconstruct, no stack of two translucent layers.

The **ground** is the sky, so its colour comes back out of the WebGL buffer —
which is the one thing the flat blue had retired and this change brings back. It
is read as the brightest pixel in the letterhead's band, against a forced
worst-case sky, under both washes. The whole argument — including why the worst
case is an *overcast* noon and not a clear one — is in
[What the bar is measured against](#what-the-bar-is-measured-against-and-why-it-is-not-a-clear-noon).

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
and it is held to the same bar — including the way out at its right end, which
is now the only chrome the view has and the one thing on screen a reader has to
be able to find without having been told it is there. `pv-verify` fails the
build below it.

Measured, worst of each kind, sampled down a whole section at both viewports:

| run | on | px | ratio |
| --- | --- | --- | --- |
| `pv-letterhead__no`, `__ref`, `__back` | ground | 11 | **7.65** |
| `pv-letterhead-block__no`, `__ref` | paper | 11 | 8.47 |
| `pv-letterhead__section` | ground | 11 | 8.87 |
| `pv-body` | paper | 16 | 9.01 |
| `pv-twoup__text`, `pv-figcaption` | paper | 14 | 9.01 |
| `pv-linkpill` | paper | 12 | 9.86 |
| `pv-letterhead__project` | ground | 11 | 10.94 |
| `pv-letterhead-block__title`, `pv-heading` | paper | 96, 22 | 14.06 |

Two numbers in that table were set by the measurement rather than by eye. The
small mono labels on paper are at **0.80** ink and not 0.74: the paper's grain
multiplies, so its worst patch is 8% darker paper under type that is 8% darker
too, and at 0.74 the 11px labels land on 6.94:1 — a miss by six hundredths. And
the letterhead's dim state is at **0.80 white** on a band held down to roughly
`#142a63`'s luminance — by `groundColor` when that was the ground, by
`letterheadScrim` now that the sky is — which is what leaves any room at all between
"dim" and "white"; the current section is marked with a rule as well as with a
weight of light, because 0.80 to 1.0 is not much of a signal on its own.

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

**The textures are not part of that gate**, and the 2× set makes that argument
stronger rather than weaker. A capture's decoding affects no layout, so the lock
must arm before paint *with the textures cold* — waiting on them would put a
WebGL asset on the critical path of a scroll lock, which is the wrong dependency
in the wrong direction. `pv-verify` proves it rather than asserting it, **at
both ratios**: in a cold context with every capture held back 3s and every block
asset held back 1.5s, the track armed at **1788ms at 1× / 1990ms at 2×** and the
first capture landed at **3364ms / 3581ms**, with 0 of 12 block images decoded
at the moment it armed and 11 after. Page heights before and after: identical.
It also checks that the captures fetched were the ones for the ratio it is
running at — a picker that quietly fell back to 1× would pass every other check
in the suite.

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

Placeholders: there are none left. Cards 02, 03 and 04 are real projects and
their section counts are their copy's — five each, split at the section breaks
their source documents already had. What follows is how a PLACEHOLDER section
got its length, kept because `placeholder.ts` is still in the repo and a
placeholder is still the fastest way to put a new card on the grid. A
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
instead: `closest('.pv-page, .pv-letterhead')`. That is still a fact about the
DOM rather than a rectangle someone has to keep up to date — it stays right
through a resize, a dial change, and anything a project puts on the page later.
A drag (>4px) is still not a click, and both ends of the press have to be on the
ground.

**The letterhead is chrome, not ground, dead space included.** It used to be
ground, with each button in it stopping its own pointer events so a press on a
number did not also close the view. That fixed the press ON a number and left
the space around it closing the view. That space is the 10px between two 21×22px
numbers and the 17px above and below them in a 56px strip, and a press a few
pixels off a number is an ordinary miss. Measured with real CDP presses logged
at both ends: **0 closes in 240 presses inside the buttons** (centred and
scattered, settled and mid-glide), and **9 in 120 aimed at them with ±5px of
scatter**. In all nine, the press and the release landed on the same dead
element, `header.pv-letterhead` or the nav's gap. So the strip did not move
under the pointer, the number was not re-rendered, and no stray handler fired.
The stopped events had a second fault: the hook never saw a press that began on
a number, so it kept the previous press's position. A press down on a number and
up on the margin, where an earlier press had started, closed the view.

So the question is asked in the hook, where it belongs. The strip is not
ground, the buttons stop nothing, and every press replaces the one before it.
Each number's HIT AREA is also stretched by a `::before` over the strip's full
height and half of each gap, so a near-miss scrolls to the section it was
aimed at instead of doing nothing. The button's box, and so its focus ring,
stays the size it was. The margin around the page still closes the view, and
`pv-verify` presses it to prove it.

Escape returns as before, and the rest of the app stays `inert` while the view
is open.

## Chrome: there isn't any

There was one piece, and it has gone. The **close pill** was a 96px hairline
ring in the bottom-left corner — a disc with its own tint, its own backdrop
blur, a hover transition on three properties, a `--pv-pill` channel in the open
storyboard, seven dials on a `PV PILL` panel, and a 144px band of ground
(`pageFootPx`) the page was forbidden to enter so it had somewhere to sit.

All of that to say a thing the keyboard already said. The ways out were never
the pill: they are **Escape**, **a click on the ground**, and **Back** — three
that cost nothing and were all there underneath it.

What replaced it is a word at the right end of the letterhead, `ESC / ← BACK`,
in the strip's own 11px mono. It is a line of the letterhead that happens to be
clickable, not a button drawn over the view, and it goes under the paper with
the rest of the band. It runs the same `close` that Escape and the ground run,
so there is one exit and it plays the same storyboard however it was asked for —
ending in `history.back()` when the view was opened from a card.

**It is first in the DOM and last on screen.** This is a modal: the way out
should be the first thing Tab reaches, not something you arrive at after every
section number and every link in the project — which is the arrangement the pill
had, for the same reason. `order: 1` puts it back on the right, where it reads
as a footnote to the strip rather than as the first thing in it. Verified: the
first Tab lands on it, Enter and Space both close, a real click closes, and the
app behind is still `inert`.

The contrast probe measures it with the rest of the strip — **7.65:1** against a
blown-out overcast noon, the same floor the section numbers sit at, against the
7:1 bar. It is the worst run of type anywhere in the view, in any weather.

And the page got the band back: **96px taller at both signed-off viewports.**

## The dev dock

`#view-NN?intro`. Panels: **PV GROUND**, **PV PAPER**, **PV PAGE**,
**PV MOTION**, **PV TRACK**, **PV REVEAL**, and **PORTFOLIO**
(Replay Open / Replay Close / Copy motion). The timeline is the open storyboard;
the close is a separate storyboard (the pane leads, the scrim trails 100ms) so
"Replay Close" plays it on its own rAF.

`PV STACK`, `PV FOLDERS` and `PV GLASS` are gone with the cabinet and the
frosted surface. `PV PAPER` holds the shader's MATERIAL uniforms, both lights
and the two colours; `PV GROUND` holds `groundScrim`, `letterheadScrim`,
`groundColor`, `groundAlpha` and `grainOpacity` plus the contrast readout that
used to live on `PV GLASS` — and `letterheadScrim` is the one that moves the
readout, because the probe measures the strip against a worst-case sky whatever
the weather is doing, so dragging it is a live read of the bar. `groundScrim` is
next to it and does nothing to the number, which is the point of having two;
`PV MOTION` holds the two distances, `handoffMs`, every entrance window and the
settle; `PV TEAR` holds the peel.

**The two shapes have separate dials, and that is the point.** The entrance is
the cone wrap, so `PV MOTION` carries `enterCurl`, `enterRollReach`,
`enterRollEdge` and `enterCurlTightness` — the roll's own four — and `PV TEAR`
carries `peelCurlTightness` with the rest of the peel. Nothing on `PV PAPER`
reaches either shape's geometry any more: one dial for both is how a tube first
became a crease across the whole peel and then became no tube at all.

What `PV PAPER` has in its place is `entranceBend`, a select over **`roll`**
(what ships — the first release's full tube), **`held`** (a partial roll) and
`custom`. Both are mode 0. Choosing one writes its four numbers — `enterCurl`,
`enterCurlTightness`, `startRotationDeg`, `curlOutAt` — onto `PV MOTION`'s
sliders, so the sliders stay the live values rather than arguing with a second
source of truth; move any of the four and the select reads `custom`. The two
presets are `ENTRANCE_BENDS` in `portfolioMotion.ts`, and **Copy motion** is
unaffected: the preset is a dock affordance and never enters `PortfolioLook`.


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
  reason there is one capture per bucket is the same reason there is one per
  end of a run: a capture is a picture of a particular frame, and there is no
  resampling between two of them.

## Not done

> **Just fixed.** The first two were not reproducible without a real hand, and
> the third was invisible to a suite that only ran at the two sizes the
> captures were taken at. All three are checked in `pv-verify` now
> (`--only hand` and `--only sizes` run just those); see
> [pointer targets](#pointer-targets) and
> [the crossfade](#the-crossfade-ends-when-the-track-leaves-it).
>
> - **The letterhead sometimes exited instead of scrolling:** the strip counted as ground, so a press a few px off a 21×22px number closed the view (9 in 120 presses with ±5px of scatter), and a stopped `pointerdown` left the hook holding the previous press.
> - **The swap changed the type's size at any window but two:** captures existed only at the two signed-off widths, so every other window wore the nearest one stretched onto a page of another width; the page is now laid out at a bucket and each bucket has its own captures (see [the bucket model](#the-page-is-laid-out-at-a-bucket-and-the-captures-are-per-bucket)).
> - **The content jumped at the swap on a real wheel:** the crossfade ran on a 120ms clock while the track kept gliding under a frozen surface (up to 126px apart), and a rewind repainted the leaving page at its bottom (488–1404px).

> **A note on what has just been fixed, because it is the kind of thing that
> comes back.** The entrance lost its roll for a release without a single check
> failing. The tear's PR replaced the cone wrap with an arc fold and gave the
> new function the OLD function's parameter names; a later PR set the roll's
> numbers into it. Everything about the pose was right, every threshold passed,
> and the sheet was a flat rectangle tilting in. What catches it now is a check
> on the SHAPE and not on the numbers that feed it — see
> [the entrance](#entrance--p-through-enterdistance). The general form: when two
> formulas share a vocabulary, no amount of testing the vocabulary tests the
> formula.

> **A note on what card 04 just proved, because it is the claim this whole file
> rests on.** Nosey replaced card 04's three placeholder sections with five, and
> the diff outside `projects/` is four lines: the registry, the section count in
> `projects.test.ts`, and two comments naming what each card is. Nothing in
> `Scroller`, `SheetCanvas` or `pageTrack` was touched, and cards 02 and 03 did
> not move — their captures are byte for byte the ones that shipped last week.
> The first real project proved a project could be dropped in; the second proved
> it could be dropped in at a different LENGTH, which is the half that was still
> an assertion.

> **And card 03 made it three, with the last placeholder gone.** Drex
> replaced a one-section placeholder with five real sections, and nothing in
> `Scroller`, `SheetCanvas` or `pageTrack` was touched; cards 02 and 04's
> captures are byte for byte what shipped. Outside `projects/` the diff is the
> registry, `projects.test.ts`, card 03's grid captions, and one addition to
> the block model — a `text` paragraph that ends in a link (see
> [the page](#the-page)) — because the copy's "Live:" and "Visit:" lines are
> links inside a line of facts and no existing block set one. `verify:pv` on
> 2026-10-02, all green at 462 checks: card 03's worst hand-off is 1.534% in
> and 0.151% out of 2% across all six windows and both ratios, and under a real
> wheel every frame near a hand-off is within 1.1px of the picture at rest.

> **A note on what has just gone off this list, for the same reason.** Eviction
> is in: the GPU holds the section being read and its two neighbours and lets go
> of the rest, and `pv-verify` asserts the count rather than reporting the
> megabytes. It took two findings that no amount of reading the code would have
> produced, and both are written down in
> [what is resident](#what-is-resident-and-what-is-let-go) — a `hide` that left
> a capture pinned, and a crossfade that outlived the window it started in. The
> general form: a cache with a window is only as small as its EXITS, and the
> exits are the paths nobody draws on the diagram.

1. **The captures are not a build step.** `npm run placeholders` takes them, and
   nothing fails if a section's first or last viewport changes and its capture
   does not. The hand-off diffs catch it *in the verify run*, which is the right
   signal in the wrong place. A content hash of each captured frame, checked at
   build, is the fix — and it now has to cover fourteen captures per section,
   two per bucket, rather than two.
2. **Below 1280, and above a 1552px-tall window, the capture does not cover the
   page.** Narrower than the smallest bucket, the page is fluid and the sheet
   wears the 1280 capture stretched to it, which is the old stretch in the one
   place it is left. Taller than 1552, the page is taller than the capture's
   1400 rows and the sheet shows paper below them. Both are a line in
   `pageBuckets.json` (a smaller bucket, a taller capture) and a retake, not
   code.
3. **One capture costs the GPU 1.7 times what it did.** The texture is the whole
   1400-row capture and the shader crops it. Cropping at DECODE instead
   (`createImageBitmap` with a source rect, re-cut on resize end) would put the
   GPU back at the live rect's size, 21.0 MB at 1728 against 34.9 MB now,
   for the price of a re-decode when the window's height changes.
4. **The page's grain layer is nine times the page's area** (`inset: -100%`, so
   the compositor loop can step it without showing an edge). At 2× and 1400px
   tall that was enough to overflow headless Chrome's raster budget, which is
   why the scripts raise it. A real GPU has far more room, but the layer is
   paying for a margin it only needs a fraction of.
5. **three.js is 539 KB of the bundle.** Measured: 367 KB → 912 KB raw,
   119 KB → 257 KB gzipped. It is a static import for the reason the view itself
   is one — the open is a storyboard that has to start on the click, and a chunk
   fetch in front of the first entrance is a blank ground. Splitting it behind
   the view's own 600ms fade would probably be invisible and has not been
   measured.
6. **Close reversal.** The spec asked for the page to drop back the way it came
   as the view closes, trailing the scrim by 100ms. It currently leaves with the
   view. The entrance machinery — a tween driving the track position — is what
   to reuse: run it from the current position to `minPosition` on `requestExit`,
   100ms behind the scrim.
7. **A hash change while the view is open does nothing.** A deep link works on a
   fresh open; editing `#view-02/3` to `#view-02/5` in place, or a `popstate`
   that lands on a different section, leaves the scroller where it was.
   `PortfolioView` has the handle to fix it in one line — it did not seem worth
   doing without a case that wanted it.
8. **The tear’s flap is rigid.** Past the arc it is a straight plane, so a peel
   that travelled the whole sheet would put a stiff flag several page heights
   long into the frame. `peelTravel` is dialled to 0.45 to stay well inside
   that, and `curlDepth` flattens what is left. A flap that DROOPED — a second,
   much larger radius past the first — would take the constraint off, and is the
   obvious next thing to try if the tear ever wants to run further.
9. **The placeholder is unregistered, and the Rive block has no page.** Drex
   replaced card 03's placeholder, so `placeholder.ts` — the nine-block cycle,
   `BLOCK_VP`, the viewports-per-section arithmetic — is in the repo with
   nothing importing it, and `make-placeholders` still writes its block media
   into `public/projects/placeholder/` for no page. It was also the only page
   with a Rive block on it, so the block's lazy mount (and `__pvRive`'s park in
   the capture pipeline) now has no exerciser at all, and `projects.test.ts`
   stopped asking for one rather than assert something nothing ships. Either
   delete the lot, or keep one placeholder card behind a dev flag as the
   mechanics' test bed; and the artboard check comes back with the first real
   page that carries one. Card 03 also took the ONE-SECTION case out of the
   browser suite: it is still a `pageTrack` unit test, but no browser walks a
   card with no tear any more.
10. **Two cards, two kinds of face.** Card 04's is real — a frame of its own
   pitch site, cut by `CARD_FACES` in `optimize-projects.mjs` — and cards 02 and
   03 are still the flat plates `make-placeholders` draws. Card 02 is the odd
   one: a real project wearing a placeholder plate, which now reads as a gap
   rather than as a card waiting its turn. It has clips in its folder and the
   machinery to crop one is two lines of table.
11. **The card face's frame is a number typed by eye.** `at` and `focus` were
   picked by cutting a dozen candidates out of the clip and looking at them, and
   nothing re-checks them: re-encode the clip a second shorter and the face
   becomes whatever is at 110s now. The frame is the thing a reader sees first
   on the grid, so it is worth more than a comment — a committed contact sheet,
   or the frame's own hash, would make a face that has quietly moved visible.
12. **No card is named on the grid.** `name` and `description` were card 04's
   alone, and both were removed on 2026-09-30: the grid's hover headline is
   the card's NUMBER on every card, the tile carries no label, and the detail
   hero carries only the number. The project view never read either. A card
   that wants to say what it IS before it is opened has nowhere to now; if
   that comes back, it wants to come back on every real card at once — a grid
   where three cards name themselves and one says "03" is worse than either
   consistent state.

## Running the checks

**Two prerequisites, and neither is installed by cloning.**

```
npm ci               # a Conductor worktree starts with NO node_modules
brew install ffmpeg  # must be a VP9-capable build
```

`npm ci` first: a worktree is an isolated checkout and `node_modules` is not
copied into it, so the first `npm run projects` in a fresh one fails on
`Cannot find package 'sharp'` rather than on anything to do with media.

**ffmpeg is NOT a project dependency** — `optimize-projects` and
`make-placeholders` both look for `$FFMPEG` and then for one on `PATH`, and skip
their video steps with a note when there is none. What they need is a build with
**`libvpx-vp9` and `libx264`**, because a clip ships as both encodes; Homebrew's
has had both for years. Check before trusting one that is already there:

```
ffmpeg -hide_banner -encoders | grep -E 'libx264|libvpx-vp9'
```

A binary can be on the disk and still be no use. The one this machine had was
an ffmpeg 0.10.2 from 2012 bundled inside an unrelated app, with no VP9 encoder
at all — it was not on `PATH`, so nothing was silently wrong, but a build old
enough to answer `ffmpeg -version` and young enough to look fine is exactly the
thing to check the encoder list of rather than the version of.

`npm run projects` reads each slug's folder AND a `media/` folder inside it
(card 03's clips are in `drex/media/`, beside its cover's handoff files); the
subfolder is not part of the output name. Note that `npm run projects -- --force`
forwards `--force` only to the LAST command in the script, `make-cover-stills`:
to re-encode media, run `node scripts/optimize-projects.mjs --force` itself.
A clip that has no output yet is encoded either way.

Then:

```
npm run dev          # in one shell
npm test             # pageTrack + fitPlaneToRect + both shapes, in node
npm run projects     # re-encode a project's media from ~/Discommode-pages (needs ffmpeg)
npm run placeholders # regenerate the captures after a page change (needs the dev server)
npm run verify:pv    # the same view, in Chrome, at six window sizes and both DPRs
npm run verify:gpu   # 20 open/close cycles, watching the GPU process
node scripts/sky-contrast.mjs  # the letterhead: 24 still skies, then the sweep (~1 min)
```

`scripts/pv-verify.mjs` is the browser suite, and it exists because the unit
tests cover `pageTrack`, `fitPlaneToRect` and both shapes' geometry thoroughly and
nothing else, while every bug this view has had was one only a browser could
see. It runs both signed-off viewports (1728×996, 1440×900) **at both device
pixel ratios** on all three cards — 02, 03 and 04, five sections each — and
checks:

- **the rect match, both ways** — the sheet's flat screen rect, as three.js
  projects it, against the page's rect, ≤ 1px on both axes, at both hand-offs of
  every section;
- **both hand-offs at four windows that are not buckets** — 1366×768,
  1512×982, 1680×1050 and 2000×1100, at both ratios, every section of every
  card: the rect match, both diffs (≤ 2%), and that the sheet is wearing the
  window's own bucket's capture rather than a neighbour that happened to be
  close. The two signed-off viewports are both buckets, so this is the only
  proof the hand-off no longer depends on the window. Measured at **≤ 1.45%**
  forward and **≤ 0.44%** reverse. See [the bucket model](#the-page-is-laid-out-at-a-bucket-and-the-captures-are-per-bucket);
- **a window dragged across buckets**, 1512 → 1760 and then down to 1366 across
  two, with the reader half way down a page: nothing re-lays mid-drag, the
  reader is on the same section at the same fraction after, no frame shows
  anything but the page, and both hand-offs then match off the new bucket's
  captures;
- **the reveal rule** — no reveal is running at either hand-off, on a deep link,
  or one frame into a tear reached by a 360ms flick from mid-page; and the page
  a forward hand-off hands to does not change over the second that follows.
  Asked of the animations as well as of the pixels, because a screenshot taken
  with `animations: 'disabled'` fast-forwards the very thing being looked for;
- **both hand-off diffs** — the last frame of an entrance against the settled
  page, and the settled page against the first frame of a tear, ≤ 2% of pixels
  differing inside the page rect. "The last frame" is the app's own
  (`__pv.handoffFrame`, derived from `SEGMENT_EPSILON`) rather than a `p` the
  suite picked, and the **approach residual** at `p` = 0.999 is printed beside
  it without being asserted — see [the hand-offs](#the-hand-offs). Plus the **control** (the same measurement
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
  tear with the canvas active, sampled off rAF. Measured at **16.8ms worst over
  73 frames** at every viewport and both ratios, which is a 60Hz frame: the
  entrance and the tear cost the same at 2× as at 1×, and the reason they can is
  that the sheet is one textured quad however many texels it is wearing;
- **the entrance is flat and square by `p` = 0.60**, and every frame of it is
  `curlMode` 0 while the tear is `curlMode` 1 on its own numbers;
- **the entrance is a TUBE**, asked of the shader's own geometry rather than of
  the pose — how far the sheet's centre line reaches down the screen against
  where a flat sheet would have put the same points, which is 15% at `p` = 0.05
  and back to 100% by 0.60. This is the check that was missing: the pose was
  right all through the release in which the entrance was a flat sheet tilting
  in, so nothing that looked at a pose could see it;
- **the resident set**, which is asserted: walking every section of every card
  forward and then rewinding it, the GPU never holds more than the six captures
  of the reader's window — and never fewer, so nothing the reader is about to
  need is left to be fetched cold. Asked of `__pv.textures()`, which is the map
  itself. See [what is resident](#what-is-resident-and-what-is-let-go);
- **the capture set's cost**, reported rather than asserted: files and bytes on
  disk at each scale, the GPU texture a project would hold with nothing disposed
  and what the worst window actually holds. See
  [what the set costs](#what-the-set-costs);
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
  cold — **at both ratios**, because the 2× set is about four times the pixels
  and is the bigger claim; plus that the captures it asked for are the ones for
  the ratio it is running at;
- the settle, on all four of its cases: a tear left before and after halfway, a
  dwell, and an entrance. Outside the dials nothing moves, the ground a tear
  finishes on is left alone, a letterhead click is not grabbed, and a real wheel
  gesture stopped mid-tear finishes;
- **the last section is reachable at all**, which is a question about the
  SCROLLER rather than about the track: the position IS the scrollTop, so the
  spacer has to be the forward extent plus one viewport or the last viewport of
  track cannot be scrolled to. Asked three ways per card — the furthest
  reachable scrollTop against `maxPosition`, a real `park` scroll onto the last
  section, and a cold deep link straight to it;
- **the clips run**, walking each section's own vertical run so every clip comes
  into view: within 2s of arriving, every clip IN VIEW is decoded
  (`readyState` ≥ 2), playing, and visible — plus every clip on the page carries
  a poster and is muted as an ATTRIBUTE, not merely as a property;
- **a real hand on the controls**, the two checks that drive CDP input instead
  of `seek` or `element.click()`, seeded so a failure reproduces.
  `--only hand` runs just these. The wheel check at six sizes makes it the
  longest section of the suite.
  - **the letterhead soak**: 60 real presses per card on every card, aimed
    at a number with ±5px of scatter. Each follows a settled wheel burst, a
    burst still gliding, or the previous press's own scroll. None may close the
    view, and the last must land on its section. Then two controls: a press
    that began on a number and ended on the margin must not close the view, and
    a press on the margin must;
  - **the hand-offs under a real wheel**, at all six window sizes: bursts
    (6–12 notches of 40–120px at 16ms) down and back up the whole of every
    card, then trackpad deltas (2–8px) across every hand-off both ways. Every frame within 80px of a
    hand-off must be within **2px** of the picture the view draws at rest at
    the same position, and every walk must actually cross every hand-off.
    Measured at ≤1px. Against the build before the fix it reports 70–1476px.
    See [the crossfade](#the-crossfade-ends-when-the-track-leaves-it);
- **card 03's own claims**, at every BUCKET rather than at the six windows,
  each bucket's width at 16:9 (1280×720 … 2560×1440, the shortest ordinary
  window at that width). `--only drex` runs just these:
  - **its captures load**: all 70 — five sections, sheet and tail, seven
    buckets — fetched from the dev server and decoded, each the live page's
    width at 2x by 2800;
  - **every clip plays**: each of the six brought to the middle of its page by
    a real `park`, then decoded, running, visible and ADVANCING, at every
    bucket (42 of 42), and all six found;
  - **the pair fits**: the editor/generator two-up is on one line, meeting at
    the gutter, equal widths, inside both insets, each clip at its 16:9, both
    captions on one line — and the whole pair no taller than the page a reader
    sees it through, then centred and asked of the live page: both whole on
    screen and both playing. Measured from 526 + 52 + 526 (342px tall in a
    568px page) at 1280 to 1166 + 52 + 1166 (702px in 1288px) at 2560;
  - **nothing shifts at a hand-off**: every entrance, tear and rewind of the
    card, with the media arriving as it likes, watched three ways — the
    browser's own `layout-shift` entries inside the pages (0 at every bucket;
    the one outside is the dev env readout's text), the page heights the track
    was built from, and every block's offset in its page;
  - **the zine-reader clip plays to its end screen**: the shipped clip is the
    master's video stream to within 0.1s (17.1s, all 1028 frames), and the page
    lets it run into "You've read all of the Fresh book" and loop;
  - **the Live link opens a new tab**: a real press on "drex.style" in the
    intro opens drex.style (stubbed) in a new page, and the view stays open;
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
cannot otherwise know where one ended up; and `textures()` is the resident set —
every capture the GPU is holding and what it costs, which is the one claim about
memory that can be asked rather than inferred.

**THE TWO THINGS `seek` CANNOT SEE.** Every check above steers the track with
`__pv.seek`, which writes the position straight into the driver. That is what
makes a mid-tear frame holdable at all — but it means the suite never asks the
SCROLLER whether a reader could have reached a position, and never waits on a
media element the way a reader's browser does. Both of the bugs a live walk
found on the first real project were in that blind spot:

- the spacer was `maxPosition` rather than `maxPosition + one viewport`, so the
  furthest reachable scrollTop was a whole viewport short and the entire last
  section of every multi-section card was unreachable — measured at 1456×839 on
  card 02: `maxPosition` 12285, furthest 11446, `start[4]` 11766. Seeking went
  there happily;
- a clip was `opacity: 0` until `is-loaded`, and `is-loaded` arrived only with
  `loadeddata` — which under `preload="metadata"` means after a successful
  `play()`. So a clip's visibility was gated on it having PLAYED, and anything
  that rejects a play left an empty grey box wearing `.pv-frame`'s tint, with
  the poster hidden by the same rule. The capture pipeline parks every video on
  its first frame before it shoots, so the textures looked perfect throughout.

The two check families above exist because of them, and both fail against the
state that shipped them.

**`verify:gpu` is a separate run, and it asks the question `verify:pv` cannot.**
That one holds the view open and counts what is resident inside it, and a map
that is correctly pruned on every section change still leaks if nothing lets go
when the view closes. So: open card 02, walk every section of it, close back to
the grid, twenty times, sampling the GPU process's resident set from `ps` after
every cycle — which is the row Chrome's own task manager calls "GPU Process". It
is not a precise accounting of texture bytes and is not meant to be; what is
being asked is whether the twentieth cycle ends where the first one did, and the
shape of the curve in between is the finding.

It runs **headed**, and that is not a preference: headless Chrome falls back to
SwiftShader here, and WebGL on the CPU answers every question about video memory
with a flat line — the baseline came back just as flat *with every capture held*,
which is how that was found. It runs against the dev server, which mounts the
canvas twice per open (StrictMode) and so asks for two contexts where a reader's
browser asks for one; the measurement is conservative on purpose. The numbers are
in [what is resident](#what-is-resident-and-what-is-let-go).

**Opening the view is not done when the track has armed.** The intro is a tween
on its own rAF and it owns the position while it runs — and `seek` sets the very
flag the intro holds, so a seek issued underneath one is silently overwritten on
the next frame and the check measures the intro's frame instead of the one it
asked for. Both the suite and the capture pipeline used to wait a flat 1.8–2s,
which is a guess about the open tween's length plus the storyboard; at 2× that
guess went marginal and surfaced as an **intermittent 26% forward diff on card
03** —
the sheet 38px low, which is the intro a few frames from landing. Both now wait
for the position to stop moving and for a page to be the live surface. A deep
link satisfies both immediately, which is the point.

**The gate is the track being built, not the open tween being over.** The cold
first-open check waits on the track existing and samples the decoded media
there. It used to wait on `armed()`, which is the moment the tween hands the
position to the scroller — a different event that merely happened to be close
by. Lengthening the open to 2.6s pulled the two apart and the check failed in
the direction that matters: it reported the media as having beaten a gate the
media had not beaten. What the claim is about is the FIRST LAYOUT — the heights
are final and the track is derived from them before any asset lands — and that
is now what is measured. **Gate at 470ms, first capture at 3486ms.**

**Anything that asks the canvas what it is showing has to seek and then WAIT.**
For the 120ms of a hand-off the canvas is holding the flat sheet — that is the
whole point of it — so a probe that lands inside the swap measures a flat sheet
and reports, quite correctly and quite uselessly, that nothing has bent. It cost
an hour of thinking the corner lift was zero.
