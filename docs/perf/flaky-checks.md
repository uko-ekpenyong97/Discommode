# The flaky checks

Why `verify:reader`, `verify:detail`, `verify:sky` and `verify:cover` failed
some runs and not others, what each cause was, and what changed. Measured
2026-10-03/04 overnight on an Apple M1 Max (ANGLE / Metal), Chrome 154,
against the **verify build** (below). The machine was shared: Spotlight was
indexing for much of the night (`mds_stores`, `spotlightknowledged` at up to
74% CPU) and the 1-minute load average ran 3–16, so every A/B here is
interleaved run by run.

## The verify build

Every suite but `verify:jank` drives the app through dev-only hooks
(`window.__covers`, `__flip`, `__sky…`), so they could only run against the
dev server — React's development build and one request per module, which is
janky in its own right. `npm run build:verify` (vite.config.ts, mode
`verify`) is a production bundle (React production, minified, no HMR) with
`import.meta.env.DEV` kept true, so the hooks and the `?intro` dock are there;
`npm run preview:verify` serves `dist-verify/`. What ships is still `npm run
build`, which has none of it.

```
npm run build:verify && npx vite preview --mode verify --port 5401 --strictPort
npm run verify:reader -- --url http://localhost:5401     # and the others
```

`cover-drag-checks.mjs` used to tell the dev server from a production build by
`window.__covers`; it now looks for Vite's client script, so its frame times
are judged on the verify build (they were printed, not judged, on dev).

## Baseline: one run of each, on the verify build of `main`

| suite | result | what failed |
| --- | --- | --- |
| verify:reader (37 min) | 5 ✗ | riffle frame budget at 1× and 2×, both ways (one 33 ms frame in 1 of 5 runs each); `pageclip` @2× held mid-turn, "prev 0.7: 595814 px" |
| verify:detail (4.4 min) | 1 ✗ | arrival `#02 tile cold`: a 50 ms frame 53 ms after the click (Long Animation Frame 58 ms, render 47) |
| verify:gpu (1.5 min) | ✓ | |
| verify:sky (12 min) | 1 ✗ | "a grid drag wakes the field": asleep before, not awake after |
| verify:cover (13 min) | 1 ✗ | `drag` 2560×1440 @2×: one 58 ms frame in 5407 ("fling, caught in its settle"; LoAF render 54) |
| verify:jank (47 s) | ✓ | |

