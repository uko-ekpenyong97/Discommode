# Chrome at 30 fps (2026-10-06)

The findings and the plan are below; **what was built** is the next section.

## Built (2026-10-06, approved in PR #54)

1. **A frame-rate-independent wake** (`src/sky/skyEngine.ts`, `stepFluid`). The
   fluid steps on its own clock, a fixed 1/60 s, with an accumulator (at most
   two steps a frame; time past that is dropped, not caught up). The pointer
   puts one splat into every step, spaced along its path since its last splat,
   at its speed over that time. The page's splats (cards, flips) go into every
   step covering their frames, weighted by 1 / the rAF frames since the last
   step. At 60 Hz it is the same arithmetic as before. Measured with the wake
   harness above (mean pixel change, slow / fast stroke, three runs each; the
   wake's visible strength depends on the weather, so compare within a row):

   | | 120 Hz | 30 fps (Energy Saver) | uncapped (270–390 fps) |
   | --- | --- | --- | --- |
   | `main` | 0.41–0.43 / 0.63–0.68 | 0.014–0.017 / 0.04–0.05 | 0.22–1.89 / 0.71–2.47 |
   | this | 0.076–0.096 / 0.13–0.28 | 0.078–0.094 / 0.13–0.22 | 0.070–0.081 / 0.17–0.22 |

   The same wake at every rate. On `main` 60 Hz was 0.19 of 120 Hz (the
   measurements above), ~0.08 here: this is `main`'s 60 Hz wake.

2. **The portfolio sheets decode off the main thread** (`src/portfolio/SheetCanvas.tsx`,
   `loadCapture`): fetched as a blob, decoded by `createImageBitmap` (flipped
   there, as WebGL does not flip a bitmap), uploaded between frames; the `<img>`
   path where that throws.

3. **The small ones.** The boil steps on the frame's timestamp
   (`CoverAnimLayer.tsx`); the page turn hands over to the plate a frame early
   when the next frame would skip the window (`flipEngine.ts`, `plateDue`; at
   60 Hz the steps are too small for that to happen); `MIN_LEAF_MS` is 67, two
   frames at 30; the turn reads the cached `bookW`, not `book.clientWidth`.

4. **Ambient motion at 60** (`src/ambient.ts`): the sky, the cover stage and
   the paper's cover draws (shaders and card 04's Rive face) draw at most ~60 a
   second, one decision a frame shared by all three. The paper itself, the grid
   and the page turns keep the full rate. Draw calls a second at `#item-03` on
   the MacBook's 120 Hz screen: the sky's **2,032 → 1,079**, the paper's 1,203 →
   1,023 (its cover draws halved, its own frames not). At 60 Hz or under nothing
   is skipped; at 90 every frame still; at 144, 72. Not capped: the portfolio
   view's Rive blocks, which run the runtime's own loop.

5. **Adaptive quality** (`src/quality.ts`), as proposed below: busy ms against
   the measured cadence, 2 s windows, two slow windows a step, step-down only
   (sessionStorage), tiers 2–3 on a settled page, busy p50 over 100 ms (in as
   few as 3 frames) or a software renderer → tier 4. Tier 1 holds a side card's
   last frame between 20 fps draws (stage and paper); tier 2 caps the covers',
   Rive's, the paper's and the sheet's DPR at 1.5 and the sky at 4 MP; tier 3
   turns the fluid off, side cards to stills, the sky to half resolution; tier
   4 is the reduced-motion paths (a still sky and still covers) and the detail
   view's DOM cards (no paper). `?tier=0..4|auto` in the query or the hash's,
   production too; the dev env readout's `quality` line; `window.__tier`
   (`get`, `history`, `force`, `inject`). **Under automation** (`navigator.webdriver`:
   Playwright, the verify suites) the governor is off at tier 0 unless the page
   asks with `?tier=auto`: the first suite run with it on stepped down under
   verify:cover's own probes and GPU benches (a side card at 20 fps, then the
   paper off) and timed out. No visitor has the flag. Captures: `thirty-fps/tiers.webp`
   (`?tier=0` … `4` at `#item-03`).

   `npm run verify:tier` (`scripts/tier-check.mjs`, real Chrome, the pointer
   moving), 2026-10-06 on the MacBook's 120 Hz screen: 14 s at the screen's
   rate never leaves tier 0 (busy p75 2.4 of 16.7); Energy Saver reads cadence
   33.3 and stays 0 (busy p75 2.6 of 33.3); 20 ms injected a frame steps at 7.2 s
   (the 3 s grace and two windows), then every 4.0 s, 1 → 2 → 3 → 4, never back;
   `--disable-gpu` is tier 4 at 1.3 s ("SwiftShader") with the DOM cards;
   `?tier=2` stays pinned under the same load; reduced motion runs no governor.
   With `--fault` (the fast case forced to tier 1) it fails, as it should.
   Unit tests: `quality.test.ts` (synthetic streams: light work at 120 / 60 /
   30-cap stays 0, a 30 cap with 28 ms of work steps, two windows a step, the
   portfolio's eight 70 ms frames in 14 s stay 0, alternating windows never
   step, severe → 4) and `ambient.test.ts`.


