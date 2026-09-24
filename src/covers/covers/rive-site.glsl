// THE RIVE-SITE COVER — card 02, "Shader variation 3 — Soft contour field".
//
// One file, three sections, split by the loader (src/covers/glsl.ts) at the
// //#common / //#passA / //#passB markers and prefixed with the version, the
// precision and the #defines the cover declares (FRAME_W, FRAME_H). The app's
// renderer (three.js) and the tuning bench (docs/prototypes/
// cover-shader-prototype.html, raw WebGL2) both load THIS file, so what is
// tuned on the bench is what ships. The tuning, and why every value is what it
// is, lives in the bench and in rive-site.json.

//#common
vec3 mod289(vec3 x){ return x - floor(x*(1.0/289.0))*289.0; }
vec4 mod289(vec4 x){ return x - floor(x*(1.0/289.0))*289.0; }
vec4 permute(vec4 x){ return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314*r; }

// 3D simplex noise with its analytic gradient (Gustavson / Ashima, noise3Dgrad).
// Returns (dn/dx, dn/dy, dn/dz, n), n in about [-1, 1]. One call buys the value
// AND the direction the displacement, dispersion and refraction all need.
vec4 snoiseG(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  vec3 ns = 0.142857142857 * D.wyz - D.xzx;
  vec4 j = p - 49.0*floor(p*ns.z*ns.z);
  vec4 x_ = floor(j*ns.z);
  vec4 y_ = floor(j - 7.0*x_);
  vec4 x = x_*ns.x + ns.yyyy;
  vec4 y = y_*ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  vec4 m2 = m*m;
  vec4 m4 = m2*m2;
  vec4 pdotx = vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3));
  vec4 t = m2*m*pdotx;
  vec3 grad = -8.0*(t.x*x0 + t.y*x1 + t.z*x2 + t.w*x3);
  grad += m4.x*p0 + m4.y*p1 + m4.z*p2 + m4.w*p3;
  return 105.0*vec4(grad, dot(m4, pdotx));
}

// fbm of snoiseG, 1–3 octaves, persistence = detail. Returns (grad.xy, n), both
// normalised by the amplitude sum. detail 0 costs one octave, not three.
vec3 fbmG(vec3 P, float detail, float oct){
  vec4 n = snoiseG(P);
  vec3 acc = vec3(n.xy, n.w);
  float amp = 1.0, norm = 1.0;
  if (oct > 1.5 && detail > 0.0) {
    amp = detail;
    vec4 m = snoiseG(P*vec3(2.03, 2.03, 1.0) + vec3(17.1, 3.7, 0.0));
    acc += amp*vec3(m.xy*2.03, m.w); norm += amp;
    if (oct > 2.5) {
      amp *= detail;
      m = snoiseG(P*vec3(4.11, 4.11, 1.0) + vec3(-7.3, 11.9, 0.0));
      acc += amp*vec3(m.xy*4.11, m.w); norm += amp;
    }
  }
  return acc/norm;
}

vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz)*p3.zy); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y)*p3.z); }
// Value noise, x periodic in 'period' cells (period <= 0: not periodic).
float vnoise(vec2 p, float period){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0 - 2.0*f);
  vec2 i1 = i + 1.0;
  if (period > 0.0) { i.x = mod(i.x, period); i1.x = mod(i1.x, period); }
  float a = hash12(i), b = hash12(vec2(i1.x, i.y)), c = hash12(vec2(i.x, i1.y)), d = hash12(i1);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
