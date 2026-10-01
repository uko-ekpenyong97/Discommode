import { NoColorSpace, Texture, Vector2, Vector4 } from 'three';
import glsl from './drex.glsl?raw';
import dials from './drex.json';
import type { DialValues } from '../dialValues';
import type { CachedCoverDef, Dome, InstanceFrame, Uniforms } from '../types';

/**
 * CARD 03, Drex — Figma "Rive-ReDesign", Frame 5 (node 490:108): the Drex logo
 * on a white 1000 × 1300 frame under three effects, in Figma's order —
 * Risograph, Dither (Bayer 2x2), Hover reveal. Ported from drexCover.js (in
 * ~/Discommode-pages/projects/drex/, with its HANDOFF.md): its two shader passes
 * are drex.glsl, its DEFAULTS are drex.json, and `buildInputCanvas` and
 * `restLight` below are its own.
 *
 * Pass A (risograph + dither) depends only on the size and the dials, so it is
 * a CACHED pass (types.ts, CachedCoverDef): rendered once per size and dial
 * state, and only pass B (the reveal) per frame. The light is where the reveal
 * is, in frame px:
 *
 *   hovered   it follows the pointer, eased by `followEase` per 60 Hz frame (the
 *             instance's dome, dome.ts: its centre eases to the pointer and its
 *             height from the rest light to it)
 *   at rest   `restMode`: 'drift' (default, a slow Lissajous around the mark),
 *             'parked' (on the logo's centre) or 'off' (fully dark)
 *   reduced motion  'parked', `motionSpeed` 0 — `stillValues`, which is also
 *             what `npm run covers` draws the still with
 *
 * Opaque: the frame is white paper, and pass B's result lies on it, so its
 * `coverBackdrop` is 'solid' and the sky does not show through.
 */

export const FRAME = { w: 1000, h: 1300 };
export const LOGO_RECT = { x: 134, y: 233, w: 731, h: 833 }; // node 490:110
export const LOGO_CENTER = { x: 500, y: 649 }; // centre of the visible mark
/** cover-logo.svg, Figma's export of node 490:110 (copied from the masters). */
const LOGO_URL = '/projects/drex/cover-logo.svg';

type Rgba = { r: number; g: number; b: number; a: number };
export interface DrexValues {
  risograph: {
    numInks: number;
    halftoneStyle: string;
    halftoneSize: number;
    screenAngle: number;
    misregistration: number;
    grain: number;
    inkDensityBoost: number;
    colorQuantization: number;
    inputBrightness: number;
    inputContrast: number;
    inputGamma: number;
    inputSaturation: number;
    paperColor: Rgba;
    ink1: Rgba;
    ink2: Rgba;
    ink3: Rgba;
    ink4: Rgba;
    inks5to8: { ink5: Rgba; ink6: Rgba; ink7: Rgba; ink8: Rgba };
  };
  dither: { ditherOn: boolean; ditherLevels: number; ditherBrightness: number; ditherContrast: number };
  reveal: {
    revealRadius: number;
    edgeSoftness: number;
    revealStrength: number;
    displacementAmount: number;
    motionSpeed: number;
    prismaticFringe: number;
  };
  rest: { logoColor: string; restMode: string; driftRadius: number; driftPeriod: number; followEase: number };
}

const HALFTONE_STYLES = ['dots', 'lines', 'diamonds'];

const f = (x = 0) => ({ value: x });
const v2 = () => ({ value: new Vector2() });

function uniformsA(): Uniforms {
  return {
    uInput: { value: null },
    uDims: v2(),
    uInk: { value: new Float32Array(32) },
    uPaper: { value: new Vector4() },
    uHalftone: f(),
    uAngle: f(),
    uMisreg: f(),
    uGrain: f(),
    uNumInks: f(),
    uStyle: f(),
    uBoost: f(),
    uQuant: f(),
    uBright: f(),
    uContrast: f(),
    uGamma: f(1),
    uSat: f(1),
    uDitherOn: f(),
    uLevels: f(2),
    uDBright: f(),
    uDContrast: f(1),
  };
}

