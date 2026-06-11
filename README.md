# Interactive Portfolio

An interactive portfolio site inspired by infinite-grid journal sites, built
with Vite + React + TypeScript.

**Phase 6 — hover overlay.** Hovering the focused card reveals a typographic
overlay — headline, captions, and a CTA — arranged around it, each floating at a
different depth so the cursor separates the layers spatially. Builds on the
Phase 5 tilt; pan, snap, and recycling are untouched.

## Getting started

```bash
npm install
npm run dev      # start the dev server
npm run build    # type-check + production build
```

## Layer architecture

The scene is composed of three stacked, independent layers, rendered by `App`
in z-order: **`BackgroundLayer`** fills the viewport with a near-black backdrop
(`#0d0d0d`) and a subtle, repeating white dot matrix drawn entirely in CSS (a
tiled `radial-gradient`, no image assets) that parallaxes slightly with the
cursor as the deepest layer; **`GridPlane`** sits above it and holds a fixed
window of 3:4 "poster" cards inside a `perspective: 1200px` container that
recycles content to feel infinite and leans toward the cursor in 3D, translating
so the focused card sits at the viewport centre at full brightness while every
other card is dimmed as a continuous function of its distance from centre (and,
on hover, that focused card reveals a typographic overlay); and
**`FrameHUD`** is a fixed, full-viewport overlay
that never moves and ignores pointer events (`pointer-events: none`), holding
the minimal instrumentation — a left-edge tick ruler, crosshairs at the corners
of the centre cell, a top-left index counter (which tracks the focused card's
content), and bottom-right coordinate readouts (a placeholder plus a live world
coordinate). It is the still "glass" of the viewport — its stillness is what
makes the layers behind it read as moving in depth. The page itself is locked to
one viewport (`100vw`/`100vh`, `overflow: hidden`) so it never scrolls.

## Motion system

The source of truth is a single **continuous grid position** `{ col, row }` in
cell units (`{ 2, 2 }` centres the middle card). Everything visual — the plane's
`translate3d`, each card's brightness, and the focused card — is derived from
that one value. All motion flows through **one `requestAnimationFrame` loop**
(`useTicker`); there are no CSS transitions on the plane. `usePanController`
owns the position: pointer and keyboard input only record intent into refs, and
the ticker advances the position each frame. A drag locks to the dominant axis
after a small threshold and then follows the finger 1:1 (content-follows-finger).
On release, a **momentum** decision (pure math in [`src/motion.ts`](src/motion.ts))
takes over: the release velocity is measured from a rolling window of the last
`velocityWindowMs` of pointer samples — oldest-to-newest in the window, so a
finger that pauses before letting go reads as zero and never flicks. Below
`flickThreshold` it simply snaps to the nearest cell; above it, the plane coasts
to a projected landing (`position + velocity * momentumFactor`), always at least
one cell in the flick direction and capped to `maxFlickCells`. Either way it
eases exponentially to the target (frame-rate-independent, settle time scaling
mildly with distance), and a new pointerdown interrupts the glide cleanly from
the current position. Arrow keys move one cell, retargeting from the in-flight
target during a glide. The grid is **unbounded** — there is no clamping and no
edge rubber-band; positions, flicks, and arrows travel to any integer cell. All
feel constants live in [`src/config.ts`](src/config.ts).

## Slot / window model

The world is an unbounded lattice of integer `(col, row)` cells, but only a
fixed window of DOM "slots" is ever rendered — the count never grows as you
travel. Each slot is keyed by its window offset `(dc, dr)` and keeps a fixed
layout position; what changes is its *content*. The window centre is the
integer cell `round(position)`, and a slot at offset `(dc, dr)` shows world cell
`(centre + dc)`, mapped onto the placeholder list by a deterministic wrap
(`contentIndex = mod(row * 5 + col, N)`, a true modulo so negatives wrap too) in
[`src/content.ts`](src/content.ts). A given world cell therefore always shows the
same item, however you reached it.

The plane translates by only the **fractional** part of the position
(`position − round(position)`, always within half a cell), so its transform
never accumulates. When the position crosses a cell boundary the window centre
steps by one and every slot re-maps to the next world cell — but the jump in the
plane transform exactly cancels that reassignment, so every on-screen card holds
its place and its content; only the trailing/leading cards (which are offscreen)
actually change. The window is sized to the viewport (one full ring beyond the
furthest visible cell, so swaps always happen out of view): 5×5 is too tight
horizontally on wide viewports, so a 1440px viewport resolves to **7×7**, and it
re-sizes on resize (never on travel). Content re-maps only when the integer
window shifts; per frame, only the plane's `translate3d` and each card's
`brightness` change — both compositor-only, so there is no layout thrash and no
per-frame work when settled.