Uko's M2 Pro MacBook Pro: Safari smooth; Chrome lagged until Energy Saver was
off, graphics acceleration on and Chrome restarted. Visitors on battery will
have Energy Saver on (a 30 fps cap). This is what was measured, and what is
proposed; **nothing here is built yet.**

Measured on an M1 Max (not the M2 Pro), a `build:verify` bundle of `main`
(b2bf2ef), 1728×1117 at 2×, the pointer always moving, Chrome 60 / Chrome 30 /
WebKit rotated run by run, three runs each; load averages 2.8–25 (other agents
were running) are recorded per run in the raw data. "WebKit" is Playwright's
build, not Safari: Safari's WebDriver needs "Allow remote automation", which is
off and was left off.

## Card 04 into the paper, in real Safari (measured; a proposal, not built)

The paper uploads card 04's Rive canvas (three's `texSubImage2D`, once per new
Rive frame, 1351×1756 for the hero at 1728×1117 @2×). Real Safari 27.0, verify
build, 8 s runs interleaved, the pointer moving, the hero after the burst:

| | upload, ms a frame: mean (p50 / p95) | uploads a second | rAF p50 / p95 |
| --- | --- | --- | --- |
| Safari, hero `#item-04` | 8.15–8.78 (8–9 / 9–10) | 60 | 17 / 17–19 ms |
| Safari, side `#item-03` | 7.31–8.29 (7–8 / 9–10) | 60 | 17 / 18–21 ms |
| Safari, side `#item-01` | 7.47–8.09 (7–8 / 9–10) | 60 | 17 / 19–21 ms |
| Chrome, hero and side | 0.057–0.067 (0.1 / 0.1–0.2) | 120 | 8.3 / 8.5–9.3 ms |

So it is real: about half of Safari's frame, every frame card 04 is on the
paper. Safari still holds 60. It behaves like ~3.4 ms fixed + ~2.1 ms per
megapixel, so halving the size saves less than half. Prototyped in the page
only (Safari):

| | upload, ms a frame |
| --- | --- |
| as shipped | 7.3–8.8 |
| `riveMaxDpr` 1.5 (1013×1317; an existing dial) | 6.2–6.4 |
| `riveMaxDpr` 1 (676×878) | 4.2–4.8 |
| every 2nd Rive frame (30 Hz) | 3.9–4.5 mean (6–10 ms on the frames that upload) |
| **`riveMaxDpr` 1 + every 2nd frame** | **2.0–2.25 mean** (4–6 on the frames that upload) |
| `riveMaxDpr` 1.5 + every 2nd frame | 3.2–3.3 mean |
| the last frame's copy, a frame behind | 6.3–6.9 (+0.2–0.3 for the copy) |
| `willReadFrequently` (CPU-backed) canvas | 6.0–6.7 |
| an ImageBitmap | 7.7–8.3, and the draw rises to 4–4.5 ms |
| `getImageData` + raw upload | 150–156 |

The proposal was (1) a lower `riveMaxDpr`, (2) a 30 Hz upload, (3) slower side
cards. **Uko's decision (2026-10-07):** skip the upload on any frame where
card 04's picture did not change; in Safari, live side cards at 20–30 Hz;
measure the centre card alone after that, and only if it is still over ~4 ms a
frame, upload it at 30 Hz in Safari too; no lower `riveMaxDpr`; Chrome and
Firefox unchanged.

