import { Color, DoubleSide, ShaderMaterial, Vector2, Vector3 } from 'three';
import type { IUniform, Texture } from 'three';

/**
 * THE SHEET'S MATERIAL — a deformation in the vertex stage, two point lights in
 * the fragment stage.
 *
 * ── TWO SHAPES, and TWO PROGRAMS ──────────────────────────────────────────
 *
 * There are two gestures in this view and they are not the same shape, so they
 * are not the same function:
 *
 *   curlMode 0    THE ROLL — the ENTRANCE. The sheet is wrapped onto a CONE
 *                 whose half-angle mixes from π/2 (the degenerate case, a
 *                 cylinder) toward a tight value. A tube, which unrolls.
 *   curlMode 1    THE FOLD — the TEAR. A flat part, an ARC of fixed radius, and
 *                 a straight flap tangent to it. A sticky note coming off.
 *
 * THE SWITCH IS THE PROGRAM, NOT A UNIFORM, and that is measured rather than
 * preferred. Both shapes as one program with `uCurlMode < 0.5 ? … : …` in it
 * compiles and runs and looks right — and it moves the TEAR. Captured at three
 * points of the peel, at both device pixel ratios, against the frames the
 * previous build produced: with the two functions in one program and no branch,
 * every frame was byte-for-byte identical; with the branch, 12 to 113 pixels of
 * 1.7M–6.9M came back one level different. The driver schedules the fold's
 * arithmetic differently when it sits inside a select.
 *
 * One level on a thousandth of a per cent of the frame is invisible and is
 * inside every threshold this view has. It is still a change to a surface that
 * was signed off, made by a release that is not about it, and the way not to
 * make it is not to ask the GPU to choose. So there are two programs from one
 * pair of functions, sharing ONE uniforms object — so there is nothing to keep
 * in step — and the fold's is the program that shipped, to the instruction.
 *
 * They were one function for one release and it was a mistake, which is worth
 * writing down because the failure was silent. The fold's parameters have the
 * same NAMES as the roll's and different MEANINGS — `uCurlTightness` is a
 * cone's half-angle mix in one and an arc's radius in the other — so setting
 * the roll's numbers into the fold's formula compiles, runs, breaks nothing the
 * suite was looking at, and produces a flat sheet tilting in. Measured on the
 * shipped build: at 0.25s after the open the entrance was a flat rectangle at
 * −45°, with a fold at one corner and no tube anywhere.
 *
 * So each shape keeps its own function, its own constants and its own reading
 * of the shared uniforms, and they meet nowhere. Nothing the tear does can move
 * the entrance and nothing the entrance does can move the tear: that is the
 * whole point of the split, and there is a test on the tear's pose table and a
 * set of committed frames that say so.
 *
 * ── the fold (mode 1), which the TEAR uses ────────────────────────────────
 *
 * The shape a sheet of paper actually makes when you lift an edge of it off a
 * surface:
 *
 *      ────────────────────╮
 *      the stuck part      ╰──╮   an arc of fixed radius
 *      (flat, untouched)       ╲
 *                               ╲  a straight flap, tangent to the arc
 *
 * Three parameters say all of it. `uCurlOrigin` is WHERE the fold is — the
 * front, measured along the roll direction. `uCurlAmount` is HOW FAR the flap
 * has turned, signed, up to {@link MAX_BEND}. `uCurlTightness` is the arc's
 * RADIUS, from wide at 0 to tight at 1. Everything before the front is
 * untouched; the next `radius × bend` of sheet is the arc; the rest is straight.
 *
 * ALL THREE COME OFF THE POSE, which is what lets the two modes hold different
 * values of the same uniform on consecutive frames.
 *
 * WHY THIS IS NOT THE ROLL. A cone wrap curls EVERYTHING behind the front, so a
 * front travelling across the sheet coils more and more of it into a tube —
 * which is a scroll being rolled up, not a sticky note being peeled off. A peel
 * is a local fold that travels and leaves a flat flap behind it, and the flap
 * has to stay flat or it reads as a window blind. That is why the tear needed a
 * new shape; it is not why the entrance should have lost its old one.
 *
 * The cone's taper survives here as `uCurlTaper`: the radius grows along the
 * fold line, so the bend is wider at the free corner and tighter at the pinned
 * one, which is what the cone was for and what a real peel does anyway.
 *
 * THE FOLD LINE CAN RUN AT ANY ANGLE (`uCurlAxis`), which is what lets the tear
 * peel diagonally from a corner.
 *
 * ── the roll (mode 0), which the ENTRANCE uses ────────────────────────────
 *
 * Recovered from the first paper release, unchanged. The plane is wrapped onto
 * a CONE whose half-angle mixes from π/2 — the degenerate case, a cylinder —
 * toward {@link CONE_TIGHT} as `uCurlTightness` rises. A cone rather than a
 * cylinder is what makes the roll taper the way a real sheet's does: one end of
 * the tube coils tighter than the other, so the roll has a direction rather
 * than being a piece of extruded pipe.
 *
 * THE TUBE'S RADIUS IS DERIVED, NOT DIALLED, and that is the part worth not
 * losing: the rolled length always makes the same number of {@link TURNS}, so
 * the tube shrinks as the sheet unrolls and vanishes at zero instead of
 * collapsing through a discontinuity. That is also what a scroll does — and it
 * is why `uCurlTightness` is NOT what makes this a tube. At any tightness the
 * roll is a tube; tightness only says how hard it tapers along its length.
 *
 * `uCurlOrigin` is how much of the sheet the roll reaches at full amount and
 * `uCurlOriginEdge` is which edge it rolls from (0 the bottom, 1 the top).
 * Neither is read in mode 1, and mode 0 reads neither `uCurlTaper`,
 * `uCurlDepth` nor `uCurlWrap`.
 *
 * NORMALS ARE RECOMPUTED from the deformed surface, by evaluating it at two
 * neighbouring points and crossing the tangents — the same way in both modes,
 * because both versions did it the same way. Without it the shape is a
 * silhouette: the right outline with no shading inside it, which reads as a
 * bent picture of paper rather than as paper.
 *
 * ── the lighting, and why it is a RATIO ───────────────────────────────────
 *
 * The fragment stage does not light the sheet. It lights the DIFFERENCE
 * between the sheet and a flat one:
 *
 *     colour = map × shade(N) / shade(flat)   +   (gloss(N) − gloss(flat))
 *
 * so a flat sheet comes out as exactly the texture, texel for texel, and the
 * curl is the only thing the lights are describing. This is not a shortcut, it
 * is the hand-off: the flat sheet and the HTML page have to be the same pixels
 * for a crossfade to hide the swap, and a lighting rig that leaves any gradient
 * at all across a flat plane is a gradient the flat HTML does not have. It
 * would show up in the hand-off diff and nowhere else, which is the worst place
 * for it to show up.
 *
 * The two lights are the reference's constants, in the reference's world units,
 * and they transfer BECAUSE the camera does: same fov, same distance, so a
 * plane fitted to a page lands at the same scale theirs does and a light at
 * `[13, 5, 10]` rakes across it from the same place. The second light exists to
 * keep the underside of the flap from going to black; lowering it is what makes
 * the bend look like a fold.
 *
 * ── colour ────────────────────────────────────────────────────────────────
 *
 * No colour management, deliberately. The texture's bytes go through untouched
 * and the shading is a multiplier near 1 applied in the same space the browser
 * composites the HTML page in. Decoding to linear and encoding back would be
 * more correct about light and less correct about the only thing being asked:
 * are these two surfaces the same pixels.
 */

