import {
  ClampToEdgeWrapping,
  DataTexture,
  DataUtils,
  HalfFloatType,
  LinearFilter,
  NoColorSpace,
  RedFormat,
  RepeatWrapping,
  Vector2,
  Vector3,
  Vector4,
} from 'three';
import type { Texture } from 'three';
import glsl from './rive-site.glsl?raw';
import dials from './rive-site.json';
import { STRIP_H, STRIP_W, TEXT_X, riveTextSdf } from './riveText';
import { cssRgb } from '../color';
import type { DialValues } from '../dialValues';
import type { CoverDef, InstanceFrame, Uniforms } from '../types';

/**
 * CARD 02, rive-site — "Shader variation 3 — Soft contour field", as the tuning
 * bench (docs/prototypes/cover-shader-prototype.html) left it. This file is the
 * bench's uniform code for three.js: the same dial → uniform mapping, line for
 * line (`applyDials`, `uploadStatic`, `draw` there). The shader and the tuned
 * values are the shared rive-site.glsl / rive-site.json.
 */

const FRAME_W = 900;
const FRAME_H = 1326;
const CIRCLE_R = 439.68 / 2;
const CIRCLES = [
  [266.0, 478.0],
  [642.0, 106.2],
  [633.8, 1065.6],
] as const;

/** Figma's Moving blobs loop length: 90 − speed × 0.78 seconds. */
const loopSeconds = (speed: number) => Math.max(1, 90 - speed * 0.78);
/** Scale 100% = 2.2 noise cells across the frame's width. */
const blobFreq = (scalePct: number) => 2.2 / Math.max(0.05, scalePct / 100);

// The dial tree, typed as far as the uniforms read it.
interface V {
  stages: { blobs1: boolean; rings2: boolean; dots3: boolean; riso4: boolean; refraction5: boolean };
  quality: { rtScale: number };
  base: {
    background: string;
    border: number;
    circleVisible: boolean;
    marqueePx: number;
    marqueeSec: number;
    textTop: number;
  };
  blobs1: {
    strength: number;
    shift: number;
    wobble: number;
    scale: number;
    detail: number;
    octaves: number;
    threshold: number;
    softness: number;
    speed: number;
    warp: number;
    levels: { blackPoint: number; shadows: number };
  };
  rings2: {
    count: number;
    thickness: number;
    spacing: number;
    offset: number;
    softness: number;
    smoothing: number;
    phase: number;
    lumaThreshold: number;
    opacity: number;
    outsideLenses: number;
    colorFrom: string;
    colorTo: string;
    perturb: { strength: number; scale: number; falloff: number };
    radial: { strength: number; frequency: number; scale: number };
  };
  dots3: {
    density: number;
    cellK: number;
    dotScale: number;
    softness: number;
    threshold: number;
    sourceMix: number;
    band: number;
    jitter: number;
    colourShiftX: number;
    colourShiftY: number;
    colorFrom: string;
    colorTo: string;
    mode: string;
    dome: { radius: number; strength: number; scale: number; spring: number; damping: number; zOffset: number };
  };
  riso4: {
    paper: string;
    inkGreen: string;
    inkBlue: string;
    inkYellow: string;
    inkNavy: string;
    paperOpacity: number;
    greenOpacity: number;
    blueOpacity: number;
    yellowOpacity: number;
    navyOpacity: number;
    blueDx: number;
    blueDy: number;
    yellowDx: number;
    yellowDy: number;
    blueSize: number;
    yellowSize: number;
    yellowChance: number;
    navySize: number;
    pale: number;
    grade: {
      exposure: number;
      contrast: number;
      highlights: number;
      shadows: number;
      saturation: number;
      vibrance: number;
      temperature: number;
    };
  };
  refraction5: {
    slugs: boolean;
    slugCell: number;
    slugWidthMin: number;
    slugWidthMax: number;
    slugLengthMin: number;
    slugLengthMax: number;
    slugTilt: number;
    slugBend: number;
    slugPresence: number;
    slugDrift: number;
    slugSeed: number;
    minify: number;
    rimSmear: number;
    scale: number;
    detail: number;
    octaves: number;
    noiseHalfRes: boolean;
    dispersionCut: boolean;
    threshold: number;
    softness: number;
    strength: number;
    dispersion: number;
    speed: number;
    shadow: number;
    highlight: number;
  };
}

