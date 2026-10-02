/**
 * SkyEngine — a minimal raw-WebGL2 renderer for the sky.
 *
 * One persistent context, one program, one fullscreen triangle. Framework-free
 * (like `motion.ts`): React wiring lives in `SkyLayer`. It owns a self-contained
 * rAF loop that:
 *   • LERPS the EnvState-derived scalars (sun, phase, cloud, fog, rain, storm,
 *     wind) toward their targets each frame (the same exponential ease as the
 *     grid motion) so any weather/time change — real or a forced override —
 *     cross-fades over `skyTransitionMs` instead of snapping,
 *   • advances the drift with uTime so the deck blows and the bank rolls (and
 *     freezes that drift under reduced motion → one static frame),
 *   • schedules LIGHTNING on the CPU (see {@link flashEnvelope}) and feeds it in
 *     as one uniform, and
 *   • pauses entirely while the tab is hidden (no rAF work in the background).
 *
 * THE FRAGMENT SHADER IS THE PROTOTYPE'S — `docs/prototypes/sky-prototype.html`,
 * minus its snow layer (see `docs/sky.md` for why there is no snow). It paints,
 * in order: a noise-warped zenith→horizon gradient, the sun's glow, stars and a
 * moon, a cloud deck, a fog bank, rain, lightning, then saturation and grain.
 * Every weather state is a THING THAT IS DRAWN; nothing here is a tint over a
 * colour field, which is what the four-colour field this replaced could only do.
 *
 * The one deliberate difference from the prototype: the time-of-day palette
 * arrives as `uZenith` / `uHorizon` uniforms instead of a GLSL `palette()` with
 * the hexes in it, so `palette.ts` stays the single editable place for a colour.
 */
import { config } from '../config';
import type { LiveConfig } from '../config';
import { createBandSweep, createRectMeans } from './bandSweep';
import { MAX_SPLATS, createFluid } from './fluid';
import type { Fluid, Splat } from './fluid';
import { afterFirstPaint } from '../firstPaint';
import { skyGradientAt } from './palette';
import type { DayPhase } from '../env/types';
import { elevationFromHeight } from '../env/sun';