### Built: the draw print, and side cards at 20 fps in WebKit

**Most of card 04's uploads were the same picture.** The artboard reports a
change on nearly every frame, and the surface's `version` (what the paper
uploads on) followed it. Read back after every upload (Chrome, 20 s), the
side card's canvas was byte-identical to the one before in **972 of 1,196**
uploads, the hero's after the burst in 67 of 1,196: the face steps at about
12 fps, while the file animates geometry nobody sees, every frame — parked
~6,900 px off the artboard, or at zero alpha.

So in WebKit (`src/engine.ts`: Apple's vendor string, every iOS browser too)
each Rive surface keeps a **draw print** (`src/covers/rive/drawPrint.ts`): while
it paints, its context's visible draws — each fill, stroke and clip's
transform, paint and path geometry, skipping draws off the canvas (bounds
padded by the stroke, miter spikes included) or at alpha 0 — fold into one
number. A paint with the last paint's print is the same picture: the version
holds and the paper does not upload. Anything the print cannot see (a path it
did not build, a gradient, an image, text, a paint that drew nothing) counts
as a change, so it can only fall back to uploading.

- **Checked against exact pixels.** A first version folded every draw and never
  matched (the off-canvas geometry); culling by bounds made it match the
  pixel diffs on 7,170 uploads with no false match. `verify:cover`'s new
  `rprint` section (`scripts/rive-print-checks.mjs`, Chrome with `?webkit`)
  reads the plane back after every frame and compares it with the last
  upload: **0 stale frames** on the hero and both side cards. (It reads the
  canvas for 2 s before counting: reading a canvas every frame moves Chrome's
  2D canvas from the GPU to the CPU, which antialiases the face's circle a
  little differently, once — 10–11k px that a first run counted as stale.)
- **Side cards at 20 fps in WebKit** (`quality.ts` `sideFrame`, the same schedule
  as adaptive tier 1): the face steps at ~12 fps, so 20 shows every step. Card
  02 and 03's side cards upload nothing (the paper draws them itself), so they
  keep the full rate unless Safari shows they cost the same.
- **With both, in Chrome with `?webkit`** (10 s, pointer moving): the side card
  at `#item-03` and `#item-01` uploads **116 times in ~600 frames (19%)**; the
  hero after the burst still uploads every frame (everything on it moves).
  Without `?webkit` nothing changes: 540 uploads in 540 frames, no print.

### In real Safari, before and after (2026-10-07)

Safari 27.0 over WebDriver, 1728×1117 @2× (the page 1728×1065), verify builds
of the PR before this change and after it, alternated, two rounds of 8 s each
with the pointer circling the centre card; load average 2.2–14.9 (falling over
the runs). Upload: the WebGL upload of card 04's canvas into the paper, ms
summed per frame. Busy: the frame's main-thread ms (rAF timestamp → a message
posted from rAF), p50 / p95.

| | before: upload ms a frame (uploads/s) | after | busy p50 / p95, before → after |
| --- | --- | --- | --- |
| side card `#item-03` | 7.83–8.05 (60) | **1.33–1.51 (11)** | 15–16 / 17–18 → 4 / 15–17 |
| side card `#item-01` | 8.47–8.58 (56–59) | **1.37–1.40 (11)** | 16 / 21–23 → 4 / 17 |
| hero `#item-04`, the print and side cards only | 8.07–8.15 (60) | 7.98–8.34 (60) | 16 / 18 → 16 / 18 |
| **hero, + the centre card at 30 fps** | 7.81–7.88 (60) | **4.11–4.17 (30)** | 15 / 17 → 5–9 / 17 |

An upload still costs ~8 ms when it happens (7.4–8.4 on the frames that
upload): the savings are in how often. The frame rate held at 60 (rAF p50 17
ms) in every run. Frames over 20 ms per 8 s run are noisy in both builds and
did not improve on the side cards (before 5–47, after 11–50); the main thread
was busy for a quarter of the time it was.

**The centre card (item 3).** After the print and the 20 fps side cards, the
hero still took ~8 ms a frame — over the 4 ms Uko set — so in WebKit card 04
as the centre card is drawn into the paper and uploaded at 30 fps
(`quality.ts` `centreFrame`): ~4.1 ms a frame. Its characters move at 30 fps in
the paper there; Chrome and Firefox are unchanged. `rprint` checks it: the hero
under `?webkit` uploads on 300 of 599 frames, with no stale frame.

