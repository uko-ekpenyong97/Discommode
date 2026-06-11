# Interactive Portfolio

An interactive portfolio site inspired by infinite-grid journal sites, built
with Vite + React + TypeScript.

**Phase 1 — static layout only.** No interactions yet: the scene renders, but
nothing pans, tilts, or responds to input.

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
centres a 5×5 window of 3:4 "poster" cards inside a `perspective: 1200px`
container (reserved for tilt in a later phase), where the centre card is shown
at full brightness and every other card is dimmed purely as a function of its
ring distance from centre; and **`FrameHUD`** is a fixed, full-viewport overlay
that never moves and ignores pointer events (`pointer-events: none`), holding
the minimal instrumentation — a left-edge tick ruler, crosshairs at the corners
of the centre cell, a top-left index counter, and a bottom-right coordinates
readout. The page itself is locked to one viewport (`100vw`/`100vh`,
`overflow: hidden`) so it never scrolls.

## Tuning

All layout, sizing, and visual constants — card width, aspect ratio, gap, grid
size, perspective, per-ring dim levels, dot-matrix spacing, and HUD colours —
live in [`src/config.ts`](src/config.ts) so the whole scene can be re-tuned from
one place.

## Structure

```
src/
  config.ts                  # all tunable layout / visual constants
  App.tsx                    # composes the three layers
  main.tsx                   # React entry point
  index.css                  # global reset + viewport lock
  components/
    BackgroundLayer.tsx      # layer 1: backdrop + dot matrix
    GridPlane.tsx            # layer 2: 5x5 poster grid
    FrameHUD.tsx             # layer 3: fixed HUD overlay
```