// 5 — the refraction field: the offset before strength (x900 x strength to use),
// mask, rim.
//
// cover-ref.png's lenses are SLUGS: ~16 of them, spread evenly, 90–150 units
// across and 100–550 long, mostly upright, some curved like bananas. Noise
// thresholded (Figma's Moving blobs) gives either the thickness or the count,
// never both, and clumps. So with slugs on (slug.x) each cell of a jittered
// grid holds one BENT CAPSULE — its length, width, tilt and bend drawn from
// the cell's hash — and the lens direction is the capsule's distance gradient.
// Each slug circles its home once per loop, so the motion loops exactly.
// Off: the noise blobs, as Figma has them.
uniform vec4 uSlugA;      // cell, width min, width max, presence
uniform vec4 uSlugB;      // length min, length max, tilt spread (rad), bend
uniform float uSlugDrift; // how far a slug wanders from home, frame units
uniform float uSlugSeed;  // which arrangement

// Distance (x) and its gradient (yz) to the nearest slug, frame units.
vec3 slugs(vec2 p, float phase){
  float G = uSlugA.x;
  vec2 cell = floor(p/G);
  vec3 best = vec3(1e5, 0.0, 1.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 c = cell + vec2(float(i), float(j));
    vec2 cs = c + uSlugSeed*vec2(37.0, 11.0);
    vec2 h1 = hash22(cs*7.31 + 117.3), h2 = hash22(cs*13.91 + 43.7), h3 = hash22(cs*5.73 - 91.1);
    if (h3.x > uSlugA.w) continue;
    float ph = phase + h3.y*6.2831853;
    vec2 ctr = (c + 0.2 + 0.6*h1)*G + uSlugDrift*vec2(cos(ph), sin(ph*2.0)*0.5);
    float ang = 1.5707963 + (h2.x - 0.5)*uSlugB.z + 0.25*sin(ph)*uSlugB.z*0.2;
    float L = mix(uSlugB.x, uSlugB.y, h2.y);
    float W = mix(uSlugA.y, uSlugA.z, 0.5*h1.y + 0.5*h2.y);    // the long ones are the thick ones
    // curvature: the ends bow by up to ±bend off the chord (never more than 0.4 L)
    float k = (h1.x - 0.5)*2.0*min(uSlugB.w, 0.4*L)*4.0/max(L*L, 1.0);
    vec2 ax = vec2(cos(ang), sin(ang));
    vec2 d = p - ctr;
    float u = dot(d, ax), v = dot(d, vec2(-ax.y, ax.x));
    float ub = clamp(u, -0.5*L, 0.5*L);                     // the bend stops at the ends: round caps
    float vb = v - k*ub*ub;
    float uc = max(abs(u) - 0.5*L, 0.0);
    float len = length(vec2(uc, vb));
    // a taper and a bulge at the ends, so they read as teardrops, peanuts and
    // the reference's bulb-ended slugs rather than even brush strokes
    float taper = (h3.y - 0.5)*0.6;
    float bulge = fract(h2.x*7.31)*0.5;
    float e = clamp(u/(0.5*L + 1.0), -1.0, 1.0);
    float dist = len - 0.5*W*(1.0 + taper*e + bulge*(e*e - 0.35));
    if (dist < best.x) {
      vec2 gl = len > 1e-4 ? vec2(sign(u)*uc, vb)/len : vec2(0.0, 1.0);
      gl.x -= 2.0*k*ub*gl.y;                                // chain rule through the bend
      vec2 g = gl.x*ax + gl.y*vec2(-ax.y, ax.x);
      best = vec3(dist, g/(length(g) + 1e-5));
    }
  }
  return best;
}