const VERT = `#version 300 es
out vec2 vUv;
void main() {
  // Fullscreen triangle (minimal equivalent of a fullscreen quad), no buffer.
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/**
 * THE ARC THE SKY IS DRAWN ON — where a body sits on screen, for the sun and
 * the moon alike. In uv, x from the left and y from the BOTTOM:
 *
 *   x  x0 on the rising side (east) → x1 on the setting side (west). The sky
 *      is drawn looking SOUTH, so east is on the left.
 *   y  y0 → y1 over the 0..1 ELEVATION scale of `sun.ts`, twilight band and
 *      all — so a body on the horizon (height 0) sits at the same row
 *      whichever body it is.
 *
 * The sun takes x from its phase (rising / setting) and y from its elevation,
 * in the shader. The moon takes x from its AZIMUTH (90° → x0, 270° → x1) and
 * y from sin(altitude) through the same elevation function, on the CPU — see
 * {@link moonScreen}. One set of numbers, so the two cannot drift apart.
 */
const ARC = { x0: 0.24, x1: 0.76, y0: -0.06, y1: 0.86 } as const;

/** The moon's disc: radius in screen HEIGHTS (the metric the shader measures
 *  in, so it is round at any aspect), and the soft edge either side of it. */
const MOON = { r: 0.036, edge0: 0.04, edge1: 0.032 } as const;

/** The last few degrees over the horizon, over which the moon fades in (and,
 *  setting, out) rather than popping. Below 0° it is not drawn at all. */
const MOON_FADE_DEG = 3;

const DEG = Math.PI / 180;

/** How fast a star twinkles, radians of its sine per shader second. One
 *  number for the shader and for the sweep that has to cover its cycle. */
const TWINKLE_RATE = 1.7;

/** Where a moon at (altitude, azimuth) sits on screen, in uv (y from the
 *  BOTTOM) — the sun's mapping, fed the moon's real place. */
export function moonScreen(altitude: number, azimuth: number): { x: number; y: number } {
  const side = (azimuth - 90) / 180; // 0 east … 1 west, off the edges beyond
  return {
    x: ARC.x0 + (ARC.x1 - ARC.x0) * side,
    y: ARC.y0 + (ARC.y1 - ARC.y0) * elevationFromHeight(Math.sin(altitude * DEG)),
  };
}

/** How much of the moon is drawn at an apparent altitude: 0 below the
 *  horizon, 1 from {@link MOON_FADE_DEG} up, smoothstepped between. */
export function moonVisibility(altitude: number): number {
  const t = Math.min(1, Math.max(0, altitude / MOON_FADE_DEG));
  return t * t * (3 - 2 * t);
}

/** Where the moon is on SCREEN: x from the left, y from the TOP, radius in
 *  heights out to the far side of its soft edge — what consumers want — and
 *  its altitude, so a caller can tell a moon that is up from one that is not. */
export interface MoonAt { x: number; y: number; r: number; altitude: number; visible: boolean }

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform vec2  uRes;
uniform float uTime;
uniform vec3  uZenith;   // time-of-day palette, top of screen
uniform vec3  uHorizon;  // …and bottom
uniform float uSun;      // 0 night .. 1 noon
uniform float uPhase;    // 0 rising .. 1 setting
uniform float uCloud;    // coverage 0..1
uniform float uFog;      // 0..1
uniform float uRain;     // 0..1
uniform float uStorm;    // 0..1
uniform float uWind;     // 0..1
uniform float uFlash;    // lightning envelope 0..1
uniform float uDrift;    // motion multiplier
uniform float uCloudScale;
uniform float uFogHeight;
uniform float uSat;
uniform float uGrain;
uniform float uStarSize;   // star disc radius; 1 = the old dot, 2 = twice it
uniform float uMoonFrac;   // illuminated fraction, 0 new .. 1 full
uniform vec2  uMoonPos;    // uv of the disc's centre (y from the bottom)
uniform float uMoonVis;    // 0 under the horizon … 1 from 3° up
uniform vec2  uMoonLimb;   // direction of the bright limb on screen (toward the sun)
uniform float uMoonLight;  // moonGlow × fraction × sin(altitude) × visibility
uniform float uMoonSize;   // disc radius; 1 = the flat disc this replaced
uniform float uMoonEarth;  // earthshine: what the unlit side still gives back
uniform float uMoonSoft;   // terminator softness, in cosine of incidence
// ---- the wake (see fluid.ts): xy velocity in screen heights / s, z density
uniform sampler2D tFluid;
uniform float uFluidOn;    // 0 while the field is asleep: no fetch, no effect
uniform float uFluidWarp;  // every noise sample moves with the wake
uniform float uStarPush;   // stars are carried along it…
uniform float uStarGlow;   // …and brighten and twinkle harder in it
uniform float uGradPush;   // the base gradient itself is dragged by it…
uniform float uGradSwirl;  // …and drifts toward the horizon colour in its wake
uniform float uCloudPart;  // the deck thins under it
uniform float uFogPart;    // the bank opens under it
uniform float uRainBend;   // rain streaks are bent by it
uniform float uFluidDebug; // dev: draw tFluid in the corner

float hash(vec2 p){ p = fract(p*vec2(123.34,345.45)); p += dot(p,p+34.345); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); float a=hash(i), b=hash(i+vec2(1,0)), c=hash(i+vec2(0,1)), d=hash(i+vec2(1,1)); vec2 u=f*f*(3.0-2.0*f); return mix(mix(a,b,u.x),mix(c,d,u.x),u.y); }
float fbm5(vec2 p){ float v=0.0,a=0.5; for(int i=0;i<5;i++){ v+=a*vnoise(p); p=p*2.02+vec2(1.7,9.2); a*=0.5; } return v; }
float fbm3(vec2 p){ float v=0.0,a=0.5; for(int i=0;i<3;i++){ v+=a*vnoise(p); p=p*2.02+vec2(1.7,9.2); a*=0.5; } return v; }

float rainLayer(vec2 uv, float aspect, float speed, float scale, float seed, float t, vec2 bend){
  vec2 p = uv*vec2(aspect,1.0) - bend;             // a gust bends the drops
  p.x += (1.0-uv.y)*(0.10+uWind*0.30);           // slant with wind
  p *= vec2(scale, scale*0.22);
  p.y += t*speed;
  vec2 id=floor(p), f=fract(p);
  float h=hash(id+seed);
  float on = step(1.0-uRain*0.55, h);
  float streak = smoothstep(0.40,0.5,f.x)*smoothstep(0.60,0.5,f.x) * smoothstep(0.0,0.25,f.y)*smoothstep(1.0,0.55,f.y);
  return on*streak;
}

void main(){
  float aspect = uRes.x/max(uRes.y,1.0);
  vec2 uv = vUv;
  float t = uTime*uDrift;
  float sun = clamp(uSun,0.0,1.0);

  float dayAmt  = smoothstep(0.0,0.35,sun);                                // how much daylight
  float lowAmt  = smoothstep(0.0,0.12,sun)*(1.0-smoothstep(0.2,0.48,sun)); // golden hour
  float nightAmt= 1.0-smoothstep(0.0,0.12,sun);
  vec3 sunCol = mix(vec3(1.0,0.52,0.28), vec3(1.0,0.97,0.90), smoothstep(0.05,0.42,sun));

  // ---- the wake. One fetch, and only while the field is awake — asleep, every
  // term below is an exact zero and this is the sky it was before the fluid.
  vec3 fl = uFluidOn > 0.5 ? texture(tFluid, uv).xyz : vec3(0.0);
  vec2 fv = fl.xy;                              // heights / s, both axes
  float fz = clamp(fl.z, 0.0, 1.0);             // density
  // Every noise sample is read UPSTREAM of the wake, so what it draws is carried
  // along the wake rather than against it.
  vec2 nuv = uv - fv*uFluidWarp/vec2(aspect,1.0);

  // ---- base sky: soft vertical gradient, gently warped so it reads painted, not printed
  // …with a heat-shimmer in the horizon band by day: the low air is what moves.
  //
  // …and the wake pushes the GRADIENT ITSELF around, like paint pulled through
  // water. Three things ride the flow, and they compound:
  //   · the point the gradient is sampled at  (uv − push),
  //   · the position along the ramp that point lands on (again, − push.y), so
  //     a drag both moves the paint and re-reads it further down the palette,
  //   · the hue, drifting toward the horizon colour by the wake's own density.
  // A fast sweep at dusk therefore drags the warm horizon up into the zenith
  // blue, and it relaxes back as the field decays. This is not what air does —
  // air does not carry colour — and it is the reference's look, deliberately.
  // It is only ever SEEN where the gradient is: the deck and the bank paint
  // over it, so an overcast sky has none of it without a line of code saying so.
  vec2 shim = fv*0.01*(1.0-smoothstep(0.0,0.35,uv.y))*dayAmt;
  // The push fades out below 0.7 heights a second and is gone below 0.2 — the
  // same fade the stars take, for the same reason. A wake does not simply
  // decay: at fluidCurl 20 the vorticity confinement keeps its eddies turning
  // at about 0.15 heights/s for as long as the field is awake, and at this
  // strength that floor is a tenth of the ramp. Without the fade, 0.5% of a
  // dusk frame is still 8 levels out at 3s, 5s and 7s — it plateaus, it does
  // not decay, and then the field sleeps and it snaps back. The fade also
  // keeps the drag WHERE THE CURSOR WENT: the same sweep moves 47% of the
  // frame without it and 30% with it. Mid-sweep, where the wake is fast, it
  // does nothing.
  vec2 gpush = fv*smoothstep(0.2,0.7,length(fv))*uGradPush/vec2(aspect,1.0);
  float warp = (fbm3(vec2(nuv.x*aspect,nuv.y)*1.4 - gpush - shim + vec2(t*0.02,-t*0.01))-0.5)*0.16;
  float gy = uv.y - gpush.y - shim.y;
  float yy = clamp(gy + warp,0.0,1.0);
  float gpos = clamp(smoothstep(0.0,1.0,yy) - gpush.y,0.0,1.0);
  vec3 col = mix(uHorizon,uZenith,gpos);
  col = mix(col, uHorizon, clamp(fz*uGradSwirl,0.0,1.0));
  // horizon warmth at golden hour — dragged with the gradient, and stirred it glows
  col += sunCol*pow(1.0-clamp(gy,0.0,1.0),3.0)*lowAmt*(0.45 + 0.1*fz);

  // ---- sun glow (position: side by phase, height by elevation)
  vec2 sunPos = vec2(mix(${ARC.x0},${ARC.x1},uPhase), mix(${ARC.y0},${ARC.y1},sun));
  float sd = length((uv-sunPos)*vec2(aspect,1.0));
  float occl = (1.0-uCloud*0.55)*(1.0-uFog*0.75)*(1.0-uStorm*0.7);
  float glow = (exp(-sd*2.2)*0.32 + exp(-sd*8.0)*0.30 + exp(-sd*70.0)*0.75);
  col += sunCol*glow*smoothstep(0.0,0.10,sun)*occl*0.75;

  // ---- stars + moon (clear nights)
  // Skipped where they cannot show, the same way the deck and the bank are: a
  // uniform branch on nightAmt. Every term inside is scaled by it, so by day
  // this skips exactly the work a multiply by zero would have thrown away —
  // and it is what pays for the bigger star, which is not free.
  if (nightAmt > 0.0) {
    // Read upstream of the wake, so a star is carried along it and comes back
    // as it decays. The push is in screen heights per (height / s), ×0.05, and
    // it fades out below half a height a second: a star is a pixel, and the
    // last few percent of a wake would otherwise hold it a pixel off for seconds.
    vec2 push = fv*smoothstep(0.3,0.8,length(fv))*uStarPush*0.05;
    vec2 sp = (uv*vec2(aspect,1.0) - push)*150.0; vec2 id=floor(sp); vec2 f=fract(sp)-0.5;
    float h=hash(id);
    // Every star has a size of its own: uStarSize × ±35% from the cell's own
    // hash, so a field of them is not a field of identical dots.
    float sz = 0.10*uStarSize*(0.65 + 0.70*hash(id+11.3));
    // The jitter is held inside the cell, less the disc. The shape is only
    // ever evaluated against its OWN cell, so a star reaching past the edge
    // would be cut off square; a big one wanders a little less instead.
    float room = max(0.5 - sz, 0.0);
    vec2 off=clamp((vec2(hash(id+3.1),hash(id+7.7))-0.5)*0.6, -room, room);
    float d = length(f-off);
    float stir = 1.0 + fz*uStarGlow;
    float twinkle = max(0.0, 0.55+0.45*stir*sin(uTime*${TWINKLE_RATE}+h*80.0));
    // Two tiers, which is what makes it read as a point of light rather than a
    // dot: a bright core over the inner 45% of the disc, then a faint halo out
    // to the full radius. The PEAK is exactly what it was — a star is no
    // brighter than it was, there is just more light around it.
    float star = smoothstep(0.972,1.0,h)
               * mix(smoothstep(sz,0.0,d)*0.45, 1.0, smoothstep(sz*0.45,0.0,d))
               * twinkle*1.3*stir;
    // ---- the moon, where it actually is and with the shape it actually has.
    //
    // Below 2% lit there is nothing to draw, and below the horizon there is
    // nothing to see: either way the whole thing is skipped — a new moon, or a
    // set one, is not a faint disc, it is an absence. (Uniform branches: both
    // are one number for the frame.) A clear night with no moon up is stars.
    vec3 sky = col;
    bool moonUp = uMoonFrac > 0.02 && uMoonVis > 0.0;
    vec2 mp = uMoonPos;
    float md = length((uv-mp)*vec2(aspect,1.0));
    // MOONLIGHT: the air round a bright moon is lit by it — a broad, cool lift
    // of the sky, by how much disc is lit and how high it is (uMoonLight is
    // both, and the dial). The stars under it wash out by the same measure.
    float mlit = moonUp ? uMoonLight*exp(-md*2.2) : 0.0;
    col += vec3(0.85,0.92,1.0)*star*nightAmt*(1.0 - min(0.6, mlit*3.0));
    col += vec3(0.42,0.52,0.78)*mlit*nightAmt;
    if (moonUp) {
    float moon=smoothstep(${MOON.edge0}*uMoonSize,${MOON.edge1}*uMoonSize,md);
    // THE TERMINATOR. Disc-local coords, x right and y up, radius 1 — then
    // treat the disc as what it is, the projection of a sphere, and light it:
    //
    //   z   = the sphere's height at this pixel, sqrt(1 - x² - y²)
    //   ct  = cos of the phase angle = 1 - 2·fraction  (+1 new, 0 quarter, -1 full)
    //   st  = |sin| of it, which is how far round the sun has swung
    //   lam = cos of the angle of incidence = s·x·st - ct·z
    //
    // lam > 0 is the lit hemisphere. The boundary it draws is the same
    // half-ellipse as the flat form (x·s = ct·sqrt(1-y²) — the two are
    // algebraically identical on the terminator), but the QUANTITY is a
    // cosine rather than a distance in x, and that is what makes the soft
    // edge behave at the ends of the month: at full the terminator IS the
    // limb, and a softness measured in x would dim the whole left rim of a
    // full moon by half. Measured in incidence it does not.
    //
    // The axis the light comes along is the BRIGHT LIMB's direction on screen,
    // toward the sun (moon.ts, brightLimbAngle). It used to be x, with a sign
    // for waxing / waning; lit straight from the right, L = (1, 0) and this is
    // the same expression, term for term.
    vec2 q = (uv-mp)*vec2(aspect,1.0)/(${MOON.r}*uMoonSize);
    // Outside |q| = 1 the pixel is not a point on the moon, it is the
    // antialiasing skirt of the silhouette — and there z is 0, which is
    // grazing incidence, which at FULL hands the whole outer rim to the
    // earthshine floor and draws a dark ring round a full moon. Sample the
    // skirt just inside the limb instead, so it takes the lighting of the edge
    // it is feathering. Everywhere inside the disc this does nothing.
    vec2 qc = q*min(1.0, 0.985/max(length(q), 1e-5));
    float z = sqrt(max(0.0, 1.0 - dot(qc,qc)));
    float ct = 1.0 - 2.0*uMoonFrac;
    float st = sqrt(max(0.0, 1.0 - ct*ct));
    vec2 L = uMoonLimb / max(length(uMoonLimb), 1e-4);
    float lam = dot(qc, L)*st - ct*z;
    // The dark side is not black: earthshine — sunlight off the Earth — is
    // what keeps a crescent reading as a whole sphere rather than a sliver.
    float face = mix(uMoonEarth, 1.0, smoothstep(-uMoonSoft, uMoonSoft, lam));
    float mdisc = moon*face;
    // The halo is the lit disc's own light scattered by the air, so it goes
    // with the fraction: full keeps the halo this always had, a crescent has
    // almost none. The wake's response to it (fz) is unchanged.
    float mglow = exp(-md*7.0)*(0.22 + fz*0.3)*uMoonFrac;
    // …and it fades over its last few degrees above the horizon, so a moon
    // rising or setting does not pop.
    col += mix(vec3(0.70,0.78,0.95),vec3(0.96,0.97,1.0),mdisc)*(mdisc*0.85+mglow)*nightAmt*uMoonVis;
    }
    // A deck or a bank the wake has parted shows the stars behind it.
    col = mix(sky, col, (1.0-uCloud*0.9*(1.0-fz*uCloudPart))*(1.0-uFog*0.9*(1.0-fz*uFogPart)));
  }

  // ---- clouds
  // Skipped where they cannot show: no deck at all when there is no coverage
  // (a uniform branch), and no shading sample where this pixel has no cloud.
  // Both skip exactly the work whose result the mix would have multiplied by
  // zero, so the picture is the same to the byte and a clear sky stops paying
  // for ten octaves of cloud it never draws.
  float cov = max(uCloud, uStorm);
  if (cov > 0.0) {
  vec2 cp = vec2(nuv.x*aspect, nuv.y*1.5);
  vec2 wind = vec2(0.015+uWind*0.10, 0.004)*t;
  float n  = fbm5(cp*uCloudScale + wind + vec2(7.0,3.0));
  float nn = smoothstep(0.22,0.78,n);
  float thr = 1.0-cov;
  float cd = smoothstep(thr, thr+0.38, nn);
  cd = mix(cd, 1.0, smoothstep(0.72,1.0,cov)*0.92);      // full cover closes the ceiling; the texture comes from the shading below
  cd *= 0.95+0.05*uStorm;
  // The wake parts the deck, and it closes back. In fog the deck overhead is
  // the top of the same marine layer, so a window in the bank goes through it
  // too — by fogPart — and what it opens onto is sky, not more grey.
  cd *= 1.0 - fz*mix(uCloudPart, max(uCloudPart, uFogPart), uFog);
  if (cd > 0.0) {
  // The shading is read further upstream than the shape, so lit and shadow
  // slide across the cloud in the wake — the deck looks blown, not warped.
  float n2 = fbm5(cp*uCloudScale*2.3 + wind*1.35 + vec2(2.0,11.0) - fv*vec2(1.0,1.5)*uFluidWarp*uCloudScale*4.6);
  float dayLight = mix(0.2,1.0,dayAmt);
  vec3 shadowCol = mix(vec3(0.58,0.63,0.72), vec3(0.28,0.30,0.38), uStorm) * (1.0-uRain*0.22) * dayLight;
  vec3 litCol    = mix(vec3(0.98,0.98,0.97), sunCol*1.05, lowAmt*0.85) * dayLight;
  // underlit at golden hour: the base of the cloud catches the sun
  litCol = mix(litCol, sunCol*1.1*dayLight, lowAmt*smoothstep(0.6,0.2,uv.y)*0.6);
  litCol *= 1.0 - uStorm*0.55 - uRain*0.15;
  vec3 cloudCol = mix(shadowCol, litCol, smoothstep(0.30,0.85,n2));
  cloudCol += vec3(0.9,0.92,1.0)*uFlash*0.9;             // lightning lights the deck from inside
  col = mix(col, cloudCol, cd);
  }
  }
  col *= 1.0 - uStorm*0.22*(1.0-uFlash);                 // storm dims the whole scene

  // ---- fog: a bright bank rolling in low, not a grey tint (none, no bank)
  if (uFog > 0.0) {
    vec2 fp = vec2(nuv.x*aspect, nuv.y);
    float fn = fbm5(fp*1.25 + vec2(t*(0.035+uWind*0.06), t*0.012) + vec2(20.0,5.0) - fv*0.05);
    float vb = 1.0-smoothstep(0.0, uFogHeight, uv.y);
    float fd = uFog*smoothstep(0.30,0.82, fn*0.62 + vb*0.60);
    fd *= 1.0 - fz*uFogPart;                               // a window in the bank, filling back in
    vec3 fogCol = mix(vec3(0.30,0.34,0.44), vec3(0.91,0.91,0.89), smoothstep(0.0,0.32,sun));
    fogCol = mix(fogCol, fogCol*mix(vec3(1.0),sunCol,0.55), lowAmt);
    col = mix(col, fogCol, fd);
    col += sunCol*exp(-sd*3.0)*fd*lowAmt*0.25;           // sun bleeding through the bank
  }

  // ---- rain
  if(uRain>0.001){
    // A gust, not the eddies. A streak follows the curve the bend draws, so
    // what leans a drop is how fast the bend CHANGES, not how big it is — read
    // at the pixel, the fine curl the sim keeps would tie every streak in a
    // knot. Four taps a tenth of the height apart are the gust without it; the
    // offset is a tenth of rainBend × the gust, capped, so the fastest wake
    // leans the rain rather than smearing it.
    vec2 bend = vec2(0.0);
    if (uFluidOn > 0.5) {
      vec2 o = vec2(0.1/aspect, 0.1);
      vec2 g = texture(tFluid, uv+o).xy + texture(tFluid, uv-o).xy
             + texture(tFluid, uv+vec2(o.x,-o.y)).xy + texture(tFluid, uv+vec2(-o.x,o.y)).xy;
      bend = g*0.25*uRainBend*0.1;
      float bl = length(bend);
      if (bl > 0.03) bend *= 0.03/bl;
    }
    float r = rainLayer(uv,aspect,3.6,70.0,1.0,t,bend)*0.55 + rainLayer(uv,aspect,2.4,42.0,2.0,t,bend)*0.40;
    vec3 streak = mix(col, vec3(0.86,0.89,0.94), 0.55);
    col = mix(col, streak, r*uRain*0.85);
  }
  // ---- lightning lifts everything for a frame
  col += vec3(0.85,0.88,1.0)*uFlash*0.35;

  // saturation dial + grain
  float l = dot(col, vec3(0.299,0.587,0.114));
  col = mix(vec3(l), col, uSat);
  col += (hash(vUv*uRes + fract(uTime))-0.5)*uGrain;
#ifdef FLUID_DEBUG
  // dev: tFluid in the bottom-left corner — velocity as red/green about grey,
  // density as blue — with a hairline round it.
  if (uFluidDebug > 0.5 && vUv.x < 0.25 && vUv.y < 0.25) {
    vec2 q = vUv*4.0;
    vec3 d = texture(tFluid, q).xyz;
    col = vec3(0.5+0.25*d.x, 0.5+0.25*d.y, clamp(d.z,0.0,1.0));
    if (q.x > 0.99 || q.y > 0.985) col = vec3(1.0);
  }
#endif
  fragColor = vec4(clamp(col,0.0,1.0),1.0);
}`;