**Cards 02 and 03 as side cards cost Safari nothing measurable**: at `#item-02`
(card 03 live beside 02) the main thread is 5 / 6 ms with the side card live
and 5 / 6–7 with it held to its still (the `sidestill` fault), frames over 20
ms 8 against 8–10. They upload nothing — the paper draws them itself — so
they keep the full rate.

## Findings

### The cap, reproduced

Chrome's own Energy Saver, forced on: a fresh profile whose `Local State` has
`{"performance_tuning":{"battery_saver_mode":{"state":3}}}` (always on),
launched with `launchPersistentContext(dir, { channel: 'chrome' })`. Frame
interval p50 33.3 ms (p10 32.2, p90 34.7). Chrome caps itself, so the page,
compositing and CSS animations are all at 30, as for a visitor. (State 2, "on
battery", does nothing on AC. A JS rAF shim would cap only our code.)

## What it showed

1. **Energy Saver alone does not make the site stutter.** Every scenario holds
   33.3 ms (p95 ≤ 34.4); work per frame is what it is at 60. The only long
   frames are the portfolio's decode stalls (5), at every rate.
2. **Graphics acceleration off is what lags**: Chrome draws WebGL in software
   (SwiftShader), 1.2–3.7 fps, 250–840 ms of main thread a frame, everywhere.
   That matches what Uko saw.
3. **The sky's pointer wake is frame-rate dependent**, ~5× weaker per halving
   of the rate: on one pointer path, mean pixel change 1.3–2.5 at 120 Hz,
   0.25–0.64 at 60, 0.04–0.17 at 30 (`thirty-fps/wake-120hz.webp`,
   `thirty-fps/wake-30fps.webp`). One full-size push per frame
   (`src/sky/skyEngine.ts:846-848` → `src/sky/fluid.ts:141-143`).
4. **On the MacBook's ProMotion screen Chrome draws 120 frames a second;
   Safari draws 60.** Chrome's GPU process spends 1.8–6.8 ms a frame on its main
   thread, 0.3–3.3 ms of it switching between the page's WebGL canvases
   (`GLContextEGL::MakeCurrent`): 57–82% of an 8.3 ms frame in the grid,
   `#item-05` and the portfolio view. That is the real "costs more in Chrome".
   Per frame, Chrome's page thread is cheaper than WebKit's.
5. **The portfolio view drops 8–10 frames of 65–83 ms a pass at any rate**: a
   44 ms WebP decode inside the frame, the sheet captures through three's
   `TextureLoader` (`src/portfolio/SheetCanvas.tsx:381`).

| scenario | Chrome 60: interval p95 / work p95 | Chrome 30 (Energy Saver) | WebKit 60 |
| --- | --- | --- | --- |
| grid drag | 17.1 / 3.0 ms, 0 long | 34.3 / 3.0 ms, 0 long | 25 / 12 ms, 7–19 long |
| grid → detail morph | 17.0 / 3.2, 0 | 34.3 / 3.5, 0 | 37 / 31, 10–28 |
| `#item-03` (live side cards) | 17.2 / 4.0, 0 | 33.6 / 2.3, 0 | 30 / 30, 2–49 |
| `#item-05` | 17.3 / 3.3, 0 | 33.7 / 3.0, 0 | 22 / 9, 0–79 |
| four flips | 17.2 / 3.3, 0 | 33.5 / 3.3, 0 | 39 / 15, 15–43 |
| riffle 0 ↔ 20 | 17.0 / 6.9, 0–1 | 33.4 / 7.2, 0 | 80 / 29, 43–50 |
| portfolio view, 200 wheel ticks | 17.7 / 2.5, 8–9 | 34.0 / 2.2, 2–4 | 142 / 18, 34–217 |

Long frame: over 25 ms at 60, over 50 ms at 30. Work: main-thread ms from the
start of a frame's callbacks to a message posted from them (style, layout,
paint and commit included), the same in both engines.