vec4 refrField(vec2 p, vec4 a, float z, float oct, vec3 slug){
  float mask; vec2 g;
  if (slug.x > 0.5) {
    vec3 sl = slugs(p, z*6.2831853);
    // softness: Figma's % of a slug's half-width, plus a unit
    float s = a.w*0.5*uSlugA.y + 1.0;
    mask = 1.0 - smoothstep(-s, s, sl.x);
    float rim = 4.0*mask*(1.0 - mask);
    // A slug is a MINIFYING lens, as cover-ref.png's are (a finer speckle and
    // denser ring lines inside than out): it looks outward, by its depth inside
    // times slug.y (= 2 × strength at 100%), so the axis sees a slug-width
    // beyond the rim. The rim itself is smeared along its tangent, as before.
    vec2 out_ = sl.yz;
    float depth = max(-sl.x, 0.0);
    vec2 off = out_*depth*slug.y*mask + vec2(-out_.y, out_.x)*rim*0.14*900.0*slug.z;
    return vec4(off/900.0, mask, rim);
  } else {
    vec3 f = fbmG(vec3(p/900.0*a.x + vec2(31.7, -12.9), z + 5.3), a.y, oct);
    mask = smoothstep(a.z - a.w, a.z + a.w, 0.5 + 0.5*f.z);
    g = f.xy;
  }
  float rim = 4.0*mask*(1.0 - mask);
  vec2 dir = g/(length(g) + 1e-5);
  return vec4(dir*mask*0.075 + vec2(-dir.y, dir.x)*rim*0.14, mask, rim);
}
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
// Highlights / shadows as luma-weighted gains: +-100 = x1.5 / x0.5 at the ends.
vec3 tones(vec3 c, float highlights, float shadows){
  float l = luma(c);
  c *= 1.0 + highlights*0.5*smoothstep(0.5, 1.0, l);
  c *= 1.0 + shadows*0.5*(1.0 - smoothstep(0.0, 0.5, l));
  return c;
}

//#passA
uniform vec4 uMap;        // frame = xy + gl_FragCoord.xy * zw
uniform vec2 uC0, uC1, uC2;
uniform float uR;
uniform sampler2D uText;  // R16F signed distance of the "Rive" strip, frame units
uniform vec4 uTextMap;    // strip left x (marquee applied), top y, width, height
uniform float uBorder;
uniform float uCircles;   // circles in the picture's shape (circleVisible)
uniform float uS1, uS2;
uniform vec4 uB1a;        // freq, detail, threshold, softness
uniform vec4 uB1b;        // displacement (frame units), shift, wobble, z
uniform vec2 uB1c;        // octaves, warp
uniform vec2 uColShift;   // particle colour lookup offset, frame units
uniform float uS5, uR5Half;
uniform vec4 uR5a;        // 5's noise: freq, detail, threshold, softness
uniform vec2 uR5z;        // 5's noise: z, octaves
uniform vec3 uR5s;        // 5's slugs: on, breakup, stretch
uniform float uSmooth;    // ring smoothing (smin k), frame units
uniform float uLumaThr;
uniform vec3 uPert;       // strength, scale, falloff
uniform vec3 uRad;        // strength, frequency (whole), scale
layout(location = 0) out vec4 o;
layout(location = 1) out vec4 o2;  // 5's field: offset / (900 * strength), mask, rim

const vec2 FRAME = vec2(FRAME_W, FRAME_H);

float sdText(vec2 p){
  float yy = clamp(p.y, uTextMap.y + 1.0, uTextMap.y + uTextMap.w - 1.0);
  float d = textureLod(uText, vec2((p.x - uTextMap.x)/uTextMap.z, (yy - uTextMap.y)/uTextMap.w), 0.0).r;
  return d + abs(p.y - yy);
}
float smin(float a, float b, float k){
  if (k <= 0.0) return min(a, b);
  float h = max(k - abs(a - b), 0.0)/k;
  return min(a, b) - h*h*k*0.25;
}
float sdCircles(vec2 p){ return min(length(p - uC0), min(length(p - uC1), length(p - uC2))) - uR; }
// the picture: letters, the 2px border inset, and the circles if they are drawn
float sdPic(vec2 p, float text){
  vec2 e = min(p, FRAME - p);
  float d = min(text, min(e.x, e.y) - uBorder);
  return uCircles > 0.5 ? min(d, sdCircles(p)) : d;
}
float perturb(float d, vec2 p){
  float w = max(0.0, 1.0 - max(d, 0.0)/uPert.z);
  float n = vnoise(p/900.0*uPert.y*3.0, 0.0)*2.0 - 1.0;
  vec2 c = p - FRAME*0.5;
  float ang = atan(c.y, c.x)/6.2831853 + 0.5;
  float rn = vnoise(vec2(ang*uRad.y, length(c)/900.0*uRad.z*4.0), uRad.y)*2.0 - 1.0;
  return d + (uPert.x*n + uRad.x*0.3*rn)*w;
}