const f = (x = 0) => ({ value: x });
const v2 = () => ({ value: new Vector2() });
const v3 = () => ({ value: new Vector3() });
const v4 = () => ({ value: new Vector4() });
const tex = () => ({ value: null as Texture | null });

function slugUniforms(): Uniforms {
  return { uSlugA: v4(), uSlugB: v4(), uSlugDrift: f(), uSlugSeed: f() };
}

function uniformsA(): Uniforms {
  return {
    ...slugUniforms(),
    uMap: v4(),
    uC0: v2(),
    uC1: v2(),
    uC2: v2(),
    uR: f(),
    uText: tex(),
    uTextMap: v4(),
    uBorder: f(),
    uCircles: f(),
    uS1: f(),
    uS2: f(),
    uB1a: v4(),
    uB1b: v4(),
    uB1c: v2(),
    uColShift: v2(),
    uS5: f(),
    uR5Half: f(),
    uR5a: v4(),
    uR5z: v2(),
    uR5s: v3(),
    uSmooth: f(),
    uLumaThr: f(),
    uPert: v3(),
    uRad: v3(),
  };
}

function uniformsB(): Uniforms {
  return {
    ...slugUniforms(),
    uView: v4(),
    uAAB: f(1),
    uRT: tex(),
    uRtUV: v4(),
    uRT2: tex(),
    uR5Half: f(),
    uS2: f(),
    uS3: f(),
    uS4: f(),
    uS5: f(),
    uBgPic: v3(),
    uRingA: v4(),
    uRingB: v2(),
    uRingV: v2(),
    uRingC0: v3(),
    uRingC1: v3(),
    uDot: v4(),
    uDotB: v4(),
    uDotC0: v3(),
    uDotC1: v3(),
    uDome: v4(),
    uDomeB: v3(),
    uPaper: v3(),
    uInkG: v3(),
    uInkB: v3(),
    uInkY: v3(),
    uInkN: v3(),
    uPaperA: f(),
    uInkA: v4(),
    uMis: v4(),
    uInkS: v4(),
    uPale: f(),
    uGradeA: v4(),
    uGradeB: v3(),
    uR5a: v4(),
    uR5b: v4(),
    uR5c: v2(),
    uR5s: v3(),
    uDebug: f(),
    uBackdrop: v4(),
  };
}

const setRgb = (u: Uniforms, name: string, css: string) => {
  const c = cssRgb(css);
  (u[name].value as Vector3).set(c[0], c[1], c[2]);
};

function bindSlugs(u: Uniforms, r: V['refraction5']) {
  (u.uSlugA.value as Vector4).set(r.slugCell, r.slugWidthMin, r.slugWidthMax, r.slugPresence);
  (u.uSlugB.value as Vector4).set(r.slugLengthMin, r.slugLengthMax, (r.slugTilt * 2 * Math.PI) / 180, r.slugBend);
  u.uSlugDrift.value = r.slugDrift;
  u.uSlugSeed.value = r.slugSeed;
}