/** The debug corner is compiled into the dev build only. */
const FRAG_SRC = import.meta.env.DEV ? FRAG.replace('\n', '\n#define FLUID_DEBUG\n') : FRAG;

/** EnvState-derived targets the engine lerps toward. */
export interface SkyTarget {
  /** 0 = deep night, 1 = high noon. */
  sun: number;
  /** Rising → the low-sun band is dawn; setting → dusk. Eased as 0..1. */
  dayPhase: DayPhase;
  /** Cloud coverage, 0..1 — straight from `cloudiness`. */
  cloud: number;
  /** The fog bank, 0..1. A STATE, not a function of cloudiness. */
  fog: number;
  /** Rain streak density, 0..1 — straight from `precipitation`. */
  rain: number;
  /** Thunderstorm, 0..1: closes the deck, dims the scene, arms the lightning. */
  storm: number;
  /** Normalized wind: slants the rain, blows the deck, rolls the bank. */
  wind: number;
  /** Illuminated fraction of the moon, 0 (new) .. 1 (full). Under 0.02 the
   *  moon is not drawn at all. */
  moonFraction: number;
  /** Apparent altitude, degrees. Below 0 the moon is not drawn; it fades in
   *  over the first {@link MOON_FADE_DEG}. */
  moonAltitude: number;
  /** Azimuth, degrees from north through east. Sets which side it is on. */
  moonAzimuth: number;
  /** The bright limb's direction on screen, radians: 0 right, π/2 up. */
  moonLimb: number;
}

