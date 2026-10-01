import { describe, expect, it } from 'vitest';
import { drex, LOGO_CENTER, lightAt, restLight } from './covers/drex';
import { printGeometry } from './cachedCoverRenderer';
import { coverCropOf } from './coverRenderer';
import { dialDefaults } from './dialValues';
import { DomeSpring } from './dome';
import { splitCoverGlsl } from './glsl';
import { coverBackdrop } from './coverDials';
import { shaderCover } from './covers';
import type { DrexValues } from './covers/drex';
import type { Crop } from './types';

/** drexCover.js's DEFAULTS (~/Discommode-pages/projects/drex/), as shipped. */
const DEFAULTS = {
  ink1: [0.91, 0.278, 0.247, 1],
  ink2: [0.231, 0.435, 0.91, 1],
  ink3: [0.961, 0.847, 0.0, 1],
  ink4: [0.0, 0.71, 0.639, 1],
  ink5: [0.902, 0.494, 0.133, 1],
  ink6: [0.494, 0.184, 0.557, 1],
  ink7: [0.122, 0.471, 0.29, 1],
  ink8: [0.918, 0.769, 0.0, 1],
  paperColor: [0.961, 0.941, 0.91, 1],
  numInks: 4,
  halftoneStyle: 0,
  halftoneSize: 8,
  screenAngle: 15,
  misregistration: 3,
  grain: 0.35,
  inkDensityBoost: 1.5,
  colorQuantization: 0,
  inputBrightness: 0,
  inputContrast: 0,
  inputGamma: 1,
  inputSaturation: 1,
  ditherOn: true,
  ditherLevels: 2,
  ditherBrightness: 100,
  ditherContrast: 1,
  revealRadius: 344,
  edgeSoftness: 68,
  revealStrength: 1,
  displacementAmount: 5,
  motionSpeed: 1.7,
  prismaticFringe: 10.5,
  logoColor: '#1CAB5B',
  restMode: 'drift',
  driftRadius: 170,
  driftPeriod: 14,
  followEase: 0.12,
};

const rgba = (c: { r: number; g: number; b: number; a: number }) => [c.r, c.g, c.b, c.a];

describe('card 03, drex', () => {
  it('is a cached-pass shader cover on an opaque ground of its own', () => {
    expect(shaderCover('drex')?.passA).toBe('cached');
    expect(coverBackdrop('drex')).toBe('solid');
  });

  it("defaults every dial to drexCover.js's DEFAULTS", () => {
    const v = dialDefaults(drex.dials) as unknown as DrexValues;
    const r = v.risograph;
    const flat = {
      ink1: rgba(r.ink1),
      ink2: rgba(r.ink2),
      ink3: rgba(r.ink3),
      ink4: rgba(r.ink4),
      ink5: rgba(r.inks5to8.ink5),
      ink6: rgba(r.inks5to8.ink6),
      ink7: rgba(r.inks5to8.ink7),
      ink8: rgba(r.inks5to8.ink8),
      paperColor: rgba(r.paperColor),
      numInks: r.numInks,
      halftoneStyle: ['dots', 'lines', 'diamonds'].indexOf(r.halftoneStyle),
      halftoneSize: r.halftoneSize,
      screenAngle: r.screenAngle,
      misregistration: r.misregistration,
      grain: r.grain,
      inkDensityBoost: r.inkDensityBoost,
      colorQuantization: r.colorQuantization,
      inputBrightness: r.inputBrightness,
      inputContrast: r.inputContrast,
      inputGamma: r.inputGamma,
      inputSaturation: r.inputSaturation,
      ...v.dither,
      ...v.reveal,
      ...v.rest,
    };
    expect(flat).toEqual(DEFAULTS);
  });

  it('draws its still, and reduced motion, parked and without the wobble', () => {
    const v = drex.stillValues!(dialDefaults(drex.dials)) as unknown as DrexValues;
    expect(v.rest.restMode).toBe('parked');
    expect(v.reveal.motionSpeed).toBe(0);
    expect(restLight(v.rest, 0)).toEqual(LOGO_CENTER);
  });

  it("rests where drexCover.js's restLight does", () => {
    const P = { restMode: 'drift', driftRadius: 170, driftPeriod: 14 };
    const w = (2 * Math.PI) / 14;
    for (const t of [0, 1.3, 7, 13.9]) {
      expect(restLight(P, t)).toEqual({
        x: LOGO_CENTER.x + 170 * Math.sin(w * t),
        y: LOGO_CENTER.y + 170 * 0.8 * Math.sin(2 * w * t + 0.6),
      });
    }
    expect(restLight({ ...P, restMode: 'off' }, 3)).toEqual({ x: -10000, y: -10000 });
  });

  it('moves the light from its rest to the pointer by the dome height', () => {
    const rest = { logoColor: '#1CAB5B', restMode: 'parked', driftRadius: 170, driftPeriod: 14, followEase: 0.12 };
    const out = { x: 0, y: 0, strength: 0 };
    expect(lightAt(rest, 1, 0, { x: 100, y: 200, amp: 0 }, out)).toEqual({ x: 500, y: 649, strength: 1 });
    expect(lightAt(rest, 1, 0, { x: 100, y: 200, amp: 1 }, out)).toEqual({ x: 100, y: 200, strength: 1 });
    expect(lightAt(rest, 1, 0, { x: 100, y: 200, amp: 0.5 }, out)).toEqual({ x: 300, y: 424.5, strength: 1 });
    // 'off': no light at rest to move from — the pointer's, faded in
    expect(lightAt({ ...rest, restMode: 'off' }, 1, 0, { x: 100, y: 200, amp: 0.25 }, out)).toEqual({ x: 100, y: 200, strength: 0.25 });
  });

  it('keeps its two passes, and the one changed line of pass B', () => {
    const p = splitCoverGlsl(drex.glsl, {}, { version: false });
    expect(p.a).toContain('float th = g2.y == 0 ? (g2.x == 0 ? 0.125 : 0.625) : (g2.x == 0 ? 0.875 : 0.375);');
    expect(p.a).not.toContain('#version');
    expect(p.b).toContain('vec2 pp = uOrigin + vec2(gl_FragCoord.x, uFlip > 0.5 ? uOut.y - gl_FragCoord.y : gl_FragCoord.y);');
    expect(p.b).toContain('outColor = mix(treatedColor, lensColor, revealMask * uStrength);');
  });
});

