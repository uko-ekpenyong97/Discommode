# The detail cards as paper

Once the detail view has settled, its three cards (the hero and the Prev/Next
neighbours) are no longer `<img>`s. A WebGL canvas draws them as sheets of paper.
A crease texture refracts and lights the artwork, the sheet dents under the
cursor, the row squashes with its own velocity, the neighbours carry a faint
resting ripple, and a card arriving in a neighbour slot un-crumples into it.
The hero lies flat at rest (`heroRipple` 0) so its cover stays registered with
the DOM sprites drawn over it. Hovered, Issue 01's hero comes alive: every
object on the cover loops and the whole sheet BOILS, plate and sprites together
(see [the boil](#the-boil)). Reference: <https://justinesoulie.fr/>. Its behaviour is ported, its numbers are
not.

The grid, the reader, the doorway and the portfolio view are untouched. The DOM
cards still carry the grid→detail morph, the exit morph and the doorway; the
canvas only takes over in between, and gives the cards back before anything
else moves them.

> **On the numbers in this file.** Architecture and dials are as shipped.
> Every *measurement* comes from `npm run verify:detail` on 2026-09-21 (46/46,
> re-run after `heroRipple`; 62/62 with the cover-life checks): headless Chrome, at 1728×996 and 1440×900, 1× and
> 2×, on an Apple M1 Max. [The arrival](#the-arrival)'s numbers are from 2026-09-28,
> two runs each of a production build and a dev one.

| | rest, paper on | rest, paper off |
| --- | --- | --- |
| #item-01 | `docs/detail-paper/rest-paper-on.webp` | `docs/detail-paper/rest-paper-off.webp` |

`hover-dent-mid.webp`, `prev-squash-mid.webp` and `neighbour-unfold-mid.webp`
sit beside them, and `boil-steps.webp`: two consecutive boil steps side by
side, held at full amplitude, with a 4× crop of the top corner under each.

## Map

| File | What it is |
| --- | --- |
| `src/components/DetailPaperLayer.tsx` | The engine: planes, the hand-off state machine, hover / velocity / fold drivers, the dev probe `window.__paper`. It renders an empty host; the canvas is paperGL's. |
| `src/components/detailPaper/paperGL.ts` | The GL, made once for the page ([the arrival](#the-arrival)): the renderer and its canvas, the programs, the crease map, the live covers' renderers, every face texture and the upload pump, and the warm-up that makes them. |
| `src/components/detailPaper/span.ts` | `span(name, fn)`: a `paper:<name>` User Timing measure in a dev build, nothing in production. `verify:detail`'s `arrival` prints them against its long frames. |
| `src/components/detailPaper/paperMaterial.ts` | The card material (vertex deformation, crease fragment stage) and the shadow material. |
| `src/components/detailPaper/paperMath.ts` | Pure helpers: tweens, fold targets, strip velocity, pointer → UV, sprite rects, the cover crop. Tested in `paperMath.test.ts`. |
| `src/components/detailPaper/paperDials.ts` | Every dial, as a module store (`paper`, `setPaper`, `subscribePaper`). |
| `src/components/detailPaper/handoff.ts` | `afterHandOut`: the gate every leave path waits on. |
| `src/dev/detailPaperDials.ts` | The DETAIL PAPER DialKit panel. |
| `src/reader/coverLife.ts` | Page hover and the boil (docs/reader.md): the dials, the stepped signal, and the registry this layer reads the hero's boil from. |
| `src/dev/coverLifeDials.ts` | The COVER LIFE DialKit panel. |
| `scripts/cover-life-checks.mjs` | The page-hover and boil checks `verify:detail` and `verify:reader` share. |
| `scripts/make-crease-map.mjs` | `npm run creases`, which writes `public/textures/paper-creases.webp`. |
| `scripts/detail-verify.mjs` | `npm run verify:detail`, the browser suite. |
| `src/covers/` | Live covers (docs/covers.md). The hero plane of a card with one samples a target the cover draws in THIS layer's renderer. |

`DetailView.tsx` changes in three places. At the end of every tick it hands the
layer each panel's rect, scale, opacity, z-order and slot, taken from the same
numbers that just laid the strip out. It mounts the layer's host, which the
shared canvas is moved into, as the view's first child (and tells it the
active item, whose faces upload first). And its Read issue / Open project
actions go through `afterHandOut`.
`useDetail.close` goes through it too, which covers the pill, Escape, the
backdrop and the swipe.

## Layers

Bottom to top, while the canvas carries the cards:

1. **The sky**, as always.
2. **The canvas** (`.detail__paper`, `pointer-events: none`). It draws every
   card's shadow and then every card, in the strip's z-order, so a neighbour's
   shadow falls under the hero exactly as the DOM's does.
3. **The strip**, the DOM panels. Their faces (`.detail__media`, and the hover
   layer's `.cover-anim__plate`) are `visibility: hidden`. Everything else is
   still DOM and still on top: the number, the name and its scrim, and **the
   CoverAnimLayer's sprites**. The panels keep every click, and the sprites keep
   resolving hover from the panel, exactly as before.
4. **The chrome**, the back pill and the bar.

**The canvas draws the shadows** because the DOM cannot. A DOM panel whose face
is hidden still casts its `box-shadow`, and it casts it *on top of the canvas*:
a neighbour's shadow would land across the hero's paper. So while the canvas has
the cards, the panels' shadows are off and the canvas draws the same one
(`0 24px 70px rgba(0,0,0,.55)`, scaled and faded with the panel). A blurred
rectangle is separable, so it is two erfs.

## The hand-off

It is the portfolio view's plate crossfade, over `HANDOFF_MS` (120ms), and for
the same reason **only the DOM's alpha moves**. The canvas sits under the strip
at full alpha, and the DOM faces dissolve off it or back over it. Two surfaces
at half alpha would let the sky through between them. The state is written to
`.detail` as `data-paper`, and that attribute is all the CSS needs.

| | when | what happens |
| --- | --- | --- |
| `dom → in` | the view is `active`, nothing above it wants the cards, the GL is warm ([the arrival](#the-arrival)) and every texture for this viewport is uploaded | the canvas paints, *then* becomes visible, in the same task; the DOM faces fade out; the DOM shadows go and the canvas's arrive on that frame |
| `in → on` | 120ms later | the DOM faces go `visibility: hidden`; the paper starts to settle in |
| `on → out` | a leave: close, Read issue, Open project | the DOM faces fade back in; the DOM shadows come back and the canvas stops drawing its own on that frame; the paper goes flat |
| `out → dom` | 120ms later | the canvas hides, *then* the leave runs |
| any `→ dom` | `live` drops without a leave having asked (browser Back, a hash edit, the reader mounting by URL), or the viewport's size or ratio changes (or `detailSideScale`) | instantly; for a size change the new size's faces are asked for and the hand-in runs again once they are in |

**Presence.** Every effect is multiplied by one `presence`, which is 0 at both
hand-offs. The canvas takes the cards over as an exact copy of the DOM (the
identity; see below). Only then, over `SETTLE_MS` (500ms), do the creases, the
ripple and everything else arrive. On the way out, presence falls back to 0
across the reverse crossfade itself, so the DOM comes back over a flat copy of
itself. This is not in the spec, and here is why it is needed. The resting
ripple alone moves the artwork 2–3px, and on line art that is most of the edges
in a card. Without presence, the 120ms crossfade would be a dissolve between two
different pictures. With it, the hand-off is a swap between two identical ones,
and it can be measured.

**Leaving waits.** `afterHandOut(then)` runs `then` at once when the DOM already
has the cards; otherwise it waits for the reverse hand-off. One leave at a time:
a second request during `out` is dropped. After a leave, the layer stays on the
DOM until `live` has actually dropped (the leave's hash change arrives a task
later) or a second has passed. Measured order, from `verify:detail`:

```
Read issue:        on #item-01 → out #item-01 → dom #read-01/0
Back to the grid:  on #item-01 → out #item-01 → dom
```

No frame ever shows the canvas under any hash other than the item's. After
closing the reader the canvas takes the cards back.

**`live`** is `phase === 'active' && (!suspended || authoring)`, where
`authoring` is the dev `#item-NN?intro` dock. That dock suspends the view on
purpose, and it is where the dials live.

## The arrival

Arriving in the detail view stuttered on every card: 120–480 ms frames for
~1.5 s in real Chrome, dev and production builds alike. The paper made its GL
as it mounted, and it mounts with the grid→detail morph, on the click. Now the
GL is made ONCE for the page, before the click, and nothing is destroyed on
close (`paperGL.ts`).

**Where the long frames came from** (a Chrome trace and Long Animation Frames
of `#item-01` from its tile, 1728×996 @2×, 2026-09-28, before the change):

| | cost | where |
| --- | --- | --- |
| the WebGL context and its drawing buffer | 170–370 ms of the click's own task | `new WebGLRenderer` on a 300×150 canvas, then `setPixelRatio` and `setSize`: four drawing buffers (300×150 → 600×300 → 3456×300 → 3456×1992, 4× multisampled). In a dev build StrictMode's second mount made a second renderer on the same canvas, whose `setPixelRatio` doubled the canvas's already-doubled width: 6912×1992, 6912×3984, then back. Each was a shared image the GPU thread made while it was busy: 50–280 ms in `GLContextEGL::MakeCurrent`, and the main thread waited on it |
| every face uploaded in one task | 20–25 ms; 276–608 ms blocked in `GetGLError` behind the buffers above | nine `initTexture`s in the microtask that finished the build |
| the faces decoded twice, during the morph | 100 ms frames with no script at all | `img.decode()` of every 2000×2600 file for its natural size, then the resize from the blob — on the same workers the morph's own images decode on |
| the programs | ~10 ms at the hand-in | the paper's and the shadow's, compiled and linked in the first `render`; card 02's cover renderer made and compiled (sync) in its first hero draw |
| contexts | +1 on every arrival (+2 in dev) | `renderer.dispose()` on close does not lose the context: each arrival made a new one |

**The model now:**

1. **The first hover of a grid card** (or the first press) starts the
   warm-up, one idle callback a step: the context on a 1×1 canvas (5–8 ms),
   its drawing buffer sized once to the viewport (~6 ms), the paper's and the
   shadow's programs compiled WITHOUT blocking (`compileAsync`,
   KHR_parallel_shader_compile) and then drawn once, invisibly (the driver
   builds its pipeline on the first draw), the crease map, every face for this
   viewport — decoded off the main thread, the natural size read without a
   decode, uploaded one at a time, a few ms a frame — and card 02's renderer,
   compiled the same way and drawn once into an 8×10 target. Not at app start
   and not on a key: a grid that is only looked at, or steered with the
   arrows, never makes the context (verify:cover's `contexts` holds the grid
   at 2).
2. **The click.** The detail view mounts; the layer moves the shared canvas
   into its host and asks for its faces, which are in. A click before the
   warm-up finished leaves the rest to the morph, which is 450 ms of runway.
3. **The landing.** One frame before the hand-in, the hero's live cover gets
   its targets at the hero's size (`primeHeroCover`); then the hand-in's
   first render, ~1 ms.
4. **Close.** The canvas leaves the view, hidden; the context, the programs
   (two never-drawn materials keep them — three frees a program with its last
   material), the crease map, the covers' renderers and the faces stay. A
   second arrival uploads nothing. A new viewport size or `detailSideScale`
   asks for the new size's faces; the old set is dropped once the new one is
   in.
5. **A direct load or a keyboard open** warms up as the view mounts, under the
   fade.

Card 02's text SDF (`riveText.ts`, ~140 ms) and its half-float conversion
(~20–40 ms) were one task each, on every page load; they run in ≤ 6 ms slices
now, with the same output.

**Numbers.** `verify:detail`'s `arrival`: the rAF intervals from the tile's
pointerdown (or the navigation; for a cold direct load, the first contentful
paint) to the settled hero (hand-in + `SETTLE_MS`), the pointer moving
throughout, 1728×996 @2×, headless Chrome, M1 Max. A production build
(`vite preview`), `main` against this change:

| | `main`: worst / p95 | now: worst / p95 | frames dropped, now |
| --- | --- | --- | --- |
| tile, cold | 83–117 / 33–50 ms | **16.8 / 16.7–16.8 ms** | 0 |
| tile, warm | 67–100 / 33–50 ms | **16.7–16.8 / 16.7–16.8 ms** | 0 |
| direct, warm | 67–83 / 33–67 ms | **16.8 / 16.7–16.8 ms** | 0 |
| direct, cold | 133–150 / 67 ms | 83–117 / 17–33 ms | 3–6 — **misses**, below |
| WebGL contexts, detail view | 3 on the first arrival, 4 on the second, … | 3, then 3 | |

A dev build (`?nodials`, below) is the same bar: every tile and warm route
within budget, the worst frame 16.8–33.4 ms, p95 16.7–16.8 ms; card 04's hero
stays instance #1 through each.

**Direct, cold, misses, and it is not the paper.** A cold direct load IS the
page load. After the first paint the page is still loading: 67–133 ms frames
at 100–300 ms after it, most of them with under 10 ms of script (the
compositor and GPU busy with the page's first frames and decodes), plus card
04's Rive runtime and file import (a 38–41 ms idle task) and the SDF's slices.
With the paper removed from the page altogether, the same load has the same
frames (83–100 ms at 90–270 ms after the first paint, three runs); with Rive
blocked as well, still 67–133 ms. The paper's own share of a cold direct load
is now its uploads (1–4 ms each) and a ~1 ms first render. The window opens at
the first contentful paint, because before it nothing is on screen; the boot
frames before it (one of 133–167 ms: the bundle, React's first render, the
sky's context) are printed and not judged.

**In a dev build, the dock.** Every change of a DialKit readout (card 04's
COVER status, once a second when it changes) re-renders the dev dock, 30–50 ms
frames four in a row, and the dock's lazy mount on a load is 260–400 ms. A
production build has neither, so `arrival` loads the page with `?nodials`
(App.tsx), which leaves the dock out; a production build ignores it. Deferring
the readout's writes out of the arrival was tried and dropped: it moved the
re-render into `life`'s boil window (a 50 ms frame there, 16.8 ms without).

### detailSideScale at 1

At `detailSideScale` 1 card 04's hero was made afresh forever: #2, #3, … for
as long as the pointer moved over it (on `main`: #1 → #5 in 2.5 s). Two
causes, both fixed:

- The layer took the hero's face by SCALE: "bigger than halfway to the side
  scale", `scale > (1 + side) / 2`. At 1 every panel is scale 1, none passed,
  and the hero plane was a neighbour — the still, and card 04's live hero never
  drawn. It is by distance now, `dist < 0.5`: the same test below 1.
- The Rive hero's "has the user left" test (`HERO_GRACE_FRAMES` and
  `HERO_GRACE_MS` without a draw) ran in `rivePlayer()`, which the pointer
  path called too: handing a hero nobody drew an event made a fresh one. The
  pointer goes to the instance on screen now, or waits for the next draw to
  make one (`rivePointer`).

`verify:detail`'s `sidescale` sweeps 0.3 → 1 → 0.3 at `#item-04` with the
pointer moving on the hero: at every value the cards are handed back in, the
plane is live Main Bounce, and the hero is #1.

## The planes

- **Camera.** An `OrthographicCamera(0, vw, 0, −vh)` in CSS pixels. The
  renderer follows the portfolio sheet's conventions: `alpha`, premultiplied,
  no colour management, `setPixelRatio(min(dpr, 2))`.
- **Geometry.** One `PlaneGeometry(1, 1, segments, segments)` per rendered
  panel. The strip renders five panels, and two of them are the off-screen
  buffer.
- **Rects.** From DetailView's tick. The centre is the hero rect (`hero.ts`),
  and every panel is that rect moved along the strip and scaled about its centre,
  which is exactly what the panel's transform does. No layout is read per frame.
- **Where z goes.** An orthographic camera cannot see z, so the vertex stage
  applies a CSS-style perspective of its own after the deformation:
  `c + (p − c) · P / (P − z)`, with `P = 2 × viewport height` and `c` the
  viewport centre. At z = 0 it is exactly 1, so the flat plane stays
  pixel-matched. The dent, the squash and the fold are what move z.
- **Painting.** The canvas only paints when the uniforms change. The comparison
  uses an epsilon rather than equality, and panel opacity is quantized to 8-bit
  steps, because the strip's hover-dim is an exponential ease whose tail moves
  opacity by 1e-9 a frame for seconds. Exact comparison repainted every frame and
  moved the canvas a level where the DOM had not moved at all (caught by the
  reduced-motion check).

### Textures

Each face is resized **once, by the browser** (`createImageBitmap`, `high`), to
the card's own device pixels: at the hero's size and at the neighbours'. From
the file's BLOB, not the decoded `<img>`: from an image element Chrome crops
and resizes on the main thread, and the faces built as the view mounts —
during the grid→detail morph — were ~1 s of it, on every card (a real-Chrome
profile, 2026-09-27). From a blob it happens off the main thread. The
plane then samples it one texel to one pixel. Faces are `itemHeroFace` (Issue
01's `cover-rest.webp`, the portfolio cards' `card.webp`). Issue 01 also gets
its `cover-plate.webp` at the hero's size. The plate is used exactly while a
`.cover-anim__plate` is in the panel, i.e. while the CoverAnimLayer is drawing
the sprites. A MutationObserver re-renders on the paint where that layer mounts
or unmounts, so the cover never shows for a frame with its objects missing.
Everything is uploaded (`initTexture`) before the hand-in, never mid-slide:
since 2026-09-28 on the first hover of a grid card, one face at a time, and
kept for the page's life ([the arrival](#the-arrival)).

GPU cost at 1728×996 @2×: four faces at two sizes plus one plate, about 65 MB,
resident from the first hover of a card (it was allocated and freed on every
open and close before).

### The live cover plane

A card with a live cover (`cover` in content.ts; cards 02 and 04) is the face
that is not a texture made once. As the HERO its plane samples the render target of
a `CoverRenderer` on the paper's renderer (made, compiled and drawn once by
the warm-up, and kept: [the arrival](#the-arrival)), drawn every
frame on the shared cover clock at the hero's device size (`coverMaxDpr`
capped) — a texture cannot cross WebGL contexts, so the cover is drawn where the
plane is (docs/covers.md). As a neighbour it is its still, like any other face.
While the plane is live the layer repaints every frame whatever the signature
says; while the cards are handed OUT it holds the cover's last frame (the DOM
face, dissolving back over it, is the live one).

Card 04's cover is RIVE (docs/covers.md, "Rive covers"): no draw in this
layer's renderer. Its hero plane samples a `CanvasTexture` of the hero
PLAYER's 2D canvas — the same canvas the DOM hero face is copied from, so the
DOM → plane hand-off is one picture — uploaded (premultiplied, 0.06–0.07 ms at
1256 × 1633) only when the player drew a new frame, and the layer repaints
only then. It is held while handing out, as the shader's is.

The cover is NOT opaque: its ground lets the sky through. So two things here
learned transparency, both identities for every other card:

- `uPremul`: the plane's map is premultiplied; the crease lighting runs on the
  un-premultiplied colour and the texture's alpha carries through. The still
  is decoded premultiplied for the same reason.
- `uHole` on the shadow: the canvas's shadow is a blurred rectangle drawn under
  the card too, invisible under an opaque card and a dark slab under a
  transparent one. It now leaves the card's own rounded rect out, which is what
  the DOM's box-shadow does.

And a live cover (either kind) is not a card here at all, in any slot
(docs/covers.md, "No card in the detail view"): no rounded corners
(`uRadius` 0), no shadow (the quad is not drawn; its DOM panel's is
transparent), and the crease light — the screen blend and the trough shading —
weighted by `uCoverShade × alpha` (`coverPaperShade`, on the COVER panel,
default 1; card 04 has its own). The geometry is untouched: the dent, squash, ripple, fold and the
crease refraction are exactly as on any card. For every other card the weight
is exactly 1 and the radius and shadow are as before.

## The material

Vertex (all in card heights, then to CSS px, then the perspective above):

| term | |
| --- | --- |
| dent | `z −= (1 − smoothstep(0, uHoverRadius, ‖uv − 0.5 − uHit‖)) · uHover · uHoverDepth` |
| squash | `z += max(|v| · −uSquash, −0.1)`; the card scales by `1 + min(|v| / 10, uSquashScale)` about its centre |
| ripple | `z −= sin(uv.y·10 + uIndex) · uRipple`; `y −= cos(uv.x·10 + uIndex + 100) · uRipple · 0.35`. `uRipple` is `mix(heroRipple, ripple, min(1, |i − pos|))`: the hero's own dial in the centre slot, the neighbours' one slot out, blended in between so a slide has no step. |
| fold | `f = uFold · uFoldAmp`; `a = uv.x·0.4 + uv.y·2π + uIndex·0.05`; `z += 0.4f − 0.15f·cos a`; `y −= 0.35f·cos a` |
| boil | last, after the perspective, in screen px: `css = c + R(uBoil.z)·(css − c) + uBoil.xy`, `c` the card's centre. A rigid move, on top of the dent: exactly what CSS's `rotate` then `translate` do to the sprites. |

Fragment:

| term | |
| --- | --- |
| reveal | `discard` where `(vUv.y − 0.04·vUv.x) < 1.04·uFold − 0.04`. This is **rescaled** from the reference's `< uFold`, whose raw form eats a 4% sliver off the bottom-right at fold 0 and would break the identity. |
| crease texel | `paper-creases.webp`, rotated `uIndex × 90°` so no two cards share folds |
| refraction | `uv −= texel.g · d + hover · d · texel.g`, where `d = uCreaseDisplacement`, **held at 0 inside every hover-sprite rect** |
| light | `mix(col, screen(col, texel), uCreaseBlend · lit)`, then `− (cmap(texel.g, 0, 0.1, 0.05, 0) − texel.g · hover · 0.1) · uCreaseBlend / 0.2 · lit`; `lit` = `uCoverShade · alpha` on a live cover, exactly 1 otherwise |
| edge | the DOM's 6px corner radius (scaled), antialiased; straight edges are the triangles' own, multisampled. None on a live cover (`uRadius` 0) |
| alpha | `uAlpha` = the panel's own opacity (hover-dim, side fade, doorway clear), premultiplied |

**The invariant.** With `uCreaseBlend`, `uCreaseDisplacement`, `uHover`,
`uVelocity`, `uRipple`, `uFold` and `uBoil` all at 0, every term above is
exactly 0 or 1, and the plane is the DOM image. The identity check tests this,
and every new term has to keep it. `override({ zero })` zeroes the first six
and leaves the boil alone: the boil is registration, not a paper effect, and
the boil check compares a boiled canvas plate with the DOM plate boiled the
same way.

### Driving it

- **Hover.** The raycast is `pointerUv`: with an orthographic camera in CSS
  pixels, the ray from the pointer meets the card's rest plane at the pointer.
  The topmost card under the pointer gets `uHover` tweened 0 → 1 over `hoverMs`
  (cubic out); every other card tweens back. `uHit` follows the pointer every
  frame while there is a dent to put under it. Touch is ignored. This works on
  all three cards.
- **Velocity.** `(Δpos · panelStep / heroW)` per 60Hz frame (rescaled by `dt`),
  lerped at 0.2 per frame, fed to every plane. The row squashes as it moves and
  relaxes as it lands.
- **Fold.** Slots 0 and 1 are flat; slot 2 (the off-screen buffer) is crumpled.
  A panel whose slot changes tweens to its new target over `foldMs` (cubic out).
  So Prev/Next brings a card into a neighbour slot folded and it opens out, and
  the card leaving folds away. The drawn fold is multiplied by `min(1, |i − pos|)`,
  so **the hero never folds**, even when a double Next catches a card mid-tween.
- **Boil.** Not driven here. The hero's CoverAnimLayer drives it and publishes
  every change (`publishBoil`, keyed by the panel element); this layer is
  subscribed and repaints in that same task, reading `boilFor(panel)` for each
  plane, times the panel's scale. So the canvas plate and the DOM sprites are
  given the same value on the same frame. It is not multiplied by `presence`:
  the sprites boil whether or not the paper has settled, and the plate has to
  go where they go.
- **Reduced motion.** No dent, squash, ripple, fold or boil. The creases stay,
  static. Presence arrives at once.

## Dials

The boil's dials are on the COVER LIFE panel, in the same docks (see
docs/reader.md). DETAIL PAPER panel. It is at `#item-01?intro` (the doorway dock), and also in the
app's own dev dock at plain `#item-NN`, where the hero is uncovered and can be
hovered: under the doorway dock the reader's cover sits over the hero and the app
is inert. It is the same panel id, persisted, so a value set in one dock is the
value the other opens with. `paperDials.ts` is the source of truth.

| dial | shipped | |
| --- | --- | --- |
| `paper` | on | `off` is the A/B: DOM cards, no canvas |
| `creaseBlend` | 0.2 | screen-blend of the crease texture |
| `creaseDisplacement` | 0.008 | UV push per unit crease height |
| `hoverRadius` | 0.35 | dent radius, UV |
| `hoverDepth` | 0.05 | dent depth, card heights |
| `hoverMs` | 300 | dent in and out, cubic out |
| `squash` | 0.7 | push-back per unit velocity |
| `squashScale` | 0.185 | cap on the velocity swell |
| `ripple` | 0.01 | resting ripple on the neighbours, card heights |
| `heroRipple` | 0 | resting ripple on the hero. 0 keeps the cover registered with its DOM hover sprites at rest (a ripple puts it 2–3px off them); the dent still applies while hovered |
| `foldMs` | 700 | un-crumple, ease out |
| `foldAmp` | 1.0 | fold vertex amplitude (the reveal edge ignores it) |
| `segments` | 40 | plane subdivisions per side |

## The boil

Hovering the hero card makes every object on Issue 01's cover loop, and boils
the card: every 1/6s a new offset (±1.5px at this hero size, scaled with the
card) and rotation (±0.5°), held until the next step, ramped in over 250ms and
out over 400ms. The signal, the stagger on leave and the COVER LIFE dials are
the reader's — [docs/reader.md, page hover and the boil](reader.md#page-hover-and-the-boil)
— and so is the rule that makes it register: ONE driver per face, writing the
same value to everything that has to move.

Here that is two things. The CoverAnimLayer's own root (`translate` /
`rotate`), which carries the sprites, and this canvas's hero plane
(`uBoil`), which carries the plate. Both turn about the card's centre, and
the boil is applied to the plane last, in screen space, so a boiled plane is
the flat plane moved exactly as CSS moves the sprites. The dent still bends the
plate under the sprites while the hero is hovered (the caveat below); the boil
adds nothing to that. The DOM labels (number, name) do not boil.

## The crease texture

`npm run creases` writes `public/textures/paper-creases.webp` (400×520, the
card's 10:13, greyscale). If `~/Discommode-pages/textures/paper-creases.{png,jpg}`
exists, it is desaturated, its 1st/99th percentiles are mapped to 0.08/0.9, and
it is resized. Otherwise the texture is drawn: 6–10 fold lines, a few long
diagonals and some short branches in from the edges, each a bright core with a
2–4px gaussian falloff on a dark ground, plus faint noise. The drawing is
seeded, so a re-run is byte-identical.

**What shipped: the procedural path** (8 folds, 4 long, seed `0xc4ea5e`). There
was no scan in `~/Discommode-pages/textures/`. Dropping one there and re-running
the script replaces it, with no code change.

## The sprite caveat

The CoverAnimLayer's sprites are DOM, drawn on top of the canvas's plate. They
stay registered with it because, inside every sprite's rect (read from the
sprites' inline px, passed as up to 24 UV rects), the crease displacement is 0.
That holds the refraction still. **At rest the geometry is still too**: the hero
has no ripple (`heroRipple` 0), and with nothing hovered and the row still, its
dent, squash and fold are all 0, so every vertex term is 0 and the plate is
exactly where the sprites expect it. `verify:detail` asserts this
(`registration`). What does move the plate under the sprites is the dent while
the hero is hovered, and the squash while the row slides. Both are transient,
and the sprite does not move with them. The boil, on the other hand, moves
both: the plane and the sprites' layer are given the same rigid transform in
the same task (see [the boil](#the-boil)).

**The layer sizes itself from its LAYOUT box** (`getComputedStyle`), never a
bounding rect. The sprites are positioned in the layer's own CSS px, and every
transform above it — the strip's panel scale, the boil — scales them along
with it. Until 2026-09-24 it measured its parent's bounding rect. After
Prev/Next, the layer mounts on the new centre panel while that panel is still
easing from the neighbours' scale (0.85) to 1. It measured about 0.94, and a
transform never fires the ResizeObserver, so card 01's sprites stayed 6% small,
up to 47px off the plate, on every route except a cold load. The sprite mask
above is read from the same inline px, so it was off by the same amount.
`verify:detail`'s `routes` check covers this.

## Running the checks

```
npm test && npx tsc -b && npm run lint
npm run dev                   # in another shell
npm run verify:detail         # --url <origin>, --only rects,identity,handoff,sprites,registration,routes,nav,leave,frames,reduced,life,arrival,sidescale

# the arrival against a production build (it needs no dev hooks):
npm run build && npx vite preview --port 5231 --strictPort
npm run verify:detail -- --url http://localhost:5231 --only arrival
```

About six minutes (`arrival` is three of them). It drives the layer through `window.__paper` (dev only):
`state`, `presence`, `rects`, `projected`, `uniforms`, `folds`, `override({ zero })`,
`freezePresence`, `holdOut`, `handOut`, `set`, and `contexts` (the paper's, ever: 1) and
`faces` (what is resident); `sidescale` sets the dial through `window.__config`
(`get`, `set`: the live config, dev only). Pixel checks hide the sky and the
dev overlays first. A pixel counts as different past 32 levels, the portfolio
view's tolerance and for its reason.

**Rects.** Every on-screen plane as three.js projects it, against the panel's
`getBoundingClientRect`, and the hero also against `--hero-*`:

| | worst vs DOM | hero vs `--hero-*` |
| --- | --- | --- |
| 1728×996, 1× and 2× | 0.0118px | 0 |
| 1440×900, 1× and 2× | 0.0096px | 0 |

That is layout's 1/64px grid against doubles: zero, for any purpose.

Cards 02 and 04 are live covers: the checks PIN the cover clock
(`window.__covers`) so the DOM and the plane draw one moment, and their
hand-offs are checked with the others — transparent heroes. Card 02 has two
budgets of its own, in the script: the hero 2.5% (0.000–0.004%, and 2.1–2.2%
at 1728×996 @2×, where the 628.2px hero box puts neither side on whole device
pixels over a field of noise), and the still as a neighbour 7%, card 01's
(1.0–5.0%). Card 04's hero meets the spec (0.149–0.434%); its still as a
neighbour, line art on a transparent ground, is held to 2% (0.018–0.891%).
docs/covers.md has all of them.

**Identity** (every effect at 0; % of the card's pixels):

| | hero | neighbours |
| --- | --- | --- |
| cards 02–04, every size | 0.005 – 0.290% | 0.000 – 0.392% |
| card 01 as hero | 0.009 – 0.954% | — |
| card 01 as neighbour | — | **1.10 – 6.43%** |

**Hand-off**, at presence 0, *is* the identity. In and out agree to 0.04%:
`#item-04` @1× is in 5.723%, out 5.765% (card 01 on the right), and cards 02–04
are at most 0.225%.

**Registration**, at 1× and 2×: at rest with nothing hovered, the hero plane's
ripple, dent, squash and fold are all exactly 0 under its 20 sprites, and the
neighbours ripple at 0.01. Hovering the hero takes the dent to 1.000, and
leaving takes it back to 0.

**Routes into card 01** (`routes`), 1728×996 at 1× and 2×: a cold load of
`#item-01`, Prev from `#item-02`, Next from `#item-04`, and 01 → 02 → 01.

| | measured | bar |
| --- | --- | --- |
| every sprite vs the cold load's | 0.000px; 0.011px from `#item-04` | ≤ 1px |
| every sprite vs where the plate puts it at rest (the plane's rect, the manifest's displayRect, fitted as the layer fits) | 0.029–0.036px | ≤ 0.5px |
| the boil check (`life`'s), on each route | 0.028–0.030px, 6/6 samples boiled | ≤ 0.5px |

The layer before the fix: 47px against the cold load and the plate on all
three navigated routes, while the boil check still read 0.03px. The boil check
predicts from the sprites' own inline px, so it moves with them and cannot
see a layer that is the wrong size.

From `#item-04`, card 01 is the strip's panel 4 (`left: 2484.51px`), and
layout's 1/64px grid puts it 0.01px off where the cold load does. That is
enough to flip Chrome's pixel snapping of some DOM sprites by one device pixel.
In pixels, 2.7% (1×) and 3.6% (2×) of the hero differs from the cold load, all
of it on sprite edges; the canvas plate is identical. The Prev-from-02 and
round-trip routes are pixel-identical to the cold load.

**Cover life** (`life`), 1728×996 at 1× and 2×, identical at both:

| | measured | bar |
| --- | --- | --- |
| page hover (a point on no object) → all 20 `playing` | 16.6–16.7ms (one frame) | ≤ 200ms |
| sprite vs plate during the boil, 10 samples × 20 sprites | worst 0.029px | ≤ 0.5px |
| boil seen in those samples | 10/10, up to 1.22px and 0.48°, 7 distinct steps | |
| worst frame while boiling, 240 frames | 16.8ms | ≤ 20ms |
| leave → every object home | slowest 1692ms (freewrite, a 2338ms pass); fades spread 53–1571ms over 18 distinct 8ms slots | each ≤ its pass + stagger + fade + 60ms |
| 500ms after the leave | uBoil 0, 0, 0; no translate or rotate anywhere | exactly 0 |
| canvas plate vs DOM plate, both held at step 7 (0.66, 1.23px, −0.25°) | 0.892% (1×), 0.743% (2×) | card 01's hero budget, 1% |
| the same boiled canvas vs the canvas at rest | 13.6% | > 3 × the above |
| reduced motion | all 20 play in 16.7ms; boil 0 over 1s | no boil |

The 0.029px is the layout grid: `offsetWidth` is rounded to a whole pixel,
and reading the host's scale from it first put a 0.31px error on the far
sprites, at rest too; the check reads the computed width. The pixel check is
the one that sees the canvas: the boiled canvas plate agrees with the boiled
DOM plate as closely as the flat ones do (identity, 0.954% / 0.570%), so the
boil adds no misregistration of its own.

**Also checked:** hovering a cover object still mounts and plays its animation
with the canvas underneath, and the point under the pointer is the panel, never
the canvas. Next / Prev ×5 including the wrap land with the hash, the jump list,
the centre panel and the centre plane agreeing. The worst frame is **16.8ms**
during a Prev slide and during a hover sweep, at 1× and 2×, three runs each.
Under reduced motion, two frames 2s apart with the pointer moving on the hero
are identical (0 levels).

## Not done

1. **Card 01 misses the identity bar.** The spec's bar is ≤ 0.5% with every
   effect at 0. Cards 02–04 meet it at every size, and so does card 01 as the
   hero at 3 of 4 sizes (0.954% at 1728×996 @1×). As a neighbour, card 01 does
   not: 1.1–6.4%. At scale(0.85) Chrome draws the `<img>` visibly softer than
   any texture made from the same file, and on the cover's line art that
   softness is edges everywhere. Card 01 as the LEFT neighbour (from
   `#item-02`), 1728×996:

   | neighbour texture | 1× | 2× |
   | --- | --- | --- |
   | direct resize to its device size (**shipped**) | 2.46% | 1.24% |
   | full-size face, trilinear mips | 0.59% | 2.09% |
   | full-size face, nearest mip | 0.85% | 2.23% |
   | full-size face, nearest mip, bias −0.5 | 1.42% | 2.57% |
   | hero-size texture, trilinear | 3.42% | 3.61% |

   As the RIGHT neighbour (from `#item-04`, 1×) it is worse: 5.72% direct,
   2.62% from a quarter-size decode upscaled. Snapping the plane to device
   pixels made it worse again (6.81%). The rects agree to 0.01px, so this is
   resampling, not placement.

   None holds at both ratios, so the simplest one ships. `verify:detail` holds
   card 01 to its own budget (hero 1%, neighbour 7%) and the other cards to the
   spec's, and prints every number. The hand-off is an exact swap only on the
   cards that meet the bar; on card 01 as a neighbour it is a 120ms sharpen.
   Where to look next: what Chrome's decode cache actually hands the raster for
   a scaled image (`cc::SoftwareImageDecodeCache`, mip level plus filter
   quality), or promoting the neighbour panels to their own layers so that the
   DOM side is the one whose resampling is known.
2. **The sprites should be in the texture.** The sprite caveat above is a
   workaround: `heroRipple` 0 registers them at rest, but not under a dent or
   a squash. The proper fix is to draw the CoverAnimLayer's current frames
   into the plate texture (or as their own quads in this canvas) so the sprites
   bend with the paper. It was not done: animated WebP frames are not
   addressable from WebGL without decoding them ourselves (`ImageDecoder`), and
   that is a pipeline of its own.
3. **The DOM labels do not fold.** The number, the name and its scrim stay DOM
   over a card that is crumpling in. For the ±1 slot this is at most `foldMs` of
   a label hanging over a half-revealed card (see `neighbour-unfold-mid.webp`).
4. **A third WebGL context.** The sky and the portfolio sheet each have one. This
   canvas is a third, made on the first hover of a grid card and kept for the
   page's life — one, however many arrivals (it was one per arrival, destroyed
   on close). With it go ~65 MB of face textures at 1728×996 @2×, resident from
   that hover. (The live covers' stage is one more, for the whole page:
   docs/covers.md.)
5. **A cold direct load still drops frames** — page load, not the paper
   ([the arrival](#the-arrival)): 67–133 ms frames in the first 300 ms after the
   first paint, with or without the paper. Where to look: what the compositor
   and GPU are doing in them (little of it is script), and card 04's Rive
   runtime and import, which load for the grid's hidden tiles under a detail
   view that does not show card 04 live.