/* ── mode 0, the roll ─────────────────────────────────────────────────────── */

/** Turns the rolled part of the sheet makes, whatever is left to roll. The
 *  tube's radius is derived from this, which is why it shrinks to nothing as
 *  the sheet unrolls instead of collapsing through a discontinuity. */
const TURNS = 2.35;

/** The tight end of the cone's half-angle range, in radians. π/2 is a cylinder;
 *  this is what `uCurlTightness: 1` mixes toward. */
const CONE_TIGHT = 1.19;

/* ── mode 1, the fold ─────────────────────────────────────────────────────── */

/** How far the flap turns at `|uCurlAmount| = 1`, in radians — a little past a
 *  right angle and a little short of folded flat back on itself. */
const MAX_BEND = 3.4;

/** The arc's radius at `uCurlTightness` 0 and 1, in PAGE HEIGHTS. Wide enough
 *  at 0 that a line of type stays readable across the bend; tight enough at 1
 *  to be a roll. */
const RADIUS_WIDE = 0.26;
const RADIUS_TIGHT = 0.03;

export interface CurlUniforms {
  // The index signature is what `ShaderMaterial` declares; the named members
  // are what this shader actually has, so a typo in a `uniforms.uFoo.value`
  // write is a compile error rather than a uniform that silently does nothing.
  // WHICH SHAPE is not in here: it picks the PROGRAM (see the header), and a
  // uniform nothing reads would be a dial that looked live and was not.
  [uniform: string]: IUniform;
  /** −1 … 1. SIGNED, and the sign is which way it deforms. In mode 1, how far
   *  the flap has turned as a fraction of {@link MAX_BEND}, positive toward the
   *  viewer. In mode 0, how ROLLED the sheet is: −1 fully, 0 flat. Never clamp
   *  it to a magnitude. */
  uCurlAmount: IUniform<number>;
  /**
   * 0 … 1, and the two modes read it differently.
   *
   * MODE 1: where the fold front sits along the roll direction, measured from
   * the free corner. Everything past it is untouched.
   *
   * MODE 0: how much of the sheet the roll reaches AT FULL AMOUNT — the front
   * is `amount × origin`, so the roll eats into the sheet as the amount rises
   * and lets go of it as the sheet unrolls. 1 rolls the whole sheet.
   */
  uCurlOrigin: IUniform<number>;
  /** MODE 0 ONLY. Which edge the roll starts from: 0 the bottom, 1 the top. */
  uCurlOriginEdge: IUniform<number>;
  /** The ROLL DIRECTION, in radians, y-up. The fold line is perpendicular to
   *  it. 0 is straight up the sheet from the bottom edge — the entrance. */
  uCurlAxis: IUniform<number>;
  /**
   * ONE NAME, TWO MEANINGS, and that is the trap this shader has already fallen
   * into once — see the header.
   *
   * MODE 1: the ARC'S RADIUS, from {@link RADIUS_WIDE} at 0 to
   * {@link RADIUS_TIGHT} at 1. The tear bends at 0.35.
   *
   * MODE 0: how far the cone's half-angle mixes from π/2 (a cylinder) toward
   * {@link CONE_TIGHT}. It is NOT what makes the roll a tube — the tube's
   * radius is derived from {@link TURNS} — it is only how hard the tube tapers
   * along its length. The entrance rolls at 1.
   *
   * It comes off the POSE, not off the material, because it belongs to the
   * gesture: one dial for both is how a tube became a crease.
   */
  uCurlTightness: IUniform<number>;
  /** MODE 1 ONLY. How much the radius grows along the FOLD LINE, so the bend is
   *  wider at one end than the other. 0 is a cylinder. */
  uCurlTaper: IUniform<number>;
  /** MODE 1 ONLY. How much of the bend's lift actually leaves the plane, 0…1.
   *  Below 1 the bend is an ellipse rather than a circle — see the note in the
   *  shader. The roll is a true circle, as it always was. */
  uCurlDepth: IUniform<number>;
  /**
   * MODE 1 ONLY. The LEAST the peeled part must wrap, in radians. Above zero
   * the radius tightens to meet it, so a short peel creases rather than
   * bulging. 0 is off.
   */
  uCurlWrap: IUniform<number>;
  /** `width / height` of the PLANE, from `fitPlaneToRect` — never the viewport's. */
  uAspect: IUniform<number>;
  /** Pointer position, −1…1 on each axis. */
  uMouse: IUniform<Vector2>;
  /** Maximum tilt in radians. Scaled by the bend, so a flat sheet is flat. */
  uMouseTilt: IUniform<number>;
  /** 0 turns the pointer tilt off outright — a sheet being pulled off a surface
   *  does not follow the cursor. */
  uPointer: IUniform<number>;
  uMap: IUniform<Texture | null>;
  uHasMap: IUniform<number>;
  uPaper: IUniform<Color>;
  uLightAPos: IUniform<Vector3>;
  uLightBPos: IUniform<Vector3>;
  uLightA: IUniform<number>;
  uLightB: IUniform<number>;
  uRoughness: IUniform<number>;
  uReflect: IUniform<number>;
  /** What the BACK of the sheet is: the paper colour times this, with its own
   *  grain and no texture at all. */
  uBackShade: IUniform<number>;
  /** The grain's amplitude on that back face, matched to the page's own. */
  uGrain: IUniform<number>;
  /** The floor under the lighting ratio: what a face turned away from both
   *  lights still shows of the paper. */
  uAmbient: IUniform<number>;
  /** One CSS pixel of the PAGE, as a fraction of the plane's uv on each axis.
   *  The hairline is a pixel wide in the page's terms, not in the plane's. */
  uHairline: IUniform<Vector2>;
  /** The hairline's colour and alpha, matching the page's inset ring. */
  uEdgeInk: IUniform<Color>;
  uEdgeAlpha: IUniform<number>;
  /** The whole sheet's alpha. The tear fades over its last tenth. */
  uOpacity: IUniform<number>;
}