## Depth / cursor tilt

The plane leans toward the cursor for a parallax depth read. The pointer is
tracked over the whole viewport and normalized to `(nx, ny)` in `[-1, 1]`; the
target is `rotateY = nx · maxTiltDeg`, `rotateX = -ny · maxTiltDeg`, plus a small
`parallaxShiftPx` translate opposite the cursor. This tilt is **eased in the same
rAF loop** (its own `tiltLerpMs` time constant) and written **imperatively** to a
wrapper element's transform — so it animates even over a settled grid without any
React re-render, and never affects pan, snap, focus, or recycling. The pan offset
lives on the inner grid (pre-rotation space), so pan and tilt compose without
fighting. The three layers move at different rates for depth: the `BackgroundLayer`
dot matrix shifts at `backgroundParallaxFactor` of the plane's shift (same
direction, weaker — the deepest layer), the `GridPlane` carries the full tilt, and
the `FrameHUD` never moves. Tilt is disabled for touch pointers (no hover) and
when `prefers-reduced-motion` is set; pan/snap, being user-initiated, remain.

## Hover overlay

Hovering the focused card (only while the grid is settled — not dragging, not
gliding) fades in a `CardOverlay`: a bold headline overlapping the top-left
corner, monospace captions along the bottom-right edge, and a circular CTA
centred on the card, all from the item's data in [`src/content.ts`](src/content.ts).
It lives inside the tilt wrapper, so it inherits the card's 3D lean, and its
layers float at different depths — `overlayDepthHeadline`/`Captions`/`Cta`. The
depth parallax reuses the tilt path: the controller writes the cursor-tilt shift
as `--tsx`/`--tsy` CSS variables on the wrapper, and each layer multiplies them
by `(depthFactor − 1)` in a `calc()` transform, so the type slides *more* than
the card and reads as floating above it. (Chosen over `translateZ`, which doesn't
compose cleanly with the slot/pan transforms; and it degrades to flat when the
variables are absent.) The focused card dims to `overlayCardDim` so the white
type reads. The overlay ignores pointer events except the CTA — a real, focusable
`<button>` (Enter/Space activate it) that logs the item and pulses. It fades in
over `overlayFadeMs` and vanishes instantly on drag, glide, or leaving the card.
On touch there is no hover, so a tap on the focused card toggles it instead (a
touch that crosses the axis-lock threshold is a drag, not a tap). Under
`prefers-reduced-motion` the overlay still fades but does not parallax.

## Tuning

All layout, sizing, and visual constants — card width, aspect ratio, gap, grid
size, perspective, per-ring dim levels, dot-matrix spacing, HUD colours, the
motion feel (axis-lock threshold, snap duration, flick threshold, momentum
factor), the tilt feel (max tilt, parallax shift, tilt ease, background parallax
factor), and the overlay feel (fade, depth factors, CTA hover scale, card dim) —
live in [`src/config.ts`](src/config.ts) so the whole scene can be re-tuned from
one place. (Phase 4 removed the grid bounds, so the former `rubberBandFactor`
edge-resistance constant was deleted — there are no edges.)

## Structure

```
src/
  config.ts                  # all tunable layout / visual / feel constants
  grid.ts                    # pure grid math (modulo, brightness, centre cell)
  content.ts                 # placeholder content (incl. overlay copy) + cell → item wrap
  motion.ts                  # pure momentum math (velocity window, flick target, settle)
  App.tsx                    # owns the controller, composes the three layers
  main.tsx                   # React entry point
  index.css                  # global reset + viewport lock
  hooks/
    useTicker.ts             # the single requestAnimationFrame loop
    usePanController.ts      # drag + keyboard → continuous grid position
  components/
    BackgroundLayer.tsx      # layer 1: backdrop + dot matrix
    GridPlane.tsx            # layer 2: recycled-slot infinite poster grid
    CardOverlay.tsx          # hover overlay on the focused card (headline/captions/CTA)
    FrameHUD.tsx             # layer 3: fixed HUD overlay
```