`reduced` (card 02's reduced motion) passed in that run; alone it failed 1
run in 8 (below).

## Riffle frame drops (verify:reader `frames`)

**What it was.** Recorded every rAF interval of a 20→0 riffle at 2× with the
leaves' lift/land events and a CDP trace of every process
(`.context/diag/riffle-*.mjs`, not committed). Three causes, in this order of
size:

1. **The grid's covers drew under the reader.** Opened by its hash — the
   suite's route, and any shared `#read-01/N` link — the reader sits over a
   grid that is fully visible underneath (`display: block; opacity: 1`), and
   the cover stage kept drawing its 12 visible tiles at 60 fps: card 04's
   Rive player on the CPU and the lava and Drex shaders. A sampling heap
   profile of one riffle: **40.6 MB allocated, ~33 MB of it the covers'**
   (Rive's canvas renderer, three.js matrices). That is a major GC in every
   riffle (finalize pauses up to 26 ms) and CPU taken from the page decodes
   the riffle needs. The detail view already hides the grid with `opacity: 0`,
   which the stage checks; the reader never did.
   **Fix** (`coverStage.ts`, `readerCoversApp`): while the reader's layer is
   up, opaque and holding the sky (TABLE 1; through the doorway the ground is
   transparent until then), every instance inside `.app` holds its last frame,
   exactly as it does under the detail view, and draws again on the first
   frame of the exit. The stage reports 0 frames a second under the reader
   (it was 60); a riffle allocates 8.5 MB.
2. **The pre-decoded pages were collected.** The riffle decodes each leaf's
   pages ahead (`decode()` on a `new Image()`), but nothing held the element,
   so it — and its decode — was often collected before its leaf lifted. The
   trace shows the strips then decoding the page in the frame they showed it
   (`GpuImageDecodeCache::DecodeImage`, 20–45 ms on a raster worker, the main
   thread in `LayerTreeHost::WaitForCommitCompletion` for as long).
   **Fix** (`flipEngine.ts`): the elements are kept with their decodes (~40
   pages, their encoded bytes). First A/B, interleaved: 16 of 48 riffles with
   a dropped frame before, 7 of 48 after.
3. **~260 style writes a frame.** Each strip's shading (`--lit`, `--a1`,
   `--a2`) was written from JS on all 28 strips of every leaf in the air,
   every frame — Blink-heap garbage behind the remaining GCs. It is a pure
   function of the chain's `--tt`/`--td` and the strip's place in it, so
   `flipbook.css` computes it (`cos()`, `pow()`), with `--i`/`--taper` set
   once per strip. Three writes a frame per leaf. Held turns differ from the
   JS values by at most 1–2 levels (its `toFixed(3)` rounding); in-riffle GC
   finalize pauses went from 6–26 ms to 4–10 ms.

Tried and dropped, each measured: hiding the near slot's swapped `<img>` until
decoded (no change, 6/32 vs 6/32); one stylesheet rule per page instead of an
inline `background-image` (same ~60 decodes a riffle); decode-ahead of 2 or 3
leaves instead of 6 (same decode count); no decode-ahead at all (worse: every
run dropped a frame, 67 decodes a riffle).

What is left is Chrome decoding full-size pages as the slower leaves lift
(~60 decodes a riffle against ~40 page uses: the compositor's decode cache
does not keep every pre-decode) and whatever else the machine is doing; see
the run counts in the morning report.

## pageclip @2× (verify:reader)

"Held mid-turn: the sprite layer adds no pixel anywhere" failed once in the
baseline with 595,814 px on "prev 0.7" — not an edge, a large area. It did
not reproduce alone (12 of 12 clean, base and branch). That hold is the one
whose leaf newly shows page 02 over a large area, after half an hour of other
sections in the same browser: the capture was taken (after a fixed 150 ms)
before that face had landed, and the next capture — with the sprite layer
removed — had it. **Fix** (the check): each capture of a held turn is taken
once the frame has settled (two identical captures in a row, at most 10, 100
ms apart); how many extra captures it took is printed. A sprite layer that
did show mid-turn still differs from the capture without it, settled or not.

## Card 02's reduced motion (verify:cover `reduced`)

"Nothing moves over 1 s" failed 1 run in 8 alone: 15,099–16,351 bytes changed
in the grid. Every changed byte differed by exactly one level, spread over the
visible cards' still images: Chrome re-rasterising the same stills (~2 s after
the load) with slightly different filtering. A frame of a live cover changes
pixels by tens of levels. **Fix** (the check): `stillDiff` counts bytes that
changed by more than one level and prints the one-level ones beside them; the
same for card 04's (`rreduced`) and card 03's (`dreduced`), which make the
same claim.

## "A grid drag wakes the field" (verify:sky, section 6)

Failed every run, on the verify build and on the dev server. The drag was
pressed at the screen's centre, which is the focused card's centre — where
the hover overlay puts its round CTA. The press lands on the CTA's `<span>`,
the grid pans 0 px, and nothing splats. **Fix** (the check): the drag starts
on the focused card 20% down from its top, above the button. 3 of 3 since.
Whether a press on the CTA should be able to start a pan is a product
question (it cannot today).

## The first arrival of cards 02–04 (verify:detail `arrival`)