/**
 * Everything both programs are built from: the uniforms, the constants, and the
 * two deformations. Each program adds one `main` that calls one of them, and
 * they are otherwise the same text — which is deliberate. Carrying the other
 * shape's function as dead code costs nothing and was measured costing nothing;
 * carrying a BRANCH does not (see the header).
 */
const VERTEX_COMMON = /* glsl */ `
  uniform float uCurlAmount;
  uniform float uCurlOrigin;
  uniform float uCurlOriginEdge;
  uniform float uCurlAxis;
  uniform float uCurlTightness;
  uniform float uCurlTaper;
  uniform float uCurlDepth;
  uniform float uCurlWrap;
  uniform float uAspect;
  uniform vec2 uMouse;
  uniform float uMouseTilt;
  uniform float uPointer;

  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec3 vFlatNormal;

  const float PI = 3.141592653589793;
  const float TURNS = ${TURNS.toFixed(4)};
  const float CONE_TIGHT = ${CONE_TIGHT.toFixed(4)};
  const float MAX_BEND = ${MAX_BEND.toFixed(4)};
  const float RADIUS_WIDE = ${RADIUS_WIDE.toFixed(4)};
  const float RADIUS_TIGHT = ${RADIUS_TIGHT.toFixed(4)};

  /**
   * MODE 0 — THE ROLL, recovered from the first paper release and unchanged.
   *
   * The curled surface at (u, v) on the flat sheet, in the plane's own unit
   * box: x and y in [-0.5, 0.5], z toward the camera. The mesh's scale is
   * (planeWidth, planeHeight, planeHeight), so y and z stay isotropic and the
   * tube is round rather than elliptical.
   *
   * It works in the unit box and NOT in the aspect-stretched frame the fold
   * uses, which is the other half of why these are two functions rather than
   * one with a branch in it: they do not even agree about what x means.
   */
  vec3 rolled(vec2 uv) {
    float amount = abs(uCurlAmount);
    float dir = uCurlAmount < 0.0 ? 1.0 : -1.0;

    // Distance from the ROLLING edge, 0 at that edge and 1 at the fixed one.
    float s = mix(uv.y, 1.0 - uv.y, uCurlOriginEdge);
    // The plane's own y, which runs the other way when the roll is flipped.
    float ySign = mix(1.0, -1.0, uCurlOriginEdge);
    float x = uv.x - 0.5;

    float front = amount * uCurlOrigin;
    vec3 local = vec3(x, ySign * (s - 0.5), 0.0);

    if (front > 1e-4 && s < front) {
      // The CONE. At a half-angle of π/2 the cosine is zero and the radius is
      // constant — a cylinder. As tightness rises the radius grows along x, so
      // the far end of the tube coils loosely and the near end tightly.
      float cone = mix(PI * 0.5, CONE_TIGHT, clamp(uCurlTightness, 0.0, 1.0));
      // DERIVED, not dialled: the rolled length always makes TURNS turns, so
      // the tube shrinks as the sheet unrolls and vanishes at zero.
      float radius = front / (TURNS * 2.0 * PI);
      float r = max(radius * (1.0 + x * uAspect * cos(cone)), 1e-4);

      float theta = (front - s) / r;
      float rolledS = front - r * sin(theta);
      local = vec3(x, ySign * (rolledS - 0.5), dir * r * (1.0 - cos(theta)));
    }

    // The pointer tilt rides on the CURL, not on the sheet: at amount 0 it is
    // zero, so a flat sheet is exactly flat and its screen rect is exactly the
    // page's. A degree and a half of tilt on a flat plane would move the
    // corners by eight pixels, which is eight times the hand-off's budget.
    //
    // The uPointer factor is the one thing here the first release did not have
    // — it postdates it, and it is 1 on every frame of an entrance, so this is
    // the original expression at the only value it ever sees. (No backticks in
    // this comment: the whole shader is a template literal.)
    float tilt = uMouseTilt * amount * uPointer;
    float ax = -uMouse.y * tilt;
    float ay = uMouse.x * tilt;
    float cx = cos(ax), sx = sin(ax), cy = cos(ay), sy = sin(ay);
    vec3 t = vec3(local.x, local.y * cx - local.z * sx, local.y * sx + local.z * cx);
    return vec3(t.x * cy + t.z * sy, t.y, -t.x * sy + t.z * cy);
  }

  /**
   * MODE 1 — THE FOLD. The bent surface at (u, v) on the flat sheet.
   *
   * IT WORKS IN PAGE HEIGHTS and returns the mesh's own units, and the
   * difference matters: the mesh's scale is (planeWidth, planeHeight,
   * planeHeight), so its local x is a fraction of a WIDTH while its y and z are
   * fractions of a HEIGHT. A bend has to be round, so the arithmetic below is
   * done with x stretched to uAspect — and the last line puts it back, which
   * is the only reason that divide is there.
   */
  vec3 bent(vec2 uv) {
    vec2 q = vec2((uv.x - 0.5) * uAspect, uv.y - 0.5);

    float amount = abs(uCurlAmount);
    float dir = uCurlAmount < 0.0 ? -1.0 : 1.0;
    // The roll direction, and the fold line at right angles to it.
    vec2 d = vec2(cos(uCurlAxis), sin(uCurlAxis));
    vec2 f = vec2(-d.y, d.x);

    // How far the sheet reaches along each of them. Not 1 and uAspect: at any
    // angle but a right one the span is the projection of both sides.
    float extentD = abs(d.x) * uAspect + abs(d.y);
    float extentF = abs(f.x) * uAspect + abs(f.y);

    // Distance from the FREE corner, along the roll direction.
    float sLen = dot(q, d) + extentD * 0.5;
    float frontLen = uCurlOrigin * extentD;

    // The radius, and its taper along the fold line — wider at one end than the
    // other, which is what a peel does and what the cone used to be for.
    float along = dot(q, f) / max(extentF, 1e-4);
    float r0 = mix(RADIUS_WIDE, RADIUS_TIGHT, clamp(uCurlTightness, 0.0, 1.0));
    float r = max(r0 * (1.0 + uCurlTaper * along * 2.0), 1e-3);

    // THE WRAP FLOOR, and it is what makes a corner lift read.
    //
    // How far the free corner comes off the surface is r (1 - cos(frontLen/r))
    // — it depends on the RADIUS and on how much sheet has peeled, and NOT on
    // how far the flap has turned, because once the corner is inside the arc its
    // own angle is frontLen / r and nothing past it can change that. So
    // winding uCurlAmount up at the start of a peel moves the fold deeper into
    // the sheet and leaves the corner exactly where it was: a soft bulge.
    //
    // Tightening the radius while the peel is short is what a hand does anyway
    // — you crease a corner much tighter than you bend a whole sheet — and it
    // stops biting on its own the moment frontLen passes r0 · uCurlWrap,
    // which is about a quarter of the way through the tear. Everything after
    // that is untouched.
    if (uCurlWrap > 1e-4) r = min(r, max(frontLen, 1e-4) / uCurlWrap);

    float bend = amount * MAX_BEND;
    float t = frontLen - sLen;

    vec3 local = vec3(q, 0.0);
    if (bend > 1e-4 && t > 0.0) {
      float arc = r * bend;
      float moved;
      float lift;
      if (t <= arc) {
        // ON THE ARC. It leaves the plane tangentially, so the surface is smooth
        // where the bend begins — a crease there would catch the light as a line
        // and read as a fold in the texture rather than in the paper.
        float phi = t / r;
        moved = frontLen - r * sin(phi);
        lift = r * (1.0 - cos(phi));
      } else {
        // THE FLAP, straight and tangent to the arc's far end. Straight is the
        // point: everything past the bend has come away from the surface in one
        // piece, and a flap that kept curving would be a blind rather than a
        // sheet.
        float rest = t - arc;
        moved = frontLen - r * sin(bend) - rest * cos(bend);
        lift = r * (1.0 - cos(bend)) + rest * sin(bend);
      }
      // THE LIFT IS COMPRESSED, and it has to be. The camera is 50 units from
      // a plane about 16 units tall, so a bend that lifts a whole page height
      // off the surface comes a third of the way to the lens and the projection
      // grows by half — a peel that BALLOONS as it lifts, which reads as a zoom
      // rather than as a sheet coming away. Flattening the bend into an ellipse
      // keeps the silhouette, keeps the shading, and keeps the sheet the size it
      // is. Paper seen nearly face-on does not give the ellipse away.
      local = vec3(q + (moved - sLen) * d, dir * lift * uCurlDepth);
    }

    // The pointer tilt rides on the BEND, not on the sheet: at amount 0 it is
    // zero, so a flat sheet is exactly flat and its screen rect is exactly the
    // page's. A degree and a half of tilt on a 1632px plane would move the
    // corners by eight pixels, which is eight times the hand-off's budget.
    // uPointer turns it off outright for the tear.
    float tilt = uMouseTilt * amount * uPointer;
    float ax = -uMouse.y * tilt;
    float ay = uMouse.x * tilt;
    float cx = cos(ax), sx = sin(ax), cy = cos(ay), sy = sin(ay);
    vec3 tv = vec3(local.x, local.y * cx - local.z * sx, local.y * sx + local.z * cx);
    vec3 out3 = vec3(tv.x * cy + tv.z * sy, tv.y, -tv.x * sy + tv.z * cy);
    return vec3(out3.x / max(uAspect, 1e-4), out3.y, out3.z);
  }

`;

