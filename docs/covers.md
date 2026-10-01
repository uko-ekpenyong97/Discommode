# Live covers

A card can have a LIVE cover: a shader or a Rive file, drawn every frame,
reacting to the mouse, and transparent where its ground is unless it brings
its own ([the backdrop](#transparency-and-the-backdrop)). Card 02 (rive-site) is
the first: the tuned "Shader variation 3 — Soft contour field", with the
weather sky showing through its ground. Card 04 (Nosey) is the second, and is
Rive: Nosey's four characters on an opaque grey ground of their own, looking at
the pointer, on "Main" in the grid and bouncing off the walls on "Main Bounce"
as the detail hero — see
[Rive covers](#rive-covers-card-04). Each is live in the grid tile, the
grid→detail morph and the detail hero, and everywhere else it is its still.

The shader and its tuning are the prototype's
([docs/prototypes/cover-shader-prototype.html](prototypes/cover-shader-prototype.html)),
and that page stays the tuning bench: it now loads the app's GLSL and dial JSON,
so what is tuned there is what ships.

> **On the numbers in this file.** Every measurement is from
> `npm run verify:cover` and `npm run verify:detail` on 2026-09-24 (card 02) and
> 2026-09-27 (card 04), on an Apple M1 Max (ANGLE / Metal), headless Chromium
> for the first and Chrome for the second.

| | |
| --- | --- |
| the grid, card 02 live, the sky through its ground | `docs/covers/grid-row.webp` |
| the detail hero, live on the paper | `docs/covers/hero.webp` |
| the same tile over NOON and over NIGHT | `docs/covers/noon-night.webp` |
| the detail hero before / after the card chrome came off, clear NOON | `docs/covers/bare-hero.webp` |
| the grid→detail morph at 0 / 0.5 / 1, before and after | `docs/covers/bare-morph.webp` |
| card 04: the grid row, live, the sky through its ground (the file before 2026-09-28; it is opaque now) | `docs/covers/nosey-grid-row.webp` |
| card 04: the detail hero at rest and mid-bounce | `docs/covers/nosey-hero.webp` |
| card 04: the same tile over NOON and over NIGHT (the file before 2026-09-28) | `docs/covers/nosey-noon-night.webp` |

## Handoff

**The detail view's arrival (2026-09-28).** [Not done](#not-done) 9. The
paper's GL — context, programs, crease map, card 02's renderer in it, every
face — is made once, on the first hover of a grid card, and kept across
every open and close (docs/detail-paper.md, "The arrival", which has the
numbers and the model). Two cover changes came with it: card 02's text SDF
and its half-float copy are built in ≤ 6 ms slices (the same output; they were
a 140 ms and a 20–40 ms task on every page load), and a Rive pointer event goes
to the hero instance on screen or waits for the next draw — through
`rivePlayer` it made a fresh hero whenever nobody was drawing one, which at
`detailSideScale` 1 was forever. Grid contexts are 2 until the first hover of a
card, 3 after; the detail view 3, on every arrival.

**Card 04's new file (2026-09-28).** Branch `update-nosey-cover-riv` ships
Uko's updated Nosey file (from `publish.sh`, signed, 872,152 bytes). The
interactions changed inside the file: the free hat is pushed and hit by the
moving pointer instead of dragged ([The .riv](#the-riv)). Main and Main Bounce
now have an opaque #E0DDDD fill. That is intended: card 04 is an opaque cover,
so its `coverBackdrop` is `solid` ([the backdrop](#transparency-and-the-backdrop)),
and the sky-through checks (`rsky`, `rground`) are skipped for it.
At the last runs: `verify:detail` all passed (card 04 as the hero
0.133–0.387%); `verify:cover` passed with 3 skipped (`rsky`, `rground` @1×/@2×),
except one miss of card 02's `reduced` grid (22,336 bytes changed in 1 s), which
passed 3 of 3 when re-run alone. Also `npm test` (325), `tsc -b`, `lint`, `build`.

**Where it stands (2026-09-27).** Branch `nosey-rive-cover` makes card 04 a
live Rive cover ([Rive covers](#rive-covers-card-04)). Uko's eye tests found
it dead twice, and neither was visible to the suites as they were: the grid
(a still for 20.8 s while the pointer moved) and then the hero (restarted from
rest by every long frame; the still for 2.1–2.7 s on a direct load; a readout
that stuttered the page) — "When card 04 does not react" has both, and the
COVER · nosey status readout that shows each stage. `rpointer` now runs the
real path on the grid, the hero after the morph and the hero on a direct
load. At the last runs: `verify:cover` and `verify:detail` all passed,
`npm test`, `tsc -b`, `lint`, `build`. A click on card 04's hero opens
`#view-04` (the cover is hover-only). Read [The .riv](#the-riv) before
re-exporting card 04's file: the Editor's export of it does not work. What
next: [Not done](#not-done) 9, the detail view's janky arrival, is on every
card and on `main`.

**Card 02 (2026-09-24).** PR #29 (the live covers) is merged. Branch
`shader-cover-detail-no-veil` takes the card chrome off a shader cover in the
detail view and weights the paper's light by the cover's alpha — the
[open issue](#the-veil-in-the-detail-view-resolved), now resolved. At its last
run: `verify:cover` (with the new `ground` check), `verify:detail` (64),
`npm test` (316), `tsc -b`, `lint`, `build`. Two misses in the full runs,
each passing when re-run alone: the grid's shared tile draw at 1728×996 @2×
(0.545ms, which put the grid total at 1.26 > 1.2; re-run 0.385ms, total 0.96),
and one 33.4ms frame in a Prev slide (re-run: 16.8ms in all six). The grid is
untouched here; that is the "take two runs" note below. The grid budget missed
again in the next full run, straight after `verify:detail` (1.285ms), and
passed alone again (0.63ms). If it keeps missing only after another GPU suite,
the likely cause is the GPU's state after that suite, not the grid. `verify:pv` was not
re-run: nothing it drives changed.

The same PR fixes card 01's hover sprites misregistering after Prev/Next
(docs/detail-paper.md, the sprite caveat). That bug was on `main` before this
branch and is not a covers bug: the sprite layer sized itself from a panel that
was still scaling.

**What is next:** the [Not done](#not-done) list. And one call that is Uko's,
not code's: what still reads as a pale sheet over the sky is the cover's OWN
riso paper stock (`riso4.paper` #9FAFFF at `paperOpacity` 0.439), in the
grid as much as the detail view. See [the veil](#the-veil-in-the-detail-view-resolved).

**Starting a fresh workspace:**

```
npm ci
npm run dev -- --port 5191 --strictPort   # any free port; :5173 is usually another checkout's
npm run verify:cover -- --url http://localhost:5191
npm run verify:detail -- --url http://localhost:5191
```

- Every suite defaults to `:5173`. In a worktree, always pass `--url`.
- The tuning bench is `/docs/prototypes/cover-shader-prototype.html` on the
  same server.
- `npm run covers` rewrites the stills (it starts its own Vite server).

**Dev hooks** (dev builds only):

| | |
| --- | --- |
| `window.__covers` | `pin(t \| null)` holds the cover clock; `time()`, `presenters()`, `frames()`, `benchStage(id, w, h)`, `benchPresent(w, h)`, `setSite({...})`, `backdrop(id)` (the cover's own, `sky` or `solid`); `dials(id)`, `patchDials(id, {folder: {dial: v}} \| null)` (null: back to the JSON) |
| `window.__paper` | the paper's own hooks (docs/detail-paper.md), plus `coversDrawn()` and `benchCover()` for the hero, and `override({ hideCovers: true })`: the live-cover planes undrawn |

**Gotchas that cost time:**

- `window.__covers` installs a beat after the app (a dynamic import). Wait for
  it before `pin()`, or the pin silently does nothing — verify:detail's first
  card-02 failures were exactly that.
- Editing ANY `.html` in the repo (the bench included) while a suite runs makes
  Vite reload the page under it: `verify:pv` died with "Execution context was
  destroyed". Edit between runs.
- `verify:detail` rewrites `docs/detail-paper/boil-steps.webp` as a side
  effect; `git checkout` it after a run unless you mean to update it.
- GPU numbers move between runs (the GPU also drives the display). Take two runs
  before believing a budget miss.
- `cover-ref.png` is RGBA. Measure a reference with its alpha, or you will match
  the wrong colours (the retune nearly did).

## Map

| File | What it is |
| --- | --- |
| `src/covers/types.ts` | `CoverRef` (the manifest's: `shader` or `rive`), `CoverDef` (a shader cover), `RiveCoverDef`, the per-draw `InstanceFrame`, `CoverBackdrop` (a cover's own: `sky` or `solid`). |
| `src/covers/covers.ts` | The registry: cover id → its definition (`shaderCover` / `riveCover` narrow it). The stills' URLs. |
| `src/covers/covers/nosey.ts`, `nosey.json` | Card 04's `RiveCoverDef`: its frame (1000 × 1300), its dials and its `coverBackdrop` (`solid`). |
| `src/covers/rive/riveCover.ts` | Rive covers: the runtime and the file (once each), the players (grid, hero), the pointer, the one-off work's scheduling, per-frame cost, `__covers.rive`. |
| `public/projects/nosey/cover.riv` | Card 04's file, copied in by `npm run projects` from `~/Discommode-pages/projects/nosey/cover.riv`. |
| `src/covers/covers/rive-site.glsl` | Card 02's shader: `//#common`, `//#passA`, `//#passB`. Shared with the bench. |
| `src/covers/covers/rive-site.json` | Card 02's dials, as a DialKit config; its defaults ARE the tuned values. Shared with the bench. |
| `src/covers/covers/rive-site.ts` | Card 02's `CoverDef`: dial values → uniforms (the bench's code, for three.js). |
| `src/covers/covers/riveText.ts` | The "Rive" strip as a signed distance field, built once on the CPU. Shared with the bench. |
| `src/covers/glsl.ts` | Splits a cover's GLSL into its passes and prefixes the version, precision and defines. |
| `src/covers/coverRenderer.ts` | One cover on one three.js renderer: the two passes, pass A's pooled targets. |
| `src/covers/coverStage.ts` | The DOM instances' ONE renderer: one draw per aspect at rest, one per domed instance, `drawImage` to each. |
| `src/covers/CoverTile.tsx` | One DOM instance: a 2D canvas over the still. |
| `src/covers/coverClock.ts` | The shared clock. |
| `src/covers/dome.ts` | The mouse dome's spring; `heroDome`, shared by the DOM hero and the paper plane. |
| `src/covers/coverDials.ts` | The live dial values (a module store), the site's dials, and `coverBackdrop(id)` / `backdropUnder(id)`: what is drawn behind each cover. |
| `src/dev/coverDials.tsx` | The COVER panel (dev). |
| `src/covers/bench.ts`, `devHooks.ts` | Dev: `window.__covers`, the GPU benchmark. |
| `scripts/make-cover-stills.mjs` | `npm run covers`: the stills. The tail of `npm run projects`. |
| `scripts/cover-verify.mjs` | `npm run verify:cover`. |
| `public/fonts/inter-latin-400.woff2` | Inter 3.19 (fontsource 4.5.15, OFL — `Inter-OFL.txt` beside it). |

Wired in: `content.ts` (`cover` on `PosterItem`, cards 02 and 04),
`GridPlane.tsx` (the tile), `DetailMorph.tsx` (the morph card, and which Rive
player it shows), `DetailView.tsx` (the panels), `DetailPaperLayer.tsx` +
`paperMaterial.ts` (the hero plane), `App.tsx` (the dev panel).

## The model

A card names its cover in the manifest:

```ts
cover: { kind: 'shader', id: 'rive-site' },
image: '/projects/rive-site/cover-still.webp',   // the still
```

Cards without `cover` are unchanged (card 03). A Rive cover's ref is
`{ kind: 'rive', id, src, artboard: { grid, detail }, stateMachine }` — see
[Rive covers](#rive-covers-card-04).

A cover is a `CoverDef` in the registry: one GLSL file, one dial JSON, and the
few lines of TS that turn dial values into its uniforms. Every instance of it is
an `object-fit: cover` crop of its FRAME (the Figma frame, 900 × 1326 for
rive-site): the grid tile shows the 3:4 of it, the hero the 10:13.

### Adding a shader cover

1. `src/covers/covers/nosey.glsl` — `//#common`, `//#passA`, `//#passB`. Pass A
   writes two targets at `rtScale` of the output over the crop plus `rtMargin`;
   pass B writes the cover, premultiplied RGBA. The renderer sets pass B's
   `uRT` / `uRT2` to pass A's targets; everything else is the cover's.
2. `src/covers/covers/nosey.json` — its dials, as a DialKit config.
3. `src/covers/covers/nosey.ts` — its `CoverDef` (frame, uniforms, `bind`,
   `frameUniforms`, `assets` if it needs textures, `domeSpring`).
4. One line in `covers.ts`, a `cover` on the card in `content.ts`, its id in
   `make-cover-stills.mjs`'s list, a panel in `src/dev/coverDials.tsx`, and
   `npm run covers`.

The renderer, the stage, the tiles, the morph, the paper and the verify suite do
not change.

## Transparency, and the backdrop

**The cover is not opaque, on purpose.** `cover-ref.png` is RGBA: its ground is
exactly 112/255 opaque, its inks 50–100%. The retune matched alpha as well as
colour, and the shader writes premultiplied RGBA, so the cover looks like the
reference over any backdrop. On the site the backdrop is the sky.

`coverBackdrop` is set in two places: on each cover, and as a site dial.

**On the cover** (its registry entry, `coverBackdrop` in `types.ts`), the
backdrop describes the file. It is a legitimate choice per cover:

| | |
| --- | --- |
| `sky` (default; card 02) | the cover's ground is transparent and the sky shows through it. The site dial below applies. |
| `solid` (card 04) | the cover brings its own opaque ground (card 04's artboards are filled #E0DDDD) and **nothing is drawn behind it**, including the site dial's colour. The sky does not show through, by design. |

**The site dial**, for a `sky` cover only (`backdropUnder(id)` in
`coverDials.ts`, which the stage, the Rive players and the paper all ask):

| | |
| --- | --- |
| `sky` (default) | nothing is drawn behind the cover. The grid tile is a 2D canvas in the DOM over the SkyLayer; the hero plane is premultiplied over the sky. No scrim, no darkening, nothing between the cover and the sky. |
| `solid` | `coverBackdropColor` is laid under the cover (premultiplied-over, in pass B; under the drawing in a Rive player). |

An opaque cover still goes through everything below (no tile fill, the
premultiplied texture, the shadow's hole). Those are exact for alpha 1, so
nothing about the card changes. The paper's light (`coverPaperShade × alpha`)
is then the full paper everywhere on it.

`verify:cover` asks the page for each cover's backdrop (`__covers.backdrop(id)`)
and **skips** `sky`, `ground`, `rsky` and `rground` for a `solid` one. They
are printed as skipped, not as failed, and the summary counts them.

What that took, outside the covers:

- **The tile has no fill.** A cover card's `.grid-card__face` has no background
  colour. Its `box-shadow` stays: a CSS box-shadow is only painted outside the
  box. That is the GRID. In the detail view a shader cover has no card chrome
  at all — see the next section.
- **The paper samples a premultiplied texture.** `uPremul` on the paper
  material: the crease lighting runs on the un-premultiplied colour and the
  texture's alpha carries through. An opaque face is exactly the old path.
- **The paper's shadow has a hole.** The canvas draws the cards' shadows (the
  DOM's, which would land on top of it) as a blurred rectangle, under the card as
  well as around it. Under an opaque card that was invisible; under a
  transparent one it is a dark slab over the sky. `uHole` cuts the card's own
  rounded rect out of it — which is what a CSS box-shadow does.
- **The still is premultiplied as the plane decodes it**, so a neighbour's still
  and the live hero composite the same way.

`verify:cover`'s `sky` check: the cover ground inside the i's stem, over a clear
NOON and a clear NIGHT: mean luminance 184.2 and 128.7, **30% apart**.

### No card in the detail view

In the grid a live cover is a card: 4px corners, a shadow, the hover overlay.
In the detail view it is not — nothing lies between it and the sky. For a card
with a `cover` of either kind (card 02's shader, card 04's Rive), in every
detail slot:

| | |
| --- | --- |
| the DOM panel | `.detail__panel--bare`: no corners, a TRANSPARENT shadow. Not `none`: `none` on an off-screen panel changes how Chrome layers the strip and re-rasterises the other cards' images (`#item-04`, DOM faces: 8% of pixels, up to 111 levels). |
| the paper | `uRadius` 0 (no rounded clip), no shadow quad. |
| the paper's light | the crease screen-blend and trough shading are weighted by `coverPaperShade × alpha`: the full paper under opaque ink, none where the ground is transparent. The dent, squash, ripple, fold and crease refraction move the sheet and are unchanged. Card 04 has its own `coverPaperShade` (its JSON); card 02's is the site dial. |
| the name's scrim | card 04 has a name and a line under it (card 02 has neither), and their scrim — a dark gradient up from the panel's foot — was a dark band across the sky over a transparent cover: `.detail__panel--bare` drops it, and the type carries a soft shadow (`0 1px 14px` at .4) instead. A design call: say if the scrim should come back. |
| the morph | the card's chrome (6px corners, `0 24px 70px` at .55) fades to none over the travel, on its easing, and back on the way out. |

Every other card is untouched: `verify:detail` as before, and before/after
captures of `#item-01/03/04` (paper on, paper off, the morph at 0.5; 1728×996
@1×/@2×) are identical outside card 02's own rect — 0 levels on the DOM and the
morph, ≤ 1 level on the paper, which is its run-to-run jitter.

`verify:cover`'s `ground` check: the hero with the paper's effects ON, where
the cover's alpha is ≈ 0, against the same pixels with the cover hidden
(`hideCovers`), at a clear NOON with the sky's clock pinned — **mean
0.15–0.16%, 0.00% of pixels past 32 levels** (floor, the sky against itself:
0.07–0.08%). The tuned cover has no transparent ground (see below), so the
check draws it with `riso4.paperOpacity` 0 and measures the alpha on the
page; 15–21% of the hero is then ground. Its control, the stock back at 0.439,
is 3.0–3.3%: the check sees a veil that size.

## Rendering: one new context, never one per tile

The grid repeats its row, so card 02 is on screen several times (3–4 tiles at
these viewports, 12–13 in the window). There is ONE new WebGL context for all
of them — the cover stage's (`coverStage.ts`), an offscreen canvas — and every
frame:

1. each cover with an instance on screen is drawn **once** for every instance
   showing it at rest, at the largest of their sizes (capped by `coverMaxDpr`),
   per aspect;
2. each instance with its own dome up (the hovered tile) is drawn once more, for
   itself;
3. each draw is copied into the instances' own 2D canvases with `drawImage`, in
   that same task. No `preserveDrawingBuffer`: the buffer is read before the
   frame it was drawn for is presented.

**The hero is drawn by DetailPaperLayer's own renderer**, not the stage's, and
its target's texture is bound to the hero plane as is. `CoverRenderer` takes any
three.js renderer, so the paper holds a second one, for the same cover, with the
same dials and the same clock. Why there and not in the stage: a texture cannot
cross WebGL contexts. The alternative is copying a 2 MP frame from the stage's
canvas into the paper's context every frame (`texImage2D` from a canvas), which
costs more than drawing it. The paper's renderer exists from the first hover
of a grid card (or the first detail view) for the page's life, and card 02's
renderer in it is made, compiled and drawn once then (docs/detail-paper.md,
"The arrival").

| | main | with covers |
| --- | --- | --- |
| grid | 1 (the sky) | **2** (+ the stage); 3 from the first hover of a card, when the paper's is made early |
| detail view | 2 (the sky, the paper) | **3** (+ the stage) — on every arrival: the paper's is made once (it was one more per arrival) |

The stage also draws the morph card and the hero's DOM face (until the paper
takes it over): 10:13 instead of 3:4, so a group of its own.

**What renders when.** Instances on screen render every frame, at full rate: the
hero, the hovered tile, all of them. Nothing renders when none is visible: the
stage's loop sleeps until the IntersectionObserver wakes it. Instances that are
on screen but hidden by CSS are checked, not drawn — the grid under the detail
view (`opacity: 0`: until 2026-09-27 only `visibility` was checked, and the
grid was drawn every frame behind the hero, card 02's and card 04's alike), the
hero's DOM face under the paper (`visibility: hidden`). Three places **hold** their last frame
instead of drawing, because another instance is showing the same cover bigger
and live, and drawing both would pay twice for one moment:

- the grid while it fades under the grid→detail morph, either way;
- the hero's DOM face while the paper hands IN (120ms);
- the paper while it hands OUT.

**No per-frame allocation** in the stage's loop, the renderer's draw or the dome,
except one `DOMRect` per visible instance (`getBoundingClientRect`, which the
DOM allocates). Instances move and scale every frame in the grid (the focus
scale, the tilt), and nothing else says how big they are now.

## The clock, and the dome

`coverClock.ts`: one time for every instance — `performance.now`-based, read at
the frame's `document.timeline.currentTime` so every rAF callback in a frame (the
stage's, the paper's ticker) draws the same moment. It does not advance while the
tab is hidden, and it is 0 under `prefers-reduced-motion`. So the repeated grid
row always shows one moment, and the morph hands the hero the frame it was
showing.

`verify:cover`'s `clock` check: the focused tile and the hero, each in its own
view, the clock pinned, cropped to the part of the frame both show — **0.33% /
0.32%** of pixels differ (1× / 2×). A control, the hero one second later: 3.71% /
7.13%, so the check can fail. They are compared blurred (σ 2 at 300 px across):
at 1× the tile draws the dot field at 3 frame units a pixel and the hero at 1.4,
so their speckle aliases differently at the SAME moment, while the letters, the
lenses and the marquee do not.

**The mouse dome.** Each grid tile has its own spring: the pointer over a tile
drives the dome in that tile's frame coordinates, and every other instance of
the cover shows it at rest. The hero has one spring (`heroDome`), driven by the
pointer over the hero's DOM panel. The DOM face and the paper plane both read
it, stepped by wall time so reading it twice in a frame integrates once. The
paper's hover dent stays; both react at once. The morph card has no dome.

## The morph, and the stills

**Grid → detail.** The morph's centre card is a live `CoverTile` on the same
clock, so it lands on the hero's frame and needs no cross-fade: the morph's face
cross-fade is 0 for a cover card (the path stays, for the cards whose grid and
hero faces differ). The paper's own hand-off dissolve (120ms, DOM alpha only)
stays too, and dissolves between two identical frames. Then the DOM hero, then
the paper, each an identity. A shader cover's card chrome fades out over the
travel ([no card in the detail view](#no-card-in-the-detail-view)), so both ends
of the hand-off are bare:

| `verify:cover` `morph`, the clock pinned | 1× | 2× |
| --- | --- | --- |
| the last morph frame → the DOM hero | 0.22% | 0.20% |
| the DOM hero → the paper (effects at 0) | 0.00% | 0.00% |

**The stills** (`npm run covers`, and the tail of `npm run projects`): the cover
at t = 0, dome at rest, nothing behind it, drawn by the app's own renderer in a
headless Chrome the script starts with its own Vite server. The WHOLE frame, so
it crops exactly as the live cover does wherever it stands in for it:

| | | |
| --- | --- | --- |
| `cover-still.webp` | 900 × 1326, 1.1 MB | where the still IS what shows: the detail neighbours, reduced motion, no WebGL. Drawn at 1800 and halved. |
| `cover-still-sm.webp` | 360 × 530, 181 KB | under a live tile, for its first paint only |

The full still is 1.1 MB because the particle field is noise, and noise does not
compress: WebP at 900 px is ~1 MB at any quality that holds up, and AVIF was
measured at 400–900 KB at the sizes that hold up. So it is loaded only where it
shows, and the grid's first paint gets the small one. Card 02's old face (the
flat placeholder `/projects/02/card.webp`; it was never in `CARD_FACES`) is
replaced by the still.

Where the still is used: **reduced motion** (the clock is 0 and nothing draws —
`verify:cover`: 0 cover canvases, the paper drew the cover 0 times, 0 bytes
changed over 1s), **no WebGL** (all tiles on the still), **the detail
neighbours** (Prev/Next: "the cover's still, not live"), **first paint** (until
the stage's first frame lands on the canvas). The MiniMap shows numbers, not
faces, so it has nothing to show.

## Dials

The COVER panel (`src/dev/coverDials.tsx`), one per cover: every dial the bench
has, stage toggles included, plus the site's `coverBackdrop`,
`coverBackdropColor`, `coverMaxDpr` (2) and `coverPaperShade` (1: in the
detail view, the paper's light per unit of the cover's alpha; 0 is no paper
light on the cover at all). **Copy pastes into
`src/covers/covers/<id>.json`** (the site's three are not the JSON's). It is at
`#item-02?intro`, as specified, and in the app's own dock everywhere else: DialKit's store is
global, so the panel is registered from outside `src/reader` and appears in
whichever dock is mounted — the doorway's at `?intro`, where the app is
suspended, which is why App mounts it even then.

The bench's own controls (size, DPR, freeze, lens mask, benchmark) stay on the
bench. `rtScale` moved from them into the cover's `quality` folder, because the
app needs it too.

rive-site's folders (`rive-site.json`). JSON carries no comments. Why each value
is what it is — the measurements against `cover-ref.png` — is in the DIALS
comments of the prototype as the retune left it (`git show
65649ec:docs/prototypes/cover-shader-prototype.html`) and in that commit's
message.

| folder | what it drives |
| --- | --- |
| `stages` | the five stage toggles (blobs1, rings2, dots3, riso4, refraction5) |
| `quality` | `rtScale`, pass A's resolution (0.5) |
| `base` | the frame: background, border, `circleVisible` (off), the marquee, `textTop` (Figma's 204) |
| `blobs1` | stage 1: the displacement (mostly a +18-unit shift), its noise, the levels crush |
| `rings2` | stage 2: the contour rings, shown only through the lenses |
| `dots3` | stage 3: the particle field (`cellK` / `density`, size, band, colour shift) and the mouse dome |
| `riso4` | stage 4: paper, the four inks fitted to the reference, their opacities and misregistration; the grade (identity) |
| `refraction5` | stage 5: the slug lenses (`slug*`, `minify`, `rimSmear`), the noise-blob fallback, the budget cuts (`noiseHalfRes`, `dispersionCut`) |
| site: `coverBackdrop`, `coverBackdropColor`, `coverMaxDpr`, `coverPaperShade` | not the cover's: in `coverDials.ts`, not the JSON |

The COVER panel persists (`dialkit:cover-rive-site-v1` in localStorage), as the other
dev panels do. A value set there overrides the JSON in that browser until reset,
and the verify suites run in fresh contexts, so they always see the JSON.

**The font is shipped.** The bench found Inter installed; visitors do not have
it. `public/fonts/inter-latin-400.woff2` is fontsource 4.5.15, i.e. Inter 3.19,
and it rasterises "Rive" pixel-identical to the Inter the cover was tuned with:
0 pixels differ, and the same 1512.17-unit advance, which is Figma's 1511 strip
spacing. Inter 4 (fontsource 5) is 1523.9 and 4.7% more ink.

## Frame time

Measured as the tuning bench measured when these budgets were set
(`src/covers/bench.ts`): batches of draws closed by a one-pixel read, minus the
same batches of the FLOOR — two do-nothing passes into the same targets. The
floor is printed beside every figure, and so is the total. Two full runs on
2026-09-24, as ranges: the GPU also drives the display, and the shared tile
draw in particular moved between them.

| | 1728×996 @1× | @2× | 1440×900 @1× | @2× | budget |
| --- | --- | --- | --- | --- | --- |
| hero (the paper's draw) | 0.215–0.220 | **0.830–0.835** (+ floor: 0.955–0.960) | 0.160–0.305 | 0.670–0.725 (+ floor: 0.785–0.855) | ≤ 1.0 |
| each tile: its copy | 0.032–0.035 | 0.055–0.058 | 0.030–0.033 | 0.055–0.057 | ≤ 0.15 |
| the shared tile draw | 0.090–0.105 (336×448) | 0.235–0.365 (672×896) | 0.085–0.100 | 0.230–0.240 | — |
| worst frame of cover work | 0.277–0.315 | 0.835–0.902 | 0.260–0.305 | 0.670–0.725 | ≤ 1.2 |
| sky + fluid (p95) + covers | 1.60–1.85 | 2.90–3.21 | 1.51–1.52 | 2.60–3.32 | ≤ 8 |

The worst frame of cover work is the larger of: in the grid, the shared draw,
the hovered tile's own, and every visible tile's copy; in the detail view, the
hero. With the floors added, every row is still inside its budget.

**How "each tile" is read here.** Under this design, a tile's own cost is its
copy of the one shared draw. The shared draw is paid once per frame for every
tile at rest, and is counted in the total. Read "each tile" as "one tile drawn
on its own" and the answer is 0.235–0.365ms at 2× (0.35–0.50 with its floor), over 0.15.
The design never draws one that way. It costs that much because the grid's tile
is 300 × 400 CSS px, scaled 1.12 when focused: 672 × 896 at 2×, 2.4× the
pixels of the 220 × 286 tile the prototype measured.

**At `cardWidth` 480 the grid is over its budget at 2×.** Uko's LAYOUT tuning
(2026-09-30) made the tile 480 wide: the shared draw is 1075 × 1434 at 2×, 2.56×
the pixels, and it costs what that says. Measured interleaved with the build
before the change, two rounds each, same session:

| @2× | `cardWidth` 300 | `cardWidth` 480 | budget |
| --- | --- | --- | --- |
| the shared tile draw | 0.26–0.57 (672×896) | **0.64–0.70** (1075×1434) | — |
| each tile: its copy | 0.053–0.063 | 0.097–0.118 | ≤ 0.15 |
| worst frame of cover work, grid | 0.71–1.30 | **1.56–1.71** | ≤ 1.2 |
| sky + fluid (p95) + covers | 1.86–2.96 | 2.52–2.99 | ≤ 8 |

So `verify:cover`'s grid total fails at 2× at both viewports, and the frame
as a whole (sky, fluid and covers, under 3ms) is nowhere near its 8. The
levers, if the 1.2 matters more than the tile's size: `coverMaxDpr` on the
grid's shared draw, or drawing the shared tile at the unfocused size.

## Rive covers (card 04)

Card 04's cover is Uko's Rive file: four Nosey characters — the headset one,
the cat, the propeller and the hardhat — that follow the pointer, on an opaque
grey ground. In the grid it is the artboard "Main"; as the detail hero it is
"Main Bounce", where the four bounce off the walls and each other like a
screensaver. Both are 1000 × 1300 (10:13, the hero's ratio), both are filled
#E0DDDD (since 2026-09-28; they were transparent before), and both run the
state machine "Main". Its `coverBackdrop` is `solid`
([the backdrop](#transparency-and-the-backdrop)).

```ts
cover: {
  kind: 'rive',
  id: 'nosey',                                  // registry key, and the stills' folder
  src: '/projects/nosey/cover.riv',
  artboard: { grid: 'Main', detail: 'Main Bounce' },
  stateMachine: 'Main',
},
image: '/projects/nosey/cover-still.webp',      // the still
```

The registry holds a `RiveCoverDef` for it (`src/covers/covers/nosey.ts`): the
frame and the dials. The tiles, the morph, the paper, the stills, the COVER
panel and the verify suite take it as they take card 02; everything
Rive-specific is `src/covers/rive/riveCover.ts`.

### The .riv

**The Editor's export of this file does not work, and the shipped file is a
CLI build.** What was found on 2026-09-27:

| file | artboards | Main / Main Bounce | scripts run |
| --- | --- | --- | --- |
| the Editor's export (303 KB) | 4 | **not in the file** | the one script it has (PropellerSpin) |
| `rive <dir> --once` (unsigned, 876 KB) | 6 | yes | **no** — "ScriptAsset doesn't have a generator function" |
| `rive <dir> --publish=local` (signed, 872 KB) — **shipped** | 6 | yes | yes |

Each was loaded in @rive-app/canvas 2.42.1 (this repo's), canvas 2.43.1 and
webgl2 2.43.1, with the same result in all three: the runtime was never the
problem. Main and Main Bounce are built on Luau scripts (MainPlay, BouncePlay;
PropellerSpin, BladeSpin, LerpNumber beside them), and the Editor's export
(checked by parsing it object by object) holds their view models but neither
artboard nor their scripts. The CLI's project, pulled with
`rive create --from-remote-file=2319048` (a download; nothing was pushed), has
all six artboards and five scripts, and `--verify`s clean. Built with
`--once` its scripts are unsigned, and web runtimes refuse unsigned scripts
(the CLI's docs, "Why signing exists"); built with `--publish` they are
compiled and signed, and run.

So: **re-export card 04 with the CLI**, `rive <dir> --publish`, into
`~/Discommode-pages/projects/nosey/cover.riv`, then `npm run projects` (and
`npm run covers` if Main's first frame changed). An unsigned build still has
the artboards but nothing scripted moves, and it says so only in the console.
The earlier unsigned master is kept beside it as `cover.unsigned.riv`, which
`npm run projects` does not ship (`NOT_SHIPPED`).

**521 KB of the 872 KB are four reference screenshots** the artboards never
show (one is placed under Nosey Cat, hidden; the Editor had them out of the
export, the CLI embeds them). `exportFlags="2"` on their `ImageAsset`s in the
CLI project drops them from the build. Not done here: it is a change to the
file.

**The 2026-09-28 file.** It arrived as a `--once` build (byte-identical to one
of the Editor file), so its scripts were unsigned. The shipped file is the
signed build of the same source (`publish.sh`, 872,152 bytes). Compared with
the 2026-09-27 source, no artboard, state machine or listener was renamed,
added or removed (6 artboards, 17 listeners). What changed:

- **`MainPlay.luau`: the free hat is hover-driven.** It used to be grabbed,
  dragged and thrown on a press, which the site never sends. Now a pointer
  within 150 units pushes it gently, and a pointer sweeping into it (within 90,
  faster than 150 u/s toward it) hits it like a ball. Nothing claims the
  pointer. `ptrX`/`ptrY`/`ptrDown` are still mirrored (`rpointer` reads them).
- **`Nosey Hardhat.dropReady`**, a new view-model boolean (default true). It
  gates Hat Off → Hat Drop and is false for 8 s after a hat comes off, so the
  loose hat can be played with. The cover binds default instances, so it needs
  nothing.
- **The #E0DDDD fill on Main and Main Bounce** (above).

**Checking a file:** the dev console logs, at load, every artboard, state
machine (inputs, listeners) and view model (properties) the file holds, and
warns when the manifest's artboards are not among them.

### Data binding

The behaviour lives in view models: Main's and Main Bounce's (positions, the
pointer, the free propeller and hat) and each character's (Nosey, Nosey
Hardhat, Nosey Cat, Noseyhead), with the "LookX to blend" converter. **Nothing
moves unless the state machine is bound to them.** The `Rive` class does that
with `autoBind: true`; the cover uses the low-level API (below), so it does it
itself: each player binds its state machine to its artboard's default view
model instance, and to a default instance of each global view model (the file
has none). If the pointer-follow or the headset stop reacting, check this
first; then that the file's scripts are signed (above).

### Rendering: two players, no WebGL

The low-level runtime, not the `Rive` class: the class runs its own rAF loop
into one DOM canvas, and the cover draws on the SHARED cover clock, once per
frame, for however many instances show it. The file is fetched and imported
once. There are two PLAYERS — an instance of an artboard, its state machine
and its view model, drawing into its own 2D canvas:

| player | artboard | shows it | how |
| --- | --- | --- | --- |
| grid | Main | every card-04 tile, the morph card | the cover stage draws it ONCE a frame at the largest visible tile's size and `drawImage`s it into each tile, exactly as card 02's shared draw |
| hero | Main Bounce | the DOM hero face AND the paper's hero plane | the stage copies it into the DOM face; the paper wraps the same canvas in a `CanvasTexture` and uploads it when the player drew a new frame |

One instance behind both of the hero's surfaces is what makes the DOM → paper
hand-off an identity: 0.00% at every size. The stage groups a Rive presenter
by its LAYOUT box's aspect, not its bounding box's — a hovered tile tilts, and
a tilted tile's bounding box is another shape, which was a second draw of Main
every frame (1.87 draws a frame before, 1.00 after).

A player advances by the cover clock's delta since its last draw, capped at
0.1 s (a grid you come back to resumes; it does not replay), so a pinned clock
holds it still. A player whose artboard did not change is not redrawn, and
the paper does not upload it.

**No WebGL context.** @rive-app/canvas draws with Canvas 2D, but its init
opens a WebGL context of its own, unconditionally, for IMAGE MESHES, and
decoding an image asset retries it. Card 04 draws no image meshes — its one
image is the hidden reference screenshot — so `riveCover.ts` withholds both:
while the runtime initialises, a context request carrying Emscripten's own
`renderViaOffscreenBackBuffer` attribute (nothing else on the site asks for
one) gets null, and the file is imported with an asset loader that declines
images. Frames with and without are byte-identical (both artboards, 150
frames, a pointer), and `rcontexts` counts 0 contexts made by the runtime: the
grid has 2 and `#item-04` 3, as before card 04 was live. A future file that
deforms or shows images has to lift both, and pays that context back.

**The one-off work prefers a quiet moment, and waits at most a second for
one.** Importing this file is one 45–97 ms main-thread task (the Editor's
export, without Main, imported in 8: it is Main's scripts and nested
artboards); making the grid's instance takes ~10 ms and each hero's 3–4. The
first run of `verify:detail` caught the import landing inside a Prev slide (a
33.3 ms frame), so the import waits for an idle callback with no press, key,
wheel, touch or drag for 800 ms and no animation running — but only for **1 s**
after the file's bytes are ready, and the grid's instance is made in the same
task as the import. A HOVER is not input here: slides and morphs start from
presses, keys and wheels, and counting a moving pointer made every arrival
wait the whole second (a direct load of `#item-04` showed the still for
2.1–2.7 s with nothing animating; now the hero is live 0.64–1.11 s after
navigation, `rpointer`).
Until then the tiles show the still, as they do before any first frame; a
spare hero instance is made the same way, so the swap takes one ready-made.

The deadline was 10 s, and waited twice (the import, then the grid's
instance). With a real person's pointer — always moving, and a moving pointer
is input — that was **20.8 s of the still** in a real Chrome session before the
cover was live, with every hover in that time going nowhere: card 04 looked
like a static image, in the grid and the detail view (2026-09-27, reported by
Uko). The suites never saw it: their pointer sat still, the page was quiet in
1.2 s, and they waited for the file before hovering. Now, with the pointer
moving from the first frame, the import runs 1.00 s after the bytes land and
the cover is live 1.4–1.5 s after navigation (`rpointer`). The deadline has a
timer of its own: checked only from idle callbacks, which are up to 500 ms
apart on a busy page, it ran at 1.34 s in a real session. In real Chrome at
`#item-04?intro`, pointer moving: waited 1.03 s, live 2.1–2.7 s after
navigation (fetching and compiling the runtime is ~1 s of that, before the
wait; the import itself took 45–405 ms there).

### The pointer

| instance | what it takes | from |
| --- | --- | --- |
| a grid tile | moves while the pointer is over its CARD, an exit when it leaves — the characters look at the hovered tile's pointer and go back to rest when there is none; all tiles show the one instance, so all look the same way | the whole `.grid-card`: the hover overlay's CTA sits over the tile and takes the pointer, and over it the tile alone saw a leave |
| the hero | moves while the pointer is over its panel, an exit when it leaves — hover only, like the tiles; a click opens the project (below) | the whole PANEL (under the paper the DOM face is `visibility: hidden` and takes no events; its panel does) |
| the morph card, the neighbours | nothing | |

A point across an instance's box maps back through its `object-fit: cover`
crop into artboard space. An event that arrives before the instance exists
(the file still loading) is kept, and the last move is replayed into the
instance when it is made — a pointer already resting on the cover counts. No
smoothing dial: the characters' tracking eases in the file itself.

### When card 04 does not react

**If a feature looks dead on one port and alive on another, or in an incognito window, suspect saved dials first.** They live in `localStorage`, which is per port, and every workspace's dev server takes the ports in turn. Press **Reset dials** in the dock's DIALS panel. Saved dials are versioned (`DIAL_STATE_VERSION` in `src/dev/dialState.ts`: bump it when a persisted dial is renamed, re-ranged or changes meaning) and validated on load.

The COVER · nosey panel ends in a **status** readout, and the console carries
the same lines as they change (`[covers] nosey: …`):

| field | reads | if it is wrong |
| --- | --- | --- |
| `file` | not requested → fetching → waiting for idle → importing → loaded (or failed: the error), with the ms of each since the request | stuck before `loaded`: the still is what shows, and no hover goes anywhere. `waiting for idle` → `importing` is at most ~1 s; `failed` names the reason (a 404, not a .riv, no runtime) |
| `showing` | which instances are on screen now: grid tiles (Main), the morph card (Main or Main Bounce), the hero's DOM face (Main Bounce), the paper plane (Main Bounce, or the still) — and what it was before; the artboard swap is a change here | the paper plane on `the still` once the file is loaded: Main Bounce is not reaching the plane |
| `grid`, `hero` | each instance apart: artboard / state machine / view model, which instance it is (`#n` counts them), and whether its state machine is advancing | `no instance`: nothing is drawing that role. `vm none`: not bound — nothing view-model-driven moves (docs above). `not advancing` while it is on screen: nothing steps it. A hero `#n` that climbs while you watch: the hero keeps being made afresh — the bounce restarting from rest (below) |
| `gridPointer`, `heroPointer` | `receiving` while events come; once they stop, the last one: its kind, where in ARTBOARD space, how many in all | `none received` while you hover: the events are not reaching the cover (an element above it, `inert`, the listener's target) |
| `heroPlane` | what the paper's hero plane samples — live Main Bounce or the still — and whether new frames are being uploaded to it | `the still`, or `no new frame uploaded` while the hero is on the paper |
| `reducedMotion` | the media query as the page sees it | `reduce`: the stills everywhere, by design, and the runtime never loads |

Its lines are STATES, not counters: every change of the panel is a DialKit
re-render of the dock, ~300 ms in a dev build, and a readout that ticked (a
frame count, an age, coordinates while the pointer moved — the first version
of it) stuttered the page once a second while the dock was open. The live
numbers — frames, dt, every pointer event, uploads — are in the console and
`window.__covers.rive.status('nosey')`. Also in the console: the file's
artboards, state machines and view models at load, the image assets not
decoded, every change of `showing`, and `prefers-reduced-motion`.

What was checked, in a real headed Chrome (153), the pointer moving from the
first frame, 2026-09-27: advance runs every frame the cover is on screen (the
grid's 76.5 steps a second at 76.5 rAF a second; the hero 91 in a second with
no pointer at all), not only on pointer events; the grid tile's own canvas is
on top at its middle, the detail's panel at the hero's (the paper canvas takes
no events), and `#item-04?intro` is not `inert` for card 04 (only DialKit's
own text fields are); the reduced-motion query was `no-preference`. The one
thing wrong was the 20.8 s wait above — and the CTA's leave.

**The hero, the second time (same day, real Chrome, arriving by the tile's
morph and by a direct load, Next, Prev, Enter, paper off, after a hot
reload).** In a clean session it lived on every route; what made it look dead
was the machine being busy, and four things this cover did with that:

1. **A long frame made a fresh hero.** A hero not drawn for 400 ms of wall
   time was taken as LEFT, and remade: the bounce back at rest, the tracking
   dropped. One 400 ms frame is enough, and the detail view's arrival gives
   150–500 ms frames on a loaded machine (more in a dev build; below): five
   450 ms frames made five fresh heroes. Now the hero is left only after 30
   frames of cover work without it AND 400 ms (`riveFrame`); three 450 ms
   frames leave it one instance (`rpointer`'s `alive`), and leaving the
   detail view or sliding away still gives a fresh one on return.
2. **The still for 2.1–2.7 s on a direct load** — the quiet wait above,
   counting a hover as input. Now 0.64–1.11 s.
3. **The readout itself**: a DialKit re-render every second while the pointer
   moved, ~300 ms each in the dev build (above). Now none while nothing
   changes state (0 long frames in 4 s of pointer moving, from 2–3).
4. **The grid drawn under the detail view.** The grid there is `opacity: 0`
   (`.grid-stage--hidden`), not `visibility: hidden`, and the stage only
   checked visibility: Main was advanced and drawn every frame behind the
   hero (and card 02's shared draw too). The stage now checks opacity; the
   grid's instance advances 0 frames in the detail view.

And one that is not this cover's, measured on `main` too: the detail view's
ARRIVAL. The paper builds every card's textures as the view mounts, during
the morph: ~1 s of `createImageBitmap` on the main thread (from an `<img>`,
Chrome crops and resizes there) — now from the file's blob, off the main
thread (docs/detail-paper.md, Textures) — and the paper's WebGL context
(~0.2 s) and first uploads. What remains is 120–480 ms frames for ~1.5 s after
the click in a production build, on every card (card 02: 150–350 ms); `main`
had 0.8–2.0 s frames there in the dev build. [Not done](#not-done) 9 —
resolved 2026-09-28 for the tile's morph and a second arrival: the paper's GL
is made once, on the first hover of a card, and kept (docs/detail-paper.md,
"The arrival"). A cold direct load still drops frames, and they are the
page's load, there with the paper removed.

**The cover is hover-only, by design.** The headset's colour steps on
pointer-ENTER: in the file, the listener "Headset.Pointer.Enter" fires
Noseyhead's `Click` trigger, which steps the Colors layer blue → red → yellow
→ blue (Main Bounce's bumps fire it too). There is no press listener, and no
presses are sent: only moves and exits, from the tiles and from the hero.

**A click on the hero opens the project**, `#view-04`, as on every portfolio
card; the bar's "Open project" does the same. (It went to Rive for a round;
the cover has nothing to click.)

### The artboard swap

The grid shows Main; the hero shows Main Bounce, a FRESH instance each time the
hero is entered (a hero player not drawn for 30 frames of cover work and
400 ms is dropped — frames, because one long frame is not leaving; see "The
hero, the second time"), so the bounce starts from the layout the grid shows. Both artboards place the characters
alike at their first frame, so the swap is the bounce starting and nothing
else — at rest. Where the grid's instance has moved on (a character looking at
the pointer, the propeller off flying), the hero starts from rest.

`riveSwapAt` (card 04's COVER panel) says at which END of the grid→detail
morph it happens:

| | on the way in | on the way out |
| --- | --- | --- |
| `landing` (default) | the morph card is Main; the hero is Main Bounce from the frame it lands on | the morph card is Main Bounce (the hero, carrying on); the tile is Main once it lands |
| `start` | the morph card is already Main Bounce | the morph card is already Main |

The neighbour slots and the MiniMap are the still (the MiniMap shows numbers,
not faces). Prev/Next into the hero slot switches the still to a fresh Main
Bounce, as card 02 switches its still to live ([Not done](#not-done) 1).

`rswap`, the clock pinned and both instances fresh: the morph held on its last
frame (Main) against the DOM hero it lands on (Main Bounce) — **0.51% (1×),
0.53–0.54% (2×)**; the control, the hero a second of bounce later, 16%. With
`start`, 0.51% (the name and number, which only the DOM hero has, are hidden:
this compares the cover).

### The still

`npm run covers` draws Main's first frame, no pointer, with the app's own
player: `cover-still.webp` (900 × 1170, **11 KB**) and `cover-still-sm.webp`
(360 × 468, 4 KB) — a vector drawing compresses; card 02's noise does not.
Since the file became opaque the stills have no alpha channel (an opaque WebP
is written without one). Decode them as 3 channels, not RGBA. It
is what reduced motion shows (the runtime is never loaded: `rreduced`), what
the neighbours show, and the tiles' first paint. Card 04's old face
(`/projects/04/card.webp`, a frame of the pitch site) is no longer used;
`npm run projects` still writes it.

### Dials

Card 04's COVER panel (`COVER · nosey`, at `#item-04?intro` and in the app's
dock) is its JSON only, with no site folder — two persisted panels writing the
site's dials would overwrite each other:

| dial | default | |
| --- | --- | --- |
| `riveSwapAt` | landing | when the hero becomes Main Bounce (above) |
| `riveMaxDpr` | 2 | the cap on both players' backing store |
| `coverPaperShade` | 1 | the paper's light on this cover, per unit of its alpha (card 02's is the site dial) |

Its own `coverBackdrop` is `solid` (`nosey.ts`), so the site's
`coverBackdrop` does not apply to it: nothing is drawn under the drawing. While
it was transparent, the site dial's `solid` was `rground`'s control.

### Frame time

Main-thread ms (Rive is CPU work; Chrome rasterises the 2D canvases off the
main thread). Every piece of card-04 cover work in a frame — the players'
advance and draw, each tile's copy, the paper's upload — is summed per frame,
with the pointer circling the focused tile, then the hero. The per-frame reads
are on a 0.1 ms clock (the page is not cross-origin isolated); a timed batch
of 120 draws of a throwaway instance is printed beside them. The two runs
after the grid's second draw was removed, 2026-09-27:

| | 1728×996 @1× | @2× | 1440×900 @1× | @2× | budget |
| --- | --- | --- | --- | --- | --- |
| grid, per frame: mean / p95 | 0.72–0.74 / 0.9 | 0.68 / 0.8 | 0.69 / 0.9 | 0.67–0.69 / 0.9 | p95 ≤ 2.0 |
| — of which the tiles' copies (3 tiles) | 0.07–0.08 | 0.08 | 0.06 | 0.08 | |
| hero, per frame: mean / p95 | 0.94–1.06 / 1.1–1.3 | **0.95–0.96 / 1.1** (1256×1633) | 0.91–1.01 / 1.1–1.2 | 1.04 / 1.2 | p95 ≤ 2.0 |
| — of which the upload | 0.06–0.08 | 0.07 | 0.06–0.07 | 0.07 | |
| a timed draw (grid; hero + upload) | 0.28; 0.29–0.32 | 0.27; 0.28–0.29 | 0.26; 0.28–0.31 | 0.27; 0.27–0.29 | |
| sky + fluid (p95) + covers | 2.08–2.21 | 2.71 | 2.00–2.14 | 2.48 | ≤ 8 |

The worst single frame: the grid 2.2–2.4 ms, once per run, on the first sweep
(a second sweep in the same page has no frame over 1.5 ms, so it is a first
time through something, not a steady cost); the hero 1.2–1.4. A draw in a live frame
costs 2–3× the timed batch's; the likely reason is that a live frame draws
into a canvas that was just read (copied into the tiles, uploaded), which a
batch into a canvas nobody reads never does. The one-off costs (the import,
the instances) are above; they wait for a quiet moment.

The upload is the canvas → texture copy of an accelerated 2D canvas into the
paper's context: 0.06–0.07 ms a frame at 1256×1633, premultiplied (as a 2D
canvas already is: no conversion).

## Checking

```
npm test && npx tsc -b && npm run lint
npm run dev                   # in another shell
npm run verify:cover          # --url <origin>, --only budgets,clock,morph,reduced,nogl,contexts,sky,ground,
                              #   rbudgets,rswap,rpointer,rclick,rreduced,rsky,rground,rcontexts
npm run verify:detail         # its identity and hand-off cover cards 02 and 04
```

`verify:cover` checks `budgets`, `clock`, `morph`, `reduced`, `nogl`,
`contexts`, `sky` and `ground`, as above (`budgets` counts card 02's tiles
only; `nogl` now also shows card 04's tiles live without WebGL). Pixel checks
hide the sky and the dev overlays, except `sky` and `ground`; a pixel differs
past 32 levels. About ten minutes. `sky`, `ground`, `rsky` and `rground` are
skipped for a cover whose `coverBackdrop` is `solid` (card 04 now).

Card 04's eight, with the numbers of the last run. `rpointer` is the one that
runs as a person does (below). The others need a still clock: the Rive players advance by
the clock's delta, so the checks pin it, `__covers.rive.reset('nosey')` for
fresh instances, and walk it a frame at a time: the same walk is the same run
(Main Bounce's physics has no randomness — two runs with no pointer differ by
0.00%).

| check | what | measured |
| --- | --- | --- |
| `rbudgets` | all card-04 work per frame, pointer moving (Frame time above) | p95 0.8–0.9 (grid), 1.1–1.3 (hero) ≤ 2.0 |
| `rswap` | morph (Main) → DOM hero (Main Bounce) at landing; DOM hero → paper; `riveSwapAt` start | 0.51–0.54% ≤ 2% (control 16%); 0.00%; 0.51% |
| `rpointer` | the REAL path: the clock never pinned, the pointer moving from the first frame, mouse events dispatched through the browser at the focused tile's, the overlay CTA's and the hero's on-screen positions — the hero reached by clicking the tile (the morph) AND by a direct load of `#item-04`; on both, the hero ALIVE: advancing, uploaded to the plane, bouncing, the swap seen (the morph), and one instance through three 450 ms frames; and STILL alive 2 s and 5 s after landing, the pointer sweeping it — advancing, uploading, receiving the pointer, a character tracking it in each window, the same instance, its pixels moving | loaded 0.77–0.88 s after navigation, the idle wait 0.39 s ≤ 1.1; the direct-load hero live 0.64–1.11 s after navigation; ~80–88 frames and as many uploads in ~2 s, the headset bounced ~290–300 units, #1 → #1; at 2 s / 5 s: +44–182 frames and as many uploads a window, a character tracking in 2–7 checks, 16–50% of the hero's pixels changed, #1 throughout; the view model's `ptrX/ptrY` exactly the on-screen point through the crop — tile (129.5, 650) / (870.5, 650), CTA (499.2, 650), hero (120, 650) / (880, 650); tracking changes left vs right; tile pixels 1.55% vs its idle 0.31% |
| `rclick` | onto the headset's cup (a hover) vs no pointer: its colour; a click on the hero | blue → red, 10.8–11.0% of the region; the click opens `#view-04` |
| `rreduced` | reduced motion: tiles and hero on the still, runtime never loaded, 1 s | 0 canvases, not loaded, 0 bytes changed |
| `rsky` | Main's empty ground, NOON vs NIGHT | **skipped** while card 04 is `solid`. On the transparent file (2026-09-27): 190.1–190.2 vs 85.8–86.1: 54.7–54.9% > 20% |
| `rground` | the hero's transparent ground, paper effects on, vs the sky with the cover hidden | **skipped** while card 04 is `solid`. On the transparent file: 88% of the hero is ground; mean 0.11–0.13% (floor 0.09–0.10%); control `solid` 70% |
| `rcontexts` | WebGL contexts with card 04 live | grid 2, `#item-04` 3 (unchanged); 0 made by the runtime |

`rpointer` was run against each way the real path broke or could break, and fails on each: the 10 s idle deadline put back ("never loaded"), events kept from the cover (`pointer-events: none` on the tile: `ptrX/ptrY` stay 0, no tracking change, tile and hero), and the tile-only listener put back (over the overlay's CTA the grid instance's last event is an `exit`).

`window.__covers.rive`: `ready(id)`, `status(id)`, `players()`, `viewModel(id, role)`,
`reset(id)`, `costs()` / `clearCosts()`, `oneOff()` (the import's and each
instance's ms), `bench(id, role, w, h, n)`; `window.__paper.riveUploads()` and
`benchRiveUpload(n)`.

**verify:detail** pins the cover clock where it opens a card, so its identity
and hand-off checks compare one moment on both sides, and its hand-off check now
includes card 02 — the paper's checks run against the transparent hero. Card 02
has two budgets of its own, documented in the script:

| | measured | budget | why |
| --- | --- | --- | --- |
| hero | 0.000–0.004%; **2.1–2.2%** at 1728×996 @2× | 2.5% | the hero box is 628.2 × 816.7 CSS px there, so neither the DOM canvas nor the plane's texture lands on whole device pixels; two resamplers move a field of noise by a fraction of a pixel. The diff grows steadily toward the bottom-right: a 0.4px scale drift, not a clock or a colour |
| as a neighbour (the still) | 1.0–5.0% | 7% (card 01's) | Chrome's scale(0.85) resampling of the `<img>` against a texture resized to the card — card 01's documented problem, on pure noise |

Card 04, the same way: as the hero **0.149–0.434%**, the spec's 0.5% (the DOM
face and the plane show one canvas; the suite waits for the live hero — until
the file is imported both sides are the still); as a neighbour, its still — thin line art
on a transparent ground — **0.018–0.891%**, held to 2% for card 01's reason
(the old opaque photo face was 0.1–0.4%). With the opaque file (2026-09-28): the
hero 0.133–0.387%, as a neighbour 0.023–0.795%.

## The veil in the detail view (resolved)

Reported after PR #29: *a rounded, bordered rect with a light veil sits over
the shader cover in the detail view; the cover reads washed out inside it.*
Suspects: (a) the grid card's chrome carried by the morph; (b) the paper's
shading lighting the transparent plane uniformly.

**The cause was (a), and a smaller part of (b), and — most of what reads as a
veil — neither.** Measured on the tuned cover at a clear NOON, 1728×996:

- **(a) the chrome: yes, the rect.** The morph card and the detail panel carry
  the card's chrome, `border-radius: 6px` and `0 24px 70px rgba(0,0,0,.55)`,
  and the paper draws the same shadow once it has the cards. A box-shadow is
  only painted outside the box, so the sky AROUND the card was darkened by
  ~25% (136,197,246 inside the edge, 104,149,183 just outside) and the sky
  inside it was not: through a transparent cover, that is a lit, rounded,
  hard-edged rect. There is no border and no fill in the CSS; the hover
  overlay (`CardOverlay`) is grid-only and never reached the morph.
- **(b) the paper: partly.** It did NOT light alpha-0 pixels — its output is
  multiplied by the texture's alpha, and `ground` passes on the old code too
  (0.15%). It DID light the cover's 0.439-opaque stock at full strength, in
  un-premultiplied colour: the crease ridges screened in as pale lines across
  the whole sheet. Weighted by alpha, its light on the stock went from a mean
  of 0.39–0.41% to 0.19–0.23%. (`paperAmbient` and `backShade`, as the
  report named them, are not terms in this material; its light is the
  crease screen-blend and the trough shading.)
- **Neither: the stock.** The cover's own riso paper, `riso4.paper` #9FAFFF
  at `paperOpacity` 0.439, covers the whole frame under the inks — the
  cover's alpha is 0.40 or more at every pixel, never ≈ 0. It was matched to
  `cover-ref.png`'s 112/255 ground in the retune, and it is identical in the
  grid tile. Over a clear NOON it is 3.0–3.3% off the bare sky. It was left
  alone: it is the cover's tuning, and a dial (COVER · rive-site → riso4 →
  paperOpacity) if it should go.

**Why the suites did not catch it.** Every pixel check of the hero ran with
`__paper.override({ zero: true })` and the sky hidden. `ground` runs with the
paper's effects on and the sky there.

## Not done

1. **A neighbour sliding into the hero switches from the still to live.** The
   neighbours are the still (as specified). When card 02 slides from a neighbour
   slot into the hero slot, the plane changes texture from the t = 0 still to
   the live cover at the clock's current time, at the midpoint of the slide.
   The rest of the page is moving then, but the switch is there. A cross-fade,
   or the still drawn at the current time, would hide it.
2. **The still is heavy** (1.1 MB), for the reason above. It is only fetched
   where it shows.
3. **A lost context falls back to nothing, not the still.** If the stage's
   context is lost, the tiles keep their last frame. The still is behind them,
   hidden once the first frame landed, and it is not brought back.
4. **"Each tile ≤ 0.15ms"**: met as each tile's own cost (its copy). As "one
   tile drawn on its own" it is 0.235–0.365ms at 2×. See Frame time.
5. **Card 04's .riv carries 521 KB it never shows** (the four reference
   screenshots; [The .riv](#the-riv)). `exportFlags="2"` on them in the CLI
   project, and a re-publish, would take it to ~350 KB.
6. **Card 04's hero starts from rest, whatever the grid was doing.** At rest
   the swap is invisible (0.5%); a character looking at the pointer, or the
   propeller off on its loop, in the grid is back home in the hero. Carrying
   state across would mean one instance for both, and they are different
   artboards.
7. **The headset's colour is on pointer-enter** in the file, not on a press
   ([The pointer](#the-pointer)) — the cover is hover-only by design, and a
   click on the hero opens the project.
8. **The Rive runtime's image-mesh context is withheld** for card 04's file,
   which draws none. A file that deforms or shows images needs that lifted
   ([Rendering](#rendering-two-players-no-webgl)).
9. **The detail view's arrival: resolved, except a cold direct load**
   (2026-09-28; docs/detail-paper.md, "The arrival"). The tile's morph, cold
   and warm, and a second direct arrival hold one vsync (p95 16.7–16.8 ms, no
   frame dropped in a production build). A cold direct load of `#item-NN` is
   the page's load and drops 3–6 frames of 67–133 ms whether the paper is
   there or not (`verify:detail`'s `arrival` prints those rows, informational): the compositor and GPU with the page's first frames, and
   card 04's runtime and import, which load for the grid's tiles hidden under
   the detail view.