void main(){
  vec2 p = clamp(uMap.xy + gl_FragCoord.xy*uMap.zw, vec2(0.0), FRAME);
  vec2 pg = p;
  float mask = 0.0;
  if (uS1 > 0.5) {
    // 1 — Moving blobs (Displacement). Figma's direction (1, -0.18) is y-UP:
    // the content moves right and a little down. In cover-ref.png the letters
    // sit ~18 units right and ~5 down of where Inter puts them, with straight
    // edges — so the blob mask barely varies over them: the stage is mostly a
    // shift (uB1b.y, the mean mask) with a little of the blobs (uB1b.z).
    vec3 P = vec3(p/900.0*uB1a.x, uB1b.w);
    if (uB1c.y > 0.0) { vec4 w = snoiseG(P*0.5 + vec3(3.1, 7.7, 1.3)); P.xy += uB1c.y*0.25*w.xy; }
    vec3 f = fbmG(P, uB1a.y, uB1c.x);
    mask = smoothstep(uB1a.z - uB1a.w, uB1a.z + uB1a.w, 0.5 + 0.5*f.z);
    float m = clamp(uB1b.y + uB1b.z*(mask - 0.5), 0.0, 1.0);
    pg = p - vec2(1.0, 0.18)*uB1b.x*m;
  }
  float t = sdText(pg);
  float ring = smin(t, sdCircles(pg), uSmooth);
  // Wild Outlines' luma threshold, on a mask blurred by 'smoothing', moves the contour.
  ring += (uLumaThr - 0.5)*max(uSmooth, 1.0);
  if (uS2 > 0.5) ring = perturb(ring, p);
  vec2 ps = pg + uColShift;
  o = vec4(sdPic(pg, t), ring, sdPic(ps, sdText(ps)), mask);
  o2 = (uS5 > 0.5 && uR5Half > 0.5) ? refrField(p, uR5a, uR5z.x, uR5z.y, uR5s) : vec4(0.0);
}

//#passB
uniform vec4 uView;       // frame = xy + gl_FragCoord.xy * zw
uniform float uAAB;       // frame units per device px
uniform sampler2D uRT;
uniform vec4 uRtUV;       // uv = (q - xy) / zw
uniform sampler2D uRT2;   // 5's field, when uR5Half
uniform float uR5Half;
uniform float uS2, uS3, uS4, uS5;
out vec4 o;
// the picture, as drawn before the riso (stage 4 off)
uniform vec3 uBgPic;
// 2 rings
uniform vec4 uRingA;      // count, thickness, spacing, offset
uniform vec2 uRingB;      // softness 0..1, phase 0..1
uniform vec2 uRingV;      // opacity, visibility outside the lenses
uniform vec3 uRingC0, uRingC1;
// 3 particles
uniform vec4 uDot;        // cell (per lattice), radius, softness 0..1, threshold 0..1
uniform vec4 uDotB;       // source mix, colour mode, band depth inside the letters, jitter
uniform vec3 uDotC0, uDotC1;
uniform vec4 uDome;       // centre.xy, radius, amplitude (CPU spring)
uniform vec3 uDomeB;      // strength, scale 0..1, z offset
// 4 riso: the ground is paper; each particle prints its inks, misregistered
uniform vec3 uPaper, uInkG, uInkB, uInkY, uInkN;
uniform float uPaperA;    // the ground's opacity: cover-ref.png is 112/255 there
uniform vec4 uInkA;       // opacity: green, blue, yellow, navy
uniform vec4 uMis;        // blue ghost offset xy, yellow ghost offset xy (frame units)
uniform vec4 uInkS;       // size: blue ghost, yellow ghost, navy; yellow chance
uniform float uPale;      // ink opacity of the sparsest particles
uniform vec4 uGradeA;     // exposure (stops), contrast factor, highlights, shadows
uniform vec3 uGradeB;     // saturation, vibrance, temperature
// 5 refraction
uniform vec4 uR5a;        // freq, detail, threshold, softness
uniform vec4 uR5b;        // strength, dispersion, shadow, z
uniform vec2 uR5c;        // octaves, highlight
uniform vec3 uR5s;        // slugs: on, breakup, stretch
uniform float uDebug;     // 1: draw stage 5's lens mask alone
uniform vec4 uBackdrop;   // the site's coverBackdrop: rgb, and 1 = 'solid' (0 = 'sky', nothing behind)

