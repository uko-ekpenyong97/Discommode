# Interactive Portfolio

An interactive portfolio site inspired by infinite-grid journal sites, built
with Vite + React + TypeScript.

**Phase 9 — focus emphasis + mini-map.** The focused card scales up and stays
fully opaque while others shrink and fade (continuous with distance), and a
small interactive mini-map at bottom-left mirrors the position and navigates to
any item by shortest path. Builds on the per-card transform path; motion,
recycling, and tilt are unchanged.

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
the ticker advances the position each frame. A drag pans **freely in 2D** — both
axes follow the finger 1:1 at once (content-follows-finger), past a small ~4px
dead zone so a tap doesn't micro-pan (there is no axis lock). On release, a **2D
momentum** decision (using pure math in [`src/motion.ts`](src/motion.ts)) takes
over: the release velocity is a vector, each axis measured from a rolling window
of the last `velocityWindowMs` of pointer samples — oldest-to-newest, so a finger
that pauses before letting go reads as zero and never flicks. Below
`flickThreshold` (vector magnitude) it snaps to the nearest cell on both axes;
above it, the plane coasts to a projected landing (`position + velocity *
momentumFactor` per axis), with the offset vector scaled to cap total travel at
`maxFlickCells` (direction preserved) and at least one cell along the dominant
axis. Either way both axes ease to the target as **one** frame-rate-independent
2D motion (shared settle, scaled by euclidean distance), and a new pointerdown
interrupts the glide cleanly from the current position. Arrow keys move one cell
on one axis. The grid is **unbounded** — no clamping, no edge rubber-band. All
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

Two cursor-driven effects layer for depth, both eased in the same rAF loop and
written **imperatively** to the DOM (no React re-renders) so they animate even
over a settled grid and never affect pan, snap, focus, or recycling.

**Global plane tilt.** The whole plane leans toward the cursor: target
`rotateY = nx · maxTiltDeg`, `rotateX = -ny · maxTiltDeg` (from the cursor
normalized to `[-1, 1]`), plus a small `parallaxShiftPx` translate opposite the
cursor, eased with its own `tiltLerpMs`. The pan offset lives on the inner grid
(pre-rotation space), so pan and tilt compose without fighting. The three layers
move at different rates: `BackgroundLayer` shifts at `backgroundParallaxFactor` of
the plane's shift (the deepest layer), `GridPlane` carries the tilt, and
`FrameHUD` never moves. From Phase 8 the global tilt is gentle (`maxTiltDeg` 2°)
so the per-card effect leads.

**Per-card cursor facing.** Each visible card *individually* rotates to face a
cursor that floats `cursorDepthPx` in front of the plane: for a card centred at
`(cx, cy)` and cursor `(px, py)`, `rotateY = atan2(px − cx, cursorDepthPx) ·
cardFaceStrength`, `rotateX = −atan2(py − cy, cursorDepthPx) · cardFaceStrength`,
clamped to `maxCardTiltDeg`. The card under the cursor is ≈ flat; farther cards
rotate more, saturating naturally with distance. The ticker loops the rendered
card faces (refs collected once per window remap), computes each card's screen
centre from the position (no per-frame layout reads), eases its rotation
(`cardTiltLerpMs`), and writes it to a dedicated inner `.grid-card__face` wrapper
— composing with the slot layout and the brightness filter rather than fighting
them. It keeps updating during drags and glides, so cards turn as they pass under
a stationary cursor (a wave of attention). Both effects are disabled for touch
(no cursor) and under `prefers-reduced-motion`, and ease to flat when the pointer
leaves the viewport; pan/snap, being user-initiated, remain.

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
touch that crosses the drag dead zone is a drag, not a tap). Under
`prefers-reduced-motion` the overlay still fades but does not parallax.

## Focus emphasis + mini-map

The focused (centre-nearest) card is emphasised by two continuous functions of a
card's distance from centre — like the brightness dimming, they *flow* across
cards during a pan rather than toggling. **Scale**: `focusScale` at the centre,
easing to 1.0 by one cell — written into the same per-card face transform that
carries the cursor-facing rotation (`scale() rotateX() rotateY()`), so it
composes without fighting the layout, and re-applied on a settled grid whenever a
dial changes. **Opacity**: 1.0 at the centre, `unfocusedOpacity` by one cell and
`farOpacity` by two, multiplied with the brightness in render. The hover overlay
scales with the focused card so its type tracks the scaled edges.

