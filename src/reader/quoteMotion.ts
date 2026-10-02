/**
 * The quote's life around the morph (docs/reader.md, "Chapter-break quotes"),
 * as pure functions of time: the hover grow, the breathing guide, the wand's
 * tap flick and its colour. The player (quotePlayer.ts) samples them each frame.
 *
 *   hover grow   the letters ease to `hoverScale` about the quote's centre over
 *                500ms on cubic-bezier(.22,.8,.24,1), and back on leave —
 *                always from wherever they are.
 *   breathing    until the first tap on the page, ×`breatheScale` once every
 *                `breathePeriodMs`: a half-sine over the first 55% of the loop,
 *                then rest.
 *   flick        on a tap the wand turns a further −22°, a sine over 420ms.
 *   turn ease    a turn that starts with the letters off ×1 (grown, mid-breath)
 *                eases them to ×1 over 180ms as the page lifts (in-out, so no
 *                frame steps more than a sliver of the way).
 *   colour       while a morph runs the wand cycles `wandPalette`, one loop per
 *                `colorCycleMs`, each step blended in OKLab; after it, it eases
 *                back to the palette's first colour in OKLab (τ 220ms).
 */
import { cubicBezier } from './jump';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export const HOVER_MS = 500;
export const TURN_EASE_MS = 180;
export const TURN_EASE = cubicBezier([0.4, 0, 0.2, 1]);

/** The letters' scale `ms` into a turn that started with them at `from`. */
export function turnEaseAt(from: number, ms: number): number {
  return from + (1 - from) * TURN_EASE(clamp01(ms / TURN_EASE_MS));
}
export const HOVER_EASE = cubicBezier([0.22, 0.8, 0.24, 1]);
/** The share of a breathing loop that moves; the rest is still. */
export const BREATHE_ACTIVE = 0.55;
export const FLICK_DEG = -22;
export const FLICK_MS = 420;
/** The wand's colour settling back after a morph, and its position following
 *  the pointer: exponential time constants. */
export const COLOR_SETTLE_TAU_MS = 220;
export const FOLLOW_TAU_MS = 28;

/** A scale tween from `from` to `to` starting at `t0`. */
export interface ScaleTween {
  from: number;
  to: number;
  t0: number;
}

export function tweenAt(tw: ScaleTween, now: number): number {
  const p = clamp01((now - tw.t0) / HOVER_MS);
  return tw.from + (tw.to - tw.from) * HOVER_EASE(p);
}

export const tweenDone = (tw: ScaleTween, now: number): boolean => now - tw.t0 >= HOVER_MS;

/** The breathing scale `ms` into the loop that started at 0. */
export function breathAt(ms: number, periodMs: number, scale: number): number {
  if (periodMs <= 0 || scale === 1) return 1;
  const phase = (((ms % periodMs) + periodMs) % periodMs) / periodMs;
  if (phase >= BREATHE_ACTIVE) return 1;
  return 1 + (scale - 1) * Math.sin((Math.PI * phase) / BREATHE_ACTIVE);
}

/** The flick's extra rotation `ms` after the tap (0 outside it). */
export function flickAt(ms: number): number {
  if (ms < 0 || ms >= FLICK_MS) return 0;
  return FLICK_DEG * Math.sin((Math.PI * ms) / FLICK_MS);
}

// ── colour, in OKLab ─────────────────────────────────────────────────────

export type Lab = [number, number, number];

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** `#rrggbb` → OKLab (Björn Ottosson's matrices). */
export function hexToOklab(hex: string): Lab {
  const n = parseInt(hex.replace('#', ''), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => toLinear(v / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLab → `#rrggbb`, clipped to sRGB. */
export function oklabToHex([L, a, b]: Lab): string {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return `#${rgb.map((c) => Math.round(clamp01(toGamma(c)) * 255).toString(16).padStart(2, '0')).join('')}`;
}

export const mixLab = (a: Lab, b: Lab, t: number): Lab => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** The palette `ms` into a morph: each colour in turn, blended in OKLab, one
 *  full loop (back to the first) per `cycleMs`. */
export function paletteAt(palette: Lab[], ms: number, cycleMs: number): Lab {
  const n = palette.length;
  if (n === 0) return [1, 0, 0];
  if (n === 1 || cycleMs <= 0) return palette[0];
  const pos = ((((ms % cycleMs) + cycleMs) % cycleMs) / cycleMs) * n;
  const i = Math.floor(pos) % n;
  return mixLab(palette[i], palette[(i + 1) % n], pos - Math.floor(pos));
}

/** One step of an exponential ease toward `to` over `dt` ms. */
export function settleLab(from: Lab, to: Lab, dt: number, tau = COLOR_SETTLE_TAU_MS): Lab {
  return mixLab(from, to, 1 - Math.exp(-Math.max(0, dt) / tau));
}

export const labDistance = (a: Lab, b: Lab): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** One step of the wand following the pointer (τ FOLLOW_TAU_MS). */
export function follow(from: number, to: number, dt: number, tau = FOLLOW_TAU_MS): number {
  return from + (to - from) * (1 - Math.exp(-Math.max(0, dt) / tau));
}