describe('the print geometry', () => {
  const crop = (w: number, h: number): Crop => coverCropOf(1000, 1300, w, h, { x0: 0, y0: 0, w: 1, h: 1 });
  const g = () => ({ w: 0, h: 0, s: 0, ox: 0, oy: 0 });

  it('is the whole frame, unscaled, for a 1000 × 1300 output', () => {
    expect(printGeometry(1000, 1300, crop(1000, 1300), 1000, 1300, g())).toEqual({ w: 1000, h: 1300, s: 1, ox: 0, oy: 0 });
  });

  it('puts a 3:4 tile at a whole-pixel offset in a print that holds it', () => {
    const r = printGeometry(1000, 1300, crop(672, 896), 672, 896, g());
    expect(r).toEqual({ w: 689, h: 896, s: 0.689, ox: 9, oy: 0 });
    expect(r.ox + 672).toBeLessThanOrEqual(r.w);
  });

  it('gives the DOM hero and the paper the same print at the same box', () => {
    // 628.2462 × 816.72 CSS px at 2×: both round the box, then the print
    const a = printGeometry(1000, 1300, crop(1256, 1633), 1256, 1633, g());
    expect(a).toEqual({ w: 1256, h: 1633, s: 1.256, ox: 0, oy: 0 });
  });
});

describe('the dome, as an ease', () => {
  it('closes followEase of the way each 60 Hz frame, by wall time', () => {
    const d = new DomeSpring();
    d.point(100, 200);
    d.ease(0, 0.12); // the first step only sets the clock
    d.ease(1000 / 60, 0.12);
    expect(d.state.amp).toBeCloseTo(0.12, 6);
    const e = new DomeSpring();
    e.point(100, 200);
    e.ease(0, 0.12);
    e.ease(1000 / 120, 0.12);
    e.ease(2000 / 120, 0.12);
    expect(e.state.amp).toBeCloseTo(0.12, 6); // two 120 Hz frames = one 60 Hz frame
  });

  it('goes back to rest, exactly, once the pointer leaves', () => {
    const d = new DomeSpring();
    d.point(100, 200);
    let now = 0;
    for (let i = 0; i < 60; i++) d.ease((now += 16.7), 0.12);
    expect(d.state.amp).toBeGreaterThan(0.99);
    d.leave();
    for (let i = 0; i < 120; i++) d.ease((now += 16.7), 0.12);
    expect(d.state.amp).toBe(0);
    expect(d.active()).toBe(false);
  });
});
