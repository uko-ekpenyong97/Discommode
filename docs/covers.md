# Live covers

A card can have a LIVE cover: a shader or a Rive file, drawn every frame,
reacting to the mouse, and transparent where its ground is unless it brings
its own ([the backdrop](#transparency-and-the-backdrop)). Card 02 (rive-site) is
the first: the tuned "Shader variation 3 — Soft contour field", its lenses a
lava lamp that the pointer warms, on a solid dark ground of its own
([Card 02's lava](#card-02s-lava); until 2026-10-01 the weather sky showed
through its ground). Card 04 (Nosey) is the second, and is
Rive: a large Nosey face on blue, looping through its states, which errors and
bursts into Nosey's four bouncing characters when card 04 becomes the detail
view's centre card — one instance for every surface, so it never jumps — see
[Rive covers](#rive-covers-card-04). Card 03 (Drex) is the third, a shader
again: the Drex logo under Figma's risograph, dither and hover reveal, dark but
for a light that follows the pointer, on white paper of its own — see
[Card 03](#card-03-drex-a-cached-pass-a). Each is live in the grid tile, the
grid→detail morph and the detail hero, and as a detail side card too
([The live side card](#the-live-side-card); card 04 since 2026-10-05, cards 02
and 03 since 2026-10-06); everywhere else — the folded cards two slots off,
reduced motion, a failed load — a cover is its still.

The shader and its tuning are the prototype's
([docs/prototypes/cover-shader-prototype.html](prototypes/cover-shader-prototype.html)),
and that page stays the tuning bench: it now loads the app's GLSL and dial JSON,
so what is tuned there is what ships.

> **On the numbers in this file.** Every measurement is from
> `npm run verify:cover` and `npm run verify:detail` on 2026-09-24 (card 02),
> 2026-09-27 (card 04) and 2026-10-01 (card 03, and card 02's lava), on an Apple M1 Max (ANGLE /
> Metal), headless Chromium for the first and the third and Chrome for the
> second.

| | |
| --- | --- |
| the grid, card 02 live, the sky through its ground (before 2026-10-01) | `docs/covers/grid-row.webp` |
| the detail hero, live on the paper | `docs/covers/hero.webp` |
| the same tile over NOON and over NIGHT | `docs/covers/noon-night.webp` |
| the detail hero before / after the card chrome came off, clear NOON | `docs/covers/bare-hero.webp` |
| the grid→detail morph at 0 / 0.5 / 1, before and after | `docs/covers/bare-morph.webp` |
| card 04: the grid row, live, at rest and hovered: no label on the tile, "04" as the overlay's headline (2026-09-30) | `docs/covers/nosey-grid-row.webp` |
| card 04: the detail hero at rest and mid-bounce, the number alone at its foot (2026-09-30) | `docs/covers/nosey-hero.webp` |
| card 04: the same tile over NOON and over NIGHT (the file before 2026-09-28) | `docs/covers/nosey-noon-night.webp` |
| card 04, the face (2026-10-05): the grid; card 03 the hero with card 04 the live side card; card 04 focused, the face finishing its clip; the shrink and the burst; the four bouncing — one instance throughout | `docs/covers/nosey-face.webp` |
| card 03: the grid tile at rest (drifting) and hovered, the detail hero hovered, under the paper (2026-10-01) | `docs/covers/drex.webp` |
| card 03: the frame at 1000 × 1300, the pointer at (-1, -1), beside drexCover.js's `preview-figma-rest.png` (2026-10-01) | `docs/covers/drex-vs-figma.webp` |
| card 02's lava: the grid tile and the detail hero, at rest and with the pointer over them, the clock pinned — `main` (top) and the lava (bottom) (2026-10-01) | `docs/covers/lava.webp` |

## Handoff

**Live side cards for 02 and 03 (2026-10-06).** Cards 02 (the lava) and 03
(Drex) are live as detail side cards, as card 04 has been since 2026-10-05:
`side: 'live'` on their refs, so whichever card is the centre card has live
neighbours; the folded cards two off stay the still. A side card is at rest —
the lava drifts, the light follows its `restMode` — and only the centre card
takes the pointer (`CoverTile`'s `input`). The one `heroDome` became a
`detailDome(id)` per cover, so a card keeps its state through grid → morph →
centre → side and back: no snap to rest when it leaves the centre warm, and a
clicked card 03 tile's light glides home on the morph card instead of jumping.
Card 01 has no live cover; its side card is its rest face, unchanged. Checked
by `sside`, `sjump`, `sbudgets` (each against a broken path: `sidestill`,
`siderest`, `sideinput`) and by verify:detail's `identity`, which now asserts
the paper samples every live side card. Costs and contexts:
[The live side card](#the-live-side-card).

**Card 04's face (2026-10-05).** Card 04 is Uko's new file: a large Nosey
face on blue that loops through its states, and, when card 04 becomes the
detail view's centre card, errors, shrinks and bursts into the four
bouncing characters; it cuts back to the face when it stops being the centre
card. ONE instance of one artboard ("Nosey Detail") is every surface — grid
tiles, the morph card, the side card, the centre card, the paper's plane — so
the face never jumps when card 04 changes role, and nothing ever drops it; the
site sets one view-model boolean, `focused` ([Rive covers](#rive-covers-card-04),
[One instance](#one-instance), [Focus](#focus)). Card 04 is live as a detail
**side card** now, through a generic `side: 'live'` on the cover ref that
cards 02 and 03 can take later ([The live side card](#the-live-side-card)).
`riveSwapAt` is `riveFocusAt` (`DIAL_STATE_VERSION` 10). New checks in
`verify:cover` — `rgrid`, `rside`, `rjump`, `rfocus`, `runfocus`, `rdeep`,
`rtouch`, `rphone`, `sidelive` — each run once against a broken path
(`--fault`, `--broken`) and failing there; `rswap` is gone. At the last
runs: `verify:cover` all passed but for `drag`'s "no canvas resized more than
once" (the side card's plane canvas was made 1×1 and then sized, mid-slide:
fixed, and `drag` and every card-04 check re-run: all passed, 3 skipped);
`verify:detail` all passed (card 04 as the hero 0.089–0.482%, as a live side
card 0.126–0.393%); `verify:jank` on a production build, twice: no frame over
33 ms (`main` the same); `verify:gpu` flat (project 02: 205.3 → 198.4 MB over
20 cycles, `main` 247.5 → 206.3; project 04: 231.9 → 193.0, `main` 229.5 →
229.8); `rbudgets` interleaved with `main` ([Frame time](#frame-time-1)).
`npm test` (534), `tsc -b`, `lint`, `build`. Rive-side follow-ups: the
face noticing the cursor while unfocused, and the file's size
([Not done](#not-done) 5, 17).

**Card 02's lava (2026-10-01).** Card 02's lenses (stage 5's slugs) are a lava
lamp: a list of up to 16 blobs that rise and sink on their own periods,
stretch and wobble, and smooth-min into one field, so they merge and split;
the pointer warms the ones near it — they swell, drift toward it (or away: a
dial) and speed up — on the grid tile and on the hero, and the warmth eases
out when it leaves. Their look (rim, the minified field inside, the dots, the
inks) is the slugs'. The sky no longer shows through: card 02 is `solid` on
its own `lava.background`, #0d1220 (Uko's tuning; the plan's pick was #425EB6, the navy ink). A LAVA panel at
`#item-02?intro`; `slugCell`, `slugPresence` and `slugDrift` are gone;
`DIAL_STATE_VERSION` is 5. See [Card 02's lava](#card-02s-lava). At the last
runs, on the final defaults: `verify:cover` passed but for `lsweep` in the
full run (6 skipped: card 02's `sky` and `ground` now, card 04's as
before), with three new checks, `lmove`, `lpointer` and `lsweep`.
`lsweep` measured 1.78 ms there, its draws benched at twice what they bench
alone, straight after the other suites; alone, twice, 0.73 and 0.83 ms
([At most two easing tiles](#the-pointers-warmth)). `verify:detail`'s
identity and hand-off: card 02 as the hero 1.92% at 1728×996 @2×, held to
3.5% (it was 2.5%; 3.04% on the first ground, #425EB6 — the same sub-pixel
drift, see Checking); the full suite passed on #425EB6. `verify:gpu` flat
(the GPU process 229.0 → 208.6 MB over 20 open/close cycles of project 02;
`main` 206.1 → 197.3). `npm test` (402), `tsc -b`, `lint`, `build`. The
stills (`npm run covers`): card 02's are opaque now, 239 KB and 36 KB (they
were 1.1 MB and 181 KB).

**Card 03, Drex (2026-10-01).** Branch `andorra` makes card 03's cover live:
Figma's Frame 5 (Risograph → Dither → Hover reveal), ported from Uko's
`drexCover.js` ([Card 03](#card-03-drex-a-cached-pass-a)). Card 03 gets the
cover and nothing else; its project view is still the placeholder. What is new
outside the cover: a second shader renderer, `CachedCoverRenderer`, for a
cover whose pass A is static (it renders it once per size and dial state;
`CoverDef` is now `LiveCoverDef | CachedCoverDef`); the dome can ease as
well as spring (`domeMotion`, which replaces `domeSpring`); and a shader
cover's dome now takes the pointer from the whole CARD (a grid tile) or PANEL
(the hero), as card 04's does. Card 02's dome used to read it from the tile
alone, so it went to rest over the overlay's CTA and never heard the pointer
under the paper. `DIAL_STATE_VERSION` is 4. At the last runs:
`verify:cover` all passed (3 skipped, card 04's sky checks, as before), card
03's seven included; `npm test` (366), `tsc -b`, `lint`, `build`.
`verify:detail`: card 03 as a NEIGHBOUR is now its still, a 1-px dither, so
it measures 2.5–6.1% and is held to card 02's 7% for card 02's reason (the
script's `budget`); identity and hand-off then pass. In the full run, every
Prev slide had one 33–50 ms frame. Run alone against `main` on the same
machine, back to back, this branch passed 12 of 12 and `main` 11 of 12 (one
33.3 ms): the GPU's state after the other suites, as noted below.

**The cards' labels (2026-09-30).** Every card is labelled the same way. In
the GRID the tile is its art alone — the bold mono number that sat in its
bottom-left corner (`.grid-card__index`) is gone — and the hover overlay's
headline is the card's number ("02", "04"), in the headline's type and place;
the mono captions bottom-right stay. In the DETAIL view the hero carries the
number bottom-left and nothing else. Card 04's name and description are gone
from the manifest, and with them their rendering: the overlay's name and
second line, the detail hero's name + line on a scrim, and PR #31's soft text
shadow in place of that scrim. The project view never read either. The stills (`npm run covers`) come
out byte-identical: they are the cover alone. At the last runs:
`verify:cover` all passed (3 skipped, as above), `verify:detail` all passed
(card 04 as the hero 0.133–0.387%).

**The detail view's arrival (2026-09-28).** [Not done](#not-done) 9. The
paper's GL — context, programs, crease map, card 02's renderer in it, every
face — is made once, on the first hover of a grid card (since 2026-10-01: in
the page's idle warm-up after load, or on that hover if it comes first), and
kept across every open and close (docs/detail-paper.md, "The arrival", which has the
numbers and the model). Two cover changes came with it: card 02's text SDF
and its half-float copy are built in ≤ 6 ms slices (the same output; they were
a 140 ms and a 20–40 ms task on every page load), and a Rive pointer event goes
to the hero instance on screen or waits for the next draw — through
`rivePlayer` it made a fresh hero whenever nobody was drawing one, which at
`detailSideScale` 1 was forever. Grid contexts are 2 until the paper's is made
(the idle warm-up after load, or the first hover), 3 after; the detail view 3,
on every arrival.

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
| `window.__covers` | `pin(t \| null)` holds the cover clock; `time()`, `presenters()`, `frames()`, `benchStage(id, w, h, warm)` (warm: under the pointer), `benchPresent(w, h)`, `setSite({...})`, `backdrop(id)` (the cover's own, `sky` or `solid`); `dials(id)`, `patchDials(id, {folder: {dial: v}} \| null)` (null: back to the JSON); card 02's `lava.blobs(which, t)` and `lava.warmth(which)` (`which`: 'rest', 'hero' or a presenter's index) |
| `window.__paper` | the paper's own hooks (docs/detail-paper.md), plus `coversDrawn()` and `benchCover(only, warm)` for the hero, and `override({ hideCovers: true })`: the live-cover planes undrawn |

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
| `src/covers/types.ts` | `CoverRef` (the manifest's: `shader` or `rive`; `side`, still or live as a detail side card), `CoverDef` (a shader cover: `LiveCoverDef`, pass A every draw, or `CachedCoverDef`, pass A cached), `RiveCoverDef`, the per-draw `InstanceFrame`, `DomeMotion`, `CoverBackdrop` (a cover's own: `sky` or `solid`). |
| `src/covers/covers.ts` | The registry: cover id → its definition (`shaderCover` / `riveCover` narrow it). The stills' URLs. |
| `src/covers/covers/nosey.ts`, `nosey.json` | Card 04's `RiveCoverDef`: its frame (1000 × 1300), its dials and its `coverBackdrop` (`solid`). |
| `src/covers/rive/riveCover.ts` | Rive covers: the runtime and the file (once each), the ONE instance per cover and its two canvases (`stage`, `plane`), its focus, the pointer, the one-off work's scheduling, per-frame cost, `__covers.rive`. |
| `src/covers/focus.ts` | Which card is focused (the detail view's centre card, by route): `focusedIndex`, and `riveFocusAt` (card 04's dial). |
| `src/covers/faults.ts` | DEV: the deliberately broken paths `verify:cover --fault` runs a check against. |
| `public/projects/nosey/cover.riv` | Card 04's file, copied in by `npm run projects` from `~/Discommode-pages/projects/nosey/cover.riv`. |
| `src/covers/covers/rive-site.glsl` | Card 02's shader: `//#common`, `//#passA`, `//#passB`. Shared with the bench. |
| `src/covers/covers/rive-site.json` | Card 02's dials, as a DialKit config; its defaults ARE the tuned values. Shared with the bench. Its `lava` folder is the LAVA panel's. |
| `src/covers/covers/rive-site.ts` | Card 02's `CoverDef`: dial values → uniforms (the bench's code, for three.js), the lava's blobs per draw, and its per-instance warmth (`instanceExtra`). |
| `src/covers/covers/lava.ts` | Card 02's lava: the blobs' homes, periods and shapes from the seed (`LavaModel`), where they are at any moment, and one instance's warmth (`LavaInstance`). Shared with the bench. |
| `src/covers/covers/riveText.ts` | The "Rive" strip as a signed distance field, built once on the CPU. Shared with the bench. |
| `src/covers/covers/drex.glsl` | Card 03's two passes, `drexCover.js`'s FS_PRINT and FS_REVEAL ([Card 03](#card-03-drex-a-cached-pass-a)). |
| `src/covers/covers/drex.json`, `drex.ts` | Card 03's dials (every DEFAULTS value of `drexCover.js`) and its `CachedCoverDef`: the input picture (`buildInputCanvas`), the uniforms, the light (`restLight`, `lightAt`). |
| `public/projects/drex/cover-logo.svg` | Card 03's logo, Figma's export of node 490:110, byte for byte from `~/Discommode-pages/projects/drex/` (`npm run projects` copies it). |
| `src/covers/glsl.ts` | Splits a cover's GLSL into its passes and prefixes the version, precision and defines. |
| `src/covers/coverRenderer.ts` | One cover on one three.js renderer: the two passes, pass A's pooled targets. And `CoverDrawer`, what the stage, the paper and the stills hold for either renderer. |
| `src/covers/cachedCoverRenderer.ts` | A cover whose pass A is static (card 03): the print, once per size and dial state, then pass B per draw. `printGeometry`, and `makeCoverRenderer`, which picks the renderer for a `CoverDef`. |
| `src/covers/coverStage.ts` | The DOM instances' ONE renderer: one draw per aspect at rest, one per domed instance, `drawImage` to each. |
| `src/covers/CoverTile.tsx` | One DOM instance: a 2D canvas over the still. |
| `src/covers/coverClock.ts` | The shared clock. |
| `src/covers/dome.ts` | The mouse dome: a spring (card 02) or an ease (card 03); `detailDome(id)`, one per cover for its card in the detail view in every role (the morph card, the centre card's DOM face and paper plane, a live side card); the cover's per-instance state beside it (`advanceDome`, `domeUp`, `adopt`). |
| `src/covers/drawProbe.ts` | DEV only: each shader cover's draw cost per frame and role, and what each surface last drew (its clock and dome), for `sbudgets` and `sjump`. |
| `src/covers/coverDials.ts` | The live dial values (a module store), the site's dials, and `coverBackdrop(id)` / `backdropUnder(id)`: what is drawn behind each cover. |
| `src/dev/coverDials.tsx` | The COVER panels and card 02's LAVA panel (dev). |
| `src/covers/bench.ts`, `devHooks.ts` | Dev: `window.__covers`, the GPU benchmark. |
| `scripts/make-cover-stills.mjs` | `npm run covers`: the stills. The tail of `npm run projects`. |
| `scripts/cover-verify.mjs` | `npm run verify:cover`. |
| `public/fonts/inter-latin-400.woff2` | Inter 3.19 (fontsource 4.5.15, OFL — `Inter-OFL.txt` beside it). |

Wired in: `content.ts` (`cover` on `PosterItem`, cards 02, 03 and 04),
`GridPlane.tsx` (the tile), `DetailMorph.tsx` (the morph card, and which Rive
player it shows), `DetailView.tsx` (the panels), `DetailPaperLayer.tsx` +
`paperMaterial.ts` (the hero plane), `App.tsx` (the dev panel).

## The model

A card names its cover in the manifest:

```ts
cover: { kind: 'shader', id: 'rive-site' },
image: '/projects/rive-site/cover-still.webp',   // the still
```

Cards without `cover` are unchanged (card 01, the magazine). A Rive cover's ref is
`{ kind: 'rive', id, src, artboard, stateMachine, focusInput }` — see
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
   `frameUniforms`, `assets` if it needs textures, `domeMotion`: a spring or
   an ease). If its pass A depends only on the dials and the size, make it a
   `CachedCoverDef` (`passA: 'cached'`, `printKey`, `printInput`,
   `printUniforms`) and it is rendered once per size, not every frame — see
   [Card 03](#card-03-drex-a-cached-pass-a).
4. One line in `covers.ts`, a `cover` on the card in `content.ts`, its id in
   `make-cover-stills.mjs`'s list, a panel in `src/dev/coverDials.tsx`, and
   `npm run covers`.

The renderers, the stage, the tiles, the morph, the paper and the verify suite do
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
| `sky` (default; no cover since 2026-10-01 — card 02 was) | the cover's ground is transparent and the sky shows through it. The site dial below applies. |
| `solid` (cards 02, 03, 04) | the cover brings its own opaque ground (card 02's `lava.background`, #0d1220, under all of pass B; card 04's artboard is filled #0A85D1, the face's blue (#E0DDDD grey 2026-09-28 to 2026-10-05); card 03's frame is white paper, under all of pass B) and **nothing is drawn behind it**, including the site dial's colour. The sky does not show through, by design. |

**The site dial**, for a `sky` cover only — none, now; the dials are still on
card 02's COVER panel, for the next one (`backdropUnder(id)` in
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
and **skips** `sky`, `ground`, `rsky` and `rground` for a `solid` one (card 03 has
none of its own: it is `solid` from the start, and `dref` checks its alpha is 255). They
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
NOON and a clear NIGHT: mean luminance 184.2 and 128.7, **30% apart** (card 02
until 2026-10-01; skipped since, as `ground` is).

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
| the labels | the number, bottom-left, as on every card, and nothing else. Card 04 had its name and a line under it here, on a scrim (and, from PR #31, a soft text shadow instead of it); both are gone from the manifest since 2026-09-30. |
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
costs more than drawing it. The paper's renderer exists from the idle warm-up
after load (or the first hover of a grid card, or the first detail view,
whichever comes first) for the page's life, and card 02's
renderer in it is made, compiled and drawn once then (docs/detail-paper.md,
"The arrival").

| | main | with covers |
| --- | --- | --- |
| grid | 1 (the sky) | **2** (+ the stage); 3 once the paper's is made — by the idle warm-up after load (src/warmup.ts), or the first hover of a card |
| detail view | 2 (the sky, the paper) | **3** (+ the stage) — on every arrival: the paper's is made once (it was one more per arrival) |

The stage also draws the morph card and the hero's DOM face (until the paper
takes it over): 10:13 instead of 3:4, so a group of its own.

**When it is made** (2026-10-02, docs/perf/first-second.md). The context
before React's first render, in a task of its own right after the sky's
(`prepareCoverStage`, main.tsx; none under reduced motion): made during the
first render, as it was, it made React's first commit the boot's longest task
and the sky's context waited behind it. The covers' programs only after the
first contentful paint, compiled without blocking (`compileAsync`,
KHR_parallel_shader_compile), and each cover drawn once its programs have
linked — each tile shows its still until its first draw lands, as before. A
lost context: every instance keeps its last frame; restored, the covers are
made again. A context that cannot be made at all: the tiles drop their
canvases for the still, as before.

**What renders when.** Instances on screen render every frame, at full rate: the
hero, the hovered tile, all of them — "on screen" being the viewport and a
band of 25% of it around it (`ON_SCREEN_MARGIN`, below). Nothing renders when
none is visible: the stage's loop sleeps until the IntersectionObserver wakes
it. Instances that are
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
except one `DOMRect` per instance (`getBoundingClientRect`, which the DOM
allocates): it says whether the instance is in the band, and whether the page
is moving. It does NOT say how big the instance is (below).

### Sizing from the layout box

(2026-10-01.) Dragging the grid made every cover flicker. An instance's draw
size and its canvas's backing store came from its BOUNDING box, every frame —
and in the grid that box is projected through the tilt and the focus scale,
so it changed by a pixel or two on most frames of a drag (672 → 671 → 673…).
Every change was a `canvas.width` write, which clears the canvas; a new
pass-A target (the pool is keyed by size); a new crop; and, the groups being
keyed on the box's aspect, tiles of one cover split into draws of their own.
A tile recycled by a wrap came back as a fresh 300 × 150 canvas on its still,
or as the same canvas still holding the cover it had, until the stage got to
it. The morph card's canvas was resized on every frame of the morph.

Now (`coverStage.ts`):

- **An instance is sized from its LAYOUT box** (a ResizeObserver; fractional
  CSS px) × its DPR — a grid tile × `focusScale` too, the largest it is shown
  at rest, then capped by `coverRenderMax`: 672 × 896 for every tile at 2×,
  as a tile at rest always was. Transforms (the tilt, the focus scale, the
  morph's travel, a slide's scale) are CSS's to scale. A backing store is
  written only when that size really changes — a resize, a DPR change, a
  layout dial — and then right before a copy, in the same task.
- **Every grid slot keeps its tile** (`GridPlane`): a card with no live cover
  (card 01) has one too, with an empty canvas sized as a tile's. A wrap swaps
  the cover in a slot; it never makes or sizes a canvas.
- **A new instance is PRIMED before the browser paints it** (`flushPrimes`, a
  microtask after the commit that added it). A wrap re-assigns every slot in
  one commit, so the instances that showed a cover a frame ago are gone and
  their canvases are about to take other covers: each cover's frame is
  gathered first — from a sibling still on the page, or from a canvas the
  commit retired, kept in that cover's scratch canvas — and then copied in. A
  Rive cover can also take its player's last draw. Only while nothing moves
  may an instance get a draw of its own; never during a drag, a morph or a
  slide, and never a compile. With no source at all, the still shows until
  the next copy lands.
- **Which shows is decided in the copy's task**: `data-drawn` on the tile
  (CoverTile.css), not React state, which showed the canvas a frame late.
- **The band is measured by the stage**, from the box it reads anyway: a tile
  within 25% of the viewport is copied every frame, so it arrives in view
  current. The IntersectionObserver could not do it: it clips the target by
  the grid's viewport-sized `overflow: hidden` before applying its root
  margin, so no margin reached past the viewport, and it reported a frame
  late. A grid tile never drawn (outside the band since load) gets the shared
  draw's copy off screen, four a frame.
- **Idle work waits for the grid**: a drag and its settle count as busy for
  the idle warm-up (src/activity.ts), and card 03's hero print for a hovered
  tile waits until nothing moves.

`verify:cover`'s `drag` (`scripts/cover-drag-checks.mjs`), on a production
build (`vite preview`), `main` against this change:

| @2× | 1728×1117 main | branch | 2560×1440 main | branch |
| --- | --- | --- | --- | --- |
| canvas writes while dragging/settling | 5146 | **0** | 10247 | **0** |
| tile-frames on the still, the cover live elsewhere | 148 | **0** | 137 | **0** |
| tile-frames off their siblings (> 24/255), worst | 203, 211 | **0**, 0 | 207, 205 | **0**, 2 |
| one-frame flickers | 0 | **0** | 1 | **0** |
| card 02 warmed: sharpness vs a sibling, least | 0.30 | **1.00** | 0.18 | **1.00** |
| …back with its siblings after leaving, frames | 0 | 3 | 182 | **0** |
| morph + slide: canvas writes | 94 | **16** | 98 | **16** |
| frames over 33 ms (headed Chrome), per ~2850 | 0–6 | 0 | 0–1 | 0–1 |

Frame times did not separate the two. At 1728×1117, one of `main`'s four runs
had six long frames (worst 250 ms) and the rest none; at 2560×1440, six runs
each, `main` and this change both had a single ~50 ms frame in two of them —
a compositor frame in a fling (no Long Animation Frame on the main thread),
the machine's rather than the page's. Every other drag frame was ≤ 17.8 ms.

The cost of the band, `budgets` at 2× (worst grid frame of cover work):
1728×1117 0.645 → 0.835 ms, 2560×1440 0.795 → 0.893 ms, against 1.2. And of
sizing every tile up front, the GPU process before `verify:gpu`'s cycles:
216.5 → 258.9 MB at 1728×1117, 225.3 → 268.7 at 2560×1440 — the tiles' canvases
allocated at load rather than as a drag first shows each; the cycles stay flat.

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

**The mouse dome.** Each grid tile has its own spring: the pointer over a tile's
CARD drives the dome in that tile's frame coordinates, and every other instance
of the cover shows it at rest. In the detail view each cover has one spring
(`detailDome(id)`, until 2026-10-06 one `heroDome` for whichever card was the
hero), driven by the pointer over its panel only while it is the CENTRE card;
as a side card it is drawn with the same spring, unpointed, so a card that
leaves the centre warm eases out instead of snapping
([The live side card](#the-live-side-card)). The DOM face and the paper plane both read
it, stepped by wall time so reading it twice in a frame integrates once. The
paper's hover dent stays; both react at once. The morph card has no dome —
except a shader cover's, which travels on its detail dome — card 02's with its lava warmth, card 03's with its light where the pointer left it
([Card 02's lava](#the-pointers-warmth)).
(Until 2026-10-01 the listener was on the tile itself: the hover overlay's CTA
sits over it and took the pointer, and under the paper the hero's DOM face is
`visibility: hidden` and took none. Card 04's pointer was already read this
way.)

A cover's `domeMotion` says how its dome moves: card 02's is a spring
(`dots3.dome`), card 03's an ease. The centre and the height close
`followEase` of the way each 60 Hz frame, by wall time. Card 03's light is the
rest light moved that height of the way to the centre (`lightAt`).

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
| `cover-still.webp` | 900 × 1326, 239 KB | where the still IS what shows: the folded detail cards two slots off, reduced motion, no WebGL, a failed load. Drawn at 1800 and halved. |
| `cover-still-sm.webp` | 360 × 530, 36 KB | under a live tile, for its first paint only |

The full still was 1.1 MB (and the small one 181 KB) while the cover let the
sky through: most of that was its alpha, the particle field's noise in a
fourth channel. Opaque on its own ground since 2026-10-01, it has none. It is
still loaded only where it shows, and the grid's first paint gets the small
one. Card 02's old face (the
flat placeholder `/projects/02/card.webp`; it was never in `CARD_FACES`) is
replaced by the still.

Where the still is used: **reduced motion** (the clock is 0 and nothing draws —
`verify:cover`: 0 cover canvases, the paper drew the cover 0 times, 0 bytes
changed over 1s), **no WebGL** (all tiles on the still), **the folded
detail cards** two slots from the centre (every side card one slot off is
live since 2026-10-06: [The live side card](#the-live-side-card)), **first paint** (until
the stage's first frame lands on the canvas). The MiniMap shows numbers, not
faces, so it has nothing to show.

## Dials

The COVER panel (`src/dev/coverDials.tsx`), one per cover: every dial the bench
has, stage toggles included, plus the site's `coverBackdrop`,
`coverBackdropColor`, `coverMaxDpr` (2), `coverRenderMax` (896, below) and `coverPaperShade` (1: in the
detail view, the paper's light per unit of the cover's alpha; 0 is no paper
light on the cover at all). **Copy pastes into
`src/covers/covers/<id>.json`** (the site's three are not the JSON's). It is at
`#item-02?intro`, as specified, and in the app's own dock at `/?intro`: DialKit's store is
global, so the panel is registered from outside `src/reader` and appears in
whichever dock is mounted — the doorway's at `#item-NN?intro`, where the app is
suspended, which is why App mounts it even then. Every panel starts folded
except the view's (LAVA at card 02; docs/detail-paper.md, "The first sweep,
and the idle warm-up").

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
| `refraction5` | stage 5: the slug lenses' shapes (`slugWidthMin/Max`, `slugLengthMin/Max`, `slugTilt`, `slugBend`, `slugSeed`), `minify`, `rimSmear`, the noise-blob fallback, the budget cuts (`noiseHalfRes`, `dispersionCut`). Where the slugs ARE is the lava's (`lava`, the LAVA panel) |
| `lava` | card 02's lava and its ground: the LAVA panel ([Card 02's lava](#dials-lava)) |
| site: `coverBackdrop`, `coverBackdropColor`, `coverMaxDpr`, `coverRenderMax`, `coverPaperShade` | not the cover's: in `coverDials.ts`, not the JSON |

The COVER panel persists (`dialkit:cover-rive-site-v6` in localStorage; LAVA,
`dialkit:cover-rive-site-lava-v6`), as the other
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

**At `cardWidth` 480 the tiles' covers are rendered at the old tile's size**
(`coverRenderMax`, 2026-09-30). Uko's LAYOUT tuning made the tile 480 wide,
and a cover's cost is its pixels: the shared draw went to 1075 × 1434 at 2×,
2.56× them, and the grid's worst frame of cover work to 1.56–1.71ms against
its 1.2. The bar was not raised. Instead a GRID TILE's cover — shader and Rive
alike, the shared draw and the hovered tile's own — is rendered no larger than
`coverRenderMax` px on its long edge, **896**: the tile at the old `cardWidth`
300 (400 tall × 1.12 focused × 2). The tile's 2D canvas has that backing
store, so the copy is 1:1, and CSS stretches the canvas over the tile — the
upscale is the compositor's, for nothing. The detail hero and the morph card
that lands on it are not tiles and draw at their full size, so the hero, the
clock check and the morph's hand-off are untouched.

| @2× | `cardWidth` 300 | 480, uncapped | 480, `coverRenderMax` 896 | budget |
| --- | --- | --- | --- | --- |
| the shared tile draw | 0.26–0.57 (672×896) | 0.64–0.70 (1075×1434) | **0.25–0.44** (672×896) | — |
| each tile: its copy | 0.053–0.063 | 0.097–0.118 | **0.053–0.080** (1:1) | ≤ 0.15 |
| worst frame of cover work, grid | 0.71–1.30 | 1.56–1.71 | **0.74–1.10** | ≤ 1.2 |
| hero | 0.83–0.94 | 0.80–0.97 | 0.68–0.93 (unchanged: not capped) | ≤ 1.0 |

What it costs is sharpness on the tile: a 960 × 1280 tile (and the focused
1075 × 1434) shows a 672 × 896 render, upscaled ×1.43–1.6. On card 02's field
of dots and its outlines that reads as a slight softening at 1:1; on card 04's
line art, less. `docs/covers/tile-crop-2x.webp` is the focused tile at 1728×996 @2×,
1:1 in device pixels, the clock pinned: card 02 (top) and card 04 (bottom),
capped at 896 (left) and uncapped (right). The dial goes up to
2048 for the sharpness back, at the cost above; it is on the COVER panel's
site folder (card 02's, at `#item-02?intro`).

## Card 02's lava

Card 02's lenses — stage 5's slugs, the bean shapes with a white rim and a
finer field inside them — are a lava lamp (2026-10-01). Until then each slug
circled its home by `slugDrift` (40 units) once a loop (69 s), and they
barely moved. What changed is WHERE they are and how their field is made;
how each one looks (`blob` in the GLSL is the slug's bent, tapered capsule,
line for line) and everything drawn through them did not.

**The field.** The slugs were one per cell of a jittered grid, the nearest
of nine; a blob that travelled further than a cell would have popped at its
edge. They are a LIST now: up to 16 blobs (`uBlobA`, `uBlobB`, `uBlobS`,
uniform arrays: centre, length, width, axis, curvature, a bounding radius,
taper, bulge), and the field is their distances SMOOTH-MIN'd (`uLava.y`,
`mergeSoftness`), the lens direction blended with the same weights — so two
that pass close merge into one and part again. A blob too far to touch the
field is skipped by its bounding radius.

**The motion** (`lava.ts`, on the CPU, every draw, from the shared clock):

| | |
| --- | --- |
| homes | a jittered grid of `count` cells over the frame (3 × 3 at 9), as the slugs' were — so they read as separate blobs, not one mass |
| rise and fall | each about its home by 0.5–1 of a cell's height, on its own period — `riseSpeed` (frame units a second) over a 500-unit travel, × 0.75–1.3, spread by the golden ratio so no two share one (10–17 s at 78) — and phase; lingering at the top and bottom (tanh of a sine) |
| stretch | up to 1.3× longer at full speed and as much thinner (length × width kept), and straighter |
| wobble | the width breathes (±20% × `wobble`), the bend flexes, it sways (±81 units × `wobble`), each on a period of its own (5.5–9 s × 0.8–1.4) |

At rest that is a function of the clock alone, so every instance shows the
same moment: the grid's one shared draw, `clock` (0.30–0.31%), `morph`
(0.20–0.21%), the stills (t = 0). The motion does not loop exactly any more.
Under reduced motion card 02 is its still, as every cover is: nothing changed
there (`reduced`).

**Why 9.** The plan was 12. Measured over the tile's crop (a CPU sampling of
both fields, seven moments), the old slugs covered 27% of it in ~11 separate
blobs; 12 lava blobs covered 34%, and the grid's columns pressed them into a
few masses. At 9, 27% — today's density, with a few of them merged at any
moment. It was chosen for the look, before any budget was measured, and the
budget did not ask for less ([Frame time](#frame-time-lava)).

### The pointer's warmth

Each instance under the pointer keeps a `LavaInstance` beside its dome
(`DomeSpring.extFor`, made by the cover's `instanceExtra`), stepped with
the dome once a frame (`advanceDome`: the stage, and the paper for the
hero):

| | |
| --- | --- |
| warmth | eases toward the dome's height: in over 0.25 s, out over 0.45 s; a blob's is that × `(1 − (d/r)²)²` at distance d, `cursorRadius` r |
| swell | on the GPU: the field's level drops by up to 0.45 × the mean width × `cursorStrength` near the pointer (`uLavaPtr`: the pointer in cover UV, the warmth, the radius — per draw, on the shared context), so the blobs bulge toward it |
| drift | up to 0.8 × `cursorStrength` of the way toward the pointer (`cursorSign` toward) or away |
| speed | up to 1.5 × `cursorStrength` faster, as extra phase per blob; once the pointer has gone it relaxes (0.35 s, by what warmth is left) to the nearest whole cycle, so the blob is back on the shared timeline |

The instance is drawn for itself while its dome is up OR its warmth is not
settled (`domeUp`), and rejoins the shared draw when the warmth is under
0.01 and every blob within 0.005 rad of the timeline: ~2.2 s after the
pointer leaves (`lpointer`: 130–139 frames), moving back at most 1.0–4.3
units a frame. A click on a warm tile hands its dome and warmth to
its detail dome (`detailDome`, `adopt`), which the morph card and the hero share, so the
click does not snap the cover to rest; a state nobody shows within 800 ms
(the click did not open the view) is dropped. That hand-off is only for a
cover with `instanceExtra`: card 03's morph card still has no dome.

**At most two easing tiles.** A pointer swept across the grid in a second
leaves every card-02 tile it crossed easing at once — three at 1728×996 —
and each is a draw of its own: `lsweep` measured the worst grid frame at
1.415–1.850 ms over four runs, against 1.2. So no more than TWO grid tiles of
a cover with `instanceExtra` are drawn for themselves (`MAX_OWN_TILES`,
`coverStage.ts`): the one under the pointer, then the one it left most
recently (`DomeSpring.priority`). A third — the one easing longest — goes
back to the shared draw at once, on the shared timeline; the two that keep
theirs ease out in full. With the cap: at most 2, the worst grid frame
1.005–1.065 ms. The cost is that third tile: what was left of its warmth
(about a tenth, a second after the pointer left it) stops at once.

The dots' own dome (`dots3.dome`) is unchanged and reacts as before.

### Dials (LAVA)

**LAVA** (`src/dev/coverDials.tsx`), at `#item-02?intro` beside COVER ·
rive-site, which no longer shows the folder. Copy pastes into
`rive-site.json`'s `lava`.

| dial | default | |
| --- | --- | --- |
| `count` | 9 | 1–16 blobs; the grid of homes follows it |
| `size` | 1 | × the slugs' widths and lengths |
| `riseSpeed` | 78 | frame units a second, over a 500-unit travel; 0 holds them where they are (the wobble still moves them) |
| `wobble` | 0.31 | breathing, flexing and swaying, 0–1 |
| `mergeSoftness` | 86 | the smooth-min's width, frame units; 0 is a plain min |
| `cursorRadius` | 249 | frame units |
| `cursorStrength` | 0.38 | 0 is no reaction |
| `cursorSign` | away | or toward |
| `background` | #0d1220 | the cover's ground, a colour picker |

Those are Uko's tuning from the panel (2026-10-01); the first defaults were
40, 0.35, 60, 260, 0.6, toward and #425EB6.

### Frame time (lava)

`budgets` now benches the hovered tile's own draw and the hero WARM (the
pointer near the centre, the warmth full on: `benchDome`) and counts at least
four tiles' copies. Two runs each, the same script against `main` and the
branch, back to back:

| GPU ms | `main` | lava | budget |
| --- | --- | --- | --- |
| hero, 1728×996 @2× (1256×1633) | 0.855 / 0.925 | 0.895 / 0.795 (0.710 in the full run) | ≤ 1.0 |
| hero, 1440×900 @2× | 0.765 / 0.800 | 0.690 / 0.600 | ≤ 1.0 |
| grid worst frame, 1728×996 @2× (shared + hovered + 4 copies) | 0.825 / 0.960 | 0.985 / 0.780 (1.065) | ≤ 1.2 |
| grid worst frame, 1440×900 @2× | 0.960 / 1.090 | 0.895 / 0.840 | ≤ 1.2 |

Those were on the first defaults. On the final ones (`riseSpeed` 78,
`mergeSoftness` 86, …), the full run: the hero 0.800 ms at 1728×996 @2×, the
grid's worst frame 0.615 ms.

Within the run-to-run spread: the 9 blobs, each skipped where it cannot touch
the field, cost about what the 9 cells did, and pass A is at half the
output's resolution (`noiseHalfRes`). The CPU's part is under 0.02 ms a draw.

## Card 03, Drex: a cached pass A

Card 03's cover is Figma "Rive-ReDesign" Frame 5 (node 490:108, 1000 × 1300, the
hero's 10:13): the Drex logo (node 490:110, at 134, 233, 731 × 833, #1CAB5B) on a
white frame under three effects, in Figma's order. Uko's `drexCover.js` is the
tested WebGL2 port of them (`~/Discommode-pages/projects/drex/`, with
`HANDOFF.md` and its preview renders), and the cover is that port:

| | Figma | here |
| --- | --- | --- |
| pass A | Risograph (v551) + Dither (v758, Bayer 2x2, pixelSize 1), fused: the dither is per pixel | `//#passA` in `drex.glsl`: `FS_PRINT` as it is. Static: **rendered once per size and dial state** into a cached RGBA8 target (the "print") |
| pass B | Hover reveal (d622acc): dark (~10%) but for a light, inside it the print with a liquid wobble and an RGB fringe on the rim | `//#passB`: `FS_REVEAL` as it is, every frame |

`npm run verify:cover` checks the shader is the port (`dref`): at 1000 × 1300,
the pointer at (-1, -1) as Figma's rests, the frame against
`preview-figma-rest.png` (`docs/covers/drex-vs-figma.webp`), averaged over
50-px blocks so the dither and the grain cancel. The means are 39.2 vs 39.1, the
lit corner 235.4 vs 234.7, the mark 17.8 against the paper beside it at 29.6
(Figma's 17.8 / 29.5), and the blocks are a mean 0.7 levels apart (max 14). The
max is the LOGO: `drexCover.js`'s previews used a stand-in mark, and the cover
draws `cover-logo.svg`, Uko's export of the real one. The control, the light
on the logo, is 45.9 apart.

**What changed in the GLSL, and nothing else did:**

- no `#version` line (three.js writes it; `splitCoverGlsl` adds the
  precision, which the port had too);
- pass B's `pp`: the output pixel's position in the PRINT, not in the output.
  An instance is an `object-fit: cover` crop of the frame, so `uOrigin` is
  the crop's top-left in the print (whole px), and `uFlip` is 1 into a canvas
  (row 0 at the bottom; the stage) and 0 into an RT (row 0 at the top; the
  paper). Over a whole-frame canvas it is the port's line exactly;
- pass B's last line puts the result on the white paper (premultiplied over
  white), so the cover is opaque even where the lens samples past the frame's
  edge. `coverBackdrop` is `solid`.

The stage's context is three.js's, which is WebGL2 only (`coverStageAvailable`
throws without it), and so is the paper's. So the GLSL stays ES 3.00, and no
conversion to 1.00 was needed. `drex.test.ts` pins the passes and the one
changed line.

### The print

`CachedCoverRenderer` (`cachedCoverRenderer.ts`) is the second shader
renderer. `makeCoverRenderer` picks it for a `CachedCoverDef`, so the stage,
the paper, the stills and the bench take it as they take card 02's. It lives
in the stage's context and the paper's, as card 02's renderers do, so it adds
no context (`contexts`: grid 2, detail 3, with card 03's tiles live):

- **Pass A covers the WHOLE frame at the output's scale.** `printGeometry`
  makes it `w × h` px at `s = w / 1000`, and puts the instance's crop at
  a whole-pixel offset. Every output pixel then reads one print texel at its
  centre, and the 1-px Bayer dither is the print's, not a resampling of it.
  The figure is `(fw · pxW / crop.w)`, rounded; a 3:4 tile at 672 × 896
  reads a 689 × 896 print from x = 9, and the hero at 1256 × 1633 is its own
  print.
- **The input picture is `buildInputCanvas`, as the port has it**: the white
  frame and the logo recoloured to `logoColor` on its own layer, at the
  print's size. Drawing the SVG at that size keeps the mark sharp at any size.
  It is uploaded as the port uploads it (no flip, premultiplied), drawn through,
  and let go.
- **Kept by size**, up to 4, each for 30 s after its last use. A new
  `printKey` (the risograph and dither dials, `logoColor`) marks every print
  stale, and each is re-rendered on its next draw.
- **The stage sizes this kind by the LAYOUT box**: a ResizeObserver's content
  box, which is fractional and untransformed. A grid tile's focus scale and
  tilt, and the morph's travel, are transforms. Sized by its bounding box, each
  frame of one was a new size and a new print. Sized by its layout box, the
  whole travel is the hero's one print and CSS scales the canvas. Not
  `offsetWidth`: it rounds, and 816.72 → 817 drew the DOM hero a print 1 px
  taller than the paper's.
- **The hero's print is made ahead.** In the paper, `primeHeroCover` renders
  it a frame before the hand-in. In the stage, a hovered card-03 tile renders
  it in an idle moment (`warmHeroPrint`, once per hero size), so the morph
  does not pay for it on the click's first frame.

`dcache` counts it: 90 frames of the pointer over the focused tile, then the
morph, then 90 frames over the hero under the paper. That is 1 print render in
the grid (the hero's, ahead of the click; the tile's is not re-rendered),
0 through the morph, 0 on the hero, and pass B drew every frame. A pass-A dial
changed is 1 render.

### The light

The light is where the reveal is, in frame px:

| | |
| --- | --- |
| hovered | follows the pointer, eased by `followEase` (0.12) per 60 Hz frame — the instance's dome, as an ease ([the dome](#the-clock-and-the-dome)). The grid tile's own (its card), the centre card's `detailDome('drex')` (its panel: under the paper too). A click on a hovered tile hands it to the morph card (2026-10-06), so the light glides home from where the pointer left it instead of jumping to its rest |
| at rest | `restMode`: `drift` (default; `drexCover.js`'s Lissajous around the mark, `driftRadius` 170, `driftPeriod` 14 s, on the shared clock), `parked` (on the mark's centre, 500, 649) or `off` (dark) |
| reduced motion | `parked`, `motionSpeed` 0: `stillValues`. The cover is its still under reduced motion, like every cover, and the still is drawn with these. |

Entering, the light glides from where the rest has it to the pointer, and
leaving, back. The dome's height is the share of the way (`lightAt`). With
`off` there is nothing at rest to glide from, so the light is the pointer and
the height fades the reveal in.

`dpointer`: the pointer at a tile's top-left and then bottom-right, the light's
quarter at 225–229 luminance and the opposite one at 29, on the grid tile and on
the hero under the paper, at 1× and 2×. At rest, two moments of the clock 3.5 s
apart differ in 34–36% of the tile's pixels.

### The still

`npm run covers` draws card 03 with `stillValues`: the light parked on the
mark, at t = 0. It draws at 900 px, NOT halved from 1800 as card 02's is: halving
averages the 1-px dither into a flat tone the live cover never shows.
`cover-still.webp` is 900 × 1170, 237 KB (dither is noise, and noise does not
compress); `cover-still-sm.webp` is 360 × 468, 14 KB. `dreduced` checks it
is parked: the paper under the mark's centre is 233, and the top-left corner
is 29.

### Dials

**COVER · DREX** (`src/dev/coverDials.tsx`), its JSON only (`drex.json`), no
site folder (card 02's panel has it). Every default is `drexCover.js`'s
DEFAULTS, and `drex.test.ts` holds them equal:

| folder | dials |
| --- | --- |
| `risograph` | Figma's: `numInks` 4, `halftoneStyle` dots, `halftoneSize` 8, `screenAngle` 15, `misregistration` 3, `grain` 0.35, `inkDensityBoost` 1.5, `colorQuantization` 0, the input grade (0, 0, 1, 1); `paperColor` and `ink1`–`ink4` (`inks5to8`, collapsed: unused at 4 inks) |
| `dither` | Figma's: `ditherOn`, `ditherLevels` 2, `ditherBrightness` 100, `ditherContrast` 1 |
| `reveal` | Figma's: `revealRadius` 344, `edgeSoftness` 68, `revealStrength` 1, `displacementAmount` 5, `motionSpeed` 1.7, `prismaticFringe` 10.5 |
| `rest` | the site's: `logoColor` #1CAB5B, `restMode` drift, `driftRadius` 170, `driftPeriod` 14, `followEase` 0.12 |

The inks and the paper are RGBA sliders, not colour dials. A colour dial is
8 bits a channel, and Figma's 0.91 would come back as 232/255 = 0.9098. The
pixel-unit dials are frame px, scaled by the print's `s`, so the cover looks
the same at the tile's size and the hero's. The panel persists as
`dialkit:cover-drex-v4`.

### Frame time (card 03)

`dbudgets`, measured as `budgets` measures card 02 (`bench.ts`: batches
closed by a pixel read, minus the floor). A frame of card-03 work is pass B
only. The floor here is one do-nothing pass into the output, because pass A
is not per frame:

| 1728×996 | @1× | @2× | budget |
| --- | --- | --- | --- |
| the shared tile draw (pass B) | 0.010 (+ floor 0.025), 480×640 | 0.015 (+ floor 0.025), 672×896 | — |
| each tile: its copy | 0.037 | 0.053 | ≤ 0.15 |
| worst frame of cover work, grid (shared + hovered + 3 copies) | 0.133 | 0.187 | ≤ 1.2 |
| hero (the paper's pass B) | 0.055 (+ floor 0.070), 628×817 | 0.120 (+ floor 0.075), 1256×1633 | ≤ 1.0 |
| pass A, once: the tile's print / the hero's | 3.2 / 4.1 | 3.4 / 8.0 | — |

Pass B is a few texture reads and a little trig a pixel, so it costs less
than its floor. Pass A is the cost, and it is paid once per size: the tile's
print when the grid first shows card 03, and the hero's when a tile is hovered
(in the stage, in an idle moment) and a frame before the paper's hand-in (in
the paper). The ms are the main thread's (the input picture, a 2D canvas
drawing the SVG at the print's size, and the upload) plus the GPU's, closed by
a pixel read.

## Rive covers (card 04)

Card 04's cover is Uko's Rive file: a large Notion-style Nosey face on blue
(#0A85D1), looping through its states — thinking → searching → writing →
greeting → error, a 24 s lap, every In and Out played through. When card 04
becomes the detail view's **centre card**, the face plays whatever clip it is
in to its end, then its error; at the error's shatter it shrinks into the
middle of the card, and the four characters — the headset Nosey, the kitten,
the propeller one, the hardhat one — burst out of that point, grow, fly
outward and bounce around as Main Bounce did (collisions, propeller liftoffs,
hat knock-offs, hovers). When it stops being the centre card it cuts straight
back to the looping face. In the grid, as the morph card and as a detail
**side card** it is the looping face, live.

It is ONE instance of one artboard, "Nosey Detail" (1000 × 1300, 10:13, the
hero's ratio), for every surface and the page's life — see
[One instance](#one-instance). Its state machine is "Main"; what the site sets
is one view-model boolean, `focused` ([Focus](#focus)). Its `coverBackdrop` is
`solid` ([the backdrop](#transparency-and-the-backdrop)): the artboard is
filled blue.

```ts
cover: {
  kind: 'rive',
  id: 'nosey',                                  // registry key, and the stills' folder
  src: '/projects/nosey/cover.riv',
  artboard: 'Nosey Detail',                     // every surface, one instance
  stateMachine: 'Main',
  focusInput: 'focused',                        // true while it is the centre card
  side: 'live',                                 // live as a detail side card
},
image: '/projects/nosey/cover-still.webp',      // the still: the face at rest
```

The registry holds a `RiveCoverDef` for it (`src/covers/covers/nosey.ts`): the
frame and the dials. The tiles, the morph, the paper, the stills, the COVER
panel and the verify suite take it as they take card 02; everything
Rive-specific is `src/covers/rive/riveCover.ts`; when it is focused is
`src/covers/focus.ts`.

### The .riv

**The Editor's export of this file does not work, and the shipped file is a
signed CLI build** (`rive <dir> --publish=local`, then `npm run projects`, and
`npm run covers` if the first frame changed). What was found on 2026-09-27:

| file | artboards | the scripted ones | scripts run |
| --- | --- | --- | --- |
| the Editor's export (303 KB) | 4 | **not in the file** | the one script it has (PropellerSpin) |
| `rive <dir> --once` (unsigned, 876 KB) | 6 | yes | **no** — "ScriptAsset doesn't have a generator function" |
| `rive <dir> --publish=local` (signed, 872 KB) | 6 | yes | yes |

Each was loaded in @rive-app/canvas 2.42.1 (this repo's), canvas 2.43.1 and
webgl2 2.43.1, with the same result in all three: the runtime was never the
problem. The artboards are built on Luau scripts (MainPlay, BouncePlay and the
face's, PropellerSpin, BladeSpin, LerpNumber), and web runtimes refuse
unsigned scripts (the CLI's docs, "Why signing exists"). An unsigned build
still has the artboards but nothing scripted moves, and it says so only in
the console (`make-cover-stills` prints it too). The earlier unsigned master
is kept beside it as `cover.unsigned.riv`, which `npm run projects` does not
ship (`NOT_SHIPPED`).

**The 2026-10-05 file** (the face, 1,125,192 bytes, signed) has nine
artboards. The site uses one:

| artboard | size | state machine | what it is |
| --- | --- | --- | --- |
| `Nosey Detail` | 1000 × 1300 | `Main` | **the site's.** The looping face, and the transition and the bounce |
| `cover` | 1000 × 1300 | `Main` | the looping face only — pixel for pixel `Nosey Detail` unfocused (0.00% of pixels differ over 30 s, sampled every 0.5 s, 2026-10-05) |
| `Main`, `Main Bounce` | 1000 × 1300 | `Main` | the old grid and hero artboards, unchanged; nothing uses them |
| `Nosey`, `Noseyhead`, `Nosey Hardhat`, `Nosey Cat`, `NotionAI 2` | | | nested: the characters and the face |

`Nosey Detail`'s view model ("Nosey Detail", its default instance):

| property | | |
| --- | --- | --- |
| `focused` | boolean | **the one the site sets** ([Focus](#focus)) |
| `burst` | number | 0 parked, 1 from the burst on (read only) |
| `faceScale` | number | 1, → 0 over the 0.35 s shrink (read only) |
| `noseyAgent/agentStatus` | enum | the face's state: idle, thinking, searching, writing, greeting, error (read only; the readout and the checks show it) |
| `headsetX/Y`, `catX/Y`, `noseyX/Y`, `hardhatX/Y` | number | the characters, −5000 while parked (read only) |
| `ptrX`, `ptrY`, `ptrDown` | | the last pointer event, mirrored by the file's MainPlay (`rpointer` reads them) |
| `bumps`, `wallBumps`, `headsetBumps` | number | counters (read only) |
| `focusAt`, `unfocusAt` | number | test hooks for the Rive CLI; left at 0 |

**Its timings, as delivered** (checked in Chrome against the file on its own,
2026-10-05, and on the site by `rfocus`, `runfocus` and `rdeep`):

- `focused` true: the loop stops; the face plays its current clip to its end,
  Out included, then the error. At the error's shatter (2.42 s into it) the
  face shrinks away over 0.35 s and the characters burst out. From `focused`
  to the burst is **1.9–4.8 s**, by which clip was playing: that wait is the
  face finishing its state, and it is intended.
- `focused` true **before the instance's first advance**: straight to the
  error, the burst **2.42 s** after the first frame (a deep link to
  `#item-04`).
- `focused` false: a cut to the start of the loop — the face back, the
  characters parked, the free propeller and any loose hat reset — within a
  frame (`runfocus`: the frame the view leaves the card).
- The pointer: as Main Bounce's, `pointerMove`/`pointerExit` in artboard space.
  While unfocused the file does nothing with it (the face does not look at it;
  [Not done](#not-done) 17).

**The file is 1,125,192 bytes** (872,152 before): 253 KB more, and the four
hidden reference screenshots are still in it (521 KB; the console lists them as
not decoded). Both are the Rive side's ([Not done](#not-done) 5).

**Checking a file:** the dev console logs, at load, every artboard, state
machine (inputs, listeners) and view model (properties) the file holds, and
warns when the manifest's artboard, its state machine or its `focusInput`
boolean is not among them.

### Data binding

The behaviour lives in view models: `Nosey Detail`'s (the face, the positions,
the pointer, the free propeller and hat, `focused`) and each character's
(Nosey, Nosey Hardhat, Nosey Cat, Noseyhead, the face's NoseyViewModel).
**Nothing moves unless the state machine is bound to them.** The `Rive` class
does that with `autoBind: true`; the cover uses the low-level API (below), so
it does it itself: the instance binds its state machine to its artboard's
default view model instance, and to a default instance of each global view
model (the file has none). If the face stands still, check this first; then
that the file's scripts are signed (above).

### One instance

The face is a running loop, so **a fresh instance starts from the top of the
loop**. Had the grid tile, the side card and the centre card each their own
instance, the face would jump each time card 04 changed role. So there is ONE,
made in the same task as the file's import and never replaced:

| surface | what it shows | how |
| --- | --- | --- |
| the grid's tiles | the instance, unfocused | the cover stage copies its `stage` canvas into each tile |
| the morph card (centre, or a side card) | the instance — focused from the morph's start ([Focus](#focus)) | the same |
| the detail view's centre card, DOM | the instance, focused | the same |
| the detail view's side card, DOM | the instance, unfocused ([The live side card](#the-live-side-card)) | the same |
| the paper's plane, centre or side | the instance | the paper wraps its `plane` canvas in a `CanvasTexture`, uploaded when it holds a new frame |

The instance draws into **two canvases**, each with its own renderer: `stage`
(grow-only; the stage copies a top-left region of it, and a tile's size moves
every frame of a focus tween) and `plane` (exactly the plane's size: it IS the
texture). It is **advanced once per moment** of the cover clock, by whichever
surface asks first, and drawn into each canvas a surface asks for — a second
ask for the same moment and size draws nothing. In practice one canvas draws
per frame: the DOM faces are `visibility: hidden` under the paper, and the
paper does not draw while the DOM has the cards.

**Nothing is ever "left".** The old hero was dropped when it had not been drawn
for 30 frames and 400 ms, so the bounce restarted on every entry. Now an
instance nobody draws is simply not advanced, and it resumes where it was (a
step is capped at 0.1 s: it resumes, it does not fast-forward). The reader
open for ten minutes over card 04, or card 02 in the centre with card 04
folded away two slots off: the face carries on from where it stopped. The DOM
→ paper hand-off is still one picture (`verify:detail`'s identity and
hand-off), and the stage and the paper agree on the moment because they draw
one instance.

`rjump` is the check: the clock pinned and walked a 1/60 s step a frame, the
instance's moment drawn every frame at a fixed size (`snapshot`, which does not
advance it) and compared with the frame before, through grid → centre, grid →
side, side → centre and centre → side; the instance's own clock across each
change.

### Focus

`src/covers/focus.ts` decides which card is focused; `DetailView` acts on it
(on every render and every tick, when it changes); `riveFocusCard(index)` sets
each Rive cover's `focusInput` to whether its card is that one.

| route | `focused` |
| --- | --- |
| grid → detail, card 04 clicked (the morph) | true as the morph **starts** (`riveFocusAt` start, the default) or as it lands (`landing`) |
| a deep link, back/forward into it (the fade) | true at once — for `#item-04` on load, before the instance's first advance |
| Prev/Next, arrows, swipe, a side-card click, the dropdown, into 04 | true when the strip **lands** on it (within 0.02 of its slot) |
| leaving 04 (any of the above), or the exit to the grid | false at once: the active card changed, or the exit started |

**Why the morph's start.** Nothing changes on screen when `focused` turns on —
the face finishes the clip it is in — so turning it on as the card flies in
brings the burst ~450 ms (the morph) closer to the landing, and nothing is seen
earlier. `rfocus`: focused on the morph's first frame, the burst 2.66–2.68 s
after landing; from Next, focused 0.40 s after the click (the slide landing),
the burst 3.32–3.37 s after it. The dial is there to judge it by eye.

**Why a slide's landing.** A card the strip passes through (Next, Next past
04) would otherwise be focused and unfocused in a few frames — and unfocused is
a cut to the top of the loop, on a card in motion. The landing costs the
slide's tail, against a 1.9–4.8 s wait anyway.

### Rendering: one instance, no WebGL

The low-level runtime, not the `Rive` class: the class runs its own rAF loop
into one DOM canvas, and the cover draws on the SHARED cover clock, once per
frame, for however many surfaces show it. The file is fetched and imported
once.

The stage groups a Rive presenter by its LAYOUT box's aspect, not its
bounding box's — a hovered tile tilts, and a tilted tile's bounding box is
another shape — so the grid's tiles share one draw (1.00 draws a frame). A
second aspect in the same frame (a 3:4 tile and a 10:13 side card never are,
the grid being hidden under the detail view) redraws the same moment at its
size.

**No WebGL context.** @rive-app/canvas draws with Canvas 2D, but its init
opens a WebGL context of its own, unconditionally, for IMAGE MESHES, and
decoding an image asset retries it. Card 04 draws no image meshes — its images
are the hidden reference screenshots — so `riveCover.ts` withholds both: while
the runtime initialises, a context request carrying Emscripten's own
`renderViaOffscreenBackBuffer` attribute (nothing else on the site asks for
one) gets null, and the file is imported with an asset loader that declines
images. `rcontexts` counts 0 contexts made by the runtime: the grid has 2 and
`#item-04` 3, as before card 04 was live. A future file that deforms or shows
images has to lift both, and pays that context back.

**The one-off work prefers a quiet moment, and waits at most a second for
one.** Importing this file is one main-thread task (its scripts and nested
artboards; 45–97 ms for the 2026-09 file); making the instance a few ms. The
first run of `verify:detail` caught the import landing inside a Prev slide (a
33.3 ms frame), so the import waits for an idle callback with no press, key,
wheel, touch or drag for 800 ms and no animation running — but only for **1 s**
after the file's bytes are ready, and the instance is made in the same task as
the import. A HOVER is not input here: slides and morphs start from presses,
keys and wheels, and counting a moving pointer made every arrival wait the
whole second. Until then the tiles show the still, as they do before any first
frame.

The deadline was 10 s, and waited twice (the import, then the grid's
instance). With a real person's pointer — always moving, and a moving pointer
is input — that was **20.8 s of the still** in a real Chrome session before the
cover was live (2026-09-27, reported by Uko). The suites never saw it: their
pointer sat still. Now, with the pointer moving from the first frame, the
import waits ~0.1 s and the plane is live 0.33–0.40 s after a direct load of
`#item-04` (`rpointer`, 2026-10-05). The deadline has a timer of its own:
checked only from idle callbacks, which are up to 500 ms apart on a busy page,
it ran at 1.34 s in a real session.

### The pointer

| surface | what it takes | from |
| --- | --- | --- |
| a grid tile | moves while the pointer is over its CARD, an exit when it leaves — to the one instance, which while unfocused does nothing with them (the file's; [Not done](#not-done) 17) | the whole `.grid-card`: the hover overlay's CTA sits over the tile and takes the pointer, and over it the tile alone saw a leave |
| the centre card | moves while the pointer is over its panel, an exit when it leaves — hover only, like the tiles; a click opens the project (below) | the whole PANEL (under the paper the DOM face is `visibility: hidden` and takes no events; its panel does) |
| a tablet's finger | the same, while it is down; lifting it is an exit (docs/mobile.md) | |
| the morph card, a side card | nothing | |

A point across a surface's box maps back through its `object-fit: cover` crop
into artboard space. An event that arrives before the instance exists (the
file still loading) is kept, and the last move is replayed into the instance
when it is made. No smoothing dial: the characters' tracking eases in the file
itself.

**A click on the centre card opens the project**, `#view-04`, as on every
portfolio card; the bar's "Open project" does the same.

### When card 04 does not react

**If a feature looks dead on one port and alive on another, or in an incognito window, suspect saved dials first.** They live in `localStorage`, which is per port, and every workspace's dev server takes the ports in turn. Press **Reset dials** in the dock's DIALS panel. Saved dials are versioned (`DIAL_STATE_VERSION` in `src/dev/dialState.ts`: bump it when a persisted dial is renamed, re-ranged or changes meaning — 10 since `riveSwapAt` became `riveFocusAt`) and validated on load.

The COVER · nosey panel ends in a **status** readout, and the console carries
the same lines as they change (`[covers] nosey: …`):

| field | reads | if it is wrong |
| --- | --- | --- |
| `file` | not requested → fetching → waiting for idle → importing → loaded (or failed: the error), with the ms of each since the request | stuck before `loaded`: the still is what shows, and no hover goes anywhere. `waiting for idle` → `importing` is at most ~1 s; `failed` names the reason (a 404, not a .riv, no runtime) |
| `showing` | what shows the instance now — grid tiles, the morph card, the side card (DOM), the centre card (DOM), the paper centre or side (live, or the still) — and what it was before | `paper centre (the still)` once the file is loaded: the instance is not reaching the plane |
| `instance` | artboard / state machine / view model, which instance (`#n`), and whether it is advancing | `no instance`: the file did not load. `vm none`: not bound — nothing moves. `not advancing` while it is on screen: nothing draws it. A `#n` above 1: something made a new one (only `__covers.rive.reset` should) |
| `focus` | focused (the centre card) or unfocused · the face's state · the characters out or parked | unfocused on the centre card: the focus is not reaching it (`[covers] nosey: focused at …` in the console says when it does); focused and parked for more than ~5 s: the file's transition is not running |
| `plane` | centre or side, live or the still, and whether new frames are uploaded to it | `no new frame uploaded` while it is on the paper |
| `tilePointer`, `centrePointer` | `receiving` while events come; once they stop, the last one: its kind, where in ARTBOARD space, how many in all | `none received` while you hover: the events are not reaching the cover (an element above it, `inert`, the listener's target) |
| `reducedMotion` | the media query as the page sees it | `reduce`: the stills everywhere, by design, and the runtime never loads |

Its lines are STATES, not counters: a readout that ticked (a frame count, an
age, coordinates while the pointer moved) changed on every check, and every
change was a DialKit re-render of the whole dock, ~300 ms in a dev build. The
face's state changes every few seconds, which is a state. Its rows are a fixed
height with tabular numbers (`src/dev/statusReadout.css`) and the other panels
are folded, so a change re-renders this panel's rows and nothing else; it is
checked four times a second (`advancing` and `uploading` judged over a
second). The live numbers — frames, the instance's clock, every pointer event,
uploads — are in the console and `window.__covers.rive.status('nosey')`,
`instance('nosey')`, `viewModel('nosey')`.

What made card 04 look dead before (2026-09-27; [the history](#the-hero-the-second-time)):
the 20.8 s wait above; a long frame taken as leaving the hero (gone: nothing is
ever left now); the readout re-rendering the dock; the grid drawn under the
detail view. The stage checks opacity, not only visibility: the grid's tiles
under the detail view (`opacity: 0`) are not drawn, and the instance is not
advanced by them.

#### The hero, the second time

Kept for the record (2026-09-27, the per-role instances). In a clean session
the hero lived on every route; what made it look dead was the machine being
busy: a hero not drawn for 400 ms of wall time was taken as LEFT and remade —
the bounce back at rest, the tracking dropped — and the detail view's arrival
gives 150–500 ms frames on a loaded machine. It became "30 frames of cover
work and 400 ms", and with one instance for the page's life (2026-10-05) the
rule is gone altogether. The lesson stands: count frames of work, not
milliseconds, for liveness rules, and test them with injected long frames
(`rpointer`'s three 450 ms frames).

### The live side card

A cover can be **live as a detail side card**: the card beside the centre one
shows the cover live, at rest, instead of its still. It is a field on the
manifest's cover ref, `side: 'live'` (default `'still'`), read through one
function, `coverSideLive(ref)` (covers.ts), by everything that draws a side
card, so they agree. **Cards 02, 03 and 04 have it** (card 04 since 2026-10-05,
02 and 03 since 2026-10-06), so whichever card is the centre card has live
neighbours; the folded cards two slots off stay the still.

| | |
| --- | --- |
| the DOM panel (`DetailView`) | `CoverTile` live on a panel one slot from the centre; a shader cover's with its detail dome, but `input` false: the pointer does not reach it |
| the morph's side cards (`DetailMorph`) | live, so a side card lands on the same moment it travelled with |
| the paper (`DetailPaperLayer`) | a live texture for slot 1 at the side card's size: a Rive cover's `plane` canvas; a shader cover drawn by the paper's renderer with its detail dome into its target — at `detailSideScale` 1 the hero's size, so the same target and card 03's same print in either role |

**At rest, and only the centre card takes the pointer.** As a side card the
lava drifts on the shared clock, card 03's light follows its `restMode`
(drift or parked), card 04's face loops, and nothing the pointer does reaches
them: a shader cover's side card has no listeners (`CoverTile`'s `input`), a
Rive cover's none either. Card 01 has no live cover: its sprites play only on
hover and its rest is a still, which is what its side card shows — as on the
grid, where it is the photographed cover.

**No jump: one dome per cover in the detail view** (`detailDome(id)`,
dome.ts). Until 2026-10-06 the detail view had ONE `heroDome` for whichever
card was the hero, and a side card was drawn with a fixed rest dome. A card
that left the centre warm — card 02's lava under the pointer, card 03's light
where the pointer was — snapped to rest the moment it became a side card (the
middle of the slide, on the paper), and the next centre card inherited the
last one's dome. Now each cover keeps its own spring for its card in every
detail role: the clicked grid tile hands its state over (`adopt`, card 03's
light too now), the morph card and the centre card drive it, and when the card
stops being the centre card its panel lets go (`leave`) and the same spring
eases out while it is the side card. Its clock is the shared one throughout.

**The checks** (scripts/side-live-checks.mjs, real Chrome, the pointer moving
from the first frame; each run once against a broken path, which failed):

| check | what | measured | broken path → |
| --- | --- | --- | --- |
| `sside` | 02 and 03 as the side card of both their neighbours, 1× and 2×: the DOM side canvas drawn, the paper's side plane `live`, pixels moving at rest; the pointer on the centre card (its dome up) and then on the side card (its dome at 0, the warmth settled); a tablet (1180 × 820 @2×, touch only): a finger circling on the side card moves nothing, on the centre card its dome; reduced motion, no WebGL and card 03's logo failing to load: the still | 218–336 live draws in 1.5 s; 30–39% of the side card's pixels moved (> 8 levels: the side card is dimmed while the pointer is on the centre card); the centre's dome 1.00, the side card's 0.000 throughout | `sidestill`: no DOM canvas, the plane `still`, 0% moved. `sideinput` (the side panel takes the pointer): the side dome 1.00, the finger's 1.03 |
| `sjump` | as `rjump`: grid → centre (a hovered tile clicked), centre → side (ArrowRight with the pointer still on the card: it leaves WARM), side → centre, grid → side; the clock pinned and walked a step a frame; each frame what the surface on screen last drew (`__covers.probe`: its clock and a copy of its dome) redrawn at 240 × 312. Judged on the STATE — a dome or warmth above 0.05 keeps ≥ half of itself per vsync — the clock (+0–4 frames) and every surface of the route drawing it; the redraw's pixels are printed beside (a function of the clock and dome alone) | kept 0.62–0.96 of a warm dome over every change (card 02: 0.62–0.96; card 03's light: 0.77–0.87); clock +3 frames at every change | `siderest` (the side card at rest, as before): kept 0.00 on centre → side, 7% (card 02) and 31% (card 03) of the redraw in one frame. `sidestill`: no side surface ever draws; side → centre restarts the clock (+650 frames) |
| `sbudgets` | per frame, per cover and role, at 1728×996 and 1440×900 (1×, 2×) and 2560×1440 @2×: the paper's draw's main-thread ms every frame (p95, the pointer circling the centre card) + the same draw's GPU ms (`benchCover`, the floor included, six benches, p95). Card 04 is `rbudgets` | below | |

A TIME_ELAPSED timer query (EXT_disjoint_timer_query_webgl2) was tried for
the GPU half first: on ANGLE's Metal backend it timed card 03's 0.12 ms pass B
at 5.5 ms — the command buffer's span, not the draw's — so the GPU ms are the
bench's, as `budgets` and `dbudgets` have always been.

**What it costs** (2026-10-06): production builds (`build:verify`, `vite
preview`), `main` (with only the measuring probe ported to it) and this
branch interleaved — main, branch, twice — Google Chrome quit before every
run, at a load average of 3.0–7.4 (macOS's own daemons). Per-frame p95, ms,
ranges over the two rounds; budget ≤ 2.0 each. `main`'s side cards of 02 and
03 are the still, which costs nothing per frame:

| viewport | cover · role | main p95 | branch p95 |
| --- | --- | --- | --- |
| 1440×900 @1× | 02 centre | 1.20–1.40 | 0.91–0.98 |
| 1440×900 @1× | 02 side | still (0) | 0.91–0.99 |
| 1440×900 @1× | 03 centre | 0.34–0.36 | 0.25–0.26 |
| 1440×900 @1× | 03 side | still (0) | 0.30–0.55 |
| 1440×900 @1× | 04 centre | 1.60–1.70 | 1.50–1.70 |
| 1440×900 @1× | 04 side | 1.50–2.60 | 1.50–1.60 |
| 1440×900 @2× | 02 centre | 1.65–1.70 | 1.16–1.30 |
| 1440×900 @2× | 02 side | still (0) | 1.02–1.34 |
| 1440×900 @2× | 03 centre | 0.47–0.56 | 0.40–0.47 |
| 1440×900 @2× | 03 side | still (0) | 0.49–0.77 |
| 1440×900 @2× | 04 centre | 1.70–1.80 | 1.60–1.80 |
| 1440×900 @2× | 04 side | 1.40–1.60 | 1.50 |
| 1728×996 @1× | 02 centre | 0.99–1.27 | 1.14–1.15 |
| 1728×996 @1× | 02 side | still (0) | 0.76–1.15 |
| 1728×996 @1× | 03 centre | 0.37–0.39 | 0.20–0.26 |
| 1728×996 @1× | 03 side | still (0) | 0.37–0.57 |
| 1728×996 @1× | 04 centre | 1.70–1.80 | 1.60–1.70 |
| 1728×996 @1× | 04 side | 1.50–1.60 | 1.40–1.50 |
| 1728×996 @2× | 02 centre | 1.70–1.83 | 1.28–1.45 |
| 1728×996 @2× | 02 side | still (0) | 0.92–1.31 |
| 1728×996 @2× | 03 centre | 0.61–0.62 | 0.22–0.22 |
| 1728×996 @2× | 03 side | still (0) | 0.52–0.88 |
| 1728×996 @2× | 04 centre | 1.70 | 1.60–1.80 |
| 1728×996 @2× | 04 side | 1.50 | 1.60 |
| 2560×1440 @2× | 02 centre | 1.89–2.14 | 1.84–1.86 |
| 2560×1440 @2× | 02 side | still (0) | 1.72–1.85 |
| 2560×1440 @2× | 03 centre | 0.66–0.98 | 0.31–0.74 |
| 2560×1440 @2× | 03 side | still (0) | 0.63–0.98 |

Within each row `main` and the branch draw the same thing in the centre
role; their differences there are the machine (the centre cards read lower on
the branch in some rows: the load fell between rounds). The side card of a
shader cover costs about what that cover costs as the centre card, because it
IS the same draw at the same size, at rest. No row needed a lower DPR or frame
rate for the side card to stay inside 2.0 ms, so it is drawn as the centre card
is. The closest is card 02 at 2560 × 1440 @2× (1.72–1.86 in either role; on
`main` its centre card measured 1.89–2.14): the lava's own cost at the
Studio Display's size, not the side card's. Every live shader cover of one
detail frame, together, at most 2.80 ms (2560 × 1440 @2×, `#item-02`: card
02 the centre card, 03 the side card; `main` 2.14), with card 04's side card
beside it on the CPU (`rbudgets` p95 1.4–1.6); sky + fluid + covers stays
far inside its 8. WebGL contexts are unchanged — `contexts`, `rcontexts`:
grid 2 (+ the paper's once warmed), detail 3, none made by the Rive runtime,
on `main` and the branch alike: a side card is drawn by the renderers that
were already there.

### The still

`npm run covers` draws `Nosey Detail`'s first frame, unfocused — the resting
face on blue, pixel for pixel `cover`'s — no pointer, with the app's own
instance: `cover-still.webp` (900 × 1170, **12 KB**) and `cover-still-sm.webp`
(360 × 468, 4 KB). An opaque WebP is written without an alpha channel: decode
them as 3 channels. It is what reduced motion shows (the runtime is never
loaded: `rreduced`), the tiles' first paint, what a side card shows for the
frame before its first copy, and the phone door's project 04 (`rphone`: the
door loads no Rive).

### Dials

Card 04's COVER panel (`COVER · nosey`, at `#item-04?intro` and in the app's
dock at `/?intro`) is its JSON only, with no site folder — two persisted panels writing the
site's dials would overwrite each other:

| dial | default | |
| --- | --- | --- |
| `riveFocusAt` | start | when a card opened from the grid is focused: as the morph starts, or as it lands ([Focus](#focus)) |
| `riveMaxDpr` | 2 | the cap on the instance's backing stores |
| `coverPaperShade` | 1 | the paper's light on this cover, per unit of its alpha (card 02's is the site dial) |

Its own `coverBackdrop` is `solid` (`nosey.ts`), so the site's
`coverBackdrop` does not apply to it: nothing is drawn under the drawing.

### Frame time

Main-thread ms (Rive is CPU work; Chrome rasterises the 2D canvases off the
main thread). Every piece of card-04 cover work in a frame — the instance's
advance and draws, each tile's copy, the paper's upload — is summed per frame,
with the pointer circling the focused tile, then the centre card after the
burst, then the centre (card 03) with card 04 the side card. The per-frame
reads are on a 0.1 ms clock (the page is not cross-origin isolated); a timed
batch of 120 draws of a throwaway instance is printed beside them. `rbudgets`,
bundled Chromium, the dev server, Chrome quit before each run, 2026-10-05:
`main` (the old file, Main and Main Bounce) and this branch from a worktree of
`main` on a server of its own, **interleaved** — main, branch, three times —
at a load average of 2.6–3.5; ranges over the four viewport × DPR rows and
the three runs:

| | main: mean / p95 | branch: mean / p95 | budget |
| --- | --- | --- | --- |
| grid, per frame | 0.67–0.76 / 0.8–0.9 | **0.62–0.66 / 0.7–0.8** | p95 ≤ 2.0 |
| — a timed draw | 0.28–0.32 | 0.25–0.27 | |
| centre card (main: Main Bounce; branch: after the burst) | 0.70–0.84 / 0.9–1.1 | **0.79–0.97 / 1.0–1.3** | p95 ≤ 2.0 |
| — its worst single frame | 1.0–1.5 | 2.1–3.7 | |
| — a timed draw + upload | 0.29–0.34 | 0.30–0.35 | |
| side card (card 03 the hero) | — (the still) | **0.67–0.82 / 0.8–1.1** | p95 ≤ 2.0 |
| — of which the upload | — | 0.07–0.10 | |

The centre card costs ~0.1 ms a frame more than Main Bounce did, and has
single frames of 2–4 ms that Main Bounce did not (one or two in each sweep of
120). The side card is a new cost, paid while card 01 or 03 is the hero; the
grid is a little cheaper. In the full `verify:cover` run the same day the
centre card measured p95 1.2–1.3, the side card 1.1–1.3. **Two runs alone,
straight after, at a load average of ~4.7** (a playing tab, `coreaudiod` at
11%), missed the bar on rows of the centre and side cards (p95 up to 2.7 and
2.4; the grid 1.0, once 2.0); `main` was not run under that load, so they
compare with nothing. Take the interleaved table, and two runs, before
believing a miss.

The upload is the canvas → texture copy of an accelerated 2D canvas into the
paper's context, premultiplied (as a 2D canvas already is: no conversion).

## Checking

```
npm test && npx tsc -b && npm run lint
npm run dev                   # in another shell
npm run verify:cover          # --url <origin>, --only budgets,clock,morph,reduced,nogl,contexts,sky,ground,lmove,lpointer,lsweep,
                              #   rbudgets,rgrid,rside,rjump,rfocus,runfocus,rdeep,rpointer,rtouch,rphone,
                              #   rclick,rreduced,rsky,rground,rcontexts,sidelive,sside,sjump,sbudgets,
                              #   dcompile,dref,dcache,dpointer,dmorph,dreduced,dbudgets,drag
npm run build && npx vite preview   # for drag's frame times: judged on a production build only
npm run verify:detail         # its identity and hand-off cover cards 02 and 04
```

`verify:cover` checks `budgets`, `clock`, `morph`, `reduced`, `nogl`,
`contexts`, `sky` and `ground`, as above (`budgets` counts card 02's tiles
only; `nogl` now also shows card 04's tiles live without WebGL). Pixel checks
hide the sky and the dev overlays, except `sky` and `ground`; a pixel differs
past 32 levels. About ten minutes. `sky`, `ground`, `rsky` and `rground` are
skipped for a cover whose `coverBackdrop` is `solid` (cards 02 and 04 now).

Card 02's lava's three (2026-10-01), on the real path — the clock running and
the pointer moving from the first frame, events through the browser at the
tile's and the hero's on-screen positions, the hover overlay in place
(transparent):

| check | what | measured |
| --- | --- | --- |
| `lmove` | the marquee held, a tile and the hero (under the paper) 2 s apart; the control: `riseSpeed` and `wobble` 0. And the blobs at one moment: some rising, some sinking | 14.5–15.4% (tile), 14.4–15.2% (hero) of pixels moved > 3%; control 0.00%; of 9, 3 rising and 6 sinking |
| `lpointer` | the dots' dome off. The tile hovered: warmth, the blobs near the pointer drawn toward it (and away, with the sign), extra phase; the tile warm against the same moment once the pointer has gone (clock pinned), near the pointer and beyond two radii, and with strength 0 (the control); every frame of leaving; the same on the hero under the paper | warmth 1.00; the pull, against the same instance without it: 8.6–9.9 units toward, −15.7 to −21.1 away (hero 10.3–13.6 toward); 0.33–0.37 rad ahead (hero 0.57–0.62); near 8.8–10.1% (hero 7.6–9.2%) > 3%, beyond 0.00%, control 0.00%; leaving 31–202 units back at ≤ 4.3 a frame, on the shared draw after 130–132 frames |
| `lsweep` | 1728×996 @2×: the pointer swept through the visible part of every card-02 tile in ~1 s (the dev dock hidden — it covers the top-right tile's strip); every frame's own draws of card 02 counted until the grid is at rest; the worst grid frame = the shared draw + that many warm draws + 4 copies, each benched | uncapped: 3 tiles at once, 1.415–1.850 ms (four runs); capped at 2: 0.73–1.07 ms alone, 1.78 ms in the full run (its draws benched at twice their cost alone). Re-baselined on production builds 2026-10-04: at most 2 tiles is asserted on its own, and the frame has its own budget, 1.25 ms (p95 1.020 of 46 runs; [docs/perf/lsweep.md](perf/lsweep.md)) |

`lpointer` fails with the tile's pointer path cut (`spring.point` not
called): the hovered tile is never drawn for itself.

Card 04's checks, with the numbers of the last runs (2026-10-05). The
behaviour checks run in real Chrome (`channel: 'chrome'`, CDP input), the
pointer moving from the first frame and never parked; each was also run once
against a deliberately broken path (`--fault <name>`, src/covers/faults.ts, dev
only; or `--broken`, from the check's side) and **failed there**, as listed:

| check | what | measured | broken path → |
| --- | --- | --- | --- |
| `rbudgets` | all card-04 work per frame, pointer moving: the grid, the centre card after the burst, the side card (card 03 the hero) | p95 0.8 (grid), 1.2–1.3 (centre), 1.1–1.3 (side) ≤ 2.0 ([Frame time](#frame-time-1)) | |
| `rgrid` | the focused tile live: agentStatus over 8 s, the canvas drawn, the blue ground, pixels moving, unfocused, one instance | thinking → searching; 53% blue; 8.2–8.8% of pixels moved in 3 s; parked; #1 | `frozen`: agentStatus `idle` only |
| `rside` | 03 (and 01) the hero: card 04's DOM side canvas drawn, the paper's side plane live, the clock and agentStatus advancing, unfocused, one instance | +437–441 uploads in ~7 s; clock 0.3 → 7.5–7.7 s; ~50% blue; #1 | `sidestill`: no side canvas, no side plane, the clock still |
| `rjump` | grid → centre, centre → side (after the cut), side → centre, grid → side; the clock pinned and walked a step a frame; the instance's moment drawn every frame vs the frame before | worst change 0.00–6.27% against bounds of 7.5–18.4% (3 × each run's p95); its clock +3 frames over every three-frame window; #1 throughout | `fresh`: the clock jumps back 29–384 frames, instances #1 → #5 |
| `rfocus` | the morph, and Next from 03: burst within 5 s of landing, faceScale 0 within 0.5 s of it, then the headset moves | focused on the morph's first frame; burst 2.68 s after landing (the morph), 3.38 s (Next; focused as the slide landed, 0.41 s after the click); face at 0 0.35 s after; the headset 154–156 units | `nofocus`: never focused, never bursts |
| `runfocus` | Next, Prev, Escape: burst 0, faceScale 1, parked | 0 frames after the view left card 04 (the frame it did) | `nounfocus`: never back |
| `rdeep` | `#item-04` on load: focused from birth, the burst 2.42 ± 0.1 s of its clock after its first draw | 2.42 s (clock), 2.41–2.42 s (wall) | `latefocus`: 4.18 s |
| `rpointer` | the import ≤ 1.1 s after the bytes, pointer moving; the tile's and the CTA's moves reach the instance through the crop; the centre card after the burst (morph and direct load): the file's ptrX/ptrY = the on-screen point, alive through three 450 ms frames | waited 99–100 ms; (129, 650) for (129.5, 650), CTA (501, 650) for (500.8, 650); centre (150, 650) / (850, 650) exactly; 95–97 frames and uploads in ~2 s, the headset 276–282 units, #1; the direct-load plane live 348–412 ms after navigation | `--broken pointer` (the panel's events cut): 0–2 events, ptrX/ptrY stale |
| `rtouch` | a tablet (1180×820 @2×, touch: `pointer: coarse`): a tap opens card 04, the burst; a finger moves its pointer, lifting is an exit | burst 2.73 s after landing; ptrX/ptrY (800.0, 698.6) exactly; last event `exit` | `--broken pointer`: 0 events |
| `rphone` | the phone door's project 04: the still, no Rive requested | the 900 × 1170 still, 54% blue; 0 of 68 requests Rive | `--broken phone` (the page fetches the .riv): caught |
| `rclick` | a click on the centre card | `#view-04` | |
| `rreduced` | reduced motion: tiles and hero on the still, runtime never loaded, 1 s | 0 canvases, not loaded, 0 bytes changed | |
| `rsky`, `rground` | the sky through the ground | **skipped**: card 04 is `solid` | |
| `rcontexts` | WebGL contexts with card 04 live | grid 2, `#item-04` 3; 0 made by the runtime | |
| `sidelive` | the live side card's SHADER path, card 02 forced live beside 03 (`window.__coversSideLive`; card 02 is live there by the manifest since 2026-10-06, and `sside`, `sjump`, `sbudgets` are its checks: [The live side card](#the-live-side-card)) | the paper drew live covers 330 times in 1.5 s; 10.5% of card 02's side pixels moved | |

`rswap` (the Main → Main Bounce swap) is gone with the swap.

Card 03's seven (`d…`), with the numbers of the last run (2026-10-01):

| check | what | measured |
| --- | --- | --- |
| `dcompile` | both passes linked, and `getError()` NO_ERROR after a draw of each, in the stage's context and the paper's | linked, 0, in both |
| `dref` | 1000 × 1300, the pointer at (-1, -1), against `preview-figma-rest.png` (read from the masters, `--drex-ref` for another): opaque; a dark frame; a lit top-left corner; the logo barely visible; 50-px blocks ≤ 3 levels apart, and the light on the logo (the control) further | [Card 03](#card-03-drex-a-cached-pass-a) |
| `dcache` | pass A's renders (`__covers.prints`, `__paper.coverPrints`) against pass B's draws: 90 hovered frames on the tile, the morph, 90 on the hero, and a dial | [The print](#the-print) |
| `dpointer` | the light follows the pointer, tile and hero (under the paper), 1× and 2×; drifts at rest | [The light](#the-light) |
| `dmorph` | card 02's `morph` on card 03: the last morph frame vs the DOM hero, the DOM hero vs the paper | 1.34% / 0.29% (1×), 1.41% / 0.56% (2×) ≤ 2% ([Not done](#not-done) 14) |
| `dreduced` | reduced motion: tiles and hero on the still, nothing moves; the still's light is on the mark | 6 of 6 tiles, 0 draws, 0 bytes; 233 / 29 |
| `dbudgets` | GPU ms per frame of pass B (the shared tile draw, the hovered tile's, the copies; the hero), and pass A's one-off ms at each size | [Frame time](#frame-time-card-03) |

`window.__covers` for card 03: `renderFrame(id, w, h, t, dome)` (one draw read
back), `prints(id)`, `diagnose(id)`, `benchPrint(id, w, h)`;
`window.__paper.coverPrints(id)`, `coverDiagnose(id)`, `benchCover(id)`.

`window.__covers.rive`: `ready(id)`, `status(id)`, `instance(id)` (its number,
clock, focus and canvases), `viewModel(id)` (enums by name), `snapshot(id, w,
h)` (its moment drawn, no advance), `focus(id, v)`, `reset(id)` (a fresh one
at the top of the loop — only the checks do this), `costs()` / `clearCosts()`,
`oneOff()` (the import's and each instance's ms), `bench(id, w, h, n, {
focused, lead })`; `window.__paper.riveUploads()` and `benchRiveUpload(n)`.

**verify:detail** pins the cover clock where it opens a card, so its identity
and hand-off checks compare one moment on both sides, and its hand-off check now
includes card 02 — the paper's checks run against the transparent hero. Card 02
has two budgets of its own, documented in the script:

| | measured | budget | why |
| --- | --- | --- | --- |
| hero | 0.000–0.004%; **1.92%** at 1728×996 @2× on #0d1220 (3.04% on #425EB6; 2.1–2.2% before 2026-10-01) | 3.5% (2.5% before) | the hero box is 628.2 × 816.7 CSS px there, so neither the DOM canvas nor the plane's texture lands on whole device pixels; two resamplers move a field of noise by a fraction of a pixel. The diff grows steadily toward the bottom-right: a 0.4px scale drift, not a clock or a colour. On the opaque navy ground the same drift puts more of the dot field past 32 levels: 3.04% every run, `main` 2.11% (the same script and machine), in the same pattern, no blob drawn apart |
| as a neighbour (the still) | 1.0–5.0% | 7% (card 01's) | Chrome's scale(0.85) resampling of the `<img>` against a texture resized to the card — card 01's documented problem, on pure noise |
| hero, since `detailCardScale` 0.81 | **5.68%** at 1728×996 @2×, every run; 0.00–0.06% elsewhere | 6.7% (`LAVA_HERO`) | the hero box is 555.7 × 722.4 CSS px there: the same drift over the dot field. The diff map is speckle and nothing else (best whole-pixel shift 1px, σ1 blur 0.37%, largest connected difference 44 px) |

Card 03 as a neighbour since `detailSideScale` 1 (the neighbours at the hero's
size): **1.1–8.2%**, held to 9.2% (`DREX_STILL_SIDE`); card 02's neighbour and
card 03's hero keep 7% and 3.5%. Both were re-baselined on 2026-10-01 at the
measured value + 1 point, after `verify:detail --diff-dir` maps of every
failing row, `main` at the old dials beside the new: resampling drift only —
card 03's dither moiré in the same places, denser; no shape out of place, no
shift over 1px.

Card 04, the same way: as the hero **0.149–0.434%**, the spec's 0.5% (the DOM
face and the plane show one canvas; the suite waits for the live hero — until
the file is imported both sides are the still); as a neighbour, its still — thin line art
on a transparent ground — **0.018–0.891%**, held to 2% for card 01's reason
(the old opaque photo face was 0.1–0.4%). With the opaque file (2026-09-28): the
hero 0.133–0.387%, as a neighbour 0.023–0.795%. With the face (2026-10-05), one
instance for every surface: the hero **0.089–0.482%**; as a neighbour it is
**live** now — the DOM side card copies the instance's `stage` canvas and the
plane samples its `plane` canvas, one moment — **0.126–0.393%**, under the same
2% (`RIVE_SIDE`).

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

## Safari: stray black lines on card 04 (2026-10-06, fixed in the .riv)

**Fixed, in the file** (Uko's signed build, 2026-10-06: 603,483 bytes, was
1,125,192): handle distance 0 on `Eyebrow_R Path`'s end vertices in all three
faces (NotionAI 2, Nosey, Nosey Hardhat), and four unused reference images no
longer exported. No code changed. Checked on the verify build, the clock walked
to the moments the artifacts showed, old file against new:

- **Stray ink** (near-black pixels in WebKit or Safari with no dark pixel within
  4 px in Chrome), worst frame: side card `#item-03` @2× 2,916 px → **0**, @1×
  571 → 0, iPad 11" 1,196 → 0, iPad 12.9" 2,200 → 0; centre (error pose and
  burst shards) 180 → 0 (iPads 130 / 48 → 0); grid tile (the instance's own
  render) 549–621 → 0. After the burst: 0 on both.
- **Real Safari 27.0** (WebDriver, 1728×1117 @2×): the old file's lines
  reproduce exactly as in Playwright's WebKit (side 2,696 px at 6.033 s; centre
  in 18 of 25 frames; grid 549 px), and the new file draws none.
- **The stroke log:** the 37-unit eyebrow strokes' end handles read 0 at every
  sampled time (0–9 s, unfocused and focused), in all three faces.
- **The rest of the file is the same:** artboards (9; names, sizes, bounds),
  state machines, inputs, listeners, animations, view models and their
  properties, enums and Nosey Detail's defaults, compared in the one runtime.
  Only the four images are gone and the Luau scripts' internal file names are
  renumbered. Chrome draws it as before.

Captures (Chrome old · Safari or WebKit old · NEW · Chrome new):
`docs/covers/safari-lines/fixed-side-real-safari.webp`, `fixed-error-pose-real-safari.webp`,
`fixed-burst-shard-real-safari.webp`, `fixed-grid-tile-real-safari.webp`,
`fixed-side-ipad-webkit.webp`; the characters after the burst in Safari,
`fixed-after-burst-real-safari.webp`.

### The findings (before the fix)


Uko saw black lines in Safari on the Nosey face that are not part of the
animation: a spike off the left tip of the eyebrow, and worse on moving
shapes. Chrome is fine. **The cause is in the .riv, on two vertices of one
path.** It is not our draw or copy path, and no runtime version changes it.

**Where.** In Playwright's WebKit (Safari 26.6's engine), on every surface: the
grid tile, the side card (`#item-03`: long lines across the face at
6.03–6.07 s, `docs/covers/safari-lines/site-side-card-sequence.webp`), the centre card's
error pose (0.56–0.9 s) and a flying eyebrow shard in the burst (2.62–2.68 s);
at 1× and 2×, and in the iPad Pro 11" and 12.9" emulations. The four
characters after the burst are clean. Chromium and Chrome draw none of it. Real
Safari was not driven: `safaridriver` needs Safari's "Allow remote automation",
which is off and was left off.

**Not our code.** A bare page drawing the artboard through `@rive-app/canvas`,
with no cover stage, shows the same spikes. The stage copies the instance's
own 2D canvas (no WebGL between), so it cannot add lines. (A dark line down the
centre card's left edge, and a dash by the kitten, are in Chrome too: not this.)

**The path.** Every stroke was logged as the runtime drew it. Every frame with
an artifact had the same one: **`Eyebrow_R Path`** in the face artboard
**`NotionAI 2`** (`NULL_Face` › `Eyebrow_R`), 37 units thick, round cap, miter
join, three vertices. Its **first and last vertices** (ids `0-10065245` and
`0-10065247`) are mirrored, with a handle **0.1 units long** at −30.39° (the
first) and 90° (the last). The anchors are animated and the handles are not,
so the curve begins and ends on a 0.1-unit handle pointing 25–164° away from
where it actually goes. WebKit takes the stroke's end direction from that
handle and draws the thick, round-capped end skewed: the spike and the bite
next to it, and, when the angle gets wide, the long lines. Skia (Chrome) draws
a faint notch at most. In the characters' faces the same path stays near 26°,
and nothing shows at any size.

**What does not fix it.** Round or bevel joins, `miterLimit` 1, butt caps
(`docs/covers/safari-lines/joins-caps-no-help.webp`): the spikes move, sometimes grow.
`@rive-app/canvas` 2.42.1 (ours), 2.43.1 and 2.44.0 draw identical pixels in
WebKit (`docs/covers/safari-lines/runtimes-identical.webp`); 2.44.0's "keep coincident control points
exact when trimming paths" does not apply to a 0.1 handle. `canvas-lite` does
not run the file's scripts. No matching rive-wasm issue was found.

**The fix, in Rive (Uko's):** on those two vertices of `Eyebrow_R Path`, set the
handle distance to **0**, or make them straight vertices, or turn the handles
along the curve; then republish the signed CLI build ([The .riv](#the-riv)).
With distance 0 simulated in the runtime, WebKit matches Chrome: 0–1 differing
pixels where there were 84–3,729 (`docs/covers/safari-lines/eyebrow-chrome-webkit-fixed.webp`, panels 3
and 4; `docs/covers/safari-lines/side-size-long-lines.webp`, `docs/covers/safari-lines/burst-shard.webp`). The Rive MCP dropped
before the animation's keys could be read, so "the handles are not keyed"
rests on the drawn output.

**A stopgap in code, if the file cannot change soon (proposed, not built):**
wrap the runtime's own path (`rt.renderFactory.makeRenderPath()`, not the
global `Path2D`) so `cubicTo` snaps any control point within 0.5 units of its
anchor onto the anchor. One length check per segment; it removed every
artifact in the tests, the burst included. Risks: it patches a runtime
internal (a runtime update can break it), and it would flatten real handles
that short (nothing visible in a 1000-unit artboard).

**The Rive Renderer** (`@rive-app/webgl2` 2.44.0, one shared offscreen context
copied to 2D canvases) also draws it clean (`docs/covers/safari-lines/webgl2-renderer.webp`), at a cost
— A/B rounds interleaved, DPR 2, characters bouncing, load average 5.8–11, M1
Max:

| | canvas 2.42.1 (now) | webgl2 2.44.0 |
| --- | --- | --- |
| WebGL contexts | 0 | +1: grid 2 → 3, `#item-04` 3 → 4 |
| draw, main thread, Chrome (mean / p95) | 0.68–0.80 / 0.9–1.2 ms | 0.95–0.98 / 1.1–1.2 ms |
| the same, WebKit | 0.88–1.23 / 1–2 ms | 1.39–1.84 / 2–3 ms |
| first frames, cold shader cache | — | one 743 ms (Chrome) / 897 ms (WebKit) stall |
| renderer setup | 0.3–2 ms | 24–60 ms (288 cold) |
| reading pixels back (`snapshot()`) | ~0.1 ms | 2.6–4.2 ms mean, p95 to 9 |
| wasm, gzip | 782 KB | 925 KB |

It would also mean lifting `withoutMeshContext`, whose test refuses the
webgl2 runtime's own context. Not worth it for a two-vertex fix in the file.

**Seen on the way:** uploading card 04's 2D canvas into the paper's WebGL
texture costs 12.6–12.8 ms a frame in Playwright's WebKit at 1384×1800 (Chrome:
0.05 ms). It needs checking in real Safari ([docs/perf/thirty-fps.md](perf/thirty-fps.md) has it too).

## Not done

1. **A neighbour sliding into the hero switched from the still to live.**
   Resolved 2026-10-06: cards 02, 03 and 04 are live side cards, on one clock
   and one dome per cover ([The live side card](#the-live-side-card),
   `sjump`). The folded cards two slots off are still the still, and one
   arriving from there passes through the side slot first.
2. **The still was heavy** (1.1 MB). Resolved by card 02's own ground
   (2026-10-01): 239 KB.
3. **A lost context falls back to nothing, not the still.** If the stage's
   context is lost, the tiles keep their last frame. The still is behind them,
   hidden once the first frame landed, and it is not brought back.
4. **"Each tile ≤ 0.15ms"**: met as each tile's own cost (its copy). As "one
   tile drawn on its own" it is 0.235–0.365ms at 2×. See Frame time.
5. **Card 04's .riv is 1,125,192 bytes** (872,152 before the face, 2026-10-05:
   +253 KB), and still carries the four reference screenshots it never shows
   (521 KB; [The .riv](#the-riv)). `exportFlags="2"` on them in the CLI
   project, and a re-publish, would drop them. The Rive side's: not changed
   here.
6. **Card 04's hero started from rest, whatever the grid was doing.**
   Resolved 2026-10-05: one instance of one artboard for every surface
   ([One instance](#one-instance)).
7. **The cover is hover-only** — a click on the centre card opens the
   project ([The pointer](#the-pointer)).
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
10. **Card 03's still is 237 KB.** Its dither is per-pixel noise, which does
   not compress, as card 02's particle field does not. It is only fetched where
   it shows.
11. **The paper renders card 03's hero print in the frame before its hand-in**
   (`primeHeroCover`, 8.0–8.2 ms at 1256 × 1633 on the main thread and the GPU). The stage's
   is made in an idle moment once a card-03 tile is hovered. The paper's could
   be too, from the same hover, but it is not yet. `verify:detail`'s
   `arrival` rows are where it would show.
12. **`dref` compares structure, not the mark.** `drexCover.js`'s previews used
   a stand-in logo, and the cover draws the exported one. So the comparison is
   over 50-px blocks, and its max (14 levels) is where the two marks differ. A
   render of Figma's frame with the real logo would make it a pixel check.
13. **`restMode` `off` fades the light in rather than gliding it:** there
   is no rest point to glide from (the port puts it 10,000 px off the frame).
14. **Card 03's morph → DOM hero is 1.3–1.4%, card 02's 0.2%.** The morph
   card is drawn at the hero's size and scaled by CSS over the travel. Held a
   hair short of its end, the scale is not quite 1, and a 1-px dither resampled
   that little still moves pixels past 32 levels. It lands on the same print,
   pixel for pixel.
15. **A warm tile is drawn for itself for ~2.2 s after the pointer leaves**
   (card 02's lava easing back onto the shared timeline). Two may ease at once
   (`MAX_OWN_TILES`): the budget's one hovered tile and one more. A third
   swept past drops its warmth on the spot rather than easing out.
16. **The site's `coverBackdrop` and `coverBackdropColor` apply to no cover**
   since card 02 became `solid`. They are on card 02's COVER panel still,
   for the next cover that lets the sky through.
17. **Card 04's face does not notice the pointer while unfocused** — in the
   grid and as a side card the face loops whatever the cursor does; the
   pointer reaches the instance (`rpointer`), and the file ignores it until
   the burst. Accepted for now (2026-10-05); the face noticing the cursor
   while unfocused is a Rive-side follow-up.
18. **The live side card was card 04's only.** Resolved 2026-10-06: cards 02
   and 03 too, budgeted per role ([The live side card](#the-live-side-card)).
19. **Detail → grid lands the morph card on a tile at rest.** The exit morph
   carries the cover's detail dome back to the grid, and the tile it lands on
   has its own spring, at rest: whatever warmth is left when the morph lands
   (the exit takes ~450 ms; card 03's light is ~97% home by then) is dropped.
   `sjump` covers the four routes `rjump` does, not this one.
20. **A side card's DOM face before the paper has the cards** (the arrival,
   and while the paper hands out) is drawn by the cover stage at the side
   card's full size, the same draw the paper would make; `sbudgets` measures
   the paper's, where a side card spends its life. `verify:jank`'s
   grid→detail, next, prev and detail→reader rows are where the stage's would
   show.
21. **Card 03 as a live side card is 12.6% off its DOM face** at 1728×996 @2×
   beside 04 (verify:detail's `DREX_LIVE_SIDE`, 13.6%): the 1-px dither's
   moiré inside the light. Snapping the resting side card to whole device
   pixels (2026-10-06) did not help — the worst row −0.35 points, three
   others 2–4× worse; numbers in `detail-verify.mjs` — and was reverted. The
   two renderers sample the one print differently; where exactly is open.