vec4 tapRT(vec2 q){ return textureLod(uRT, (q - uRtUV.xy)/uRtUV.zw, 0.0); }
// A pixel's footprint in the picture, frame units: uAAB, times what a lens
// squeezes into it. Dots and rings are antialiased over it, so a minifying
// lens averages the field into the frosted fill cover-ref.png has, instead of
// point-sampling sharp dots.
float gFoot;

vec4 ring(float d){
  float x = (d - uRingA.w)/uRingA.z + 0.5;
  if (x < 0.0 || x >= uRingA.x) return vec4(0.0);
  float i = floor(x);
  float f = abs(fract(x) - 0.5)*uRingA.z;
  float hw = uRingA.y*0.5;
  float s = uRingB.x*hw + gFoot*0.75;
  float a = 1.0 - smoothstep(hw - s, hw + s, f);
  float t = uRingA.x > 1.0 ? i/(uRingA.x - 1.0) : 0.0;
  a *= 1.0 - uRingB.y*t;
  return vec4(mix(uRingC0, uRingC1, t), a);
}

// 3 — Shape-based particles, re-derived from cover-ref.png:
//   cell = 256 / density (34 → 7.5 units, the reference's spacing), split over
//   TWO jittered lattices, one turned 30°, so the field reads random, not gridded;
//   radius = dotScale × cell / 2 (66 → 2.5 units, the reference's dots);
//   they live where the picture is DARK — outside the letters — thinning to
//   nothing across a band just inside each letter's edge ('threshold' 12 = the
//   darkness below which there are none), smaller and paler as they thin
//   ('source mix' 44);
//   mode 3 = coloured by the picture at colourShift from the particle: the
//   'to' end (navy) where that lands inside a letter — the dotted outline the
//   reference draws along left and bottom edges — else the 'from' end.
struct Part { vec2 c; float r; float a; float t; float h; float in_; float sh; };
const mat2 ROT = mat2(0.8660254, 0.5, -0.5, 0.8660254);
Part part(vec2 x, float l){
  vec2 y = l < 0.5 ? x : ROT*x + vec2(3.7, 1.9)*uDot.x;
  vec2 cell = floor(y/uDot.x);
  vec2 h = hash22(cell + l*57.31);
  vec2 cy = (cell + 0.5 + (h - 0.5)*uDotB.w)*uDot.x;
  vec2 c = l < 0.5 ? cy : transpose(ROT)*(cy - vec2(3.7, 1.9)*uDot.x);
  vec4 s = tapRT(c);
  float D = smoothstep(-uDotB.z, 1.0, s.x);                 // darkness 0 (deep in a letter) .. 1
  float pres = clamp((D - uDot.w)/(1.0 - uDot.w), 0.0, 1.0);
  float h2 = hash12(cell*1.37 + l*91.3 + 7.1);
  Part P;
  P.c = c;
  P.r = uDot.y*mix(1.0, D, uDotB.x);
  P.a = step(h2, pres)*mix(uPale, 1.0, D*D);
  P.t = smoothstep(-1.0, 1.0, s.x)*(1.0 - smoothstep(-1.0, 1.0, s.z));
  P.h = fract(h2*13.7);
  P.in_ = 1.0 - smoothstep(-1.0, 1.0, s.x);                 // 1 inside a letter
  P.sh = smoothstep(-1.0, 1.0, s.z);                         // 1 where its shifted lookup is outside
  return P;
}
float disc(vec2 x, Part P, float scale){
  float r = P.r*scale;
  float soft = max(r*uDot.z, gFoot);
  return P.a*(1.0 - smoothstep(r - soft, r + gFoot*0.5, length(x - P.c)));
}