/** The numeric form the engine eases (dayPhase collapsed to 0 rising / 1
 *  setting; the moon as a screen position, an altitude for its fade, and its
 *  bright limb as a vector so an angle never has to wrap). */
type EasedSky = {
  sun: number; phase: number; cloud: number; fog: number; rain: number; storm: number; wind: number;
  moonFraction: number; moonX: number; moonY: number; moonAlt: number; moonLimbX: number; moonLimbY: number;
};

const KEYS = [
  'sun', 'phase', 'cloud', 'fog', 'rain', 'storm', 'wind',
  'moonFraction', 'moonX', 'moonY', 'moonAlt', 'moonLimbX', 'moonLimbY',
] as const;

function toEased(t: SkyTarget): EasedSky {
  // The moon eases on SCREEN, not in the sky: an azimuth would have to wrap
  // at north, and the only moon that does that over San Francisco is one
  // under the horizon. A forced moon glides to where it is sent.
  const moon = moonScreen(t.moonAltitude, t.moonAzimuth);
  return {
    sun: t.sun,
    phase: t.dayPhase === 'setting' ? 1 : 0,
    cloud: t.cloud,
    fog: t.fog,
    rain: t.rain,
    storm: t.storm,
    wind: t.wind,
    moonFraction: t.moonFraction,
    moonX: moon.x,
    moonY: moon.y,
    moonAlt: t.moonAltitude,
    // The limb as a vector, so waxing → waning is a cross-fade and not an angle
    // spinning the long way round. A flip only ever happens AT new or full,
    // where the terminator is off the disc either way.
    moonLimbX: Math.cos(t.moonLimb),
    moonLimbY: Math.sin(t.moonLimb),
  };
}

/** A splat, as {@link SkyEngine.splat} takes it: CSS px and CSS px / s. */
export interface SweepSplat { x: number; y: number; dx: number; dy: number }

export interface SweepOptions {
  /**
   * The wake, frame by frame at 60 Hz: what is splatted into it on each
   * frame (often nothing — the frames after a swipe are it decaying). The
   * field is cleared first, so the sweep is the same wake every time.
   */
  frames: SweepSplat[][];
  /** Measure after every Nth frame (and, before the first, at rest). */
  sampleEvery: number;
  /**
   * The shader clock at the first measurement, seconds. Every measurement
   * after it is taken a further 1/{@link phases} of a TWINKLE CYCLE on — not
   * 1/60 s — because the stars twinkle in near-lockstep (every star cell's
   * phase lies within about a third of a cycle of the others') and a single
   * clock can put every star in the band at the bottom of its cycle at once.
   * The drift those jumps also move is under a pixel.
   */
  time: number;
  /** Clock phases per twinkle cycle; the still sky is measured at all of them. */
  phases: number;
  /** Dials to hold for the sweep — the worst the dock can set — and then
   *  put back. */
  config?: Partial<LiveConfig>;
}

export interface SweepResult {
  /** Per state: the brightest pixel over every sampled frame, RGB 0..255. */
  colors: [number, number, number][];
  /** Per state: the brightest pixel with the field asleep — the still sky. */
  rest: [number, number, number][];
  /** Per state: the frame it was brightest at (−1 = at rest). */
  frame: number[];
  /** Frames measured, including the one at rest. */
  samples: number;
  ms: number;
}

/** A rect of the viewport, CSS px from its top-left. */
export interface ViewRect { x: number; y: number; w: number; h: number }
/** A colour as 0..255 sRGB. */
export type RGB8 = [number, number, number];

