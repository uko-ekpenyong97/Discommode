import type { IUniform, Texture } from 'three';
import type { DialConfig, DialValues } from './dialValues';

/** A card's live cover, as the manifest names it (content.ts). */
export type CoverRef = ShaderCoverRef | RiveCoverRef;

/** A shader cover: everything about it is its `CoverDef` in the registry. */
export interface ShaderCoverRef {
  kind: 'shader';
  id: string;
}

/**
 * A Rive cover (docs/covers.md, "Rive covers"): a .riv, the artboard the grid
 * shows and the one the detail hero switches to, and the state machine both
 * run. `id` is its registry key and names its stills
 * (`/projects/<id>/cover-still.webp`).
 */
export interface RiveCoverRef {
  kind: 'rive';
  id: string;
  src: string;
  artboard: { grid: string; detail: string };
  stateMachine: string;
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
 * What is behind a cover (docs/covers.md, "Transparency, and the backdrop"):
 *
 *   'sky'    (default) its ground is transparent and the sky shows through it;
 *            the site's `coverBackdrop` dial can lay one colour under it
 *   'solid'  it brings its own opaque ground (card 04's artboards are filled
 *            #E0DDDD) and nothing is drawn behind it, the site dial included
 */
export type CoverBackdrop = 'sky' | 'solid';

/**
 * A cover: one GLSL file, one dial JSON, and the few lines that turn dial
 * values into its uniforms. Adding one is a new entry in covers.ts — the
 * renderer, the stage, the tiles, the paper and the stills do not change.
 */
export interface CoverDef {
  kind?: 'shader';
  id: string;
  /** The Figma frame, frame units. Every instance is a cover-crop of it. */
  frame: { w: number; h: number };
  glsl: string;
  dials: DialConfig;
  /** What is behind it: 'sky' when omitted. */
  coverBackdrop?: CoverBackdrop;
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

/**
 * A Rive cover's registry entry (src/covers/rive/): its frame — the artboards'
 * size, which every instance crops as `object-fit: cover` — and its dials. The
 * file, the artboards and the state machine are the manifest's (RiveCoverRef).
 */
export interface RiveCoverDef {
  kind: 'rive';
  id: string;
  frame: { w: number; h: number };
  dials: DialConfig;
  /** What is behind it: 'sky' when omitted. */
  coverBackdrop?: CoverBackdrop;
}

export type AnyCoverDef = CoverDef | RiveCoverDef;
