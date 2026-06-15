# Interactive Portfolio

An interactive portfolio site inspired by infinite-grid journal sites, built
with Vite + React + TypeScript.

**Phase 10 — detail view.** Clicking a poster (or its CTA) expands it into a
focused 3-panel reading state with hash-based routing, so every item is
deep-linkable; Prev/Next, a dropdown, the side panels, the mini-map, arrow keys,
and touch swipes all walk the sequence, and exiting returns the grid focused on
the item just viewed. Built as a state layer over the grid.

## Getting started

```bash
npm install
npm run dev      # start the dev server
npm run build    # type-check + production build
npm test         # run the unit tests (Vitest)
```

## Layer architecture

The scene is composed of three stacked, independent layers, rendered by `App`
in z-order: **`SkyLayer`** fills the viewport as the deepest layer — a
full-screen WebGL2 fragment shader drawing a slowly-drifting atmospheric color
field driven by the live environment data (see _Sky (WebGL)_ below; it replaced
the original CSS dot-matrix backdrop); **`GridPlane`** sits above it and holds a fixed
window of 3:4 "poster" cards inside a `perspective: 1200px` container that
recycles content to feel infinite and leans toward the cursor in 3D, translating
so the focused card sits at the viewport centre at full brightness while every
other card is dimmed as a continuous function of its distance from centre (and
any hovered card reveals a typographic overlay and, on click, opens its detail
view); and
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
move at different rates: the `SkyLayer` can shift its gradient/sun slightly with
the cursor via the `skyParallax` uniform (off by default — it replaced the old
dot-matrix's `backgroundParallaxFactor` CSS-transform parallax, which was
removed with the dot matrix), `GridPlane` carries the tilt, and `FrameHUD` never
moves. From Phase 8 the global tilt is gentle (`maxTiltDeg` 2°) so the per-card
effect leads.

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

Hovering **any** card (the one under the cursor, only while the grid is settled —
not dragging, not gliding) fades in a `CardOverlay`: a bold headline overlapping
the top-left corner, monospace captions along the bottom-right edge, and a
circular CTA centred on the card, all from the item's data in
[`src/content.ts`](src/content.ts). Only one shows at a time; the hovered cell is
hit-tested each frame from the cursor + live position (so it tracks the grid
sliding beneath a still cursor, and a cursor in a gap shows nothing). It is
rendered as a child of the hovered card's **transform wrapper** — the element
that carries the imperative per-card scale + cursor-facing rotation — so it
inherits that card's exact transform automatically (it tracks scaled/rotated
non-centre cards without doubling or drifting), while the brightness filter stays
on the inner face so the overlay isn't dimmed by it. Its layers float at
different depths — `overlayDepthHeadline`/`Captions`/`Cta`: the controller writes
the cursor-tilt shift as `--tsx`/`--tsy` CSS variables on the tilt wrapper, and
each layer multiplies them by `(depthFactor − 1)` in a `calc()` transform, so the
type slides *more* than the card. (Chosen over `translateZ`; degrades to flat
when the variables are absent.) The hovered card dims to `overlayCardDim` so the
white type reads, and — since non-centre cards are dim — its opacity is **lifted
toward `hoverLiftOpacity`** (eased on the per-card opacity, which the ticker now
owns alongside the scale/rotation) so the overlay is legible; it eases back on
leave. The overlay ignores pointer events except the CTA — a real, focusable
`<button>` that opens that card's detail (FLIP from the card's rect). It fades in
over `overlayFadeMs` and vanishes instantly on drag, glide, or leaving the card.
On touch there is no hover; a tap opens the tapped card's detail directly. Under
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

## Detail view

Clicking **any** card (or its CTA) opens a full-viewport reading state
(`DetailView`) for that card's item — drag / flick / arrows / mini-map still move
the grid. Routing (`useDetail`) makes the **URL hash the source of truth** — a
slug means detail, no hash means grid: deep-linking `#item-07` opens straight into
that item, browser back/forward arrive as `popstate` and the state follows, and
Esc / the close button / a down-swipe clear the hash via history without trapping
the back button. Every item view pushes a history entry, so back/forward walk the
visited sequence. On exit the grid re-centres on the item just viewed (the
Phase 9 shortest-path glide).

