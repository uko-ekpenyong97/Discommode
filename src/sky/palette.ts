/**
 * Sky palette — time-of-day color anchors, blended by sunElevation.
 *
 * PLACEHOLDER SF-ish colors — real tuning is a later session. The palette is
 * structured as an easily-replaced table of hex anchors per time band so the
 * colors can be swapped without touching the blend logic or the shader.
 *
 * `sunElevation` (0 = deep night, 1 = high noon; from the Phase 11 EnvState)
 * drives which band is active and blends continuously between adjacent bands.
 * Because a single elevation scalar is symmetric (it cannot tell a rising sun
 * from a setting one), dawn and dusk share the low-sun region for now — the
 * `dusk` anchors are kept in the table for when a future rising/setting signal
 * is added. The elevation→band placement matches the spec: 0.15–0.35 blends
 * dawn → day.
 */

/** Linear RGB-ish triplet, each channel 0..1 (sRGB hex decoded, no gamma). */
export type RGB = [number, number, number];

export interface SkyPalette {
  /** Color at the bottom of the sky (the horizon). */
  horizon: RGB;
  /** Color at the top of the sky (the zenith). */
  zenith: RGB;
  /** Sun/glow disc color. */
  sun: RGB;
}

interface HexPalette {
  horizon: string;
  zenith: string;
  sun: string;
}

/** The replaceable hex table — one entry per time band. */
export const PALETTE_HEX: Record<'night' | 'dawn' | 'day' | 'dusk', HexPalette> = {
  night: { horizon: '#1a2138', zenith: '#05060d', sun: '#2a3a66' },
  dawn: { horizon: '#e8a26b', zenith: '#3a4a78', sun: '#ffd9a0' },
  day: { horizon: '#bcd3ea', zenith: '#4f86c6', sun: '#fff6e0' },
  // Kept for a future rising/setting signal; not on the elevation axis yet.
  dusk: { horizon: '#f0895d', zenith: '#2c3e63', sun: '#ffb27a' },
};

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** A band anchored at a sunElevation position. */
interface Band {
  at: number;
  pal: SkyPalette;
}

function toBand(at: number, hex: HexPalette): Band {
  return {
    at,
    pal: { horizon: hexToRgb(hex.horizon), zenith: hexToRgb(hex.zenith), sun: hexToRgb(hex.sun) },
  };
}

/**
 * Bands along the sunElevation axis (ascending). night at the bottom, dawn the
 * low-sun twilight, day from 0.35 up — so 0.15–0.35 blends dawn → day.
 */
const BANDS: Band[] = [
  toBand(0.0, PALETTE_HEX.night),
  toBand(0.15, PALETTE_HEX.dawn),
  toBand(0.35, PALETTE_HEX.day),
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function lerpRgb(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

/**
 * The blended {@link SkyPalette} at a given sunElevation. Continuous everywhere:
 * clamps to the end bands outside the range, linearly blends adjacent bands
 * inside it.
 */
export function paletteAt(elevation: number): SkyPalette {
  if (elevation <= BANDS[0].at) return BANDS[0].pal;
  const last = BANDS[BANDS.length - 1];
  if (elevation >= last.at) return last.pal;
  for (let i = 0; i < BANDS.length - 1; i++) {
    const lo = BANDS[i];
    const hi = BANDS[i + 1];
    if (elevation >= lo.at && elevation <= hi.at) {
      const t = (elevation - lo.at) / (hi.at - lo.at);
      return {
        horizon: lerpRgb(lo.pal.horizon, hi.pal.horizon, t),
        zenith: lerpRgb(lo.pal.zenith, hi.pal.zenith, t),
        sun: lerpRgb(lo.pal.sun, hi.pal.sun, t),
      };
    }
  }
  return last.pal;
}

/** Vertical screen position (0 = bottom, 1 = top) of the sun for an elevation. */
export function sunScreenY(elevation: number): number {
  // Rises from just above the horizon at twilight to high near noon.
  const t = Math.min(Math.max(elevation, 0), 1);
  return lerp(0.22, 0.82, t);
}

/** Sun visibility 0..1 — fades out into deep night, full once well up. */
export function sunOpacity(elevation: number): number {
  // smoothstep(0.05 → 0.22): no sun at night, full sun once clear of twilight.
  const t = Math.min(Math.max((elevation - 0.05) / (0.22 - 0.05), 0), 1);
  return t * t * (3 - 2 * t);
}

/** CSS `linear-gradient` for the WebGL-less fallback, from a palette. */
export function gradientCss(pal: SkyPalette): string {
  const css = (c: RGB) =>
    `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;
  return `linear-gradient(to top, ${css(pal.horizon)} 0%, ${css(pal.zenith)} 100%)`;
}