export interface SkyEngine {
  /** Set the EnvState targets. `immediate` snaps (used for the first paint). */
  setEnv(target: SkyTarget, immediate?: boolean): void;
  /** Freeze the drift + the lightning, and use quick transitions (reduced motion). */
  setReducedMotion(reduced: boolean): void;
  /** Re-read the viewport + `skyResolution` and resize the backing store. */
  syncSize(): void;
  /**
   * The BRIGHTEST pixel in a horizontal band of the sky, as 0..255 sRGB —
   * dev-only, for the contrast probe. `y0`/`y1` are fractions of the viewport
   * measured from the TOP. Pass `at` to sample a hypothetical sky (the probe
   * asks for clear noon, the brightest the sky ever gets) without disturbing
   * the live one.
   */
  sampleBand(y0: number, y1: number, at?: SkyTarget): [number, number, number] | null;
  /**
   * DEV: THE SWEEP. The brightest pixel of the band `y0`–`y1` (fractions of
   * the viewport from the TOP, as {@link sampleBand}) for every sky in
   * `states`, at its WORST over a synthetic wake — see {@link SweepOptions}.
   * Draws nothing to the screen; the live sky is put back when it is done.
   */
  sweepBand(y0: number, y1: number, states: SkyTarget[], opts: SweepOptions): SweepResult | null;
  /**
   * THE CHROME'S SKY: the MEAN colour of the live sky inside each rect, as
   * 0..255 sRGB — what the chrome's paper takes its hue from
   * (src/chrome/chromeColor.ts). The sky WITHOUT its wake: the weather, not
   * the air the page stirs. ASYNCHRONOUS, and never a stall: at the next
   * frame the rects are drawn (scissored, wake off) and copied into a pixel
   * buffer just before the frame is drawn over them, a fence is set, and
   * the bytes are fetched once the GPU has passed the fence — a frame or two
   * later. One request at a time; a newer one replaces a queued one (which
   * resolves null). Null when there is nothing to read (a hidden tab, no
   * backing store). The chrome asks about twice a second, never per frame.
   */
  readMeans(rects: ViewRect[]): Promise<RGB8[] | null>;
  /** DEV: the same question, answered synchronously (a stall), of the live
   *  sky or of the hypothetical sky `at` — for the contrast probe. */
  sampleMeans(rects: ViewRect[], at?: SkyTarget): RGB8[] | null;
  /**
   * DEV: THE SWEEP, for the chrome. The mean of every rect for every sky in
   * `states`, at rest and at every measured frame of the synthetic wake
   * (see {@link SweepOptions}), reduced on the GPU (`createRectMeans`).
   * Each measurement is handed to `onSample` (frame −1 = at rest) rather
   * than returned: what is worst depends on what the caller makes of the
   * colour. The live sky is put back afterwards.
   */
  sweepMeans(
    rects: ViewRect[],
    states: SkyTarget[],
    opts: SweepOptions,
    onSample: (state: number, rect: number, color: RGB8, frame: number) => void,
  ): { samples: number; ms: number } | null;
  /**
   * Per-frame GPU cost, in ms — dev-only, for `scripts/sky-perf.mjs`. Returns
   * one mean per BATCH of `batch` frames.
   *
   * Two things make this the shape it is. `drawArrays` only QUEUES the work, so
   * timing around one call measures how fast this thread can talk to the driver
   * and not how long the shader takes; the batch is closed with a one-pixel
   * `readPixels`, which the driver cannot answer without finishing every draw
   * behind it. And `performance.now()` is clamped to 100µs in a page that is
   * not cross-origin isolated, so a single frame of this shader can land inside
   * the clock's own resolution — averaging over a batch is what gets the number
   * out from under it.
   */
  benchmark(frames?: number, batch?: number, withFluid?: boolean): number[];
  /** The GL renderer string, for a perf table that says what it ran on. */
  renderer(): string;
  /** Where the moon is drawn, in screen terms — see {@link MoonAt}. Scales
   *  with `moonSize`, so a caller looking for the disc finds it. Pass `at`
   *  to ask where it is in THAT sky rather than in the live, eased one: the
   *  moon moves now, and a caller measuring a forced sky wants that sky's. */
  moonAt(at?: SkyTarget): MoonAt;
  /**
   * DISTURB THE SKY at a point: push air through it at `(x, y)` — CSS pixels
   * from the viewport's top-left — moving at `(dx, dy)` CSS px / s, scaled by
   * `strength`. The wake's velocity is the push; its density (what thins the
   * deck and opens the fog) is the push's speed. Ignored while the fluid is
   * off, under reduced motion, and when WebGL cannot render half floats.
   */
  splat(x: number, y: number, dx: number, dy: number, strength?: number): void;
  /** Dev: whether the fluid is awake — anything non-zero in the field. */
  fluidAwake(): boolean;
  /** Dev: pin the shader's clock (drift, twinkle, grain) and zero the lightning,
   *  so two captures differ only by what the wake did. `null` lets it run. */
  pinTime(seconds: number | null): void;
  /** Dev: freeze the wake where it is (the solver skips its steps and the
   *  pointer is ignored), so a capture can be taken of one exact frame of it —
   *  a screenshot is slower than the field is. `false` lets it run on. */
  holdFluid(hold: boolean): void;
  dispose(): void;
}

/** A shader, its compile STARTED — no status read here: that would make the
 *  main thread wait for it (see `programReady` in createSkyEngine). */
function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  return sh;
}

const SETTLE_EPSILON = 0.0005;
const REDUCED_TRANSITION_MS = 150;
const MAX_DT = 0.05; // clamp the post-background frame jump

/** Fastest push a splat carries, in screen heights / s. */
const SPLAT_SPEED_MAX = 4;
/** Density a splat lays down per (screen height / s) of its speed, up to 1. */
const DENSITY_PER_SPEED = 1;

/** Storm level above which lightning is armed. */
const FLASH_ARMED_AT = 0.3;
/** Gap between flashes, in ms — uniform in this range (the prototype's). */
const FLASH_GAP_MIN_MS = 3500;
const FLASH_GAP_SPAN_MS = 9000;
/**
 * The lightning envelope: THREE BURSTS with exponential decay, the way a real
 * strike reads — a hard leader, a small re-strike a tenth of a second later,
 * and a longer, brighter main stroke behind it. `d` is seconds since the strike
 * began; the result is scaled by how much of a storm there is, so a marginal
 * storm flickers rather than detonates.
 */
export function flashEnvelope(d: number, storm: number): number {
  if (d < 0) return 0;
  const burst = (t0: number, a: number, k: number) => (d > t0 ? a * Math.exp(-(d - t0) / k) : 0);
  const v = burst(0, 1.0, 0.09) + burst(0.1, 0.35, 0.07) + burst(0.18, 0.8, 0.14);
  return Math.min(1, v) * Math.min(1, storm * 1.5);
}

/**
 * Create a sky engine on a canvas, or return null if WebGL2 / program setup
 * fails (the caller then shows the CSS fallback).
 */
