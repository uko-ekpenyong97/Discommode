// THE DREX COVER — card 03, Figma "Rive-ReDesign" Frame 5 (node 490:108).
//
// Ported from drexCover.js (~/Discommode-pages/projects/drex/), the tested
// WebGL2 port of the Figma stack, in Figma's order:
//   1. Risograph   (v551)  — static
//   2. Dither      (v758, "Bayer 2x2", pixelSize 1) — static
//   3. Hover reveal (d622acc) — animated + pointer
// 1 and 2 are fused into pass A (pixelSize 1 makes the dither per pixel), which
// the app renders ONCE per size and dial state (cachedCoverRenderer.ts); only
// pass B, the reveal, runs per frame.
//
// Both passes are drexCover.js's FS_PRINT and FS_REVEAL as they are, GLSL ES
// 3.00, maths untouched. What differs, and only to fit the app's renderer:
//   - no `#version` line: three.js writes it (RawShaderMaterial, GLSL3);
//   - pass B's pixel position (`pp`) is the output pixel's position in pass
//     A's frame, not in the output: an instance is an object-fit: cover crop
//     of the frame (uOrigin, whole px), and draws into a canvas (row 0 at the
//     bottom, uFlip 1) or into an RT a paper plane samples (row 0 at the top,
//     uFlip 0). Over a whole-frame canvas (uOrigin 0, uFlip 1, uOut = uDims)
//     it is drexCover.js's line exactly;
//   - pass B's result lies on the frame's white paper (the cover is opaque):
//     premultiplied over white, the last line.
//
// All maths in top-origin frame pixels. Figma's pixel-unit params are authored
// on the 1000 × 1300 frame and multiplied by the scale (drex.ts).

//#common

//#passA
precision highp int;
uniform sampler2D uInput;   // uploaded with FLIP_Y=false: t=0 is the TOP row
uniform vec2  uDims;
uniform vec4  uInk[8];
uniform vec4  uPaper;
uniform float uHalftone, uAngle, uMisreg, uGrain;
uniform int   uNumInks, uStyle;
uniform float uBoost, uQuant;
uniform float uBright, uContrast, uGamma, uSat;
uniform int   uDitherOn;
uniform float uLevels, uDBright, uDContrast;
out vec4 outColor;

float hash21(vec2 p){
  vec2 q = fract(p * vec2(123.34, 456.21));
  q = q + dot(q, q + 45.32);
  return fract(q.x * q.y);
}
float hash11(float n){ return fract(sin(n) * 43758.5453123); }

float halftone(vec2 px, float density, int style){
  vec2 c = px - 0.5;
  if (style == 1) return abs(c.y) < density * 0.5 ? 1.0 : 0.0;
  if (style == 2) return (abs(c.x) + abs(c.y)) < density * 0.7071 ? 1.0 : 0.0;
  return length(c) < density * 0.5 ? 1.0 : 0.0;
}
vec2 rot2(vec2 p, float a){ float ca = cos(a), sa = sin(a); return vec2(ca*p.x - sa*p.y, sa*p.x + ca*p.y); }
float inkDensity(vec3 i, vec3 ink, vec3 paper){
  float paperDist = length(i - paper);
  float inkDist   = length(i - ink);
  float r = max(length(ink - paper), 0.05);
  return clamp(clamp(paperDist / r, 0.0, 1.0) * clamp(1.0 - inkDist / r, 0.0, 1.0), 0.0, 1.0);
}
vec2 misregOffset(int k, float m){
  float f = float(k);
  return (vec2(hash11(f * 17.43 + 1.0), hash11(f * 31.17 + 5.0)) - 0.5) * 2.0 * m;
}
vec3 prep(vec3 s){
  s = clamp(s + uBright, 0.0, 1.0);
  s = clamp((s - 0.5) * (1.0 + uContrast) + 0.5, 0.0, 1.0);
  s = pow(s, vec3(max(uGamma, 0.001)));
  float l = dot(s, vec3(0.2126, 0.7152, 0.0722));
  return clamp(mix(vec3(l), s, uSat), 0.0, 1.0);
}

vec4 risoSample(vec2 spx){
  vec2 uv = spx / uDims;
  float raw[8]; float ud[8]; float a[8];
  float alpha0 = 0.0;
  int winner = -1; float maxUD = 0.02;
  for (int k = 0; k < 8; k++){
    raw[k] = 0.0; ud[k] = 0.0; a[k] = 0.0;
    if (k >= uNumInks) continue;
    vec4 sf = texture(uInput, clamp(uv + misregOffset(k, uMisreg) / uDims, 0.0, 1.0));
    vec3 s = prep(sf.rgb);
    a[k] = sf.a;
    if (k == 0) alpha0 = sf.a;
    ud[k]  = inkDensity(s, uInk[k].rgb, uPaper.rgb);
    raw[k] = clamp(ud[k] * uBoost, 0.0, 1.0);
    if (ud[k] > maxUD){ maxUD = ud[k]; winner = k; }
  }
  vec3 result = uPaper.rgb;
  float dots = 0.0;
  for (int k = 0; k < 8; k++){
    if (k >= uNumInks) break;
    float wta = (k == winner) ? raw[k] : 0.0;
    float density = mix(raw[k], wta, uQuant);
    vec2 rp = rot2(spx + misregOffset(k, uMisreg), uAngle + radians(15.0 * float(k)));
    float covered = halftone(fract(rp / uHalftone), density, uStyle);
    bool land = covered > 0.5 && a[k] > 0.0;
    if (land){ result *= uInk[k].rgb; dots = 1.0; }
  }
  float outA = mix(dots, alpha0, uPaper.a);
  return vec4(result * outA, outA);
}

