import { describe, expect, it } from 'vitest';
import { splitCoverGlsl } from './glsl';

const SRC = `// header, ignored
// //#common in a comment is not a marker
//#common
float f(){ return FRAME_W; }
//#passA
void main(){ o = vec4(f()); }
//#passB
void main(){ o = vec4(0.0); }
`;

describe('splitCoverGlsl', () => {
  it('splits at the markers and prefixes each pass with version, precision, defines and common', () => {
    const p = splitCoverGlsl(SRC, { FRAME_W: 900, FRAME_H: 1326.5 });
    expect(p.a.startsWith('#version 300 es\nprecision highp float;')).toBe(true);
    expect(p.a).toContain('#define FRAME_W 900.0');
    expect(p.a).toContain('#define FRAME_H 1326.5');
    expect(p.a).toContain('float f(){ return FRAME_W; }');
    expect(p.a).toContain('o = vec4(f());');
    expect(p.a).not.toContain('o = vec4(0.0);');
    expect(p.b).toContain('o = vec4(0.0);');
    expect(p.a).not.toContain('header, ignored');
  });

  it('leaves the version line to three.js when asked', () => {
    const p = splitCoverGlsl(SRC, { FRAME_W: 900 }, { version: false });
    expect(p.a).not.toContain('#version');
    expect(p.a.startsWith('precision highp float;')).toBe(true);
  });

  it('refuses a file with a section missing', () => {
    expect(() => splitCoverGlsl('//#common\n//#passA\n', {})).toThrow(/passB/);
  });
});
