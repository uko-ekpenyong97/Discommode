# The sky

Everything behind everything: a full-viewport WebGL2 fragment shader driven by
San Francisco's live weather. It is Layer 0 of the grid, and since this change
it is also the ground the project view's paper sits on. Code is in `src/sky/`,
the React wiring in `src/components/SkyLayer.tsx`, the data in `src/env/`.

Reference: `docs/prototypes/sky-prototype.html` — a standalone page whose
fragment shader **is** this one. Open it, press the buttons. Its dock is the
dial set this ships, its shader is what `FRAG` in `skyEngine.ts` was copied
from, and anything argued about here should be argued about there first.

> **On the numbers in this file.** Architecture and dials are as shipped.
> Anything reported as a *measurement* names the run that produced it. The
> frame-time table comes from a run on 2026-09-20 on an Apple M1 Max; the
> contact sheet is `scripts/sky-sheet.mjs` from the same day; the contrast
> figures are `scripts/sky-contrast.mjs` and live in
> [docs/portfolio-view.md](portfolio-view.md#two-washes-because-there-are-two-questions),
> which is where the ground they are measured on is documented.

## What was wrong with the one before it

The sky used to be a **four-colour noise field**: four hexes per time band, with
three fbm fields mixing between them, and no horizon, no sun and no cloud. Every
weather condition was a *modifier on those four colours* — `fogDesaturation`,
`fogLift`, `cloudMute`, `stormDarken` — and every one of those modifiers could
only desaturate or darken. Three things followed from that and all three were
bad:

1. **The day was itself a grey.** The `day` band was
   `#a6b8c8 #c2cedb #8fa6ba #cdd7e0` — four desaturated blue-greys. A clear noon
   in San Francisco arrived on screen as a wash.
2. **Fog and overcast were the same code path.** `SkyLayer` derived
   `fog = clamp01((cloudiness − 0.85) / 0.15)`, and the WMO table gives plain
   overcast — code 3, the most ordinary sky the city has — a cloudiness of 1. So
   WMO 3 got the **full fog treatment**, and the one condition the site was
   built around could not be told from the one it sees most.
3. **Every condition converged.** Start from a grey, desaturate it for cloud,
   desaturate it for fog, darken it for storm, and rain, fog, overcast and a
   thin high cloud all land within a few levels of each other.

The fix is not a better set of modifiers. It is that **weather is drawn**. Each
condition is a layer with a shape: the cloud deck is cloud, the fog bank is a
bank, rain is streaks. Nothing tints anything.

## The layers, in paint order

All of it is one program, one fullscreen triangle, one pass. The order is the
order in the shader, and it is the order the sky is actually built out of —
each layer composites over what is under it.

| # | Layer | What drives it |
| --- | --- | --- |
| 1 | **Base gradient** | `uZenith` → `uHorizon` up the screen, the sample point warped by a 3-octave fbm so it reads painted rather than printed. Warm lift along the horizon at golden hour. |
| 2 | **Sun glow** | Position: `x` by phase (0.24 rising → 0.76 setting), `y` by elevation (−0.06 → 0.86). Three exponentials — a broad wash, a near glow, a disc. Occluded by cloud, fog and storm. |
| 3 | **Stars + moon** | Only at `nightAmt`; a hashed star field with a per-star twinkle, and a moon with its own halo. Mixed back out by cloud and fog — an overcast night has no stars. |
| 4 | **Cloud deck** | `coverage = max(cloud, storm)` thresholds a 5-octave fbm. Above 0.72 coverage the ceiling **closes** and the texture comes from the shading instead. A second fbm sample shades lit against shadow; lit goes sun-coloured at golden hour and the deck is **underlit** from below. Blown sideways by wind. |
| 5 | **Fog bank** | A 5-octave fbm gated by a vertical falloff at `fogHeight`: a **bright** bank sitting low and rolling, not a grey tint. Its colour goes from a cold slate at night to near-white in daylight, and takes the sun's colour at golden hour; the sun bleeds through it. |
| 6 | **Rain** | Two layers of hashed streaks at different scales and speeds, both slanted by wind. |
| 7 | **Lightning** | `uFlash` lights the cloud deck from the inside, then lifts the whole scene. |
| 8 | **Saturation, grain** | `skySaturation` toward luma, then additive per-pixel grain at `skyGrain`. |

The one deliberate difference from the prototype: the prototype has a GLSL
`palette()` with the hexes written into it. Here the blended pair arrives as
`uZenith` / `uHorizon`, computed in `palette.ts`, so **the hex table is the one
editable place for a sky colour**.

### The palette

`PALETTE_FIELDS` in `src/sky/palette.ts`. One `[zenith, horizon]` pair per band.

| band | zenith | horizon |
| --- | --- | --- |
| night | `#050918` | `#161e40` |
| dawn | `#485ca8` | `#f6aa70` |
| day | `#347cd6` | `#c4def5` |
| dusk | `#30286e` | `#f0764e` |

`skyGradientAt(elevation, phase)` blends them: night below 0, a linear ramp to
the low-sun band by 0.15, a smoothstepped ramp to day by 0.42. `phase` is
continuous 0 (rising) → 1 (setting), so the low band is dawn at 0 and dusk at 1
and a flip cross-fades rather than throwing the sun across the sky.

## The mapping

`envToTarget` in `src/sky/envToTarget.ts`, and this is the whole of it:

| target | from | note |
| --- | --- | --- |
| `sun` | `env.sunElevation` | |
| `dayPhase` | `env.dayPhase` | eased as 0/1 |
| `cloud` | `env.cloudiness` | coverage, straight through |
| `fog` | `condition === 'fog' ? 1 : 0` | **a state** |
| `rain` | `env.precipitation` | |
| `storm` | `condition === 'storm' ? 1 : 0` | **a state** |
| `wind` | `env.windSpeed` | |

Fog and storm are conditions and not functions of cloudiness. That is the one
line of this file that matters: **fog and overcast are different states**, and
the reason the old sky converged is that they were not.

## No snow. This sky is San Francisco's.

There is no snow layer, `Condition` has six members, and WMO 71–77 and 85/86 map
to `'rain'` in `wmo.ts`.

The prototype has a snow layer and it is a good one. It is also a layer that
will never be seen — it has snowed on San Francisco three times in a century —
drawn by a shader that every visitor pays for on every frame, with a seventh
state to hold, screenshot and keep true. The scope of this sky is one city's
weather; a seventh state that city does not have is not scope, it is stock.

The codes still have to go **somewhere**. Open-Meteo reports what it reports,
and a reading the renderer has no state for is a blank sky — which is the one
failure mode a background must not have. Falling wet is the nearest thing this
sky can draw, so a freak 73 is a heavy grey day with rain in it. `wmo.test.ts`
asserts that no code in the whole 0–99 range produces a condition the sky cannot
draw, which is the check that actually protects this.

## The dials

`SKY` panel in DialKit (dev only), values in `src/config.ts`.

| Dial | Default | What it does |
| --- | --- | --- |
| `skyTransitionMs` | 1500 | Time constant of the ease when a target changes. |
| `skyDrift` | 1.0 | Multiplier on every motion: deck, bank, warp. |
| `cloudScale` | 2.0 | Cloud noise frequency. Bigger = smaller, busier cloud. |
| `fogHeight` | 0.85 | How far up the screen the bank reaches. |
| `skySaturation` | 1.0 | Final saturation multiplier. |
| `skyGrain` | 0.03 | Additive grain over everything. |
| `skyResolution` | 1.0 | Backing-store scale under the DPR cap of 2. See below. |

The panel used to carry the four weather modifiers and a three-dial preview
sweep. The modifiers went with the tint model. The preview moved to the
**EnvReadout**, where the six conditions and the four times of day are two rows
of buttons — the override is stepping through states, not tuning a feel, and a
state is a button.

`skyParallax` also went. It shifted the whole field vertically with the cursor,
it shipped at 0, and a sky with a horizon in it is not a thing that should slide
up and down under the pointer.

## Motion, and the things that freeze it

The engine (`skyEngine.ts`) owns its own rAF loop and eases every scalar toward
its target with the same exponential the grid motion uses, tau `skyTransitionMs`,
settling at an epsilon of 0.0005. Three things stop it:

- **Reduced motion.** `uTime` is pinned to 0, so the drift, the twinkle and the
  shader's own grain are all frozen; transitions drop to 150ms; and once
  everything has settled the loop stops entirely. Measured: with a storm up,
  two captures 2.5s apart are **bit-identical**.
- **A hidden tab.** `visibilitychange` cancels the frame and nothing runs.
- **Nothing else.** The sky drifts continuously while it is on screen — that is
  the point of it.

### Lightning

The envelope is on the CPU (`flashEnvelope`), fed in as one uniform. While
`storm > 0.3` a strike is scheduled every 3.5–12.5s, uniform; each one is three
exponentially decaying bursts — a leader, a small re-strike at 100ms, the main
stroke at 180ms — scaled by how much of a storm there is. It lights the cloud
deck from the inside before it lifts the scene, which is what makes it read as
being *inside* the cloud rather than as an exposure change.

Under reduced motion it is pinned at 0. A strobe over a page of type is the one
thing it must never be.

## One canvas

`skyStage.ts`. There is **one** `<canvas>` and **one** WebGL2 context for the
whole app, and the components that want it *claim* it: a claim appends the
element to the claimant's host, and releasing hands it back to whoever had it
before (last in wins, which is also paint order).

This exists because the sky is drawn in two places — behind the grid, and under
the paper in the project view, which is a layer *above* the grid and so cannot
be the same element showing through. The alternative is two contexts, which is
two programs, two rAF loops and two five-octave fbm passes for one sky, on a
machine that is also running a three.js sheet.

Moving a canvas in the DOM does not touch its drawing buffer, so the context,
the program and the eased state all survive the move: the sky a project opens
onto is the sky you left, mid-drift, in the same weather. Verified — opening
`#view-01` and closing it again leaves exactly one canvas, which travels from
`.app` to `.pv-ground` and back.

### The claim is re-asserted, not taken once

A host claims on **every render**, not only on mount, and `claimSky` is
idempotent. That looks redundant and is not — it is the fix for a bug that cost
a walk-through, and the shape of it is worth keeping written down.

The canvas is not the component's. It is built lazily by whichever host claims
first, and it can be **replaced underneath a component React has no reason to
re-render an effect for** — which is exactly what a dev hot update of this
module does. A fresh module builds a fresh canvas and a fresh engine; a
mount-only claim never runs again; so the new canvas is never put in the DOM,
the new engine renders into a detached element, and what stays on screen is the
*previous* canvas, cut off from its driver and frozen on its last frame.

Every symptom of that points somewhere else. Nothing throws, nothing logs, and
the `EnvReadout` beside it goes on reporting the correct state — so it reads as
"the time of day does not reach the shader" when in fact nothing reaches it and
the picture is simply old. It was diagnosed as a sun-specific mapping fault
before the pixels were measured.

Three things close it, and each closes it from a different side:

- the claim is re-asserted every render, so the invariant is *stated*: while
  this host is mounted, it holds the canvas;
- `attach` sweeps any `.sky-layer__canvas` that is not the current one out of
  the host — there is exactly one sky, so a second element is a ghost with a
  live loop behind it;
- `start` replays the stage's current target into a newly built engine, so an
  engine born after a push cannot miss it. (`setSkyTarget` compares before it
  publishes, which is what keeps the every-render push from looping against the
  store it also subscribes to.)

And `pv-verify` now asserts it in light rather than in structure — see
[the contact sheet](#the-contact-sheet) below.

The one thing that does not travel with it is the WASH. On the grid the sky is
bare; in the project view it is under `groundScrim`, and the letterhead's band
under `letterheadScrim` on top of that. Both live in the project view's look —
the grid has nothing printed on the sky and needs neither.

Every host paints a CSS gradient of the current sky *behind* the canvas
(`skyFallbackCss` — a zenith→horizon gradient plus a flat cloud-grey wash
proportional to coverage). That covers the host that is not currently holding
the canvas, and the browser with no WebGL2 at all, with the same code.

## Frame time

`node scripts/sky-perf.mjs`, with the dev server up. It draws batches of ten
frames and closes each batch with a one-pixel `readPixels`, which the driver
cannot answer until every queued draw has landed — `drawArrays` only queues, so
timing around one call measures how fast the main thread can talk to the driver.
The sync costs something the real loop never pays, so these figures err high.

**2560×1440 @2× — a 5120×2880 backing store — on an Apple M1 Max, 2026-09-20.**
Budget: 6ms.

| condition | mean | p95 | max |
| --- | --- | --- | --- |
| clear | 0.68 | 1.08 | 1.22 |
| partly | 0.70 | 1.12 | 1.24 |
| fog | 0.62 | 0.66 | 0.75 |
| storm | 0.56 | 0.57 | 0.62 |

Worst p95 **1.12ms of a 6ms budget**, at roughly fourteen megapixels. The new
shader is about three times the cost of the field it replaced and it is still
nowhere near the budget, so **`skyResolution` ships at 1.0** and nothing is
upscaled. It is in the panel as the lever for a machine where that is not true:
at 0.75 the backing store is 3840×2160 and the grain covers the softening.

Note that `storm` is the *cheapest* of the four despite drawing the most. It has
full coverage, and a closed ceiling is a `mix` to a value the shader has already
computed; a partly-clouded sky is the expensive one, because every pixel pays
for both the sky under the deck and the deck.

## The contact sheet

`node scripts/sky-sheet.mjs`, with the dev server up, writes
`docs/sky/<condition>-<time>.webp` — six conditions × four times of day, shot
from the grid so every frame also answers "does the site still read on it". It
drives `window.__skyPreview`, which is the same call the EnvReadout's buttons
make, so the sheet is the states you can click to and not a second definition of
them.

The twenty-four images are in `docs/sky/`. The three that carry the argument:

- `clear-noon` — blue, with the sun up near the top of the frame.
- `cloudy-noon` — a closed grey ceiling with texture in it, edge to edge.
- `fog-noon` — a bright bank across the bottom two-thirds with **blue sky above
  it**. That is the difference the whole change is for.

Reading the sheet: `storm-dawn` is brighter than `storm-noon`, which is not a
bug — the shutter caught a lightning flash.

The sheet is shot from the **grid**, where the sky is bare. The project view
puts it under a wash; see
[Two washes](portfolio-view.md#two-washes-because-there-are-two-questions).

### The sheet is not a check, and one was needed

A contact sheet is an eye test. It is driven by `window.__skyPreview`, a handle
that calls `setEnvOverride` directly — so it can come out **perfect while the
buttons a person actually presses are wired to nothing**, and it did. That gap
is now a check: `pv-verify` forces NOON and NIGHT from the grid **through the
DOM buttons** — EnvReadout → `setEnvOverride` → `useEnvState` → `SkyLayer` →
`skyStage` → engine → glass, every link in the order a walk would hit them —
and fails if night is not under **35%** of noon's mean luminance.

It photographs the sky with the grid hidden. The cards are opaque art that does
not change with the weather, and with them in frame a *working* night measures
56% of noon, which leaves no threshold worth setting. Sky alone it is 28%, and
it was 100% with the bug.

### …and the thing the sheet nearly hid

`scripts/sky-contrast.mjs` walks the same twenty-four states and measures the
letterhead against each. It is what caught the one wrong assumption in this
change: a **clear** noon is not the brightest sky over the strip. An overcast
one is, because the lit top of the cloud deck clips to white — `litCol` is
near-white before `dayLight` scales it and the shader clamps to 1.0, so every
daylit clouded state ties at exactly the same ratio. Clear noon measures 8.51:1
and overcast noon 7.65. The mean-luma column the sheet prints says the same
thing if you read it: `cloudy-noon` and `fog-noon` are the two brightest frames
of the twenty-four, and `clear-noon` is twenty levels behind them.

## Where this is wired

| File | What it is |
| --- | --- |
| `src/sky/palette.ts` | The hex table and the band blend. The only place a sky colour is written. |
| `src/sky/skyEngine.ts` | The shader, the eased targets, the rAF loop, the lightning envelope, the dev readback. |
| `src/sky/skyStage.ts` | The one canvas and the claim stack. |
| `src/sky/envToTarget.ts` | The mapping: `EnvState` → `SkyTarget`. |
| `src/components/SkyLayer.tsx` | The host. Claims the canvas; feeds the target in. |
| `src/env/wmo.ts` | WMO code → condition, cloudiness, precipitation. |
| `src/dev/skyPreview.ts` | Dev: what each condition and each time of day means as numbers. |
| `src/dev/EnvReadout.tsx` | Dev: the readout and the override buttons. |
| `scripts/sky-sheet.mjs` | The 24-image contact sheet. |
| `scripts/sky-perf.mjs` | The frame-time table above. |
| `scripts/sky-contrast.mjs` | The letterhead against all 24 skies, and the sweep that set `letterheadScrim`. |

## Not done

- **The palette is still first-draft.** It is the prototype's, chosen by eye in
  a browser at one viewport. The four bands have never been looked at against
  the real card art at both signed-off viewports in a row.
- **The sun does not know where the sun is.** Its screen position is a mapping
  from elevation and phase, not an azimuth — so it rises on the left and sets on
  the right regardless of the time of year.
- **Wind has one number and two jobs.** It blows the deck and slants the rain
  from the same normalized windspeed, with no direction. A southerly and a
  northerly look identical.
- **`cloudiness` is a hint, not a measurement.** `current_weather` gives no
  cloud-cover percentage, so the coverage that drives the deck comes from the
  WMO table's per-code guess. Open-Meteo's hourly endpoint has the real figure.