void main(){
  vec2 p = vec2(gl_FragCoord.x, uDims.y - gl_FragCoord.y); // top-origin px centre
  vec4 acc = ( risoSample(p + vec2(-0.25,-0.25)) + risoSample(p + vec2(0.25,-0.25))
             + risoSample(p + vec2(-0.25, 0.25)) + risoSample(p + vec2(0.25, 0.25)) ) * 0.25;
  float g = (hash21(p * 0.37 + 13.7) - 0.5) * uGrain;
  vec4 riso = vec4(clamp(acc.rgb + g * acc.a, vec3(0.0), vec3(acc.a)), acc.a);

  if (uDitherOn == 0){ outColor = riso; return; }
  // Dither v758, ordered family, Bayer 2x2, colour mode, pixelSize 1
  vec3 c = riso.a > 0.0 ? riso.rgb / riso.a : vec3(0.0);
  c = clamp((c - 0.5) * uDContrast + 0.5 + uDBright, 0.0, 1.0);
  ivec2 g2 = ivec2(floor(p)) % 2;
  // bayer2 = [[0,2],[3,1]] -> (v+0.5)/4, row-major [y][x]
  float th = g2.y == 0 ? (g2.x == 0 ? 0.125 : 0.625) : (g2.x == 0 ? 0.875 : 0.375);
  float L = uLevels - 1.0;
  float off = (th - 0.5) / L;
  vec3 q = clamp(floor((c + off) * L + 0.5) / L, 0.0, 1.0); // WGSL round() on +ve
  outColor = riso.a > 0.0 ? vec4(q * riso.a, riso.a) : vec4(0.0);
}

//#passB
uniform sampler2D uTex;     // pass A target: GL bottom-origin
uniform vec2  uDims;
uniform float uTime;        // seconds
uniform vec2  uMouse;       // top-origin px
uniform float uScale;
uniform float uRadius, uSoft, uStrength, uDisp, uSpeed, uFringe;
// The app's: where this output's pixels lie in pass A's frame (the header).
uniform vec2  uOrigin;      // the crop's top-left, pass A px (whole)
uniform vec2  uOut;         // the output's size, px
uniform float uFlip;        // 1: into a canvas (row 0 = bottom); 0: an RT (row 0 = top)
out vec4 outColor;

vec4 sampleInput(vec2 uvTop){ vec2 c = clamp(uvTop, 0.0, 1.0); return texture(uTex, vec2(c.x, 1.0 - c.y)); }
vec4 sampleInputOrZero(vec2 uvTop){ vec2 ins = step(vec2(0.0), uvTop) * step(uvTop, vec2(1.0)); return sampleInput(uvTop) * (ins.x * ins.y); }

void main(){
  vec2 dims = max(uDims, vec2(1.0));
  vec2 pp = uOrigin + vec2(gl_FragCoord.x, uFlip > 0.5 ? uOut.y - gl_FragCoord.y : gl_FragCoord.y);
  vec2 uv = pp / dims;
  vec4 inputColor = sampleInput(uv);
  vec2 pixelPosition = uv * dims;
  float pointerDistance = distance(pixelPosition, uMouse);
  float feather = max(uSoft, 0.001);
  float focusedCore = uRadius * 0.55;
  float radialReveal = 1.0 - smoothstep(focusedCore, uRadius + feather, pointerDistance);
  float revealMask = radialReveal * radialReveal * (3.0 - 2.0 * radialReveal);
  float radialPosition = pointerDistance / max(uRadius, 1.0);
  float phase = uTime * uSpeed;
  // Figma's wave frequencies are per frame-px; divide by pxScale so the
  // ripple looks identical at any tile size.
  vec2 fp = pixelPosition / uScale;
  float liquidX = sin(fp.y * 0.031 + phase * 1.17) + sin((fp.x + fp.y) * 0.017 - phase * 0.73);
  float liquidY = cos(fp.x * 0.027 - phase * 0.91) + sin((fp.x - fp.y) * 0.019 + phase * 0.61);
  float centerReadability = mix(0.22, 1.0, smoothstep(0.12, 0.72, radialPosition));
  vec2 displacementPx = vec2(liquidX, liquidY) * (0.5 * uDisp * centerReadability * revealMask);
  vec2 displacedUv = uv + displacementPx / dims;
  vec4 displacedColor = sampleInputOrZero(displacedUv);
  float boundaryBand = revealMask * smoothstep(0.48, 0.82, radialPosition) * (1.0 - smoothstep(0.82, 1.12, radialPosition));
  vec2 radialDirection = (pixelPosition - uMouse) / max(pointerDistance, 1.0);
  vec2 fringeUv = radialDirection * (uFringe * boundaryBand) / dims;
  vec4 redSample  = sampleInputOrZero(displacedUv + fringeUv);
  vec4 blueSample = sampleInputOrZero(displacedUv - fringeUv);
  vec3 prismRgb = min(vec3(redSample.r, displacedColor.g, blueSample.b), vec3(displacedColor.a));
  vec4 lensColor = vec4(prismRgb, displacedColor.a);
  float luminance = dot(inputColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  vec3 muted = inputColor.rgb * 0.10 + vec3(luminance * 0.025);
  vec4 treatedColor = vec4(muted, inputColor.a);
  outColor = mix(treatedColor, lensColor, revealMask * uStrength);
  outColor = vec4(outColor.rgb + (1.0 - outColor.a), 1.0); // on the white paper
}