/**
 * The rest of the vertex stage, given the name of the deformation this program
 * is for. The ONLY difference between the two programs is that name.
 */
const vertexMain = (deform: string): string => /* glsl */ `
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(${deform}(uv), 1.0);
    vWorldPos = world.xyz;

    // The normal is recomputed from the DEFORMED surface, never carried through
    // from the flat geometry — and it is crossed in WORLD space, from two
    // neighbouring points put through the same matrix. three's normalMatrix
    // would have given a VIEW-space normal, and the lights are in world space;
    // doing it this way also survives the mesh's anisotropic scale without a
    // second matrix to keep in step.
    //
    // It is the same arithmetic in both modes because BOTH versions used the
    // same arithmetic — the same epsilon, the same two neighbours, the same
    // cross in world space. Each mode gets its normals from its own surface;
    // what they share is only the method.
    float e = 0.002;
    vec3 du = (modelMatrix * vec4(${deform}(uv + vec2(e, 0.0)), 1.0)).xyz - vWorldPos;
    vec3 dv = (modelMatrix * vec4(${deform}(uv + vec2(0.0, e)), 1.0)).xyz - vWorldPos;
    vWorldNormal = normalize(cross(du, dv));
    // The FLAT sheet's normal, which the fragment stage divides by. Carried
    // rather than recomputed there: modelMatrix is a vertex-stage uniform.
    // The mesh only ever turns about z, so this is one vector for the whole
    // plane however it is posed.
    vFlatNormal = normalize((modelMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);

    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/** THE ENTRANCE's program: the cone wrap. */
const ROLL_VERTEX = VERTEX_COMMON + vertexMain('rolled');
/** THE TEAR's program: the arc and its flap, and the same text it has always
 *  had — which is what makes "the exit did not move" checkable rather than
 *  asserted. See the header. */
const FOLD_VERTEX = VERTEX_COMMON + vertexMain('bent');

const FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uHasMap;
  uniform vec3 uPaper;
  uniform vec3 uLightAPos;
  uniform vec3 uLightBPos;
  uniform float uLightA;
  uniform float uLightB;
  uniform float uRoughness;
  uniform float uReflect;
  uniform float uAmbient;
  uniform float uBackShade;
  uniform float uGrain;
  uniform vec2 uHairline;
  uniform vec3 uEdgeInk;
  uniform float uEdgeAlpha;
  uniform float uOpacity;

  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec3 vFlatNormal;

  float shade(vec3 n) {
    vec3 la = normalize(uLightAPos - vWorldPos);
    vec3 lb = normalize(uLightBPos - vWorldPos);
    return uLightA * max(dot(n, la), 0.0) + uLightB * max(dot(n, lb), 0.0);
  }

  /** A per-pixel value, stable under the bend: the seed is the sheet's own uv
   *  in page pixels, so the grain sits ON the paper rather than swimming over
   *  it as the flap turns. */
  float grainAt(vec2 uv) {
    vec2 px = floor(uv / max(uHairline, vec2(1e-6)));
    return fract(sin(dot(px, vec2(127.1, 311.7))) * 43758.5453);
  }

  float gloss(vec3 n, vec3 v, float shininess) {
    vec3 la = normalize(uLightAPos - vWorldPos);
    vec3 lb = normalize(uLightBPos - vWorldPos);
    return uLightA * pow(max(dot(n, normalize(la + v)), 0.0), shininess) +
           uLightB * pow(max(dot(n, normalize(lb + v)), 0.0), shininess);
  }

  void main() {
    // THE BACK OF THE SHEET IS NOT THE FRONT OF IT. Paper is opaque: fold a
    // page over and what you see is the blank reverse, not the type read
    // backwards. Sampling the same texture on both faces was the shortcut, and
    // the tear is where it stops being invisible — the flap turns over at
    // p = 0.3 and hands the reader a mirrored paragraph.
    //
    // So the back is the paper colour darkened, with a grain of its own and no
    // texture at all. The lighting below is untouched by the branch: both faces
    // are the same surface and take the same ratio, which is also why a flat
    // sheet — every fragment of which is front-facing — is still exactly the
    // texture and both hand-offs still hold.
    vec3 albedo = gl_FrontFacing
      ? mix(uPaper, texture2D(uMap, vUv).rgb, uHasMap)
      : uPaper * uBackShade + vec3((grainAt(vUv) - 0.5) * uGrain);

    vec3 v = normalize(cameraPosition - vWorldPos);
    vec3 n = normalize(vWorldNormal);
    // The flap's underside faces away; light it as paper, which has two sides.
    if (dot(n, v) < 0.0) n = -n;
    vec3 flat0 = normalize(vFlatNormal);

    float shininess = mix(4.0, 128.0, 1.0 - clamp(uRoughness, 0.0, 1.0));
    float base = shade(flat0);
    // AMBIENT, as a floor rather than as another light. The flap turns its back
    // to both of them as it folds, and a ratio with nothing under it takes that
    // face to pure black — which is not what paper does, and is the one part of
    // the tear where the reference's two-light rig has nothing to say. It is a
    // MIX rather than an addition so that a FLAT sheet still comes out at
    // exactly 1: mix(a, 1, x) is 1 at x = 1 whatever a is, and the hand-off
    // depends on that.
    float lit = mix(uAmbient, 1.0, base > 1e-4 ? shade(n) / base : 1.0);
    float spec = gloss(n, v, shininess) - gloss(flat0, v, shininess);

    vec3 colour = albedo * lit + vec3(spec * uReflect);

    // THE HAIRLINE. A pixel of ink along the sheet's edge, so the plane has a
    // border rather than dissolving into the ground — and so that it has the
    // SAME border the page does, which is an inset ring of the same colour. An
    // edge that appears at either hand-off is an edge a crossfade has to hide.
    float dx = min(vUv.x, 1.0 - vUv.x) / max(uHairline.x, 1e-6);
    float dy = min(vUv.y, 1.0 - vUv.y) / max(uHairline.y, 1e-6);
    float edge = 1.0 - smoothstep(0.0, 1.0, min(dx, dy));
    colour = mix(colour, uEdgeInk, edge * uEdgeAlpha);

    gl_FragColor = vec4(colour, uOpacity);
  }
`;