The layout is a **hero carousel** ([`src/detailLayout.ts`](src/detailLayout.ts),
pure + unit-tested): the centre card is large — `detailCardScale` of the viewport
height (3:4 preserved, capped so it never overflows) — with the previous/next
cards just **peeking** by `detailPeekPx` at the edges; `detailGap` is the minimum
gap between centre and side cards and shrinks the card gracefully on narrow
viewports. The backdrop is **transparent**, so the same global `SkyLayer`
(weather colour field) shows through behind the panels — only a low bottom scrim
(`detailScrimOpacity`) sits behind the text for legibility; the card panels stay
opaque. Hovering one panel **isolates** it (it stays full; the others dim to
`detailHoverDim`, eased with the overlay-fade feel); leaving restores all to full
(touch has no hover). A bar holds Prev / a title dropdown / Next; Prev/Next, arrow
keys, horizontal swipes, the dropdown, side-panel clicks, and the (persistent)
mini-map all change the active item, wrapping the `content.ts` order. The strip
**slides** between items with the grid's exponential-settle feel — a continuous
position eased in an rAF loop toward a carousel target that accumulates signed
steps, so it slides the short way and fast Prev/Next presses retarget cleanly.

Grid↔detail is an approximate **FLIP from the clicked card**: the detail expands
from the card's actual on-screen rect (its scale + translate, `transform-origin`
the centre panel) into the centre panel while the grid cross-fades
(`detailTransitionMs`, transform+opacity only; input locked mid-transition;
deep-link / back have no origin and use a centred scale). `prefers-reduced-motion`
cuts it to a plain fade.

## Environment data layer

[`src/env/`](src/env) determines San Francisco's current sky state (day/night +
weather) from real data and exposes it as a normalized, typed **`EnvState`** —
the single contract the WebGL sky renderer (see _Sky (WebGL)_) consumes. The
state carries a continuous `sunElevation`
(0 = deep night, 1 = high noon — not just `is_day`), `isDay`, a `dayPhase`
(`rising`/`setting`, from before/after solar noon — distinguishes dawn from
dusk), a `condition`
(`clear`/`partly`/`cloudy`/`fog`/`rain`/`snow`/`storm`), `cloudiness`,
`precipitation`, `windSpeed`, the `rawWeatherCode`, and `fetchedAt`.

Data comes from the free, keyless **Open-Meteo** API (one fetch; SF coordinates
are an *input* in [`types.ts`](src/env/types.ts), not baked into logic, so user
geolocation can replace them later — attribution: *Weather data by Open-Meteo,
CC BY 4.0*). The WMO weathercode is mapped to a condition (+ cloud/precip hints)
in one documented table ([`wmo.ts`](src/env/wmo.ts)) where fog (45/48) is a
first-class state. `sunElevation` is a smooth, time-driven curve
([`sun.ts`](src/env/sun.ts)): a sine hump scaled to the day's daylight length,
an inverted hump over the night, mapped to 0..1 with a twilight band so
sunrise/sunset read as *low* values — continuous so a renderer can animate
dawn → day → dusk → night.

`useEnvState()` ([`useEnvState.ts`](src/env/useEnvState.ts)) fetches on mount,
recomputes `sunElevation` from the clock **every minute** (no refetch — the sun
moves continuously), and refetches the weather **every ~15 min**. It never
throws or blocks render: a failed fetch falls back to a clock-only state
(condition `clear`, sun curve from a fixed SF estimate) and `status` reports
`loading` / `live` / `fallback`. An exported `setEnvOverride()` forces any
`EnvState`; DialKit's SKY group uses it to preview any sun elevation / condition
live. `App` owns a single `useEnvState()` snapshot and feeds it to both the sky
renderer and a dev-only text readout
([`dev/EnvReadout.tsx`](src/dev/EnvReadout.tsx), gated the same way as DialKit).
The WMO mapping and sun model are unit-tested (`npm test`, Vitest).

## Sky (WebGL)

[`SkyLayer`](src/components/SkyLayer.tsx) is the deepest layer — a single
full-screen primitive drawn by a raw **WebGL2** fragment shader (no three.js),
driven by the `EnvState` above. The renderer ([`src/sky/skyEngine.ts`](src/sky/skyEngine.ts))
is framework-free (like `motion.ts`): React only feeds it *targets*; one
persistent context + program owns a self-contained rAF loop that **lerps** the
EnvState-derived scalars (sun elevation, fog, cloud, storm, wind, parallax)
toward their targets each frame (the same exponential ease as the grid motion) so
any weather/time change — real or a forced override — cross-fades over
`skyTransitionMs` (~1.5 s) instead of snapping. It's DPR-aware (capped at 2×),
resize-aware, and **pauses entirely while the tab is hidden** (no background rAF).