vec3 grade(vec3 c){
  vec3 lin = pow(max(c, 0.0), vec3(2.2))*exp2(uGradeA.x);
  lin.r *= 1.0 + uGradeB.z*0.3;
  lin.b *= 1.0 - uGradeB.z*0.3;
  c = pow(lin, vec3(1.0/2.2));
  c = (c - 0.5)*uGradeA.y + 0.5;
  c = tones(max(c, 0.0), uGradeA.z, uGradeA.w);
  float l = luma(c);
  c = mix(vec3(l), c, 1.0 + uGradeB.x);
  float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  return mix(vec3(l), c, 1.0 + uGradeB.y*(1.0 - clamp(sat, 0.0, 1.0)));
}

// Everything below is PREMULTIPLIED rgba: cover-ref.png is not opaque (its
// ground is 44%, its inks 50–100%), and the plane that will carry this samples
// a premultiplied texture anyway.
vec4 over(vec4 c, vec3 ink, float a){ return vec4(ink*a, a) + c*(1.0 - a); }

vec4 shade(vec2 q, float lens){
  vec4 s = tapRT(q);
  vec4 col;
  if (uS4 > 0.5) col = vec4(uPaper*uPaperA, uPaperA);       // no ink on the ground: letters and purple alike
  else col = vec4(mix(uBgPic, vec3(1.0), clamp(0.5 - s.x/(uAAB*2.0), 0.0, 1.0)), 1.0);
  // deep inside a letter no particle can reach: skip the six lattice lookups
  if (uS3 > 0.5 && s.x > -uDotB.z - 3.0*uDot.x) {
    // the dome pushes the particles, not the picture under them
    vec2 x = q;
    float hd = 0.0;
    if (uDome.w > 0.001) {
      vec2 dv = q - uDome.xy;
      float rr = length(dv)/uDome.z;
      if (rr < 1.0) {
        hd = clamp(sqrt(1.0 - rr*rr) + uDomeB.z, 0.0, 1.0)*uDome.w;
        x = q - dv*(uDomeB.x/uDome.z)*hd;
      }
    }
    float grow = 1.0 + uDomeB.y*hd;
    if (uS4 > 0.5) {
      // 4 — each particle prints a blue ghost and a yellow ghost
      // (misregistered by uMis, as measured on cover-ref.png) under green, or
      // under navy at the outline. The sparse ones just inside a letter print
      // one ink, chosen the way mode 3 chooses: yellow where their shifted
      // lookup is still inside (the left and bottom edges), green where it is
      // out (the right and top). Laid blue, yellow, green, navy.
      float cg = 0.0, cb = 0.0, cy = 0.0, cn = 0.0;
      for (int l = 0; l < 2; l++) {
        float fl = float(l);
        Part P = part(x, fl);
        float outside = 1.0 - P.in_;
        cg = max(cg, (1.0 - P.t)*mix(P.sh, 1.0, outside)*disc(x, P, grow));
        cn = max(cn, P.t*disc(x, P, grow*uInkS.z));
        vec2 xb = x - uMis.xy;
        Part B = part(xb, fl);
        cb = max(cb, (1.0 - B.in_)*disc(xb, B, grow*uInkS.x));
        vec2 xy = x - uMis.zw;
        Part Y = part(xy, fl);
        cy = max(cy, (1.0 - Y.t)*step(Y.h, uInkS.w)*mix(1.0 - Y.sh, 1.0, 1.0 - Y.in_)*disc(xy, Y, grow*uInkS.y));
      }
      col = over(col, uInkB, cb*uInkA.y);
      col = over(col, uInkY, cy*uInkA.z);
      col = over(col, uInkG, cg*uInkA.x);
      col = over(col, uInkN, cn*uInkA.w);
    } else {
      for (int l = 0; l < 2; l++) {
        Part P = part(x, float(l));
        vec3 base = col.rgb/max(col.a, 1e-4);
        vec3 dc = uDotB.y < 0.5 ? base : uDotB.y < 1.5 ? vec3(1.0) : uDotB.y < 2.5 ? vec3(0.0) : mix(uDotC0, uDotC1, P.t);
        col = over(col, dc, disc(x, P, grow));
      }
    }
  }
  if (uS2 > 0.5) {
    // 2 — the rings show through the lenses (cover-ref.png has none on the open page)
    vec4 r = ring(s.y);
    col = over(col, r.rgb, r.a*uRingV.x*mix(uRingV.y, 1.0, lens));
  }
  return col;
}
vec4 gradeP(vec4 c){ return c.a > 0.0 ? vec4(grade(c.rgb/c.a)*c.a, c.a) : c; }

