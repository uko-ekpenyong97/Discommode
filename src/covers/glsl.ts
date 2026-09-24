/**
 * A cover's GLSL is ONE file in three sections — `//#common`, `//#passA`,
 * `//#passB`, each marker alone on its line — so the tuning bench and the app
 * read the same source. This splits it and prefixes each pass with what both
 * readers need and neither should repeat: the version, the precision, and the
 * cover's #defines.
 *
 * Plain string work, no three.js: the bench (docs/prototypes/
 * cover-shader-prototype.html) is raw WebGL2 and imports this file too.
 */
export interface CoverPasses {
  /** Fragment source of pass A (writes two targets). */
  a: string;
  /** Fragment source of pass B (writes the cover, premultiplied). */
  b: string;
}

const VERSION = '#version 300 es\n';
const PRECISION = 'precision highp float;\nprecision highp sampler2D;\n';

/**
 * `version: false` for three.js, whose RawShaderMaterial writes the
 * `#version 300 es` line itself (glslVersion GLSL3) and rejects a second.
 */
export function splitCoverGlsl(
  src: string,
  defines: Record<string, number>,
  { version = true }: { version?: boolean } = {},
): CoverPasses {
  const parts: Record<string, string> = {};
  let key = '';
  for (const line of src.split('\n')) {
    const m = /^\/\/#(common|passA|passB)\s*$/.exec(line);
    if (m) {
      key = m[1];
      parts[key] = '';
    } else if (key) parts[key] += `${line}\n`;
  }
  for (const k of ['common', 'passA', 'passB']) {
    if (parts[k] === undefined) throw new Error(`cover GLSL: no //#${k} section`);
  }
  const defs = Object.entries(defines)
    .map(([k, v]) => `#define ${k} ${Number.isInteger(v) ? v.toFixed(1) : v}`)
    .join('\n');
  const pre = `${version ? VERSION : ''}${PRECISION}${defs}\n${parts.common}`;
  return { a: pre + parts.passA, b: pre + parts.passB };
}
