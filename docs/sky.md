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
> frame-time table comes from a run on 2026-09-21 on an Apple M1 Max, and the one
> it replaced was wrong (see [Frame time](#frame-time)); the figures under
> [Bigger stars](#bigger-stars) and [The gradient is paint](#the-gradient-is-paint)
> are 2026-09-22 on the same machine, each one paired with a run of `main`
> taken in the same session, because that session was a noisy one; the
> contact sheet is `scripts/sky-sheet.mjs`, eighteen frames from 2026-09-20 and
> the six nights re-shot 2026-09-22 (see
> [One column at a time](#one-column-at-a-time)); the contrast
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
| 1 | **Base gradient** | `uZenith` → `uHorizon` up the screen, the sample point warped by a 3-octave fbm so it reads painted rather than printed. Warm lift along the horizon at golden hour. Wherever it is what you can see, the wake **pushes it around like paint in water** — see [The gradient is paint](#the-gradient-is-paint). |
| 2 | **Sun glow** | Position: `x` by phase (0.24 rising → 0.76 setting), `y` by elevation (−0.06 → 0.86). Three exponentials — a broad wash, a near glow, a disc. Occluded by cloud, fog and storm. |
| 3 | **Stars + moon** | Only at `nightAmt`, and skipped outright above it; a hashed star field, each star with its own size and twinkle and a two-tier falloff, and a moon with its own halo. Mixed back out by cloud and fog — an overcast night has no stars. |
| 4 | **Cloud deck** | `coverage = max(cloud, storm)` thresholds a 5-octave fbm. Above 0.72 coverage the ceiling **closes** and the texture comes from the shading instead. A second fbm sample shades lit against shadow; lit goes sun-coloured at golden hour and the deck is **underlit** from below. Blown sideways by wind. |
| 5 | **Fog bank** | A 5-octave fbm gated by a vertical falloff at `fogHeight`: a **bright** bank sitting low and rolling, not a grey tint. Its colour goes from a cold slate at night to near-white in daylight, and takes the sun's colour at golden hour; the sun bleeds through it. |
| 6 | **Rain** | Two layers of hashed streaks at different scales and speeds, both slanted by wind. |
| 7 | **Lightning** | `uFlash` lights the cloud deck from the inside, then lifts the whole scene. |
| 8 | **Saturation, grain** | `skySaturation` toward luma, then additive per-pixel grain at `skyGrain`. |

All of layers 1–6 also respond to the **wake** the pointer and the page leave in a
fluid simulation that runs in the same context. The sun is the exception. See
[The wake](#the-wake).

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
| `starSize` | 2.0 | Star disc radius, as a multiple of the one-device-pixel dot the field started as. See [Bigger stars](#bigger-stars). |
| `skyResolution` | 1.0 | Backing-store scale under the DPR cap of 2. See below. |
| `skyMaxMegapixels` | 0 | The most pixels the backing store may have, in millions. Above it the store is scaled down. 0 = no cap, which ships; it is the lever for a slower machine. See [Frame time](#frame-time). |

The wake has its own panel, **SKY · FLUID**, next to it. See [The wake](#the-wake).

| Dial | Default | What it does |
| --- | --- | --- |
| `fluidOn` | on | Master switch. Off, the sky is exactly the sky without a wake. |
| `fluidRadius` | 0.08 | Splat radius, as a fraction of the viewport height (the gaussian's 1/e). |
| `fluidStrength` | 1.0 | What the pointer puts in: its push and its density. |
| `fluidCurl` | 20 | Vorticity confinement: how much the wake curls into eddies. |
| `velocityDissipation` | 0.98 | Velocity kept per 60 Hz frame. |
| `densityDissipation` | 0.94 | Density kept per 60 Hz frame. A parting closes in about a second. |
| `fluidWarp` | 0.02 | How far every noise sample moves with the wake. |
| `starPush` | 0.6 | How far stars are carried along it. |
| `starGlow` | 1.5 | How much brighter, and harder-twinkling, a star in it gets. |
| `cloudPart` | 0.5 | How much of the deck its density parts. |
| `fogPart` | 0.7 | How much of the bank its density clears. |
| `rainBend` | 0.15 | How far a gust bends the rain. |
| `gradientPush` | 0.35 | How far the wake drags the base gradient itself. Seventeen times `fluidWarp`, and it is not the same kind of thing: see [The gradient is paint](#the-gradient-is-paint). |
| `gradientSwirl` | 0.15 | How far the wake's density drifts the gradient's hue toward the horizon colour. |
| `pageSplat` | 1.0 | What the page's moving cards put in. 0 turns them off. |
| `fluidDebug` | off | Draw `tFluid` in the bottom-left corner. On **F**. |

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
- **A hidden tab.** `visibilitychange` cancels the frame and nothing runs,
  and that includes the wake's solver.
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

## The wake

Reference: **ponpon-mania.com**. Every background there samples one shared
fluid-simulation texture that the pointer writes into; velocity displaces
UVs, density lifts colour or thins masks. The sky does the same thing,
with one rule on top: **what the wake does to a layer has to be what moving air
would do to it.** A cloud deck parts and closes back. A fog bank opens a window
that fills in. Rain bends like it does in a gust. Stars (which air cannot move)
are carried along the wake anyway and drift back, because at night that is the
one thing on the screen the eye can follow. The sun is left where it is.

### The solver

`src/sky/fluid.ts`. It runs in the **sky's own WebGL2 context**, so there is no
second context, and it is the standard stable-fluids pipeline (Stam, in the
shape Pavel Dobryakov's WebGL-Fluid-Simulation made standard). Once per frame:

    splat → curl → vorticity → divergence → pressure (Jacobi ×20) →
    gradient subtract → advect velocity → advect dye

Velocity runs at **128×72** and dye at **256×144**, both half-float. It
runs in **17 passes rather than 30**. At this size a pass costs next to nothing
to shade; what it costs is being a pass, because every render-target switch
is a new encoder. So:
- the curl is computed inside the vorticity pass (each of its five taps is
  four velocity reads);
- the warm start's ×0.8 is folded into the first pressure pass;
- each pressure pass does two Jacobi sweeps. The inner sweep reads its
  neighbours through the same edge clamp a separate pass would have seen.

That is ten passes and twenty iterations, the same arithmetic minus the
half-float rounding between sweeps. Velocity is
held internally in sim texels per second, because the pressure solve treats both
axes alike. **The output is the dye target:** the dye advect writes `xy` = the
projected velocity in *screen heights per second* (both axes, so it is
isotropic on screen) and `z` = the density. The sky fragment shader reads that
as `tFluid`, one fetch per pixel.

The splats come from two places:

- **The pointer.** A `pointermove` listener on the window records where it is;
  each frame, if it has moved since the last frame, one splat goes in at its
  position with its velocity × `fluidStrength`. Density is the speed:
  1 per (height/s), capped at 1. Speed is capped at 4 heights/s. **If the
  pointer does not move, nothing splats** and the field just keeps decaying.
  Leaving the window resets it, so coming back in somewhere else does not
  splat the jump.
- **The page.** `skySplat` / `skyWake` / `skyWakeLeading` in `skyStage.ts`,
  scaled by `pageSplat`. See [The page disturbs the sky](#the-page-disturbs-the-sky).

Up to 16 splats a frame go in as one pass per target. Decay is
`velocityDissipation` / `densityDissipation` **per 60 Hz frame**, applied as
`k^(dt·60)` so the rate does not depend on the refresh rate.

### It goes to sleep

This part is what makes the rest affordable, and what makes the
idle check below possible at all.

Half floats never reach zero by multiplication. A subnormal times 0.98 rounds
back to itself, so a field left to decay holds a floor of noise forever. So
both advects flush anything under a cutoff (10⁻³ heights/s, 10⁻³ density) to an
exact 0. The CPU then works out how long the largest value the field can hold
takes to decay under that cutoff at the current dials: 7.2s at the defaults,
set by velocity. It is capped at 12s whatever the dials say. When that much
time has passed since the last splat, **it clears every target and stops
running the solver.** From then on the sky gets `uFluidOn = 0` and does not
fetch the texture at all. Every fluid term in the shader is then multiplied or
offset by an exact zero, so an idle sky with the fluid on is **the same
pixels** as one with it off, and costs what it did before.

### What each layer does with it

All in `FRAG` in `skyEngine.ts`. `fv` is the velocity (heights/s), `fz` the
density clamped to 1.

| Layer | Response | Dial |
| --- | --- | --- |
| **Every noise sample** (base warp, deck, bank) | read at `uv − fv × fluidWarp`, so what it draws is carried along the wake | `fluidWarp` 0.02 |
| **Base gradient** | the gradient itself is dragged: sampled at `uv − fv × gradientPush`, with the ramp position slid a further `fv.y × gradientPush` on top, and the hue pulled `fz × gradientSwirl` toward the horizon colour. Fades out below 0.7 heights/s | `gradientPush` 0.35, `gradientSwirl` 0.15 |
| **Base gradient, by day** | a heat-shimmer on top of that: the sample point moves a further `fv × 0.01` in the horizon band (bottom 35%), scaled by daylight | — |
| **Golden hour** | the warm horizon lift gains `fz × 0.1` | — |
| **Sun** | nothing. Its glow is positioned in unwarped UV and does not follow the cursor | — |
| **Stars** | the star field is sampled at `p − fv × starPush × 0.05` (heights), so stars are carried along the wake; brightness and twinkle amplitude × `1 + fz × starGlow`. The whole block is skipped by day | `starPush` 0.6, `starGlow` 1.5, `starSize` 2.0 |
| **Moon** | its halo gains `fz × 0.3` where the wake passes it | — |
| **Clouds** | coverage `cd *= 1 − fz × cloudPart` (in fog, by `fogPart`: see below); the lit/shadow sample is read a further `2 × fluidWarp` upstream, so the shading slides across the shapes and the deck looks blown | `cloudPart` 0.5 |
| **Fog** | `fd *= 1 − fz × fogPart`; the bank's drift gains `fv × 0.05` | `fogPart` 0.7 |
| **Stars behind cloud or fog** | where the wake has parted the deck or bank, the stars behind it show through by the same fractions | `cloudPart`, `fogPart` |
| **Rain** | streak coordinates bent by `fv × rainBend × 0.1`, capped at 0.03 heights | `rainBend` 0.15 |
| **Lightning** | unchanged | — |

Five things here differ from the spec as first written. Each was found by
looking at the result or measuring it:

- **Sign.** "uv += fluid.xy × k" moves a texture *against* the flow. Every
  sample is read upstream (`−`), so a cloud in the wake goes where the wake goes.
- **The stars' push fades out below 0.8 heights a second, and is gone
  below 0.3** (`smoothstep(0.3, 0.8, |fv|)`). A star is one or two device
  pixels, and a wake does not simply decay: at `fluidCurl` 20 the vorticity
  confinement keeps its eddies turning at about 0.15 heights/s for as long as
  the field is awake (read back from the texture: 3.3 at the end of a sweep,
  0.36 at 1.6s, then a floor of ~0.15 until it sleeps). Without the fade that
  floor holds a fifth of the stars a pixel off their place for seven seconds.
  With it, they are all back within 3s (measured below). Mid-sweep, where the
  wake is fast, the fade does nothing.
- **In fog, a window goes through the deck as well.** The fog condition carries
  a 0.9-coverage cloud deck (WMO 45's own figure), so a window in the bank that
  only thinned the fog showed more grey: the fog and the deck behind it are
  within a few levels of each other. In fog the deck is the top of the same
  marine layer, so the wake parts it by `fogPart` too
  (`mix(cloudPart, max(cloudPart, fogPart), uFog)`), and the window opens
  onto sky.
- **The gradient's push takes the stars' fade, and needs it more.** The same
  `smoothstep` window (0.2 → 0.7 heights/s here, against the stars' 0.3 → 0.8)
  for the same reason: the vorticity floor of ~0.15 heights/s outlives the
  sweep by seconds. On a star that floor is worth a pixel. On the gradient, at
  `gradientPush` 0.35 and with the ramp position sliding by it a second time,
  it is worth a tenth of the ramp. Measured on the dusk sweep below, without
  the fade: **0.42% of the frame is still 8 levels out at 3s, 0.52% at 5s and
  0.49% at 7s** — it does not decay, it plateaus, and then the field sleeps and
  it snaps. With the fade it is 0.00% at all three. The fade also keeps the
  effect *where the cursor went*: the same sweep moves about **47%** of the
  frame without it and **30%** with it, and the difference is a weak wash over
  everything else. Mid-sweep, where the wake is fast, it does nothing.
- **Rain reads the gust, not the eddies.** A streak follows the curve the bend
  draws, so what leans a drop is how fast the bend *changes*, not how big it
  is. Read per pixel at the full `fv × 0.15`, the solver's fine curl tied every
  streak in the wake into a knot. The bend is now a four-tap average a tenth
  of the height across, at a tenth of the scale, capped. The drops lean and
  kink around the cursor, and the rest of the rain is left alone.

### The gradient is paint

`fluidWarp` moves a *noise sample*: the fbm that makes the gradient look
painted is read 0.02 heights upstream, and what you see is the texture sliding.
`gradientPush` is a different thing and seventeen times the size. Where the
gradient is what is on screen — a clear or partly sky at any hour, and the sky
above the bank in fog — the wake drags **the colour itself**:

- the gradient is sampled at `uv − fv × gradientPush`, so the paint moves;
- the position along the zenith→horizon ramp that point lands on slides by
  `fv.y × gradientPush` **again**, so the drag also re-reads the palette
  further down it. The two compound, and that is what makes a sweep carry the
  warm horizon a long way rather than nudging it;
- and the hue drifts `fz × gradientSwirl` toward the horizon colour wherever
  the wake has been, which is the stain it leaves behind.

A fast diagonal at dusk therefore pulls the orange horizon up through the
purple zenith in a plume, and the plume relaxes as the field decays.
`docs/sky/fluid/gradient-mid-sweep.webp` is one, mid-sweep.

**This is not what air does.** Air carries water and dust; it does not carry
the colour of the sky, which is scattering and is a function of where you are
looking. Every other layer's response to the wake was argued from "what would
moving air do to this", and this one is argued from ponpon-mania: it is the
reference's look, on purpose, and the one place in this sky where the picture
wins over the weather.

It needs no gate. The gradient is layer 1 and the deck, the bank and the rain
composite over it, so an overcast sky has none of this without a line of code
saying so — and the check below says so in pixels: with the field asleep, the
**eighteen daylit states are 0.000%** different from the sky before this
change. The six nights are the ones that differ, and they differ by their
stars, not by this.

### Bigger stars

The star was a disc of radius 0.10 of its cell — about 1.2 device pixels at
1440×900 @2x — with a hard `smoothstep` edge. At that size it is a dot, and
the eye reads a dot as a speck of dirt rather than as light. Three changes,
all in the same expression:

- **`starSize`**, 2.0, scales the radius. The shipped value is twice what it
  was.
- **Two tiers.** A bright core over the inner 45% of the disc, then a faint
  halo out to the full radius:
  `mix(smoothstep(sz,0,d)×0.45, 1.0, smoothstep(0.45·sz,0,d))`. The **peak is
  exactly what it was** — what grew is the light around a star, not the star.
  That is deliberate, and it is why the letterhead barely moved (below).
- **±35% per star**, from a fourth hash of the cell, so a field of them is not
  a field of identical dots.

`docs/sky/fluid/stars-at-rest.webp` is the same clear night at the old size
(left) and the shipped one (right), 1:1 and brightened, with the field asleep.
It is written by section 2 of `npm run verify:sky --shots`, which is also the
section that then sweeps them.

The one thing that had to be held: the shape is evaluated against its **own
cell only**, so a disc that reached past the cell edge would be cut off square.
The jitter is therefore clamped to `0.5 − sz`, and a big star wanders a little
less than a small one. The alternative is sampling the eight neighbouring
cells, which is thirty-two more hashes per pixel on a full-screen pass, for a
lattice nobody can see at 2.8% density.

The night also got more stars before this, and that had nothing to do with the
wake either: the density threshold went from 0.978 to 0.972 and star brightness
×1.3 (Uko wants them more prominent). See the idle check below.

**What it does to the letterhead.** The contrast probe measures the brightest
pixel under the band, and on a clear night that pixel is a star.
`scripts/sky-contrast.mjs`, against `main` on the same machine:

| clear night | before the wake | + the wake (09-21) | + bigger stars (09-22) | `main` re-run (09-22) |
| --- | --- | --- | --- | --- |
| 1728×996 @2x | 10.20:1 | 9.60:1 | **9.34:1** | 9.60:1 |
| 1440×900 @2x | 9.75:1 | 9.16:1 | **9.16:1** | 9.10:1 |

**Doubling the star did not cost the letterhead anything worth measuring**, and
the reason is that the two-tier falloff left the *peak* alone: the brightest
pixel under the band is as bright as it was, there is simply more light around
it, and the probe reads the brightest pixel. The last column is `main` measured
in the same session as the fourth, and the two differ by less than the twinkle
phase does between runs — at 1440 the branch reads *higher* than `main`.

**No cap in the strip band was needed.** The worst state anywhere is still
partly / overcast / fog noon at **7.65:1** — a ceiling, not a sample, because
the lit top of the deck clips to white — and all 24 states are over 7:1 at both
viewports. A clear night is nowhere near binding.

#### …and the day stopped paying for them

The star block ran on **every pixel of every frame**, at noon included, and
every term in it is multiplied by `nightAmt`. It is now inside
`if (nightAmt > 0.0)`, which is a uniform branch and the same trick the cloud
deck and the fog bank already use. It is what pays for the bigger star, and it
pays several times over: at 5K @2x with the fluid awake, median p95 of three
600-frame runs, 2026-09-22, each figure paired with a run of `main` in the
same session:

| 5K @2x, fluid awake | `main` | + stars & gradient | + the night branch |
| --- | --- | --- | --- |
| clear noon | 3.65 | 3.61 | **1.82** |
| partly noon | 4.22 | 4.42 | **3.78** |
| fog noon | 5.50 | 5.76 | **5.14** |
| storm noon | 6.16 | 6.34 | **5.83** |

The two effects cost about **0.2ms**; the branch gives back 0.4 to 1.8. Read
the columns against each other and not against
[the table above](#the-budget--6ms-sky-incl-fluid): that session had three dev
servers and a browser on the machine, and `main`'s own storm measures over
6ms in it, which is exactly why the comparison is paired. The number that
decides is section 4 of `npm run verify:sky`, which ends a render pass the way
a present does rather than with a `finish`: **worst p95 4.89ms**, fog at 5K,
against 5.75 before.

The branch has to be free of pixels as well as of cost, because
`mix(sky, col, a)` with `sky == col` is not *obviously* the identity in
floating point. It is: the eighteen daylit states measure **0.000%** against
`main` with it in, the same as without it — and dawn and dusk take the branch
too, because `nightAmt` is already 0 at both.

### The page disturbs the sky

Anything on the page that moves across the screen pushes air through the sky
behind it. `skyStage.ts` has three ways in, all scaled by `pageSplat` (0
turns the page's wake off and leaves the pointer's):

- `skySplat(x, y, vx, vy)`: a point in CSS px and its velocity in px/s.
- `skyWake(key, points)`: for something that only knows where it *is*. Pass
  the same key each frame; each point splats with the velocity since the last
  call. A key unseen for 100ms starts over rather than splatting the jump.
- `skyWakeLeading(key, edges)`: several candidate edges, of which only the one
  furthest along the direction of travel splats.

| Motion | Where | What splats |
| --- | --- | --- |
| **Detail Prev/Next slide** | `DetailView` ticker | the hero-slot card's two side edges at three heights, at the strip's speed (`−dpos × panelStep / dt`) |
| **Grid drag** | `usePanController` ticker, drag branch | the card under the finger (`cardHitAt`), its four edge midpoints, keyed by absolute cell so moving onto the next card starts a new wake |
| **Portfolio sheet roll-in and tear-off** | `Scroller.apply`, after `canvas.show` | the sheet's leading edge, top or bottom, at u = 0.1 / 0.5 / 0.9, through `sheetPoint`, which is the CPU port of the vertex shader's bend. So the wake follows the edge as it is drawn, rolled or folded |
| **Reader doorway open/close** | `useDoorwayMotion` frame | the neighbours drifting out on CLEAR (and back in on the way out), and the cover's free edge swinging over the spine on OPEN |

The pointer's splat and the page's are the same splat, so they add. A card
dragged under the cursor gets both.

### What turns it off

- **Reduced motion.** The solver does not run, splats are dropped, and the
  field is cleared, so every effect is zero. Checked: a sweep under
  `prefers-reduced-motion` changes **0** pixels, and the field never wakes.
- **`fluidOn` off.** The same as reduced motion.
- **A hidden tab.** The existing rule: the loop stops, and the solver with it.
- **No half-float render targets.** `createFluid` returns null and the sky
  has no wake. Nothing else changes.

### The debug view

**F** (a DialKit shortcut on the `fluidDebug` toggle, dev only) draws `tFluid`
in the bottom-left quarter. Red and green are velocity around mid-grey, and
blue is density. The branch is compiled into the dev shader only
(`#define FLUID_DEBUG`).

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

`node scripts/sky-perf.mjs [--fluid]`, with the dev server up, and section 4 of
`npm run verify:sky`, which runs the same benchmark at every signed-off size.
It draws batches of ten frames and closes each batch with a one-pixel
`readPixels`, which the driver cannot answer until every queued draw has landed.
`drawArrays` only queues, so timing a single call would only measure how fast
the main thread talks to the driver.

### The table that used to be here was a tenth of the truth

It reported a worst p95 of **1.12ms** at 5K @2x, and that number was wrong.
The sky is one opaque full-screen triangle. A tile-based GPU (every Apple one)
removes hidden surfaces *before* it shades, so ten of those queued into one
render pass shade **once**, and the benchmark divided that one frame's cost by
ten. The real loop does not work that way: each frame is presented, so each
frame is its own pass and pays for every pixel. The fluid is what exposed it.
Its passes break the sky's render pass every frame, so the first honest
"fluid on" number looked like the fluid costing 5ms. It was the sky's own
cost, finally being counted.

The benchmark now invalidates the framebuffer between frames, which ends the
pass the way a present does. Measured that way, 2026-09-21 on an Apple M1 Max,
*before* any of the fluid work, the sky at 5K @2x costs **5.0ms p50 and
6.1ms p95 in fog**, and 1.8ms / 2.4ms at 1440×900 @2x.

### The budget: ≤ 6ms, sky incl. fluid

**≤ 6 ms for the whole sky, including the fluid, at p95, at every signed-off
size and at 5K @2x.** It is checked in section 4 of `npm run verify:sky` and by
`sky-perf.mjs --fluid`. Two things keep it there, and neither changes a pixel:

1. **Layers that cannot show are not computed.** No cloud deck at all when
   coverage is 0 (a uniform branch), no shading sample where a pixel has no
   cloud, no fog bank when there is no fog, and — since the stars grew —
   **no star field by day**. Each skips exactly the work a `mix` would have
   multiplied by zero, so the picture is identical. It is what makes a clear
   sky cheap, and the star branch alone takes a clear 5K noon from 3.6ms to
   1.8 (see [the day stopped paying for them](#and-the-day-stopped-paying-for-them)).
2. **The solver in 17 passes, not 30** (see [The solver](#the-solver)). Its
   cost was the passes, not the shading. Awake, it adds **0.3–0.6ms** to a
   frame, because most of it overlaps the sky's shading. Asleep, it adds
   nothing.

**The whole sky at full resolution**, re-measured 2026-09-21 on an Apple M1
Max with the cap off (as shipped). Each cell is the *median p95 of three
600-frame runs, [min–max]*, in ms, with the fluid awake and splatting every
frame. Fog is always the worst condition.

| viewport | backing store | sky alone | sky incl. fluid |
| --- | --- | --- | --- |
| 1728×996 @2x | 3456×1992 | 2.68 [2.57–2.75] | **3.31** [3.25–3.33] |
| 2560×1440 @2x | 5120×2880 | 5.40 [5.40–5.41] | **5.75** [5.74–5.76] |

The full table for that 5K row, median p95 (p50):

| | clear | partly | fog | storm |
| --- | --- | --- | --- | --- |
| sky alone | 1.91 (1.86) | 3.88 (3.84) | 5.40 (5.34) | 4.74 (4.69) |
| sky incl. fluid | 2.56 (2.27) | 4.43 (4.14) | 5.75 (5.65) | 5.54 (5.13) |

**Every noon figure in the two tables above predates the star branch** and is
now high by 0.4–1.8ms; the 2026-09-22 paired run is
[here](#and-the-day-stopped-paying-for-them), and the checked worst is 4.89ms.
What the tables are still good for is the shape — fog is the worst condition,
the cost is per pixel, and 5K is where it is spent.

Worst **5.75ms of 6**: fog at 5K @2x with the fluid awake. At 1440×900 @2x
(5.2 MP) the worst is 2.77ms. **The margin at 5K is thin, and the machine has
to be quiet to measure it.** The GPU also drives the display. One run taken
while Spotlight was indexing put the same 5K fog frame at 8.9ms, *with or
without* the fluid, and the next run put it at 6.1. That is why the check takes
the median of three runs rather than trusting one.

### The lever: `skyMaxMegapixels`

**Off (0) by default.** The sky's cost is per pixel and nothing else, so on a
slower GPU the lever is the backing store. Set it and, above that many million
pixels, the store is scaled down to the cap and the compositor scales it up.
The sky is soft noise and the grain covers the softening; the stars are what
it costs, because they are a pixel or two and come out softer. What it does
at 5.5 on the machine above, measured when it briefly shipped at that value:

- 1440×900 @2x (5.2 MP) is untouched.
- 1728×996 @2x draws at 0.89 linear.
- 5K @2x draws at 0.61 (3,127×1,759), and its foggy frame drops from 5.75ms
  to 2.46ms.

`skyResolution` is the other lever: a flat scale, rather than a ceiling.

`storm` is no longer the cheapest condition. The old table said it was, and
that came from the same artifact.

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

### One column at a time

The six **night** frames were re-shot on 2026-09-22 for
[the bigger stars](#bigger-stars):

    node scripts/sky-sheet.mjs --times night

`--times` exists because a full run `rm -rf`s the directory and re-renders all
twenty-four, and the eighteen frames that had nothing to do with the change
would have come back a few levels different for nothing but a new noise phase —
eighteen files of diff saying nothing, in a review whose whole job is to make
one difference visible. A partial run does not wipe. The other eighteen are
still the 2026-09-20 sheet, and nothing in this change touches a daylit pixel
(the [idle check](#checking-the-wake) puts all eighteen daylit states at
0.000% against `main`).

Zenith luma of the six, this run: clear 40.6, partly 39.3, cloudy 46.5,
fog 46.2, rain 43.3, storm 31.8. Night still measures **27.8%** of noon's mean
luminance against `pv-verify`'s 35% bar — the same figure `main` measures,
because the peak star brightness did not change and the discs cover about a
third of a percent of the frame.

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

## Checking the wake

`npm run verify:sky` (`scripts/sky-fluid-verify.mjs`), with the dev server up.
`--before <url>` points at a dev server of the branch this came from, and
`--shots docs/sky/fluid` writes the captures. Every claim is made in
pixels, with the shader's clock **pinned** (`__skyPinTime`), so that two
captures differ only by what the wake did, not by the drift, the twinkle, the
grain or a flash. Run 2026-09-22, Apple M1 Max, 1440×900 @2x:

| # | Check | Result |
| --- | --- | --- |
| 1 | 24 states, sim on, a sweep put through and left to decay, against sim off | **0.000%** of pixels differ in every state; the solver asleep after 7.2–7.3s every time |
| 1 | …and against the sky before this change (`main` under reduced motion, both clocks at 0) | worst **0.255%** (clear night, the bigger stars); **every one of the twenty daylit states is 0.000%** — the gradient push leaves nothing behind |
| 2 | a sweep across a clear night | **33.9%** of 3,936 star pixels moved; **0.0%** still moved at 3s |
| 3 | fog at night, a 200px disc at the cursor | **−27.5%** luminance; back to baseline at 3s |
| 3 | fog at noon / dusk (reported, see below) | −8.6% / −9.5%; both back at 3s |
| 4 | frame time, fluid awake, five sizes, cap off as shipped | worst p95 **4.89ms**, fog at 5K @2x, against 5.75 before (see [Frame time](#frame-time)) |
| 5 | reduced motion, a sweep and a direct `splat` | **0.000%** differ; the field never wakes |
| 6 | pointer strength 0: detail Next, grid drag, sheet roll-in, reader doorway | each wakes the field on its own |
| 7 | a diagonal sweep across a clear **dusk** | **30.6%** of the frame moved by ≥ 8 levels; **0.00%** still shifted at 3s |

Check 7 is at dusk because dusk is the state that can answer it. Its ramp runs
from a deep purple zenith to an orange horizon, so displacing the gradient *is*
a change of colour; the same push at noon, over blue to pale blue, would barely
print. The frame is the denominator: a clear dusk is gradient edge to edge but
for the sun's disc, which is a fraction of a percent of it, and the glow is
added *over* a gradient that moves under it anyway.

Three things about how it measures, each of which was a wrong result first:

- **Every page settles at 150ms**, the ease reduced motion uses. At the shipped
  1500ms the sky is still 5% short of its target 4.5s after a change, and the
  first idle comparison came out 3.8% "different" for exactly that reason.
- **The window is measured AT the cursor, with the field frozen**
  (`__skyHoldFluid`). The air the cursor pushes carries the window along with
  it, so a disc on the path behind the cursor has already closed. A screenshot
  takes the better part of a second, and by the time it lands the window has
  coasted 300px on.
- **"Back within 3s" is one capture after 3s untouched, not a poll.** A 2x
  full-frame screenshot stalls the page's frames while it is taken, and the
  solver's step is capped at 1/30s. A page being photographed continuously
  therefore decays its wake in fewer, slower steps than a page being looked
  at, and polling made the stars look as if they took 5.5s to come back.

**The fog window is asserted at night and reported by day.** The spec asks for
a 15% drop in a 200px disc. At night the lit bank sits over a dark sky and the
window takes 27% off. At noon and dusk the bank is only about 13% brighter
than the sky behind it, so no hole in it, however clean, can take 15% off a
disc. The measured drops (8–10%) are printed rather than asserted, and the
window is plainly there: see `docs/sky/fluid/fog-window.webp`.

## Where this is wired

| File | What it is |
| --- | --- |
| `src/sky/palette.ts` | The hex table and the band blend. The only place a sky colour is written. |
| `src/sky/skyEngine.ts` | The shader, the eased targets, the rAF loop, the lightning envelope, the pointer's splats, the dev readback. |
| `src/sky/fluid.ts` | The wake: the fluid solver, in the sky's context. |
| `src/sky/skyStage.ts` | The one canvas and the claim stack, and `skySplat` / `skyWake` / `skyWakeLeading` for the page. |
| `src/sky/envToTarget.ts` | The mapping: `EnvState` → `SkyTarget`. |
| `src/components/SkyLayer.tsx` | The host. Claims the canvas; feeds the target in; the dev hooks (`__skyPinTime`, `__skyHoldFluid`, `__skyFluidAwake`, `__skySplat`). |
| `src/env/wmo.ts` | WMO code → condition, cloudiness, precipitation. |
| `src/dev/skyPreview.ts` | Dev: what each condition and each time of day means as numbers. |
| `src/dev/EnvReadout.tsx` | Dev: the readout and the override buttons. |
| `scripts/sky-sheet.mjs` | The 24-image contact sheet. |
| `scripts/sky-perf.mjs` | The frame-time table above; `--fluid` for the wake awake. |
| `scripts/sky-fluid-verify.mjs` | `npm run verify:sky`: the wake's checks, and the four captures in `docs/sky/fluid/`. |
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
- **The wake has no direction of its own.** Wind blows the deck, and the
  wake pushes it, but the two do not interact. A gust with the wind and one
  against it part the deck the same way.
- **The fog window cannot reach 15% by day.** See
  [Checking the wake](#checking-the-wake). A daylit bank is too close to the
  sky behind it. If a noon window has to read louder, the lever is the colour
  it opens onto, not `fogPart`.
- **5K @2x has 0.25ms of headroom in fog.** It is inside the 6ms budget on
  an M1 Max and nothing slower has been measured. `skyMaxMegapixels` is the
  lever if it is not inside on something else.
- **Sweep-time letterhead contrast has never been measured.** Every ratio in
  this file and in [portfolio-view.md](portfolio-view.md) is a *still* sky:
  `sky-contrast.mjs` hands the probe a target and reads a settled frame out of
  the back buffer, so **none of the 7.65:1 through 10.77:1 is a measurement of
  the sky with a cursor moving through it.** A wake under the band parts the
  deck there, and since `gradientPush` it can also drag a clear dusk's orange
  horizon up under the type — locally, and for about a second. It mattered less
  when the wake only thinned a deck; at 0.35 it is the open question this
  change leaves, and it is **deliberately not in this change**, because it is a
  new instrument and not a tuning of an old one.

  What it needs: a probe that **splats and reads on the next frame**, sampling
  at the worst phase of a sweep rather than an average one — which means
  driving `__skySplat` directly (a pointer sweep is too slow and too coarse to
  land the peak under the band), pinning the clock, and stepping the phase to
  find the minimum rather than taking one shot. The bar it should be held to is
  the same 7:1. If a state fails it, the lever is still `letterheadScrim` and
  never `groundScrim`; the other lever this change adds is `gradientPush`
  itself.
- **`gradientPush` is the one dial argued from the reference and not the
  weather.** See [The gradient is paint](#the-gradient-is-paint). If the sky
  ever has to justify itself as San Francisco's weather rather than as a
  picture, this is the line that does not.