| Chrome, other conditions | grid drag | riffle | `#item-03` |
| --- | --- | --- | --- |
| 120 Hz | 119.8 fps, work p95 2.8 | 118.0, 6.8 | 119.9, 2.2 |
| 120 Hz + 4× slower CPU | 84.1, 12.6 | **53.6, 30.5, 61 long** | 109.0, 9.9 |
| 30 + 4× slower CPU | 29.8, 12.2 | 29.5, 34.0, 2 long | 29.9, 8.8 |
| graphics acceleration off | **3.1 fps**, 409 | **3.7**, 285 | **1.2**, 926 |

## Is every animation time-based?

Yes, everything a visitor sees: a function of the clock, an exponential
approach scaled by the elapsed time, or a tween with a duration. Lenis 1.3.26's
`lerp` is time-based (`damp(v, to, lerp*60, dt)`). Checked by running each at
60 and at 30: the grid's snap-back decays at the same rate (0.463 vs 0.466 per
100 ms; the release lands ~16 ms later), a page turn settles 20–30 ms later (the
frame its end lands on), the riffle and the portfolio's glide are identical.

What misbehaves at 30, or has no margin there:

| file:line | what | at 30 fps |
| --- | --- | --- |
| `src/sky/skyEngine.ts:846-848`, `src/sky/fluid.ts:141-143` | pointer and page wakes: one push per frame | ~5× weaker per halving of the rate; pushes land further apart than the 0.02-height radius, so a fast stroke leaves dots |
| `src/sky/fluid.ts:422` | fluid step capped at exactly 1/30 s | no headroom: any frame over 33.3 ms loses time (the sky's own cap is 50 ms) |
| `src/hooks/useTicker.ts:5` (`MAX_DT` 0.05; also `skyEngine.ts:630`, `dome.ts:117`) | dt cap | one dropped frame at 30 (66.7 ms) is cut by 16.7 ms |
| `src/reader/flipEngine.ts:63`, `:749` (`PLATE_T` 0.985) | the turn's hand-off to the flat page | ~46 ms past the threshold: 1–2 frames at 30; one late frame and it lands at `onArrive`, the settle the comment warns about |
| `src/reader/jump.ts:57` (`MIN_LEAF_MS` 34) | shortest riffle leaf, "two frames" | one frame at 30; latent (shipped leaves are 107–143 ms) |
| `src/covers/coverStage.ts:115` (`UNDRAWN_PER_FRAME` 4) | priming off-screen tiles | half the rate; a fast fling can show a still |
| `src/components/CoverAnimLayer.tsx:387` | the boil reads `performance.now()` late in the frame | holds of 4 or 6 frames (±20%) |

## What costs more in Chrome than in Safari

| | Chrome | WebKit (Playwright) |
| --- | --- | --- |
| frames a second on the MacBook's screen | **120** | 60 |
| GPU process main thread, per frame | 1.8–6.8 ms (canvas switching 0.3–3.3) | not traceable |
| page main thread, per frame | p50 1.6–4.2, p95 ≤ 7 ms | p50 5–15, p95 ≤ 31 ms |
| card 04 into the paper (`DetailPaperLayer.tsx:466-474`) | 0.05 ms | **6.9 ms** (a Safari risk, to check in real Safari) |
| sky GPU, 3456×2234, fog + wake | 2.7 ms | 11 ms (likely the test build) |
| Rive draw / cover copies / chrome colour read-back | about equal / about equal / async every 500 ms, ~0.015 ms a frame | |

Flips and the riffle spend 0.9–2.0 ms in style and 2.2–3.9 ms in raster a frame
in both: the 196-element strip chains driven by custom properties
(`flipEngine.ts:461-463`), and `book.clientWidth` read each frame
(`:440`, `:1120`) though `bookW` is cached at `:375`.

## Proposed: fix these first

1. **A frame-rate-independent wake.** Step the fluid at a fixed 60 Hz with an
   accumulator (at most 2 steps a frame) and give each step its pointer pushes
   interpolated along the path at 60 Hz size. Retires the 1/30 cap. Today the
   wake differs ~25× between Chrome under Energy Saver and Chrome on ProMotion.
2. **Decode the portfolio sheets off the main thread** (`SheetCanvas.tsx:381`:
   `ImageBitmapLoader` / `createImageBitmap`, as `faceWorker.ts` does for the
   paper). Removes the 67–83 ms frames at every rate.
3. **Small ones:** the frame's timestamp in the boil tick; a time-based plate
   hand-off ("≤ 46 ms left") or one allowed a frame late; `MIN_LEAF_MS` that
   guarantees a drawn frame at 30; `bookW` for `book.clientWidth`.
4. **Uko's call:** cap the ambient WebGL (sky drift, the cover clock, Rive — not
   the paper or the grid, which move with the hand) at 60 on a 120 Hz screen,
   as Safari does. Halves Chrome's cost a second on the MacBook; the sky would
   drift at 60 there.