function uniformsB(): Uniforms {
  return {
    uTex: { value: null },
    uDims: v2(),
    uTime: f(),
    uMouse: v2(),
    uScale: f(1),
    uRadius: f(),
    uSoft: f(),
    uStrength: f(),
    uDisp: f(),
    uSpeed: f(),
    uFringe: f(),
    uOrigin: v2(),
    uOut: v2(),
    uFlip: f(),
  };
}

const inks = (r: DrexValues['risograph']): Rgba[] => [
  r.ink1,
  r.ink2,
  r.ink3,
  r.ink4,
  r.inks5to8.ink5,
  r.inks5to8.ink6,
  r.inks5to8.ink7,
  r.inks5to8.ink8,
];

/** drexCover.js's `rebuildPrint` uniforms, for a target `w × h` at `s` px per
 *  frame px. */
function printUniforms(values: DialValues, a: Uniforms, w: number, h: number, s: number) {
  const v = values as unknown as DrexValues;
  const r = v.risograph;
  const d = v.dither;
  (a.uDims.value as Vector2).set(w, h);
  const ink = a.uInk.value as Float32Array;
  inks(r).forEach((c, k) => ink.set([c.r, c.g, c.b, c.a], k * 4));
  (a.uPaper.value as Vector4).set(r.paperColor.r, r.paperColor.g, r.paperColor.b, r.paperColor.a);
  a.uHalftone.value = r.halftoneSize * s;
  a.uAngle.value = (r.screenAngle * Math.PI) / 180;
  a.uMisreg.value = r.misregistration * s;
  a.uGrain.value = r.grain;
  a.uNumInks.value = r.numInks;
  a.uStyle.value = Math.max(0, HALFTONE_STYLES.indexOf(r.halftoneStyle));
  a.uBoost.value = r.inkDensityBoost;
  a.uQuant.value = r.colorQuantization;
  a.uBright.value = r.inputBrightness;
  a.uContrast.value = r.inputContrast;
  a.uGamma.value = r.inputGamma;
  a.uSat.value = r.inputSaturation;
  a.uDitherOn.value = d.ditherOn ? 1 : 0;
  a.uLevels.value = d.ditherLevels;
  a.uDBright.value = (d.ditherBrightness - 100) / 200;
  a.uDContrast.value = d.ditherContrast;
}

/** Everything pass A reads from the dials (the inks, the dither, the logo's
 *  colour): a change in any re-renders it. */
const printKey = (values: DialValues) => {
  const v = values as unknown as DrexValues;
  return JSON.stringify([v.risograph, v.dither, v.rest.logoColor]);
};

function hexToRgb(h: string) {
  const n = parseInt(h.replace('#', ''), 16);
  return `rgb(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255})`;
}

/** Composites the logo onto the white 1000x1300 frame at output size.
 *  (drexCover.js's, as it is.) */
export function buildInputCanvas(logoImg: CanvasImageSource | null, w: number, h: number, logoColor: string | null) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d')!;
  x.fillStyle = '#fff';
  x.fillRect(0, 0, w, h);
  const s = w / FRAME.w;
  if (logoImg) {
    const lw = Math.round(LOGO_RECT.w * s),
      lh = Math.round(LOGO_RECT.h * s);
    const l = document.createElement('canvas');
    l.width = lw;
    l.height = lh;
    const lx = l.getContext('2d')!;
    lx.drawImage(logoImg, 0, 0, lw, lh);
    if (logoColor) {
      // recolour (on the logo's own layer) in case the export isn't Grass Field
      lx.globalCompositeOperation = 'source-in';
      lx.fillStyle = hexToRgb(logoColor);
      lx.fillRect(0, 0, lw, lh);
    }
    x.drawImage(l, LOGO_RECT.x * s, LOGO_RECT.y * s, lw, lh);
  }
  return c;
}

/** The dials' rest light, in frame px: drexCover.js's `restLight`, written
 *  into `out` (it is read every frame). */
export function restLight(P: { restMode: string; driftRadius: number; driftPeriod: number }, t: number, out = { x: 0, y: 0 }) {
  if (P.restMode === 'off') {
    out.x = out.y = -10000;
  } else if (P.restMode === 'parked') {
    out.x = LOGO_CENTER.x;
    out.y = LOGO_CENTER.y;
  } else {
    const w = (2 * Math.PI) / P.driftPeriod;
    out.x = LOGO_CENTER.x + P.driftRadius * Math.sin(w * t);
    out.y = LOGO_CENTER.y + P.driftRadius * 0.8 * Math.sin(2 * w * t + 0.6);
  }
  return out;
}

