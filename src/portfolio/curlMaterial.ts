import { Color, DoubleSide, ShaderMaterial, Vector2, Vector3 } from 'three';
import type { IUniform, Texture } from 'three';

/**
 * THE SHEET'S MATERIAL — a bend in the vertex stage, two point lights in the
 * fragment stage.
 *
 * ── the bend ──────────────────────────────────────────────────────────────
 *
 * ONE SHAPE serves the entrance and the tear, and it is the shape a sheet of
 * paper actually makes when you lift an edge of it off a surface:
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
 * This replaces wrapping the plane onto a cone, and the reason is the tear. A
 * cone wrap curls EVERYTHING behind the front, so a front travelling across the
 * sheet coils more and more of it into a tube — which is a scroll being rolled
 * up, not a sticky note being peeled off. A peel is a local fold that travels
 * and leaves a flat flap behind it, and the flap has to stay flat or it reads
 * as a window blind.
 *
 * The taper is still there, as `uCurlTaper`: the radius grows along the fold
 * line, so the bend is wider at the free corner and tighter at the pinned one,
 * which is what the cone was for and what a real peel does anyway.
 *
 * THE FOLD LINE CAN RUN AT ANY ANGLE (`uCurlAxis`), which is what lets the tear
 * peel diagonally from a corner. At 0 the roll direction is straight up the
 * sheet and the fold is horizontal, which is the entrance.
 *
 * NORMALS ARE RECOMPUTED from the bent surface, by evaluating it at two
 * neighbouring points and crossing the tangents. Without that the bend is a
 * silhouette — the right shape with no shading inside it, which reads as a bent
 * picture of paper rather than as paper.
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
  [uniform: string]: IUniform;
  /** −1 … 1. How far the flap has turned, as a fraction of {@link MAX_BEND}.
   *  SIGNED, and the sign is which way it bends: POSITIVE is toward the viewer.
   *  Never clamp it to a magnitude. */
  uCurlAmount: IUniform<number>;
  /** 0 … 1. Where the fold front sits along the roll direction, measured from
   *  the free corner. Everything past it is untouched. */
  uCurlOrigin: IUniform<number>;
  /** The ROLL DIRECTION, in radians, y-up. The fold line is perpendicular to
   *  it. 0 is straight up the sheet from the bottom edge — the entrance. */
  uCurlAxis: IUniform<number>;
  /** The arc's radius: 0 is {@link RADIUS_WIDE}, 1 is {@link RADIUS_TIGHT}. */
  uCurlTightness: IUniform<number>;
  /** How much the radius grows along the FOLD LINE, so the bend is wider at one
   *  end than the other. 0 is a cylinder. */
  uCurlTaper: IUniform<number>;
  /** How much of the bend's lift actually leaves the plane, 0…1. Below 1 the
   *  bend is an ellipse rather than a circle — see the note in the shader. */
  uCurlDepth: IUniform<number>;
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

const VERTEX = /* glsl */ `
  uniform float uCurlAmount;
  uniform float uCurlOrigin;
  uniform float uCurlAxis;
  uniform float uCurlTightness;
  uniform float uCurlTaper;
  uniform float uCurlDepth;
  uniform float uAspect;
  uniform vec2 uMouse;
  uniform float uMouseTilt;
  uniform float uPointer;

  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec3 vFlatNormal;

  const float MAX_BEND = ${MAX_BEND.toFixed(4)};
  const float RADIUS_WIDE = ${RADIUS_WIDE.toFixed(4)};
  const float RADIUS_TIGHT = ${RADIUS_TIGHT.toFixed(4)};

  /**
   * The bent surface at (u, v) on the flat sheet.
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

  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(bent(uv), 1.0);
    vWorldPos = world.xyz;

    // The normal is recomputed from the BENT surface, never carried through
    // from the flat geometry — and it is crossed in WORLD space, from two
    // neighbouring points put through the same matrix. three's normalMatrix
    // would have given a VIEW-space normal, and the lights are in world space;
    // doing it this way also survives the mesh's anisotropic scale without a
    // second matrix to keep in step.
    float e = 0.002;
    vec3 du = (modelMatrix * vec4(bent(uv + vec2(e, 0.0)), 1.0)).xyz - vWorldPos;
    vec3 dv = (modelMatrix * vec4(bent(uv + vec2(0.0, e)), 1.0)).xyz - vWorldPos;
    vWorldNormal = normalize(cross(du, dv));
    // The FLAT sheet's normal, which the fragment stage divides by. Carried
    // rather than recomputed there: modelMatrix is a vertex-stage uniform.
    // The mesh only ever turns about z, so this is one vector for the whole
    // plane however it is posed.
    vFlatNormal = normalize((modelMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);

    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

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

  float gloss(vec3 n, vec3 v, float shininess) {
    vec3 la = normalize(uLightAPos - vWorldPos);
    vec3 lb = normalize(uLightBPos - vWorldPos);
    return uLightA * pow(max(dot(n, normalize(la + v)), 0.0), shininess) +
           uLightB * pow(max(dot(n, normalize(lb + v)), 0.0), shininess);
  }

  void main() {
    vec3 albedo = mix(uPaper, texture2D(uMap, vUv).rgb, uHasMap);

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
  tightness: number;
  taper: number;
  depth: number;
  paper: string;
  lightA: { x: number; y: number; z: number; intensity: number };
  lightB: { x: number; y: number; z: number; intensity: number };
  roughness: number;
  reflect: number;
  ambient: number;
  mouseTiltDeg: number;
  /** The hairline, matched to the page's inset ring. */
  edgeInk: string;
  edgeAlpha: number;
}

export interface CurlMaterial extends ShaderMaterial {
  uniforms: CurlUniforms;
}

export function createCurlMaterial(o: CurlMaterialOptions): CurlMaterial {
  const material = new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    // Both sides: the flap's underside is as much of the sheet as its face.
    side: DoubleSide,
    // The tear fades over its last tenth, so the sheet has to be able to. At
    // alpha 1 — which is every frame but those — this composites identically.
    transparent: true,
    uniforms: {
      uCurlAmount: { value: 0 },
      uCurlOrigin: { value: 0 },
      uCurlAxis: { value: 0 },
      uCurlTightness: { value: o.tightness },
      uCurlTaper: { value: o.taper },
      uCurlDepth: { value: o.depth },
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
      uHairline: { value: new Vector2(0, 0) },
      uEdgeInk: { value: new Color(o.edgeInk) },
      uEdgeAlpha: { value: o.edgeAlpha },
      uOpacity: { value: 1 },
    } satisfies CurlUniforms,
  });
  return material as unknown as CurlMaterial;
}

/** Retune a live material from the dock, without rebuilding it. */
export function applyCurlOptions(material: CurlMaterial, o: CurlMaterialOptions): void {
  const u = material.uniforms;
  u.uCurlTightness.value = o.tightness;
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
  u.uEdgeInk.value.set(o.edgeInk);
  u.uEdgeAlpha.value = o.edgeAlpha;
}
