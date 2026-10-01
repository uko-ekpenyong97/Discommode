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
  /** What the cover keeps per instance beside it (`instanceExtra`; card 02's
   *  lava warmth), or none. */
  ext?: InstanceExtra;
}

/**
 * Per-instance state a cover keeps beside an instance's dome (card 02's lava:
 * the pointer's warmth, and each blob's extra phase), stepped once a frame by
 * wall time with the dome (dome.ts, `advanceDome`). While it is not settled the
 * instance is drawn for itself, as while its dome is up.
 */
export interface InstanceExtra {
  step(now: number, t: number, dome: Dome, values: DialValues): void;
  /** Back at rest: the instance shows what the shared draw shows. */
  settled(): boolean;
  copyFrom(other: InstanceExtra): void;
  reset(): void;
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
  /** Pass A's target: its top-left in frame units, units per texel, texels.
   *  (A cached pass A covers the whole frame: 0, 0, 1 / its scale, its size.) */
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
 * How an instance's dome follows the pointer (dome.ts): a damped spring
 * (stiffness-ish, damping %; card 02), or an ease — the share of the way it
 * closes per 60 Hz frame (card 03's `followEase`).
 */
export type DomeMotion = { spring: number; damping: number } | { ease: number };

/** What every shader cover has, whichever way its pass A runs. */
interface ShaderCoverBase {
  kind?: 'shader';
  id: string;
  /** The Figma frame, frame units. Every instance is a cover-crop of it. */
  frame: { w: number; h: number };
  glsl: string;
  dials: DialConfig;
  /** What is behind it: 'sky' when omitted. */
  coverBackdrop?: CoverBackdrop;
  /** The uniforms each pass declares, with their initial values. */
  uniformsA: () => Uniforms;
  uniformsB: () => Uniforms;
  /** What the cover needs beyond the dials, built from them (async: fonts,
   *  SDFs, images). A new key rebuilds them. */
  assetKey: (v: DialValues) => string;
  assets: (v: DialValues) => Promise<Record<string, Texture>>;
  /** Dial values → the uniforms that only change when a dial does. */
  bind: (v: DialValues, a: Uniforms, b: Uniforms, assets: Record<string, Texture>) => void;
  /** How the mouse dome follows the pointer, from the dials. */
  domeMotion: (v: DialValues) => DomeMotion;
  /** State it keeps per instance beside the dome (card 02's lava warmth). A
   *  cover with it carries a clicked tile's state into the morph card and the
   *  hero (CoverTile, DetailMorph), so the click does not snap it to rest. */
  instanceExtra?: () => InstanceExtra;
  /** Per draw: time, crop, target mapping, dome. No allocation. */
  frameUniforms: (v: DialValues, a: Uniforms, b: Uniforms, f: InstanceFrame, assets: Record<string, Texture>) => void;
  /** The dials its STILL is drawn with (`npm run covers`), and that reduced
   *  motion would draw with; the dials as they are when omitted. */
  stillValues?: (v: DialValues) => DialValues;
}

/**
 * A cover whose pass A runs on every draw (card 02): over the crop plus
 * `rtMargin`, at `rtScale` of the output (coverRenderer.ts).
 */
export interface LiveCoverDef extends ShaderCoverBase {
  passA?: 'live';
  /** Frame units around the crop that pass A also draws (for lens look-ups). */
  rtMargin: number;
  /** Pass A's resolution, as a fraction of the output's. */
  rtScale: (v: DialValues) => number;
}

/**
 * A cover whose pass A is STATIC — it depends only on the dials and the size it
 * is drawn at (card 03's print, drex) — so it is rendered once per size and
 * dial state into a cached target and only pass B runs per frame
 * (cachedCoverRenderer.ts). Pass A covers the WHOLE frame at the output's
 * scale, one RGBA8 target; pass B draws the instance's crop of it.
 *
 * The renderer owns the geometry uniforms: pass A's `uInput` (the input
 * picture) and `uDims` (its size, px); pass B's `uTex` (pass A's target),
 * `uDims` (the same), `uOrigin` (the crop's top-left in it, whole px), `uOut`
 * (the output's size, px) and `uFlip` (1 drawing into a canvas, 0 an RT).
 */
export interface CachedCoverDef extends ShaderCoverBase {
  passA: 'cached';
  /** The dials pass A depends on, as a string: a new one re-renders it. */
  printKey: (v: DialValues) => string;
  /** Pass A's input picture, the whole frame at `w × h` px, or null while its
   *  assets are not in. Uploaded once per render of pass A. */
  printInput: (v: DialValues, w: number, h: number, assets: Record<string, Texture>) => TexImageSource | null;
  /** Pass A's own uniforms for a target `w × h` px at `s` px per frame unit. */
  printUniforms: (v: DialValues, a: Uniforms, w: number, h: number, s: number) => void;
}

/**
 * A shader cover: one GLSL file, one dial JSON, and the few lines that turn
 * dial values into its uniforms. Adding one is a new entry in covers.ts — the
 * renderers, the stage, the tiles, the paper and the stills do not change.
 */
export type CoverDef = LiveCoverDef | CachedCoverDef;

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