const restAt = { x: 0, y: 0 };

/**
 * The light, frame px, and the reveal's strength, for one draw: the rest
 * light, and the dome's height of the way from it to the dome's centre (the
 * pointer, eased). With restMode 'off' there is no light at rest to move from
 * — it is 10,000 px off the frame — so the light is the pointer and the dome's
 * height fades the reveal in instead. Writes `out`; no allocation.
 */
export function lightAt(rest: DrexValues['rest'], strength: number, t: number, dome: Dome, out: { x: number; y: number; strength: number }) {
  if (rest.restMode === 'off') {
    out.x = dome.amp > 0 ? dome.x : -10000;
    out.y = dome.amp > 0 ? dome.y : -10000;
    out.strength = strength * dome.amp;
    return out;
  }
  const r = restLight(rest, t, restAt);
  out.x = r.x + (dome.x - r.x) * dome.amp;
  out.y = r.y + (dome.y - r.y) * dome.amp;
  out.strength = strength;
  return out;
}

/** Reduced motion's dials, and the still's: parked, and no wobble. */
function stillValues(values: DialValues): DialValues {
  const v = values as unknown as DrexValues;
  return { ...values, reveal: { ...v.reveal, motionSpeed: 0 }, rest: { ...v.rest, restMode: 'parked' } };
}

let reducedQuery: MediaQueryList | null = null;
const reduced = () => (reducedQuery ??= window.matchMedia('(prefers-reduced-motion: reduce)')).matches;
const stills = new WeakMap<DialValues, DrexValues>();
const light = { x: 0, y: 0, strength: 1 };
const ease = { ease: 0.12 };

/** Pass B per draw: the clock, the light and every frame-px dial at the
 *  instance's scale (pass A's: 1 / its frame px per texel). */
function frameUniforms(values: DialValues, _a: Uniforms, b: Uniforms, fr: InstanceFrame) {
  let v = values as unknown as DrexValues;
  if (reduced()) {
    let s = stills.get(values);
    if (!s) stills.set(values, (s = stillValues(values) as unknown as DrexValues));
    v = s;
  }
  const s = 1 / fr.rtUnits;
  const rv = v.reveal;
  lightAt(v.rest, rv.revealStrength, fr.t, fr.dome, light);
  b.uTime.value = fr.t;
  (b.uMouse.value as Vector2).set(light.x * s, light.y * s);
  b.uScale.value = s;
  b.uRadius.value = rv.revealRadius * s;
  b.uSoft.value = rv.edgeSoftness * s;
  b.uStrength.value = light.strength;
  b.uDisp.value = rv.displacementAmount * s;
  b.uSpeed.value = rv.motionSpeed;
  b.uFringe.value = rv.prismaticFringe * s;
}

/** The logo, decoded once (an SVG: drawn at whatever size pass A is). */
let logo: Promise<HTMLImageElement> | null = null;
function loadLogo(): Promise<HTMLImageElement> {
  logo ??= new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`drex: ${LOGO_URL} did not load`));
    img.src = LOGO_URL;
  });
  return logo;
}

/** The logo as an asset. Never uploaded: pass A's input is built from it per
 *  size (`printInput`), and the cached renderer uploads that. */
async function assets(): Promise<Record<string, Texture>> {
  const t = new Texture(await loadLogo());
  t.colorSpace = NoColorSpace;
  return { logo: t };
}

export const drex: CachedCoverDef = {
  id: 'drex',
  passA: 'cached',
  frame: FRAME,
  glsl,
  dials,
  coverBackdrop: 'solid',
  uniformsA,
  uniformsB,
  assetKey: () => 'logo',
  assets,
  bind: () => {},
  domeMotion: (v) => {
    ease.ease = (v as unknown as DrexValues).rest.followEase; // read every frame: no allocation
    return ease;
  },
  frameUniforms,
  stillValues,
  printKey,
  printInput: (values, w, h, a) => {
    const img = a.logo?.image as HTMLImageElement | undefined;
    return img ? buildInputCanvas(img, w, h, (values as unknown as DrexValues).rest.logoColor) : null;
  },
  printUniforms,
};
