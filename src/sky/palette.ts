/**
 * Sky palette — the time-of-day gradient the sky is built on.
 *
 * ONE PAIR OF COLOURS PER BAND: a ZENITH (top of the screen) and a HORIZON
 * (bottom). Everything else the sky draws — the sun, the cloud deck, the fog
 * bank, the rain — is drawn ON TOP of that gradient by the shader, so this
 * table is only ever the empty sky. It used to be four colours per band that a
 * noise field mixed between, with weather applied here as a tint; weather is
 * DRAWN now (see `docs/sky.md`), and a four-colour field has no horizon to hang
 * a sun or a fog bank on.
 *
 * `sunElevation` picks the band by height; `dayPhase` resolves the low-sun band
 * to dawn (rising) or dusk (setting) and is carried as a continuous 0..1 so a
 * flip cross-fades rather than snaps.
 *
 * THE HEX TABLE BELOW IS THE ONLY PLACE A SKY COLOUR IS WRITTEN. The shader
 * takes the blended pair as two uniforms rather than carrying its own copy —
 * the prototype (`docs/prototypes/sky-prototype.html`) hard-codes them in GLSL,
 * and a second copy of a palette is a second thing to edit and a first thing to
 * forget.
 */

/** RGB triplet, each channel 0..1 (sRGB hex decoded, no gamma). */
export type RGB = [number, number, number];

/** The empty sky for one moment: top of screen, bottom of screen. */
export interface SkyGradient {
  zenith: RGB;
  horizon: RGB;
}

/**
 * The replaceable hex table — `[zenith, horizon]` per time band. Swap these
 * freely; nothing downstream (shader included) hard-codes a colour value.
 */
export const PALETTE_FIELDS: Record<'night' | 'dawn' | 'day' | 'dusk', [string, string]> = {
  // Near-black indigo overhead, a deeper blue at the horizon.
  night: ['#050918', '#161e40'],
  // Cool blue overhead over a warm amber horizon.
  dawn: ['#485ca8', '#f6aa70'],
  // SF daylight, and it is BLUE — the old day band was itself a grey.
  day: ['#347cd6', '#c4def5'],
  // Violet overhead over a hot orange horizon.
  dusk: ['#30286e', '#f0764e'],
};

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function toGradient(hexes: [string, string]): SkyGradient {
  return { zenith: hexToRgb(hexes[0]), horizon: hexToRgb(hexes[1]) };
}

const NIGHT = toGradient(PALETTE_FIELDS.night);
const DAWN = toGradient(PALETTE_FIELDS.dawn);
const DAY = toGradient(PALETTE_FIELDS.day);
const DUSK = toGradient(PALETTE_FIELDS.dusk);

/** Elevation where the low-sun (dawn/dusk) band has fully given way to day. */
const DAY_AT = 0.42;
/** Elevation of the low-sun band's peak presence. */
const LOW_AT = 0.15;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function lerpRgb(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}
function lerpGradient(a: SkyGradient, b: SkyGradient, t: number): SkyGradient {
  return { zenith: lerpRgb(a.zenith, b.zenith, t), horizon: lerpRgb(a.horizon, b.horizon, t) };
}
function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * The blended {@link SkyGradient} for an elevation + phase. Continuous in both:
 * `phase` is 0 rising → 1 setting, so the low-sun band is dawn at 0, dusk at 1,
 * and anything between cross-fades (the engine eases a `dayPhase` flip through
 * it rather than snapping the sun across the sky).
 *
 * The night → low-sun ramp is linear and the low-sun → day ramp is smoothed,
 * which is the prototype's curve: sunrise arrives quickly and then the sky
 * takes its time turning blue.
 */
export function skyGradientAt(elevation: number, phase: number): SkyGradient {
  const s = clamp01(elevation);
  const p = clamp01(phase);
  const low = lerpGradient(DAWN, DUSK, p);
  if (s <= 0) return NIGHT;
  if (s < LOW_AT) return lerpGradient(NIGHT, low, s / LOW_AT);
  if (s < DAY_AT) {
    const t = (s - LOW_AT) / (DAY_AT - LOW_AT);
    return lerpGradient(low, DAY, t * t * (3 - 2 * t));
  }
  return DAY;
}

/** Soft grey the cloud deck averages out to — the fallback's stand-in for it. */
const CLOUD_GREY: RGB = [0.72, 0.75, 0.8];

/**
 * CSS for the WebGL-less fallback, and for a sky host that has not been handed
 * the shared canvas yet: the zenith → horizon gradient, plus a flat cloud-grey
 * wash proportional to `cloud`. Not a picture of the sky — the right colours in
 * the right places, so nothing ever paints blank or off-palette.
 */
export function skyFallbackCss(gradient: SkyGradient, cloud: number): string {
  const css = (c: RGB, a = 1) =>
    `rgba(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)}, ${a})`;
  const wash = clamp01(cloud) * 0.85;
  return (
    `linear-gradient(${css(CLOUD_GREY, wash)}, ${css(CLOUD_GREY, wash)}), ` +
    `linear-gradient(to bottom, ${css(gradient.zenith)}, ${css(gradient.horizon)})`
  );
}

/**
 * The fallback's colour at one height — `y` 0 at the top of the screen, 1 at
 * the bottom — as 0..255 sRGB: the same gradient and cloud wash
 * {@link skyFallbackCss} paints. What the chrome's paper takes its hue from
 * before the first read-back of the live sky lands, and always where there is
 * no WebGL2 (src/chrome/useSkyChrome.ts).
 */
export function skyFallbackColorAt(gradient: SkyGradient, cloud: number, y: number): [number, number, number] {
  const base = lerpRgb(gradient.zenith, gradient.horizon, clamp01(y));
  const c = lerpRgb(base, CLOUD_GREY, clamp01(cloud) * 0.85);
  return [c[0] * 255, c[1] * 255, c[2] * 255];
}