export interface CurlMaterialOptions {
  taper: number;
  depth: number;
  paper: string;
  lightA: { x: number; y: number; z: number; intensity: number };
  lightB: { x: number; y: number; z: number; intensity: number };
  roughness: number;
  reflect: number;
  ambient: number;
  /** The back face: the paper colour times this, and its grain's amplitude. */
  backShade: number;
  grain: number;
  mouseTiltDeg: number;
  /** The hairline, matched to the page's inset ring. */
  edgeInk: string;
  edgeAlpha: number;
}

export interface CurlMaterial extends ShaderMaterial {
  uniforms: CurlUniforms;
}

/**
 * THE TWO PROGRAMS, and the one set of uniforms they both read.
 *
 * Sharing the uniforms object is not a saving, it is the safety: there is no
 * "copy the values across" step to forget, so the two programs cannot drift
 * apart on anything but the one line that differs between them. Writing a
 * uniform writes it for both; only one of them is on the mesh at a time.
 */
export interface CurlMaterials {
  /** The ENTRANCE's — `curlMode` 0. */
  roll: CurlMaterial;
  /** The TEAR's — `curlMode` 1. */
  fold: CurlMaterial;
  /** Shared. Written by `SheetCanvas` on every frame the sheet paints. */
  uniforms: CurlUniforms;
  dispose: () => void;
}