void main(){
  vec2 p = uView.xy + gl_FragCoord.xy*uView.zw;
  vec4 col;
  gFoot = uAAB;
  if (uS5 > 0.5) {
    // 5 — Moving blobs (Refraction). Its noise field is read from pass A's
    // half-res second target, or computed here at full res (uR5Half 0).
    vec4 fld = uR5Half > 0.5 ? textureLod(uRT2, (p - uRtUV.xy)/uRtUV.zw, 0.0)
                             : refrField(p, uR5a, uR5b.w, uR5c.x, uR5s);
    float mask = fld.z, rim = fld.w;
    if (uDebug > 0.5) { o = vec4(vec3(mask), 1.0); return; }
    // the direction back out of the offset: offset = R(dir) (0.075 mask, 0.14 rim)
    float ol = length(fld.xy);
    vec2 u = ol > 1e-6 ? fld.xy/ol : vec2(1.0, 0.0);
    vec2 cs = normalize(vec2(0.075*mask, 0.14*rim) + vec2(1e-6, 0.0));
    vec2 dir = vec2(u.x*cs.x + u.y*cs.y, u.y*cs.x - u.x*cs.y);
    vec2 q = p + fld.xy*900.0*uR5b.x;
    // across a slug the lens maps at 1 − k (k = minify × strength): flipped and
    // squeezed. The footprint is floored at one frame unit — cover-ref.png's
    // pixel — so the frosting is the reference's at any size and DPR.
    if (uR5s.x > 0.5) gFoot = mix(uAAB, max(uAAB, 1.0), mask)*max(1.0, abs(1.0 - uR5s.y*uR5b.x*mask));
    vec2 S = dir*(0.024*900.0)*rim*uR5b.y;
    // (a split under half a device pixel is not drawn: it cannot be seen)
    if (dot(S, S) > 0.25*uAAB*uAAB) {
      vec4 g = shade(q, mask);
      col = vec4(shade(q + S, mask).r, g.g, shade(q - S, mask).b, g.a);
    } else col = shade(q, mask);
    if (uS4 > 0.5) col = gradeP(col);
    col.rgb *= 1.0 - uR5b.z*rim*0.6;
    col = over(col, vec3(1.0), clamp(uR5c.y*rim, 0.0, 1.0));   // the rim's highlight
  } else {
    col = shade(p, 0.0);
    if (uS4 > 0.5) col = gradeP(col);
  }
  o = clamp(col, 0.0, 1.0);
  // coverBackdrop: under 'sky' nothing is drawn behind the cover and whatever
  // the page has there (the SkyLayer) shows through its ground; 'solid' lays
  // one colour under it, premultiplied-over.
  if (uBackdrop.a > 0.5) o += vec4(uBackdrop.rgb, 1.0)*(1.0 - o.a);
}