function bind(values: DialValues, a: Uniforms, b: Uniforms, assets: Record<string, Texture>) {
  const v = values as unknown as V;
  // pass A
  (a.uC0.value as Vector2).set(CIRCLES[0][0], CIRCLES[0][1]);
  (a.uC1.value as Vector2).set(CIRCLES[1][0], CIRCLES[1][1]);
  (a.uC2.value as Vector2).set(CIRCLES[2][0], CIRCLES[2][1]);
  a.uR.value = CIRCLE_R;
  a.uText.value = assets.text ?? null;
  a.uBorder.value = v.base.border;
  a.uCircles.value = v.base.circleVisible ? 1 : 0;
  const bl = v.blobs1;
  (a.uB1a.value as Vector4).set(blobFreq(bl.scale), bl.detail / 100, bl.threshold / 100, bl.softness / 100);
  (a.uB1c.value as Vector2).set(bl.octaves, bl.warp);
  const d = v.dots3;
  (a.uColShift.value as Vector2).set(d.colourShiftX, d.colourShiftY);
  const rg = v.rings2;
  a.uSmooth.value = rg.smoothing;
  a.uLumaThr.value = rg.lumaThreshold;
  (a.uPert.value as Vector3).set(rg.perturb.strength, rg.perturb.scale, rg.perturb.falloff);
  (a.uRad.value as Vector3).set(rg.radial.strength, Math.round(rg.radial.frequency), rg.radial.scale);
  const r5 = v.refraction5;
  (a.uR5a.value as Vector4).set(blobFreq(r5.scale), r5.detail / 100, r5.threshold / 100, r5.softness / 100);
  (a.uR5s.value as Vector3).set(r5.slugs ? 1 : 0, r5.minify, r5.rimSmear);
  bindSlugs(a, r5);
  a.uR5Half.value = r5.noiseHalfRes ? 1 : 0;

  // pass B
  b.uR5Half.value = r5.noiseHalfRes ? 1 : 0;
  b.uDebug.value = 0;
  // the picture's background through the first Color adjust (levels), for stage 4 off
  const bg = cssRgb(v.base.background);
  const bp = bl.levels.blackPoint / 255;
  const sh = bl.levels.shadows / 100;
  const l0 = 0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2];
  const lift = 1 + sh * 0.5 * (1 - Math.min(1, Math.max(0, l0 / 0.5)));
  const pic = (c: number) => (Math.max(c - bp, 0) / (1 - bp)) * lift;
  (b.uBgPic.value as Vector3).set(pic(bg[0]), pic(bg[1]), pic(bg[2]));
  (b.uRingA.value as Vector4).set(rg.count, rg.thickness, rg.spacing, rg.offset);
  (b.uRingB.value as Vector2).set(rg.softness / 100, rg.phase / 100);
  (b.uRingV.value as Vector2).set(rg.opacity, rg.outsideLenses);
  setRgb(b, 'uRingC0', rg.colorFrom);
  setRgb(b, 'uRingC1', rg.colorTo);
  // two lattices share the density, so each is √2 coarser
  const cell = (d.cellK / d.density) * Math.SQRT2;
  const radius = ((d.dotScale / 100) * (d.cellK / d.density)) / 2;
  (b.uDot.value as Vector4).set(cell, radius, d.softness / 100, d.threshold / 100);
  const jitter = (Math.max(0, 1 - (2 * radius) / cell) * d.jitter) / 100;
  (b.uDotB.value as Vector4).set(d.sourceMix / 100, Number(d.mode), d.band, jitter);
  setRgb(b, 'uDotC0', d.colorFrom);
  setRgb(b, 'uDotC1', d.colorTo);
  (b.uDomeB.value as Vector3).set(d.dome.strength, d.dome.scale / 100, d.dome.zOffset);
  const ri = v.riso4;
  setRgb(b, 'uPaper', ri.paper);
  setRgb(b, 'uInkG', ri.inkGreen);
  setRgb(b, 'uInkB', ri.inkBlue);
  setRgb(b, 'uInkY', ri.inkYellow);
  setRgb(b, 'uInkN', ri.inkNavy);
  (b.uMis.value as Vector4).set(ri.blueDx, ri.blueDy, ri.yellowDx, ri.yellowDy);
  (b.uInkS.value as Vector4).set(ri.blueSize, ri.yellowSize, ri.navySize, ri.yellowChance);
  b.uPale.value = ri.pale;
  b.uPaperA.value = ri.paperOpacity;
  (b.uInkA.value as Vector4).set(ri.greenOpacity, ri.blueOpacity, ri.yellowOpacity, ri.navyOpacity);
  const g = ri.grade;
  (b.uGradeA.value as Vector4).set((g.exposure / 100) * 4, 1 + g.contrast / 100, g.highlights / 100, g.shadows / 100);
  (b.uGradeB.value as Vector3).set(g.saturation / 100, g.vibrance / 100, g.temperature / 100);
  (b.uR5a.value as Vector4).set(blobFreq(r5.scale), r5.detail / 100, r5.threshold / 100, r5.softness / 100);
  (b.uR5c.value as Vector2).set(r5.octaves, r5.highlight);
  (b.uR5s.value as Vector3).set(r5.slugs ? 1 : 0, r5.minify, r5.rimSmear);
  bindSlugs(b, r5);
}