`#02 tile cold` (and in other runs `#04 tile cold`) dropped 2–3 frames ~50 ms
after the click. Traced: one image decode (~28 ms, a raster worker) required
before the morph's first frame could commit — the morph shows pictures the
grid never drew: the live tiles' own small stills (hidden once a cover draws;
the morph's centre card shows it until its first draw), every cover's full
still (the neighbours'), and card 01's drawn cover at rest (its hero face;
the grid shows the photograph). **Fix** (`warmup.ts`): the idle warm-up
decodes them, as it already did card 01's hover plates for the first hover.
8 traced cold arrivals of 02 and 04 after it: no frame over 16.8 ms.

## Frames of exactly two vsyncs (verify:cover `drag`, verify:jank)

Both judged "no frame over 33 ms" as `> 33.4`. A frame that dropped one vsync
reads 33.2–33.6 ms, so the same frame passed at 33.3 and failed at 33.4. Four
`drag` runs, `main` and branch interleaved: every failure was a 33.4, every
pass had a 33.3. `verify:jank` failed `reader→detail` on a 33.4, and the next
run had a 33.4 in `keys →←`. **Fix** (the checks): a frame is over when it is
three vsyncs or more, `Math.round(ms / 16.67) > 2` — verify:detail's rule
("over 33 ms is three vsyncs (50 ms) or more, and 33.3 is two"). The drag
check's timing pass is headed, and headed Chrome here runs at 120 Hz: its
41.7 ms frame is 2.5 of these, rounds to 3, and still fails.

## The first full run after the fixes

One run of each suite on the verify build of this branch, 03:44–04:57:

| suite | result | what failed |
| --- | --- | --- |
| verify:reader | 4 ✗ | riffle budget 1× 0→20 (one 33.4 in 5 runs) and 2× 20→0 (two in 5); "the flips and the riffle hold 60fps over the sky" at 1× and 2× (2 frames over 20 ms of 475 each) |
| verify:detail | ✓ | |
| verify:gpu | ✓ | |
| verify:sky | ✓ | |
| verify:cover | 1 ✗ | `drag` 1728×1117: one 41.7 ms frame in 5396 (headed, 120 Hz) |
| verify:jank | ✗ | `reader→detail` 33.4 ms — the two-vsync rule above, fixed after this run |

The "flips over the sky" frames passed alone on both builds, two rounds each
(0 of 476 over 20 ms); the branch's flip main-thread p95 is lower there (3.1–3.6
ms against 3.7–4.0 on `main`: the strips' shading in CSS).

## Where it ended (2026-10-04, 08:00)

Full runs of all six on the verify build of this branch:

| suite | first run | final 1 | final 2 |
| --- | --- | --- | --- |
| verify:reader | ✗ riffle ×2, flips over the sky ×2 | ✗ riffle ×3 | ✗ riffle ×4, flips over the sky @1× |
| verify:detail | ✓ | ✓ | ✓ |
| verify:gpu | ✓ | ✓ | ✓ |
| verify:sky | ✓ | ✓ | ✓ |
| verify:cover | ✗ drag 41.7 ms | ✓ | ✗ drag 41.8 ms; a Drex tile 79 off its siblings in one fling frame @2560 |
| verify:jank | ✗ 33.4 (fixed after) | ✓ | ✓ |

(A third final run was stopped for the riffle A/B below.)

**The riffle budget is not fixed.** `verify:reader --only frames` (20 riffles
a run), `main` and this branch interleaved, three rounds: a dropped frame in
**18 of 60** riffles on `main`, **13 of 60** on the branch — and round to
round each swung from 2 to 8 of 20. The fixes above remove real work (the
covers drawing under the reader; 40.6 → 6 MB of garbage a riffle; a lower flip
main-thread p95), and the per-riffle diagnostic measured fewer drops with them
(16/48 → 7/48, 13/40 → 3/40, and once 6/40 vs 8/40 while Spotlight indexed),
but in the suite's own runs the difference is inside the noise. What is left is
Chrome decoding full-size pages as the slower leaves lift. Options: more
half-resolution leaves (`riffleHalfResBelowMs`, a visual trade); gate the
budget on a control, as `pageanims` already does (an ordinary Next is already
measured beside it); or accept it.

The drag's 41.7–41.8 ms frames are real dropped frames in headed Chrome at 120
Hz (5 ticks), one in ~5400 frames, with nothing on the main thread.