export function createCurlMaterials(o: CurlMaterialOptions): CurlMaterials {
  const shared: CurlUniforms = {
    uCurlAmount: { value: 0 },
    uCurlOrigin: { value: 0 },
    uCurlOriginEdge: { value: 0 },
    uCurlAxis: { value: 0 },
    // Written from the POSE on every frame the sheet paints, like the amount,
    // the origin and the wrap. Nothing renders before the first `show`.
    uCurlTightness: { value: 0 },
    uCurlTaper: { value: o.taper },
    uCurlDepth: { value: o.depth },
    uCurlWrap: { value: 0 },
    uAspect: { value: 1 },
    uMouse: { value: new Vector2(0, 0) },
    uMouseTilt: { value: (o.mouseTiltDeg * Math.PI) / 180 },
    uPointer: { value: 1 },
    uMap: { value: null },
    uHasMap: { value: 0 },
    uPaper: { value: new Color(o.paper) },
    uLightAPos: { value: new Vector3(o.lightA.x, o.lightA.y, o.lightA.z) },
    uLightBPos: { value: new Vector3(o.lightB.x, o.lightB.y, o.lightB.z) },
    uLightA: { value: o.lightA.intensity },
    uLightB: { value: o.lightB.intensity },
    uRoughness: { value: o.roughness },
    uReflect: { value: o.reflect },
    uAmbient: { value: o.ambient },
    uBackShade: { value: o.backShade },
    uGrain: { value: o.grain },
    uHairline: { value: new Vector2(0, 0) },
    uEdgeInk: { value: new Color(o.edgeInk) },
    uEdgeAlpha: { value: o.edgeAlpha },
    uOpacity: { value: 1 },
  };

  const program = (vertexShader: string): CurlMaterial =>
    new ShaderMaterial({
      vertexShader,
      fragmentShader: FRAGMENT,
      // Both sides: the flap's underside is as much of the sheet as its face.
      side: DoubleSide,
      // The tear fades over its last tenth, so the sheet has to be able to. At
      // alpha 1 — which is every frame but those — this composites identically.
      transparent: true,
      uniforms: shared,
    }) as unknown as CurlMaterial;

  const roll = program(ROLL_VERTEX);
  const fold = program(FOLD_VERTEX);
  return {
    roll,
    fold,
    uniforms: shared,
    dispose: () => {
      roll.dispose();
      fold.dispose();
    },
  };
}