function frameUniforms(values: DialValues, a: Uniforms, b: Uniforms, fr: InstanceFrame, assets: Record<string, Texture>) {
  const v = values as unknown as V;
  const t = fr.t;
  const s = v.stages;
  const on = (x: boolean) => (x ? 1 : 0);
  // pass A: its target's row 0 is the frame's TOP row (pass B reads v = 0 at the top)
  (a.uMap.value as Vector4).set(fr.rtX0, fr.rtY0, fr.rtUnits, fr.rtUnits);
  const step = v.base.marqueePx;
  const marquee = step > 0 ? ((t * step) / v.base.marqueeSec) % STRIP_W : 0;
  const y0 = (assets.text?.userData.y0 as number | undefined) ?? v.base.textTop - 300;
  (a.uTextMap.value as Vector4).set(TEXT_X - marquee, y0, STRIP_W, STRIP_H);
  a.uS1.value = on(s.blobs1);
  a.uS2.value = on(s.rings2);
  a.uS5.value = on(s.refraction5);
  const bl = v.blobs1;
  (a.uB1b.value as Vector4).set((0.075 * 900 * bl.strength) / 100, bl.shift / 100, bl.wobble / 100, t / loopSeconds(bl.speed));
  const r5 = v.refraction5;
  (a.uR5z.value as Vector2).set(t / loopSeconds(r5.speed), r5.octaves);

  // pass B
  const u = fr.crop.w / fr.pxW; // frame units per device px
  if (fr.flipY) (b.uView.value as Vector4).set(fr.crop.x0, fr.crop.y0 + fr.pxH * u, u, -u);
  else (b.uView.value as Vector4).set(fr.crop.x0, fr.crop.y0, u, u);
  b.uAAB.value = u;
  (b.uRtUV.value as Vector4).set(fr.rtX0, fr.rtY0, fr.rtW * fr.rtUnits, fr.rtH * fr.rtUnits);
  b.uS2.value = on(s.rings2);
  b.uS3.value = on(s.dots3);
  b.uS4.value = on(s.riso4);
  b.uS5.value = on(s.refraction5);
  (b.uDome.value as Vector4).set(fr.dome.x, fr.dome.y, v.dots3.dome.radius, fr.dome.amp);
  (b.uR5b.value as Vector4).set(
    r5.strength / 100,
    r5.dispersionCut ? 0 : r5.dispersion / 100,
    r5.shadow / 100,
    t / loopSeconds(r5.speed),
  );
  const bd = fr.backdrop;
  if (bd) (b.uBackdrop.value as Vector4).set(bd[0], bd[1], bd[2], 1);
  else (b.uBackdrop.value as Vector4).set(0, 0, 0, 0);
}

/** The "Rive" strip's SDF as a half-float texture (filterable everywhere). */
async function assets(values: DialValues): Promise<Record<string, Texture>> {
  const v = values as unknown as V;
  const sdf = await riveTextSdf(v.base.textTop);
  const half = halfOf(sdf.data);
  const t = new DataTexture(half, sdf.width, sdf.height, RedFormat, HalfFloatType);
  t.colorSpace = NoColorSpace;
  t.flipY = false; // row 0 = the strip's top, as the shader reads it
  t.wrapS = RepeatWrapping;
  t.wrapT = ClampToEdgeWrapping;
  t.minFilter = LinearFilter;
  t.magFilter = LinearFilter;
  t.generateMipmaps = false;
  t.userData.y0 = sdf.y0;
  t.needsUpdate = true;
  return { text: t };
}

/** Half floats, converted once per strip and shared by every renderer. */
const halves = new WeakMap<Float32Array, Uint16Array>();
function halfOf(data: Float32Array): Uint16Array {
  let h = halves.get(data);
  if (!h) {
    h = new Uint16Array(data.length);
    for (let i = 0; i < data.length; i++) h[i] = DataUtils.toHalfFloat(data[i]);
    halves.set(data, h);
  }
  return h;
}

export const riveSite: CoverDef = {
  id: 'rive-site',
  frame: { w: FRAME_W, h: FRAME_H },
  glsl,
  dials,
  rtMargin: 48,
  rtScale: (v) => (v as unknown as V).quality.rtScale,
  uniformsA,
  uniformsB,
  assetKey: (v) => `text@${(v as unknown as V).base.textTop}`,
  assets,
  bind,
  domeSpring: (v) => (v as unknown as V).dots3.dome,
  frameUniforms,
};