## Proposed: adaptive quality

Only where it helps. A capped visitor whose work is light is not slow, and
lowering quality cannot lift a cap, so **the signal is work per frame against
the measured cadence, never the interval**: on intervals alone a 30 fps cap
looks like 100% dropped frames.

**Signal** (a new `src/quality.ts`, fed from `useTicker`): *busy*, the page's
main-thread ms a frame (as measured above; one `postMessage` a frame, works in
Safari); *cadence*, the 25th percentile of intervals over 2 s, snapped to
8.3 / 11.1 / 16.7 / 33.3; budget `B = max(cadence, 16.7)`. 2 s windows, scored
only with ≥ 30 frames of the app's own loops; not the first 3 s after load nor
the first 500 ms after a route change.

**Steps:** a window is slow if busy p75 > 0.8·B, or more than 10% of frames run
over 1.5·B (GPU-bound). **Two slow windows in a row (~4 s) step down one tier**;
the next step needs two more. **It only ever steps down** in a session
(`sessionStorage`), so it cannot flicker; tiers 2–3 wait for `whenSettled`
(`src/activity.ts`), never mid-motion. Busy p50 over 100 ms, or a software
renderer at startup (the sky context's renderer string: SwiftShader, llvmpipe,
Software, Basic Render), goes straight to tier 4.

| tier | what changes |
| --- | --- |
| 0 | as shipped |
| 1 | live side cards redraw at 20 fps (`coverStage.ts` side presenters; the paper reuses the last side texture between draws) |
| 2 | lower DPR for the WebGL canvases, text untouched: sky `skyMaxMegapixels` 4; paper and sheet 1.5× not 2×; `coverMaxDpr` / `riveMaxDpr` 1.5 |
| 3 | fluid sim (the wake) off, side cards as stills, sky `skyResolution` 0.5 |
| 4 | software renderer or busy p50 > 100 ms: the sky draws once and stops, covers stills, the paper on its plain-page fallback (the reduced-motion paths) |

Checked against the measurements: this Mac at 60 or 120, Energy Saver at 30,
and 30 with a 4× slower CPU all stay at **tier 0** (busy p75 ≤ 0.35·B, drops ≤ 2
a run), so the Studio Display and the MacBook look unchanged; 120 Hz with a 4×
slower CPU stays at 0 in the grid and detail (85–109 fps) and steps once in the
riffle (19% dropped); graphics acceleration off goes to tier 4 at startup.

**Reduced motion:** no governor (the sky stops once settled, the covers are
stills); only the software-renderer test applies.

**Readout and override:** one line in the dev env readout, e.g. `tier 1 · auto ·
cadence 33.3 (cap) · busy p75 3.1/B 33.3 · drop 0% · stepped at 41.2 s: riffle
busy`; `window.__tier` (`get`, `history`, `force`, `inject`) for the checks;
`?tier=0..4|auto` read at startup pins the tier and turns the governor off — in
production too, so each tier can be looked at on the MacBook (it needs its own
parse: `DEV_QUERY` is dev-only).

**Verified by:** unit tests on synthetic frame streams (light work at 120 / 60 /
30-cap stays 0; 30-cap with 28 ms of work steps; the portfolio's eight 70 ms
frames in 14 s stay 0; alternating windows never step up); a `tier-check`
suite in real Chrome with the pointer moving (Studio Display 60 and built-in
120 stay 0; Energy Saver reads cadence 33.3 and stays 0; injected 20 ms busy
frames step within 4–6 s, one tier per 4 s, never back; `--disable-gpu` → 4;
`?tier=2` pinned; reduced motion runs nothing), run once against a broken
governor to show it can fail; and `visual-ab` at each `?tier=N` against 0.