export function createSkyEngine(canvas: HTMLCanvasElement): SkyEngine | null {
  const gl = canvas.getContext('webgl2', {
    antialias: false,
    alpha: false,
    // The contrast probe reads pixels back out of this buffer in dev. It does
    // so in the same task as the draw, so no preserved buffer is needed.
    preserveDrawingBuffer: false,
  });
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  // KHR_parallel_shader_compile: the compile and link run on the GPU
  // process's own threads. Asked for here, this engine is made before React's
  // first render (skyStage `prepareSky`) and its first frame is drawn a
  // render and a commit later, so they are done by then; reading the status
  // here (and every uniform's location, which waits for the link too) had the
  // main thread wait ~7 ms for them in the boot's first task
  // (docs/perf/first-second.md).
  gl.getExtension('KHR_parallel_shader_compile');

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const loc = (name: string) => gl.getUniformLocation(program, name);
  const locations = () => ({
    res: loc('uRes'),
    time: loc('uTime'),
    zenith: loc('uZenith'),
    horizon: loc('uHorizon'),
    sun: loc('uSun'),
    phase: loc('uPhase'),
    cloud: loc('uCloud'),
    fog: loc('uFog'),
    rain: loc('uRain'),
    storm: loc('uStorm'),
    wind: loc('uWind'),
    flash: loc('uFlash'),
    drift: loc('uDrift'),
    cloudScale: loc('uCloudScale'),
    fogHeight: loc('uFogHeight'),
    sat: loc('uSat'),
    grain: loc('uGrain'),
    fluid: loc('tFluid'),
    fluidOn: loc('uFluidOn'),
    fluidWarp: loc('uFluidWarp'),
    starSize: loc('uStarSize'),
    moonFrac: loc('uMoonFrac'),
    moonPos: loc('uMoonPos'),
    moonVis: loc('uMoonVis'),
    moonLimb: loc('uMoonLimb'),
    moonLight: loc('uMoonLight'),
    moonSize: loc('uMoonSize'),
    moonEarth: loc('uMoonEarth'),
    moonSoft: loc('uMoonSoft'),
    starPush: loc('uStarPush'),
    starGlow: loc('uStarGlow'),
    gradPush: loc('uGradPush'),
    gradSwirl: loc('uGradSwirl'),
    cloudPart: loc('uCloudPart'),
    fogPart: loc('uFogPart'),
    rainBend: loc('uRainBend'),
    fluidDebug: loc('uFluidDebug'),
  });
  let u: ReturnType<typeof locations> | null = null;
  let linked: boolean | null = null;
  /** The program linked (read once, at the first draw), its uniforms found.
   *  If it did not, the canvas hides and the host's CSS gradient — painted
   *  behind it for exactly this — is the sky, as it was when a failed link
   *  meant no engine at all. */
  function programReady(): boolean {
    if (linked === null) {
      linked = gl!.getProgramParameter(program, gl!.LINK_STATUS) === true;
      if (linked) u = locations();
      else {
        console.warn('[sky] program link failed:', gl!.getProgramInfoLog(program), gl!.getShaderInfoLog(vs!), gl!.getShaderInfoLog(fs!));
        canvas.style.visibility = 'hidden';
      }
    }
    return linked;
  }

  // --- eased state ---
  // moonFraction starts at 0 — an unknown moon is no moon, and it eases up to
  // whatever tonight's is with everything else.
  const cur: EasedSky = {
    sun: 0, phase: 0, cloud: 0, fog: 0, rain: 0, storm: 0, wind: 0,
    moonFraction: 0, moonX: 0.5, moonY: -1, moonAlt: -90, moonLimbX: 1, moonLimbY: 0,
  };
  const tgt: EasedSky = { ...cur };
  let reduced = false;
  const startTime = performance.now();

  let running = false;
  let raf = 0;
  let last = performance.now();
  let width = 0;
  let height = 0;

  // --- lightning ---
  let nextFlashAt = performance.now() + FLASH_GAP_MIN_MS;
  let flashStartedAt = -1;

  // --- the wake ---
  // Null where the context cannot render to half floats: the sky then simply
  // has no wake, and every splat is dropped. Made after the first paint: its
  // seven programs and its half-float targets were ~15 ms of the boot's
  // longest task, and until the pointer stirs it there is nothing of it to
  // see (asleep, every fluid term in the shader is an exact zero — the same
  // frame as no fluid at all).
  let fluid: Fluid | null = null;
  let disposed = false;
  afterFirstPaint(() => {
    if (disposed || gl.isContextLost()) return;
    fluid = createFluid(gl);
    // It leaves its own state bound; the sky's back for the next frame.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.viewport(0, 0, width, height);
  });
  const splats: Splat[] = [];
  /** The pointer as last reported, and as last splatted (CSS px). */
  let pointerX = 0;
  let pointerY = 0;
  let pointerSeen = false;
  let splatX = 0;
  let splatY = 0;
  let splatFrom = false;
  let pinned: number | null = null;
  let held = false;

  /** The fluid runs only while it is on, motion is allowed, and it exists. */
  const fluidLive = () => fluid !== null && config.fluidOn && !reduced;

  function queueSplat(x: number, y: number, dx: number, dy: number, strength: number): void {
    if (!fluidLive() || splats.length >= MAX_SPLATS || !(strength > 0)) return;
    const vh = Math.max(1, window.innerHeight);
    const vw = Math.max(1, window.innerWidth);
    // CSS px / s → screen heights / s, y up. Clamped: a flick is a gust, not a
    // detonation, and a card that jumps a whole panel in one frame is a jump.
    let vx = dx / vh;
    let vy = -dy / vh;
    const speed = Math.hypot(vx, vy);
    if (!(speed > 0)) return;
    const cap = SPLAT_SPEED_MAX / speed;
    if (cap < 1) {
      vx *= cap;
      vy *= cap;
    }
    splats.push({
      u: x / vw,
      v: 1 - y / vh,
      vx: vx * strength,
      vy: vy * strength,
      density: Math.min(1, Math.min(speed, SPLAT_SPEED_MAX) * DENSITY_PER_SPEED) * strength,
    });
  }

  function onPointerMove(e: PointerEvent): void {
    pointerX = e.clientX;
    pointerY = e.clientY;
    pointerSeen = true;
  }
  /** A pointer that leaves and comes back somewhere else is not a sweep. */
  function onPointerGone(): void {
    pointerSeen = false;
    splatFrom = false;
  }

  /** One step of the wake: the pointer's splat for this frame, then the solve. */
  function stepFluid(dt: number): void {
    if (!fluid) return;
    if (!fluidLive()) {
      if (fluid.awake()) fluid.clear();
      splats.length = 0;
      splatFrom = false;
      return;
    }
    // NO POINTER, NO SPLAT. A pointer that has not moved since the last frame
    // puts nothing in; the field just goes on decaying.
    if (pointerSeen) {
      if (splatFrom && dt > 0 && (pointerX !== splatX || pointerY !== splatY)) {
        queueSplat(pointerX, pointerY, (pointerX - splatX) / dt, (pointerY - splatY) / dt, config.fluidStrength);
      }
      splatX = pointerX;
      splatY = pointerY;
      splatFrom = true;
    }
    if (held) {
      splats.length = 0;
      splatFrom = false;
      return;
    }
    if (splats.length === 0 && !fluid.awake()) return;
    fluid.step(dt, splats, {
      radius: config.fluidRadius,
      curl: config.fluidCurl,
      velocityDissipation: config.velocityDissipation,
      densityDissipation: config.densityDissipation,
      aspect: window.innerWidth / Math.max(1, window.innerHeight),
    });
    splats.length = 0;
    // The solve leaves its own program, framebuffer and viewport bound.
    gl!.useProgram(program);
    gl!.bindVertexArray(vao);
    gl!.viewport(0, 0, width, height);
  }

  function resize(): void {
    let dpr = Math.min(window.devicePixelRatio || 1, 2) * config.skyResolution;
    // THE PIXEL CAP — off by default, the lever for a slower machine. The sky's
    // cost is per pixel and nothing else, so on a big retina window it is the
    // backing store that decides the frame (a foggy 5K @2x is 5–6ms on an M1
    // Max). Above `skyMaxMegapixels` the store is scaled down to that many
    // pixels and the compositor scales it up; the sky is soft noise and the
    // grain covers it. 5.5 leaves 1440×900 @2x (5.2 MP) untouched. 0 = no cap.
    const cap = config.skyMaxMegapixels * 1e6;
    const area = window.innerWidth * window.innerHeight * dpr * dpr;
    if (cap > 0 && area > cap) dpr *= Math.sqrt(cap / area);
    const w = Math.max(1, Math.round(window.innerWidth * dpr));
    const h = Math.max(1, Math.round(window.innerHeight * dpr));
    if (w === width && h === height) return;
    width = w;
    height = h;
    canvas.width = w;
    canvas.height = h;
    gl!.viewport(0, 0, w, h);
    requestRender();
  }

  /** The flash uniform for this frame. Frozen at 0 under reduced motion — a
   *  static frame is the whole contract there, and a strobe is the one thing it
   *  must never be. */
  function flashFor(now: number): number {
    if (reduced || pinned !== null) return 0;
    if (cur.storm > FLASH_ARMED_AT) {
      if (now > nextFlashAt) {
        flashStartedAt = now;
        nextFlashAt = now + FLASH_GAP_MIN_MS + Math.random() * FLASH_GAP_SPAN_MS;
      }
    } else {
      // Disarmed: hold the next strike off so a storm rolling in does not open
      // with one the same frame it crosses the threshold.
      nextFlashAt = now + 2000;
    }
    if (flashStartedAt < 0) return 0;
    return flashEnvelope((now - flashStartedAt) / 1000, cur.storm);
  }

  function render(nowMs: number, state: EasedSky = cur, flash = flashFor(nowMs), withWake = state === cur): void {
    if (!programReady() || !u) return;
    const g = skyGradientAt(state.sun, state.phase);
    gl!.useProgram(program);
    gl!.uniform2f(u.res, width, height);
    gl!.uniform1f(u.time, reduced ? 0 : pinned ?? (nowMs - startTime) / 1000);
    gl!.uniform3f(u.zenith, g.zenith[0], g.zenith[1], g.zenith[2]);
    gl!.uniform3f(u.horizon, g.horizon[0], g.horizon[1], g.horizon[2]);
    gl!.uniform1f(u.sun, state.sun);
    gl!.uniform1f(u.phase, state.phase);
    gl!.uniform1f(u.cloud, state.cloud);
    gl!.uniform1f(u.fog, state.fog);
    gl!.uniform1f(u.rain, state.rain);
    gl!.uniform1f(u.storm, state.storm);
    gl!.uniform1f(u.wind, state.wind);
    gl!.uniform1f(u.flash, flash);
    gl!.uniform1f(u.drift, config.skyDrift);
    gl!.uniform1f(u.cloudScale, config.cloudScale);
    gl!.uniform1f(u.fogHeight, config.fogHeight);
    gl!.uniform1f(u.sat, config.skySaturation);
    gl!.uniform1f(u.grain, config.skyGrain);
    gl!.uniform1f(u.starSize, config.starSize);
    gl!.uniform1f(u.moonFrac, state.moonFraction);
    const moonVis = moonVisibility(state.moonAlt);
    gl!.uniform2f(u.moonPos, state.moonX, state.moonY);
    gl!.uniform1f(u.moonVis, moonVis);
    gl!.uniform2f(u.moonLimb, state.moonLimbX, state.moonLimbY);
    gl!.uniform1f(
      u.moonLight,
      config.moonGlow * state.moonFraction * Math.max(0, Math.sin(state.moonAlt * DEG)) * moonVis,
    );
    gl!.uniform1f(u.moonSize, config.moonSize);
    gl!.uniform1f(u.moonEarth, config.moonEarthshine);
    gl!.uniform1f(u.moonSoft, config.moonTerminatorSoft);
    // The wake. Asleep (or off, or reduced), uFluidOn is 0 and the shader never
    // fetches it — every fluid term is an exact zero.
    const wake = fluid !== null && fluidLive() && fluid.awake() && withWake;
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, fluid ? fluid.texture() : null);
    gl!.uniform1i(u.fluid, 0);
    gl!.uniform1f(u.fluidOn, wake ? 1 : 0);
    gl!.uniform1f(u.fluidWarp, config.fluidWarp);
    gl!.uniform1f(u.starPush, config.starPush);
    gl!.uniform1f(u.starGlow, config.starGlow);
    gl!.uniform1f(u.gradPush, config.gradientPush);
    gl!.uniform1f(u.gradSwirl, config.gradientSwirl);
    gl!.uniform1f(u.cloudPart, config.cloudPart);
    gl!.uniform1f(u.fogPart, config.fogPart);
    gl!.uniform1f(u.rainBend, config.rainBend);
    gl!.uniform1f(u.fluidDebug, import.meta.env.DEV && config.fluidDebug && fluid ? 1 : 0);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
  }

  function frame(now: number): void {
    const dt = Math.min((now - last) / 1000, MAX_DT);
    last = now;
    const tauMs = reduced ? REDUCED_TRANSITION_MS : config.skyTransitionMs;
    const k = 1 - Math.exp(-dt / (tauMs / 1000));
    let settled = true;
    for (const key of KEYS) {
      cur[key] += (tgt[key] - cur[key]) * k;
      if (Math.abs(tgt[key] - cur[key]) >= SETTLE_EPSILON) settled = false;
    }
    if (settled) for (const key of KEYS) cur[key] = tgt[key];

    stepFluid(dt);
    // The chrome's read-back, if one is waiting: its rects drawn without the
    // wake and copied out, just before the frame is drawn over them.
    if (meansQueued) issueMeans(now);
    render(now);

    // The sky moves continuously while visible — keep going unless reduced
    // motion has frozen it AND everything has settled.
    if (reduced && settled) {
      running = false;
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  function requestRender(): void {
    if (running || document.hidden) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  // --- the chrome's read-back (readMeans) ---
  /** A rect of the viewport as a rect of the backing store, GL's way up. */
  function deviceRect(r: ViewRect): { x: number; y: number; w: number; h: number } {
    const sx = width / Math.max(1, window.innerWidth);
    const sy = height / Math.max(1, window.innerHeight);
    const x0 = Math.max(0, Math.min(width - 1, Math.floor(r.x * sx)));
    const x1 = Math.max(x0 + 1, Math.min(width, Math.ceil((r.x + r.w) * sx)));
    const top = Math.floor(r.y * sy);
    const bottom = Math.ceil((r.y + r.h) * sy);
    const y0 = Math.max(0, Math.min(height - 1, height - bottom));
    const y1 = Math.max(y0 + 1, Math.min(height, height - top));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  function meanOf(px: Uint8Array, from: number, n: number): RGB8 {
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = from; i < from + n * 4; i += 4) {
      r += px[i];
      g += px[i + 1];
      b += px[i + 2];
    }
    return [r / n, g / n, b / n];
  }
  let meansQueued: { rects: ViewRect[]; resolve: (c: RGB8[] | null) => void } | null = null;
  let meansInFlight: {
    sync: WebGLSync;
    sizes: number[];
    bytes: number;
    resolve: (c: RGB8[] | null) => void;
  } | null = null;
  let pbo: WebGLBuffer | null = null;

  /**
   * Draw the queued rects of this moment's sky WITHOUT THE WAKE (and without a
   * lightning flash) into the back buffer, scissored to the rects, copy them
   * into the pixel buffer and fence it. The paper takes its colour from the
   * weather, not from the air a page turn or the pointer stirs: read with the
   * wake, the chrome re-coloured itself through every flip, cross-fading on
   * nearly every frame for nothing anyone asked for (docs/reader.md, Chrome).
   * The caller draws the full frame over the rects straight after.
   */
  function issueMeans(now: number): void {
    const job = meansQueued;
    meansQueued = null;
    if (!job) return;
    if (meansInFlight || width === 0 || height === 0) {
      job.resolve(null);
      return;
    }
    const rects = job.rects.map(deviceRect);
    const sizes = rects.map((r) => r.w * r.h);
    const bytes = sizes.reduce((a, n) => a + n * 4, 0);
    if (!pbo) pbo = gl!.createBuffer();
    gl!.bindBuffer(gl!.PIXEL_PACK_BUFFER, pbo);
    // Fresh storage every time (a few KB), so no read-back ever writes into
    // storage the browser is still shadowing for the last one.
    gl!.bufferData(gl!.PIXEL_PACK_BUFFER, bytes, gl!.STREAM_READ);
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
    gl!.enable(gl!.SCISSOR_TEST);
    rects.forEach((r, i) => {
      gl!.scissor(r.x, r.y, r.w, r.h);
      if (i === 0) render(now, cur, 0, false);
      else gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    });
    gl!.disable(gl!.SCISSOR_TEST);
    let offset = 0;
    rects.forEach((r, i) => {
      gl!.readPixels(r.x, r.y, r.w, r.h, gl!.RGBA, gl!.UNSIGNED_BYTE, offset);
      offset += sizes[i] * 4;
    });
    // Unbound at once: every other readPixels in here reads into client memory.
    gl!.bindBuffer(gl!.PIXEL_PACK_BUFFER, null);
    const sync = gl!.fenceSync(gl!.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (!sync) {
      job.resolve(null);
      return;
    }
    gl!.flush();
    meansInFlight = { sync, sizes, bytes, resolve: job.resolve };
    setTimeout(pollMeans, 0);
  }

  /** Fetch the bytes once the GPU has passed the fence; until then, look
   *  again next tick. Never waits. */
  function pollMeans(): void {
    const job = meansInFlight;
    if (!job) return;
    const status = gl!.clientWaitSync(job.sync, 0, 0);
    if (status === gl!.TIMEOUT_EXPIRED) {
      setTimeout(pollMeans, 16);
      return;
    }
    gl!.deleteSync(job.sync);
    meansInFlight = null;
    if (status === gl!.WAIT_FAILED) {
      job.resolve(null);
      return;
    }
    const px = new Uint8Array(job.bytes);
    gl!.bindBuffer(gl!.PIXEL_PACK_BUFFER, pbo);
    gl!.getBufferSubData(gl!.PIXEL_PACK_BUFFER, 0, px);
    gl!.bindBuffer(gl!.PIXEL_PACK_BUFFER, null);
    let from = 0;
    job.resolve(
      job.sizes.map((n) => {
        const m = meanOf(px, from, n);
        from += n * 4;
        return m;
      }),
    );
  }

  function onVisibility(): void {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      running = false;
    } else {
      requestRender();
    }
  }

  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  document.documentElement.addEventListener('pointerleave', onPointerGone);
  window.addEventListener('blur', onPointerGone);
  document.addEventListener('visibilitychange', onVisibility);
  resize();

  return {
    setEnv(target, immediate = false) {
      Object.assign(tgt, toEased(target));
      if (immediate) {
        Object.assign(cur, tgt);
        render(performance.now());
      }
      requestRender();
    },
    setReducedMotion(value) {
      reduced = value;
      requestRender();
    },
    syncSize: resize,
    moonAt(at) {
      const s = at ? toEased(at) : cur;
      return {
        x: s.moonX,
        y: 1 - s.moonY,
        r: MOON.edge0 * config.moonSize,
        altitude: s.moonAlt,
        visible: s.moonFraction > 0.02 && moonVisibility(s.moonAlt) > 0,
      };
    },
    sampleBand(y0, y1, at) {
      if (width === 0 || height === 0) return null;
      // `readPixels` measures from the BOTTOM of the buffer; the arguments are
      // from the top, which is how the DOM measures a band.
      const glY0 = Math.max(0, Math.min(height - 1, Math.round((1 - y1) * height)));
      const glY1 = Math.max(glY0 + 1, Math.min(height, Math.round((1 - y0) * height)));
      const h = glY1 - glY0;
      // Draw the sky being asked about into the (unpresented) back buffer and
      // read it straight back. Same task as the draw, so nothing has composited
      // it away yet.
      render(performance.now(), at ? toEased(at) : cur, 0);
      const px = new Uint8Array(width * h * 4);
      gl!.readPixels(0, glY0, width, h, gl!.RGBA, gl!.UNSIGNED_BYTE, px);
      let best: [number, number, number] = [0, 0, 0];
      let bestLuma = -1;
      for (let i = 0; i < px.length; i += 4) {
        const luma = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
        if (luma > bestLuma) {
          bestLuma = luma;
          best = [px[i], px[i + 1], px[i + 2]];
        }
      }
      if (at) render(performance.now()); // put the live sky back on screen
      return best;
    },
    readMeans(rects) {
      return new Promise<RGB8[] | null>((resolve) => {
        if (document.hidden || width === 0 || height === 0 || rects.length === 0) {
          resolve(null);
          return;
        }
        meansQueued?.resolve(null);
        meansQueued = { rects, resolve };
        // The loop picks it up after its next draw. A loop that has stopped
        // (reduced motion, settled) draws once for it, here.
        if (!running) {
          const now = performance.now();
          issueMeans(now);
          render(now);
        }
      });
    },
    sampleMeans(rects, at) {
      if (!import.meta.env.DEV || width === 0 || height === 0) return null;
      render(performance.now(), at ? toEased(at) : cur, 0);
      gl!.bindFramebuffer(gl!.READ_FRAMEBUFFER, null);
      const out = rects.map((r) => {
        const d = deviceRect(r);
        const px = new Uint8Array(d.w * d.h * 4);
        gl!.readPixels(d.x, d.y, d.w, d.h, gl!.RGBA, gl!.UNSIGNED_BYTE, px);
        return meanOf(px, 0, d.w * d.h);
      });
      if (at) render(performance.now());
      return out;
    },
    sweepMeans(rects, states, opts, onSample) {
      if (!import.meta.env.DEV || width === 0 || height === 0 || !fluid) return null;
      const t0 = performance.now();
      const saved = Object.fromEntries(Object.keys(opts.config ?? {}).map((k) => [k, config[k as keyof LiveConfig]]));
      const savedPinned = pinned;
      const savedHeld = held;
      Object.assign(config, opts.config ?? {});
      held = false;
      const reducers = rects.map((r) => {
        const d = deviceRect(r);
        return createRectMeans(gl, width, height, d.x, d.w, d.y, d.h);
      });
      const eased = states.map(toEased);
      const period = (2 * Math.PI) / TWINKLE_RATE;
      let samples = 0;
      const measure = (f: number) => {
        pinned = opts.time + (samples % opts.phases) * (period / opts.phases);
        reducers.forEach((red, r) => {
          const px = red.run(eased.length, (i) => render(0, eased[i], 0, true));
          for (let i = 0; i < eased.length; i++) onSample(i, r, [px[i * 3], px[i * 3 + 1], px[i * 3 + 2]], f);
        });
        samples++;
      };
      try {
        fluid.clear();
        for (let k = 0; k < opts.phases; k++) measure(-1);
        opts.frames.forEach((splatsNow, f) => {
          for (const sp of splatsNow) queueSplat(sp.x, sp.y, sp.dx, sp.dy, config.fluidStrength);
          stepFluid(1 / 60);
          if ((f + 1) % opts.sampleEvery === 0) measure(f);
        });
      } finally {
        for (const red of reducers) red.dispose();
        fluid.clear();
        Object.assign(config, saved);
        pinned = savedPinned;
        held = savedHeld;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.useProgram(program);
        gl.bindVertexArray(vao);
        gl.viewport(0, 0, width, height);
        render(performance.now());
      }
      return { samples, ms: performance.now() - t0 };
    },
    sweepBand(y0, y1, states, opts) {
      // Dev only, and constant-folded out of a production build with the
      // reducer it builds.
      if (!import.meta.env.DEV || width === 0 || height === 0 || !fluid) return null;
      const t0 = performance.now();
      const glY0 = Math.max(0, Math.min(height - 1, Math.round((1 - y1) * height)));
      const glY1 = Math.max(glY0 + 1, Math.min(height, Math.round((1 - y0) * height)));
      const saved = Object.fromEntries(Object.keys(opts.config ?? {}).map((k) => [k, config[k as keyof LiveConfig]]));
      const savedPinned = pinned;
      const savedHeld = held;
      Object.assign(config, opts.config ?? {});
      held = false;
      const sweep = createBandSweep(gl, width, height, glY0, glY1 - glY0);
      const eased = states.map(toEased);
      const colors: [number, number, number][] = states.map(() => [0, 0, 0]);
      const luma = states.map(() => -1);
      const frame = states.map(() => -1);
      let samples = 0;
      const period = (2 * Math.PI) / TWINKLE_RATE;
      const measure = (f: number) => {
        pinned = opts.time + (samples % opts.phases) * (period / opts.phases);
        const px = sweep.run(eased.length, (i) => render(0, eased[i], 0, true));
        for (let i = 0; i < eased.length; i++) {
          const l = 0.2126 * px[i * 3] + 0.7152 * px[i * 3 + 1] + 0.0722 * px[i * 3 + 2];
          if (l > luma[i]) {
            luma[i] = l;
            colors[i] = [px[i * 3], px[i * 3 + 1], px[i * 3 + 2]];
            frame[i] = f;
          }
        }
        if (f < 0) rest = colors.map((c) => [...c] as [number, number, number]);
        samples++;
      };
      let rest: [number, number, number][] = [];
      try {
        fluid.clear();
        for (let k = 0; k < opts.phases; k++) measure(-1);
        opts.frames.forEach((splatsNow, f) => {
          for (const sp of splatsNow) queueSplat(sp.x, sp.y, sp.dx, sp.dy, config.fluidStrength);
          stepFluid(1 / 60);
          if ((f + 1) % opts.sampleEvery === 0) measure(f);
        });
      } finally {
        sweep.dispose();
        fluid.clear();
        Object.assign(config, saved);
        pinned = savedPinned;
        held = savedHeld;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.useProgram(program);
        gl.bindVertexArray(vao);
        gl.viewport(0, 0, width, height);
        render(performance.now());
      }
      return { colors, rest, frame, samples, ms: performance.now() - t0 };
    },
    benchmark(frames = 600, batch = 10, withFluid = false) {
      const out: number[] = [];
      const px = new Uint8Array(4);
      // A read the driver cannot answer until every queued draw has landed.
      const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      render(performance.now()); // warm: shader compiled, uniforms resident
      sync();
      for (let r = 0; r < Math.max(1, Math.ceil(frames / batch)); r++) {
        const t0 = performance.now();
        // Walk uTime forward so no two frames in a batch are the same picture —
        // a driver is entitled to notice that they would be.
        for (let i = 0; i < batch; i++) {
          // With the fluid: the WORST frame it has — awake, splatting, the
          // whole pipeline — fed by a pointer circling the middle of the screen.
          if (withFluid && fluidLive()) {
            const a = (r * batch + i) * 0.12;
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            queueSplat(vw * (0.5 + 0.3 * Math.cos(a)), vh * (0.5 + 0.3 * Math.sin(a)), -Math.sin(a) * vh * 2, Math.cos(a) * vh * 2, 1);
            stepFluid(1 / 60);
          }
          // EVERY FRAME IS SHADED. The sky is one opaque full-screen triangle,
          // and a tile-based GPU (every Apple one) removes hidden surfaces
          // before it shades: ten of them queued into one pass shade ONCE, and
          // the table this benchmark used to print was a tenth of the truth.
          // Invalidating the buffer between frames ends the pass, as a real
          // frame's present does, so every frame pays for itself.
          if (i > 0) gl.invalidateFramebuffer(gl.FRAMEBUFFER, [gl.COLOR]);
          render(t0 + i * 16.7, cur, 0);
        }
        sync();
        out.push((performance.now() - t0) / batch);
      }
      return out;
    },
    splat(x, y, dx, dy, strength = 1) {
      queueSplat(x, y, dx, dy, strength);
    },
    fluidAwake: () => fluid?.awake() ?? false,
    pinTime(seconds) {
      pinned = seconds;
    },
    holdFluid(hold) {
      held = hold;
    },
    renderer() {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      running = false;
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
      document.documentElement.removeEventListener('pointerleave', onPointerGone);
      window.removeEventListener('blur', onPointerGone);
      fluid?.dispose();
      meansQueued?.resolve(null);
      meansInFlight?.resolve(null);
      if (meansInFlight) gl.deleteSync(meansInFlight.sync);
      meansQueued = null;
      meansInFlight = null;
      if (pbo) gl.deleteBuffer(pbo);
      document.removeEventListener('visibilitychange', onVisibility);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      if (vao) gl.deleteVertexArray(vao);
    },
  };
}
