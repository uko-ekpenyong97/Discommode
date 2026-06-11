# Interactive Portfolio

An interactive portfolio site inspired by infinite-grid journal sites, built
with Vite + React + TypeScript.

**Phase 2 — drag + keyboard navigation.** The grid pans by dragging or with the
arrow keys and snaps to the nearest card. No momentum yet (that's the next
phase) and no tilt yet.

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
tiled `radial-gradient`, no image assets); **`GridPlane`** sits above it and
holds a 5×5 window of 3:4 "poster" cards inside a `perspective: 1200px`
container (reserved for tilt in a later phase), translating itself from the
grid position so the focused card sits at the viewport centre at full
brightness while every other card is dimmed as a continuous function of its
distance from centre; and **`FrameHUD`** is a fixed, full-viewport overlay
that never moves and ignores pointer events (`pointer-events: none`), holding
the minimal instrumentation — a left-edge tick ruler, crosshairs at the corners
of the centre cell, a top-left index counter (which tracks the focused card),
and a bottom-right coordinates readout. The page itself is locked to one
viewport (`100vw`/`100vh`, `overflow: hidden`) so it never scrolls.

## Motion system

The source of truth is a single **continuous grid position** `{ col, row }` in
cell units (`{ 2, 2 }` centres the middle card). Everything visual — the plane's
`translate3d`, each card's brightness, and the focused card — is derived from
that one value. All motion flows through **one `requestAnimationFrame` loop**
(`useTicker`); there are no CSS transitions on the plane. `usePanController`
owns the position: pointer and keyboard input only record intent into refs, and
the ticker advances the position each frame. A drag locks to the dominant axis
after a small threshold and then follows the finger 1:1 (content-follows-finger,
with a rubber band past the edges); on release it eases exponentially to the
nearest cell (frame-rate-independent, settling in `snapMs`). Arrow keys move one
cell with the same snap and clamping. All feel constants live in
[`src/config.ts`](src/config.ts).

## Tuning

All layout, sizing, and visual constants — card width, aspect ratio, gap, grid
size, perspective, per-ring dim levels, dot-matrix spacing, HUD colours, and the
motion feel (axis-lock threshold, snap duration, rubber-band factor) — live in
[`src/config.ts`](src/config.ts) so the whole scene can be re-tuned from one
place.

## Structure

```
src/
  config.ts                  # all tunable layout / visual / feel constants
  grid.ts                    # pure grid math (position → transform/brightness/focus)
  App.tsx                    # owns the controller, composes the three layers
  main.tsx                   # React entry point
  index.css                  # global reset + viewport lock
  hooks/
    useTicker.ts             # the single requestAnimationFrame loop
    usePanController.ts      # drag + keyboard → continuous grid position
  components/
    BackgroundLayer.tsx      # layer 1: backdrop + dot matrix
    GridPlane.tsx            # layer 2: 5x5 poster grid, translated from position
    FrameHUD.tsx             # layer 3: fixed HUD overlay
```
