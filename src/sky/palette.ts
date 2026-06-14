/**
 * Sky palette — time-of-day color *fields*, blended by sunElevation + dayPhase,
 * then modified by weather.
 *
 * Phase 12b model: each time band holds a SET of 4 field colors (not a
 * horizon/zenith pair). The fragment shader flows noise to mix between them, so
 * the screen reads as drifting regions of color. PLACEHOLDER SF-ish colors —
 * trivially editable here for a future tuning session.
 *
 * `sunElevation` picks the band by height; `dayPhase` resolves the low-sun band
 * to dawn (rising) or dusk (setting). Weather (fog / cloud / storm) is applied
 * on top as continuous color modifiers — fog is the SF hero state.
 */

/** RGB triplet, each channel 0..1 (sRGB hex decoded, no gamma). */
export type RGB = [number, number, number];

/** Four field colors per band — the set the shader mixes across the screen. */
export type FieldColors = [RGB, RGB, RGB, RGB];

/**
 * The replaceable hex table — one SET of 4 field colors per time band. Swap
 * these freely; nothing downstream hard-codes color values.
 */
export const PALETTE_FIELDS: Record<'night' | 'dawn' | 'day' | 'dusk', [string, string, string, string]> = {
  // Cool deep blues / indigos.
  night: ['#0b1026', '#161d44', '#241a4e', '#070b1e'],
  // Warm rose / amber over a cool base.
  dawn: ['#e8956b', '#f0b585', '#a86a8e', '#4a4f86'],
  // Soft desaturated blue-grays (SF daylight).
  day: ['#a6b8c8', '#c2cedb', '#8fa6ba', '#cdd7e0'],
  // Warm orange / violet.
  dusk: ['#e8825d', '#cf6478', '#7d4a92', '#33285c'],
};

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function toField(hexes: [string, string, string, string]): FieldColors {
  return [hexToRgb(hexes[0]), hexToRgb(hexes[1]), hexToRgb(hexes[2]), hexToRgb(hexes[3])];
}

const NIGHT = toField(PALETTE_FIELDS.night);
const DAWN = toField(PALETTE_FIELDS.dawn);
const DAY = toField(PALETTE_FIELDS.day);
const DUSK = toField(PALETTE_FIELDS.dusk);

/** Elevation where the low-sun (dawn/dusk) band has fully given way to day. */
const DAY_AT = 0.35;
/** Elevation of the low-sun band's peak presence. */
const LOW_AT = 0.15;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function lerpRgb(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}
function lerpField(a: FieldColors, b: FieldColors, t: number): FieldColors {
  return [lerpRgb(a[0], b[0], t), lerpRgb(a[1], b[1], t), lerpRgb(a[2], b[2], t), lerpRgb(a[3], b[3], t)];
}
function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * The blended {@link FieldColors} for an elevation + dayPhase. Continuous in
 * elevation; the low-sun band is dawn when rising, dusk when setting (the only
 * place dayPhase matters — at high sun it's day, at zero it's night regardless).
 */
export function fieldColorsAt(elevation: number, dayPhase: 'rising' | 'setting'): FieldColors {
  const low = dayPhase === 'rising' ? DAWN : DUSK;
  if (elevation <= 0) return NIGHT;
  if (elevation >= DAY_AT) return DAY;
  if (elevation < LOW_AT) {
    return lerpField(NIGHT, low, elevation / LOW_AT); // night → dawn/dusk
  }
  return lerpField(low, DAY, (elevation - LOW_AT) / (DAY_AT - LOW_AT)); // dawn/dusk → day
}

// --- Weather modifiers -------------------------------------------------------

/** Continuous weather amounts (0..1), derived from EnvState. */
export interface WeatherAmounts {
  fog: number;
  cloud: number;
  storm: number;
}

/** Dial strengths for the weather modifiers (from config). */
export interface WeatherDials {
  fogDesaturation: number;
  fogLift: number;
  cloudMute: number;
  stormDarken: number;
}

/** Soft gray that fog lifts the field toward (the SF hero look). */
const FOG_GRAY: RGB = [0.8, 0.82, 0.84];

function luma(c: RGB): number {
  return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
}
function desaturate(c: RGB, amt: number): RGB {
  const g = luma(c);
  return [lerp(c[0], g, amt), lerp(c[1], g, amt), lerp(c[2], g, amt)];
}

/**
 * Apply weather modifiers to one color. Order: cloud (mute + slight darken) →
 * storm (darken + cooler) → fog (desaturate + lift toward gray, applied last so
 * it dominates). All amounts continuous, so they cross-fade with the lerped
 * weather scalars.
 */
function applyWeatherColor(c: RGB, w: WeatherAmounts, d: WeatherDials): RGB {
  let out = c;
  // Cloud: mute saturation + slightly darken.
  const cloud = w.cloud * d.cloudMute;
  out = desaturate(out, cloud * 0.7);
  out = [out[0] * (1 - cloud * 0.25), out[1] * (1 - cloud * 0.25), out[2] * (1 - cloud * 0.25)];
  // Storm: darken + shift cooler (lift blue, drop red).
  const storm = clamp01(w.storm);
  const dark = storm * d.stormDarken;
  out = [out[0] * (1 - dark), out[1] * (1 - dark), out[2] * (1 - dark)];
  out = [out[0] * (1 - storm * 0.12), out[1], Math.min(1, out[2] + storm * 0.06)];
  // Fog: desaturate + lift toward soft gray (hero state).
  const fog = clamp01(w.fog);
  out = desaturate(out, fog * d.fogDesaturation);
  out = lerpRgb(out, FOG_GRAY, fog * d.fogLift);
  return [clamp01(out[0]), clamp01(out[1]), clamp01(out[2])];
}

/** Apply weather to a whole field. */
export function applyFieldWeather(field: FieldColors, w: WeatherAmounts, d: WeatherDials): FieldColors {
  return [
    applyWeatherColor(field[0], w, d),
    applyWeatherColor(field[1], w, d),
    applyWeatherColor(field[2], w, d),
    applyWeatherColor(field[3], w, d),
  ];
}

/** CSS for the WebGL-less fallback: a representative soft blend of the field. */
export function fieldFallbackCss(field: FieldColors): string {
  const css = (c: RGB) =>
    `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;
  // A couple of soft radial washes over a base tint — flat-ish but on-palette.
  return (
    `radial-gradient(120% 90% at 25% 20%, ${css(field[1])} 0%, transparent 60%), ` +
    `radial-gradient(120% 90% at 80% 80%, ${css(field[2])} 0%, transparent 60%), ` +
    `${css(field[3])}`
  );
}