/** Retune the live material from the dock, without rebuilding it. One write
 *  reaches both programs: they share the uniforms object. */
export function applyCurlOptions(materials: CurlMaterials, o: CurlMaterialOptions): void {
  const u = materials.uniforms;
  u.uCurlTaper.value = o.taper;
  u.uCurlDepth.value = o.depth;
  u.uMouseTilt.value = (o.mouseTiltDeg * Math.PI) / 180;
  u.uPaper.value.set(o.paper);
  u.uLightAPos.value.set(o.lightA.x, o.lightA.y, o.lightA.z);
  u.uLightBPos.value.set(o.lightB.x, o.lightB.y, o.lightB.z);
  u.uLightA.value = o.lightA.intensity;
  u.uLightB.value = o.lightB.intensity;
  u.uRoughness.value = o.roughness;
  u.uReflect.value = o.reflect;
  u.uAmbient.value = o.ambient;
  u.uBackShade.value = o.backShade;
  u.uGrain.value = o.grain;
  u.uEdgeInk.value.set(o.edgeInk);
  u.uEdgeAlpha.value = o.edgeAlpha;
}

/* ── the bend, on the CPU ─────────────────────────────────────────────────── */

/** Everything the vertex stage reads, for the one caller that has to evaluate
 *  it here. The mode picks which of the two shapes the rest describes. */