The visual is an **atmospheric color field** (no horizon, no sun disc): the
fragment shader flows layered value-noise (fbm) to mix between four active field
colors, so soft regions of color form, drift, and dissolve with watercolor edges.
The noise domain advances with `uTime` at a slow, tunable `fieldDriftSpeed`
("alive but barely"); `fieldSoftness` controls boundary diffuseness and
`fieldGrain` adds faint texture. Colors come from an easily-replaced table of
placeholder hex anchors — a **set of four field colors per time band**
([`src/sky/palette.ts`](src/sky/palette.ts)): `night`, `dawn`, `day`, `dusk`.
`sunElevation` picks the band; the **`dayPhase`** signal (rising vs setting, from
before/after solar noon — added to `EnvState`) resolves the low-sun band to dawn
(rising) or dusk (setting). Weather modifies the field continuously on top: **fog**
desaturates + lifts toward soft gray (the SF hero state), **cloudiness** mutes +
darkens, **precipitation/storm** darkens + cools + agitates the drift, and
**windSpeed** nudges drift up — all lerped so they cross-fade. DialKit's **SKY**
group exposes the look + weather-response dials and a `previewSun` /
`previewCondition` / `dayPhase` sweep (via `setEnvOverride`) covering the full
time × weather matrix. If WebGL2 is unavailable, the layer falls back to a static
CSS gradient of the current (weather-modified) palette (logged) so it's never
blank; `prefers-reduced-motion` freezes the drift to a static field but keeps the
correct palette and (quick) transitions. The palette blend, weather modifiers,
and `dayPhase` derivation are unit-tested.

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
grouped MOTION / DEPTH / LAYOUT / FOCUS / DETAIL / SKY / OVERLAY, and pushes changes through `setConfig`
so they propagate without a reload. It is loaded behind an `import.meta.env.DEV`
dynamic import, so **neither the panel nor the `dialkit` dependency is in the
production bundle** (Rollup drops the dead branch); production uses the `DEFAULTS`.
Values persist to `localStorage` across reloads, and a **Copy config** button
emits a paste-ready snippet for promoting tuned numbers back into `DEFAULTS`.

The DEPTH group includes the per-card facing dials (`cursorDepthPx`,
`cardFaceStrength`, `maxCardTiltDeg`, `cardTiltLerpMs`) alongside the global tilt;
both are independently dialable. The FOCUS group dials the focus emphasis
(`focusScale`, `unfocusedOpacity`, `farOpacity`) plus `hoverLiftOpacity` (the
hovered card's opacity lift). The DETAIL group dials the hero carousel
(`detailCardScale`, `detailGap`, `detailPeekPx`), the hover-isolate dim
(`detailHoverDim`), the sky scrim (`detailScrimOpacity`), and the transition /
slide times.

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
  detailLayout.ts            # pure detail hero-carousel geometry (unit-tested)
  App.tsx                    # owns the controller, composes the layers (+ dev panel)
  main.tsx                   # React entry point
  index.css                  # global reset + viewport lock
  env/                       # environment data layer (Open-Meteo → typed EnvState)
    types.ts                 #   EnvState contract + SF location + attribution
    wmo.ts                   #   WMO weathercode → condition table (unit-tested)
    sun.ts                   #   continuous sunElevation model (unit-tested)
    openMeteo.ts             #   fetch/parse + EnvState derivation + fallback
    useEnvState.ts           #   live hook (fetch, minute clock, refetch, override)
  sky/                       # WebGL sky renderer (driven by EnvState)
    palette.ts               #   per-band field-color sets + dayPhase blend + weather mods (unit-tested)
    skyEngine.ts             #   raw WebGL2 engine (fbm color-field shader, eased uniforms, rAF loop)
  dev/
    Dials.tsx                # dev-only DialKit panel (excluded from production)
    EnvReadout.tsx           # dev-only EnvState text readout (excluded from production)
  hooks/
    useTicker.ts             # the single requestAnimationFrame loop
    usePanController.ts      # drag + keyboard → continuous grid position
    useDetail.ts             # detail mode + activeItem + hash routing
  components/
    SkyLayer.tsx             # layer 0: WebGL atmospheric color field (CSS-gradient fallback)
    GridPlane.tsx            # layer 2: recycled-slot infinite poster grid
    CardOverlay.tsx          # hover overlay on the focused card (headline/captions/CTA)
    DetailView.tsx           # the 3-panel detail reading state
    MiniMap.tsx              # bottom-left position carousel (interactive, both modes)
    FrameHUD.tsx             # layer 3: fixed HUD overlay
public/posters/              # poster images referenced by the manifest
```
