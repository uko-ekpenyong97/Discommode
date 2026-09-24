# Live covers

A card can have a LIVE cover: a shader, drawn every frame, reacting to the
mouse, transparent where its ground is. Card 02 (rive-site) is the first: the
tuned "Shader variation 3 — Soft contour field", with the weather sky showing
through its ground. It is live in the grid tile, the grid→detail morph and the
detail hero, and everywhere else it is its still.

The shader and its tuning are the prototype's
([docs/prototypes/cover-shader-prototype.html](prototypes/cover-shader-prototype.html)),
and that page stays the tuning bench: it now loads the app's GLSL and dial JSON,
so what is tuned there is what ships.

> **On the numbers in this file.** Every measurement is from
> `npm run verify:cover` and `npm run verify:detail` on 2026-09-24, on an Apple
> M1 Max (ANGLE / Metal), headless Chromium for the first and Chrome for the
> second.

| | |
| --- | --- |
| the grid, card 02 live, the sky through its ground | `docs/covers/grid-row.webp` |
| the detail hero, live on the paper | `docs/covers/hero.webp` |
| the same tile over NOON and over NIGHT | `docs/covers/noon-night.webp` |

## Map

| File | What it is |
| --- | --- |
| `src/covers/types.ts` | `CoverRef` (the manifest's), `CoverDef` (a cover), the per-draw `InstanceFrame`. |
| `src/covers/covers.ts` | The registry: cover id → `CoverDef`. The stills' URLs. |
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
| `src/covers/coverDials.ts` | The live dial values (a module store) and the site's two dials. |
| `src/dev/coverDials.tsx` | The COVER panel (dev). |
| `src/covers/bench.ts`, `devHooks.ts` | Dev: `window.__covers`, the GPU benchmark. |
| `scripts/make-cover-stills.mjs` | `npm run covers`: the stills. The tail of `npm run projects`. |
| `scripts/cover-verify.mjs` | `npm run verify:cover`. |
| `public/fonts/inter-latin-400.woff2` | Inter 3.19 (fontsource 4.5.15, OFL — `Inter-OFL.txt` beside it). |

Wired in: `content.ts` (`cover` on `PosterItem`, card 02), `GridPlane.tsx`
(the tile), `DetailMorph.tsx` (the morph card), `DetailView.tsx` (the panels),
`DetailPaperLayer.tsx` + `paperMaterial.ts` (the hero plane), `App.tsx` (the
dev panel).

## The model

A card names its cover in the manifest:

```ts
cover: { kind: 'shader', id: 'rive-site' },
image: '/projects/rive-site/cover-still.webp',   // the still
```

Cards without `cover` are unchanged (card 04 keeps its video-cut face).

A cover is a `CoverDef` in the registry: one GLSL file, one dial JSON, and the
few lines of TS that turn dial values into its uniforms. Every instance of it is
an `object-fit: cover` crop of its FRAME (the Figma frame, 900 × 1326 for
rive-site): the grid tile shows the 3:4 of it, the hero the 10:13.

### Adding a cover (Nosey's, say)

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

`coverBackdrop` (a site dial, beside the cover's own):

| | |
| --- | --- |
| `sky` (default) | nothing is drawn behind the cover. The grid tile is a 2D canvas in the DOM over the SkyLayer; the hero plane is premultiplied over the sky. No scrim, no darkening, nothing between the cover and the sky. |
| `solid` | `coverBackdropColor` is laid under the cover (premultiplied-over, in pass B). |

What that took, outside the covers:

- **The tile has no fill.** A cover card's `.grid-card__face` has no background
  colour. Its `box-shadow` stays: a CSS box-shadow is only painted outside the
  box.
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
costs more than drawing it. The paper's renderer exists whenever the hero does.

| | main | with covers |
| --- | --- | --- |
| grid | 1 (the sky) | **2** (+ the stage) |
| detail view | 2 (the sky, the paper) | **3** (+ the stage) |

The stage also draws the morph card and the hero's DOM face (until the paper
takes it over): 10:13 instead of 3:4, so a group of its own.

**What renders when.** Instances on screen render every frame, at full rate: the
hero, the hovered tile, all of them. Nothing renders when none is visible: the
stage's loop sleeps until the IntersectionObserver wakes it. Instances that are
on screen but hidden by CSS are checked, not drawn — the grid under the detail
view, the hero's DOM face under the paper. Three places **hold** their last frame
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
the paper, each an identity:

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
`coverBackdropColor` and `coverMaxDpr` (2). **Copy pastes into
`src/covers/covers/<id>.json`** (the site's three are not the JSON's). It is at
`#item-02?intro`, as specified, and in the app's own dock everywhere else: DialKit's store is
global, so the panel is registered from outside `src/reader` and appears in
whichever dock is mounted — the doorway's at `?intro`, where the app is
suspended, which is why App mounts it even then.

The bench's own controls (size, DPR, freeze, lens mask, benchmark) stay on the
bench. `rtScale` moved from them into the cover's `quality` folder, because the
app needs it too.

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

## Checking

```
npm test && npx tsc -b && npm run lint
npm run dev                   # in another shell
npm run verify:cover          # --url <origin>, --only budgets,clock,morph,reduced,nogl,contexts,sky
npm run verify:detail         # its identity and hand-off now cover card 02
```

`verify:cover` checks `budgets`, `clock`, `morph`, `reduced`, `nogl`,
`contexts` and `sky`, as above. Pixel checks hide the sky and the dev overlays,
except `sky`; a pixel differs past 32 levels.

**verify:detail** pins the cover clock where it opens a card, so its identity
and hand-off checks compare one moment on both sides, and its hand-off check now
includes card 02 — the paper's checks run against the transparent hero. Card 02
has two budgets of its own, documented in the script:

| | measured | budget | why |
| --- | --- | --- | --- |
| hero | 0.000–0.004%; **2.1–2.2%** at 1728×996 @2× | 2.5% | the hero box is 628.2 × 816.7 CSS px there, so neither the DOM canvas nor the plane's texture lands on whole device pixels; two resamplers move a field of noise by a fraction of a pixel. The diff grows steadily toward the bottom-right: a 0.4px scale drift, not a clock or a colour |
| as a neighbour (the still) | 1.0–5.0% | 7% (card 01's) | Chrome's scale(0.85) resampling of the `<img>` against a texture resized to the card — card 01's documented problem, on pure noise |

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