export interface BendParams {
  /** 0 the ROLL, 1 the FOLD. {@link bentPoint} switches on it exactly as the
   *  shader's `deform` does. */
  mode: 0 | 1;
  amount: number;
  origin: number;
  /** MODE 0. Which edge the roll starts from: 0 the bottom, 1 the top. */
  originEdge: number;
  /** MODE 1. Radians, the shader's own frame. */
  axis: number;
  tightness: number;
  taper: number;
  depth: number;
  wrap: number;
  aspect: number;
}

/**
 * ONE POINT of the deformed surface, in the mesh's own units — a hand port of
 * `deform()` above, minus the pointer tilt, which the tear does not use.
 *
 * It exists because "how far off the page has the corner come" is a question
 * about a vertex, and the vertex is computed in a shader: the CPU has no way to
 * ask the GPU where it put one without reading a buffer back. `pv-verify` needs
 * the answer every run, so the answer is here.
 *
 * IT IS A DUPLICATE, and the only thing that keeps it honest is that it lives
 * in the same file as the thing it duplicates — edit the shader and this is on
 * the screen next to it. `curlMaterial.test.ts` holds it to the properties the
 * shader's own geometry has to have (flat at zero, tangent at the fold, lift
 * rising with the wrap), which is what would catch a port that drifted.
 *
 * It switches on the mode for the same reason the shader does. The corner-lift
 * measurement is about the TEAR, so mode 1 is the path that has to match the
 * GPU to a pixel; mode 0 is here so that asking where a vertex of the ROLL went
 * gets an answer rather than a fold's answer to a different question.
 */
export function bentPoint(u: number, v: number, p: BendParams): [number, number, number] {
  if (p.mode === 0) return rolledPoint(u, v, p);
  const qx = (u - 0.5) * p.aspect;
  const qy = v - 0.5;

  const amount = Math.abs(p.amount);
  const dir = p.amount < 0 ? -1 : 1;
  const dx = Math.cos(p.axis);
  const dy = Math.sin(p.axis);
  const fx = -dy;
  const fy = dx;

  const extentD = Math.abs(dx) * p.aspect + Math.abs(dy);
  const extentF = Math.abs(fx) * p.aspect + Math.abs(fy);

  const sLen = qx * dx + qy * dy + extentD * 0.5;
  const frontLen = p.origin * extentD;

  const along = (qx * fx + qy * fy) / Math.max(extentF, 1e-4);
  const r0 = RADIUS_WIDE + (RADIUS_TIGHT - RADIUS_WIDE) * Math.min(Math.max(p.tightness, 0), 1);
  let r = Math.max(r0 * (1 + p.taper * along * 2), 1e-3);
  if (p.wrap > 1e-4) r = Math.min(r, Math.max(frontLen, 1e-4) / p.wrap);

  const bend = amount * MAX_BEND;
  const t = frontLen - sLen;

  let x = qx;
  let y = qy;
  let z = 0;
  if (bend > 1e-4 && t > 0) {
    const arc = r * bend;
    let moved: number;
    let lift: number;
    if (t <= arc) {
      const phi = t / r;
      moved = frontLen - r * Math.sin(phi);
      lift = r * (1 - Math.cos(phi));
    } else {
      const rest = t - arc;
      moved = frontLen - r * Math.sin(bend) - rest * Math.cos(bend);
      lift = r * (1 - Math.cos(bend)) + rest * Math.sin(bend);
    }
    x = qx + (moved - sLen) * dx;
    y = qy + (moved - sLen) * dy;
    z = dir * lift * p.depth;
  }
  return [x / Math.max(p.aspect, 1e-4), y, z];
}

/**
 * MODE 0 on the CPU — the hand port of `rolled()`, same relationship and same
 * risk. It works in the unit box, not in the aspect-stretched frame the fold
 * uses, because that is what the shader's roll does.
 */
function rolledPoint(u: number, v: number, p: BendParams): [number, number, number] {
  const amount = Math.abs(p.amount);
  const dir = p.amount < 0 ? 1 : -1;

  const s = p.originEdge > 0.5 ? 1 - v : v;
  const ySign = p.originEdge > 0.5 ? -1 : 1;
  const x = u - 0.5;

  const front = amount * p.origin;
  if (front <= 1e-4 || s >= front) return [x, ySign * (s - 0.5), 0];

  const cone = Math.PI * 0.5 + (CONE_TIGHT - Math.PI * 0.5) * Math.min(Math.max(p.tightness, 0), 1);
  const radius = front / (TURNS * 2 * Math.PI);
  const r = Math.max(radius * (1 + x * p.aspect * Math.cos(cone)), 1e-4);

  const theta = (front - s) / r;
  const rolledS = front - r * Math.sin(theta);
  return [x, ySign * (rolledS - 0.5), dir * r * (1 - Math.cos(theta))];
}
