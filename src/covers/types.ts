import type { IUniform, Texture } from 'three';
import type { DialConfig, DialValues } from './dialValues';

/** A card's live cover, as the manifest names it (content.ts). */
export interface CoverRef {
  kind: 'shader';
  id: string;
}

export type Uniforms = { [name: string]: IUniform };

/** The part of the frame one instance shows, in frame units. */
export interface Crop {
  x0: number;
  y0: number;
  w: number;
  h: number;
}

/** The dome under one instance's pointer, frame units; amp 0 = at rest. */
export interface Dome {
  x: number;
  y: number;
  amp: number;
}

/**
 * Everything one draw of one instance needs beyond the dials: the shared
 * clock's time, what it shows, at what size, and where pass A's target sits.
 */
export interface InstanceFrame {
  t: number;
  crop: Crop;
  /** Output size, device px. */
  pxW: number;
  pxH: number;
  /** Drawing into a canvas's own framebuffer (row 0 = bottom): flip y. */
  flipY: boolean;
  /** Pass A's target: its top-left in frame units, units per texel, texels. */
  rtX0: number;
  rtY0: number;
  rtUnits: number;
  rtW: number;
  rtH: number;
  dome: Dome;
  /** Solid backdrop behind the cover (premultiplied over), or null for none. */
  backdrop: [number, number, number] | null;
}

/**
 * A cover: one GLSL file, one dial JSON, and the few lines that turn dial
 * values into its uniforms. Adding one is a new entry in covers.ts — the
 * renderer, the stage, the tiles, the paper and the stills do not change.
 */
export interface CoverDef {
  id: string;
  /** The Figma frame, frame units. Every instance is a cover-crop of it. */
  frame: { w: number; h: number };
  glsl: string;
  dials: DialConfig;
  /** Frame units around the crop that pass A also draws (for lens look-ups). */
  rtMargin: number;
  /** Pass A's resolution, as a fraction of the output's. */
  rtScale: (v: DialValues) => number;
  /** The uniforms each pass declares, with their initial values. */
  uniformsA: () => Uniforms;
  uniformsB: () => Uniforms;
  /** Textures the cover needs, built from the dials (async: fonts, SDFs). A new
   *  key rebuilds them. */
  assetKey: (v: DialValues) => string;
  assets: (v: DialValues) => Promise<Record<string, Texture>>;
  /** Dial values → the uniforms that only change when a dial does. */
  bind: (v: DialValues, a: Uniforms, b: Uniforms, assets: Record<string, Texture>) => void;
  /** The mouse dome's spring, from the dials: stiffness-ish and damping %. */
  domeSpring: (v: DialValues) => { spring: number; damping: number };
  /** Per draw: time, crop, target mapping, dome. No allocation. */
  frameUniforms: (v: DialValues, a: Uniforms, b: Uniforms, f: InstanceFrame, assets: Record<string, Texture>) => void;
}