A small **mini-map** (`MiniMap`) sits at bottom-left — in the HUD layer, but the
only HUD element with pointer events. It's a tiny carousel of squares for the
content sequence centred on the current item (larger, framed, labelled; neighbours
shrink and fade), re-centring with an eased slide on every focus change via a
continuous accumulated index so it slides the short way even across the wrap.
Squares are real buttons (focusable, Enter/click): clicking one navigates to that
content index by the **shortest path** — the controller finds the world cell with
that index nearest the current position (inverting the `mod(row·stride + col, N)`
mapping per nearby row, picking minimal euclidean travel) and glides there. It
hides on very narrow viewports so it never collides with the other HUD readouts.

## Content pipeline

Cards come from a typed manifest in [`src/content.ts`](src/content.ts): each
`PosterItem` is `{ id, title, image?, hue, captions, cta }`. If `image` is set,
the card renders it (`object-fit: cover`, 3:4); otherwise it falls back to the
`hue` tint — so real posters and placeholders mix freely. Images live in
[`public/posters/`](public/posters/) and load `lazy`, except the focused card
and its immediate ring (eager), so what you're looking at is always sharp. The
top of `content.ts` documents the add-a-poster workflow (drop image → add entry →
push). The wrap stride that tiles the N items across the plane
(`index = mod(row · wrapStride + col, N)`) is a live config value, not a magic
number.

## Tuning (DialKit, dev only)

The feel and layout values are a small **reactive store**:
[`src/config.ts`](src/config.ts) keeps a mutable `config` singleton that the rAF
loop and handlers read directly each frame, plus `useConfig()` for components to
subscribe and re-render. In development a **DialKit** panel
([`src/dev/Dials.tsx`](src/dev/Dials.tsx)) wires those values to live sliders,
grouped MOTION / DEPTH / LAYOUT / FOCUS / OVERLAY, and pushes changes through `setConfig`
so they propagate without a reload. It is loaded behind an `import.meta.env.DEV`
dynamic import, so **neither the panel nor the `dialkit` dependency is in the
production bundle** (Rollup drops the dead branch); production uses the `DEFAULTS`.
Values persist to `localStorage` across reloads, and a **Copy config** button
emits a paste-ready snippet for promoting tuned numbers back into `DEFAULTS`.

The DEPTH group includes the per-card facing dials (`cursorDepthPx`,
`cardFaceStrength`, `maxCardTiltDeg`, `cardTiltLerpMs`) alongside the global tilt;
both are independently dialable. The FOCUS group dials the focus emphasis
(`focusScale`, `unfocusedOpacity`, `farOpacity`).

Retuning **layout** live is handled end-to-end: changing `cardWidth`/`gap`
recomputes the cell span used by pan/flick math, re-derives the slot-window size
(the ring is recomputed on layout change, not just viewport resize), and keeps
the focused card centred by preserving its **world coordinate** (the position is
in cell units, so the transform stays identity when settled). Changing
`wrapStride` re-tiles the content with no crashes at negative coordinates.
(Phase 4 removed the grid bounds, so the former `rubberBandFactor` constant is
gone; Phase 8 replaced the axis lock with free 2D panning, so the former
`axisLockThresholdPx` is now just a ~4px `dragDeadZonePx`.)

## Structure

```
src/
  config.ts                  # reactive config store (DEFAULTS + setConfig + useConfig)
  grid.ts                    # pure grid math (modulo, brightness, focus scale/opacity)
  content.ts                 # poster manifest (PosterItem) + cell → item wrap
  motion.ts                  # pure momentum math (velocity window, flick target, settle)
  App.tsx                    # owns the controller, composes the layers (+ dev panel)
  main.tsx                   # React entry point
  index.css                  # global reset + viewport lock
  dev/
    Dials.tsx                # dev-only DialKit panel (excluded from production)
  hooks/
    useTicker.ts             # the single requestAnimationFrame loop
    usePanController.ts      # drag + keyboard → continuous grid position
  components/
    BackgroundLayer.tsx      # layer 1: backdrop + dot matrix
    GridPlane.tsx            # layer 2: recycled-slot infinite poster grid
    CardOverlay.tsx          # hover overlay on the focused card (headline/captions/CTA)
    MiniMap.tsx              # bottom-left position carousel (interactive)
    FrameHUD.tsx             # layer 3: fixed HUD overlay
public/posters/              # poster images referenced by the manifest
```
