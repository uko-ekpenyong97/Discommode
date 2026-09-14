import { Color, DoubleSide, ShaderMaterial, Vector2, Vector3 } from 'three';
import type { IUniform, Texture } from 'three';

/**
 * THE SHEET'S MATERIAL — a cylindrical curl in the vertex stage, two point
 * lights in the fragment stage.
 *
 * ── the curl ──────────────────────────────────────────────────────────────
 *
 * The plane is wrapped onto a CONE whose half-angle mixes from π/2 — which is
 * the degenerate case, a cylinder — toward a tight value as `uCurlTightness`
 * rises. A cone rather than a cylinder is what makes the roll taper the way a
 * real sheet's does: one end of the tube coils tighter than the other, so the
 * roll has a direction rather than being a piece of extruded pipe.
 *
 * The tube's radius is derived rather than dialled: the rolled length always
 * makes the same number of TURNS, so the tube shrinks as the sheet unrolls and
 * vanishes at zero instead of collapsing through a discontinuity. That is also
 * what a scroll does.
 *
 * NORMALS ARE RECOMPUTED from the curled surface, by evaluating it at two
 * neighbouring points and crossing the tangents. Without that the roll is a
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
 * keep the inside of the roll from going to black; lowering it is what makes
 * the curl look like a fold.
 *
 * ── colour ────────────────────────────────────────────────────────────────
 *
 * No colour management, deliberately. The texture's bytes go through untouched
 * and the shading is a multiplier near 1 applied in the same space the browser
 * composites the HTML page in. Decoding to linear and encoding back would be
 * more correct about light and less correct about the only thing being asked:
 * are these two surfaces the same pixels.
 */

/** Turns the rolled part of the sheet makes, whatever is left to roll. */
const TURNS = 2.35;

/** The tight end of the cone's half-angle range, in radians. π/2 is a cylinder;
 *  this is what `uCurlTightness: 1` mixes toward. */
const CONE_TIGHT = 1.19;

export interface CurlUniforms {
  // The index signature is what `ShaderMaterial` declares; the named members
  // are what this shader actually has, so a typo in a `uniforms.uFoo.value`
  // write is a compile error rather than a uniform that silently does nothing.
  [uniform: string]: IUniform;
  /** −1 fully rolled … 0 flat. SIGNED: the sign is which way it rolls, so it
   *  must never be clamped to a magnitude. */
  uCurlAmount: IUniform<number>;
  /** Mixes the cone's half-angle away from π/2. */
  uCurlTightness: IUniform<number>;
  /** How much of the sheet the roll reaches at full amount, 0…1. */
  uCurlOrigin: IUniform<number>;
  /** Which edge it rolls from: 0 the bottom, 1 the top. */
  uCurlOriginEdge: IUniform<number>;
  /** `width / height` of the PLANE, from `fitPlaneToRect` — never the viewport's. */
  uAspect: IUniform<number>;
  /** Pointer position, −1…1 on each axis. */
  uMouse: IUniform<Vector2>;
  /** Maximum tilt in radians. Scaled by the curl, so a flat sheet is flat. */
  uMouseTilt: IUniform<number>;
  uMap: IUniform<Texture | null>;
  uHasMap: IUniform<number>;
  uPaper: IUniform<Color>;
  uLightAPos: IUniform<Vector3>;
  uLightBPos: IUniform<Vector3>;
  uLightA: IUniform<number>;
  uLightB: IUniform<number>;
  uRoughness: IUniform<number>;
  uReflect: IUniform<number>;
  /** One CSS pixel of the PAGE, as a fraction of the plane's uv on each axis.
   *  The hairline is a pixel wide in the page's terms, not in the plane's. */
  uHairline: IUniform<Vector2>;
  /** The hairline's colour and alpha, matching the page's inset ring. */
  uEdgeInk: IUniform<Color>;
  uEdgeAlpha: IUniform<number>;
}

const VERTEX = /* glsl */ `
  uniform float uCurlAmount;
  uniform float uCurlTightness;
  uniform float uCurlOrigin;
  uniform float uCurlOriginEdge;
  uniform float uAspect;
  uniform vec2 uMouse;
  uniform float uMouseTilt;

  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec3 vFlatNormal;

  const float PI = 3.141592653589793;
  const float TURNS = ${TURNS.toFixed(4)};
  const float CONE_TIGHT = ${CONE_TIGHT.toFixed(4)};

  /**
   * The curled surface at (u, v) on the flat sheet, in the plane's own unit
   * box: x and y in [-0.5, 0.5], z toward the camera. The mesh's scale is
   * (planeWidth, planeHeight, planeHeight), so y and z stay isotropic and the
   * tube is round rather than elliptical.
   */
  vec3 curled(vec2 uv) {
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
      float radius = front / (TURNS * 2.0 * PI);
      float r = max(radius * (1.0 + x * uAspect * cos(cone)), 1e-4);

      float theta = (front - s) / r;
      float rolled = front - r * sin(theta);
      local = vec3(x, ySign * (rolled - 0.5), dir * r * (1.0 - cos(theta)));
    }

    // The pointer tilt rides on the CURL, not on the sheet: at amount 0 it is
    // zero, so a flat sheet is exactly flat and its screen rect is exactly the
    // page's. A degree and a half of tilt on a flat plane would move the
    // corners by eight pixels, which is eight times the hand-off's budget.
    float tilt = uMouseTilt * amount;
    float ax = -uMouse.y * tilt;
    float ay = uMouse.x * tilt;
    float cx = cos(ax), sx = sin(ax), cy = cos(ay), sy = sin(ay);
    vec3 t = vec3(local.x, local.y * cx - local.z * sx, local.y * sx + local.z * cx);
    return vec3(t.x * cy + t.z * sy, t.y, -t.x * sy + t.z * cy);
  }

  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(curled(uv), 1.0);
    vWorldPos = world.xyz;

    // The normal is recomputed from the CURLED surface, never carried through
    // from the flat geometry — and it is crossed in WORLD space, from two
    // neighbouring points put through the same matrix. three's normalMatrix
    // would have given a VIEW-space normal, and the lights are in world space;
    // doing it this way also survives the mesh's anisotropic scale without a
    // second matrix to keep in step.
    float e = 0.002;
    vec3 du = (modelMatrix * vec4(curled(uv + vec2(e, 0.0)), 1.0)).xyz - vWorldPos;
    vec3 dv = (modelMatrix * vec4(curled(uv + vec2(0.0, e)), 1.0)).xyz - vWorldPos;
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
  uniform vec2 uHairline;
  uniform vec3 uEdgeInk;
  uniform float uEdgeAlpha;

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
    // The inside of the roll faces away; light it as paper, which has two sides.
    if (dot(n, v) < 0.0) n = -n;
    vec3 flat0 = normalize(vFlatNormal);

    float shininess = mix(4.0, 128.0, 1.0 - clamp(uRoughness, 0.0, 1.0));
    float base = shade(flat0);
    float lit = base > 1e-4 ? shade(n) / base : 1.0;
    float spec = gloss(n, v, shininess) - gloss(flat0, v, shininess);

    vec3 colour = albedo * lit + vec3(spec * uReflect);

    // THE HAIRLINE. A pixel of ink along the sheet's edge, so the plane has a
    // border rather than dissolving into the ground — and so that it has the
    // SAME border the page does, which is an inset ring of the same colour. An
    // edge that appears at the hand-off is an edge the crossfade has to hide.
    float dx = min(vUv.x, 1.0 - vUv.x) / max(uHairline.x, 1e-6);
    float dy = min(vUv.y, 1.0 - vUv.y) / max(uHairline.y, 1e-6);
    float edge = 1.0 - smoothstep(0.0, 1.0, min(dx, dy));
    colour = mix(colour, uEdgeInk, edge * uEdgeAlpha);

    gl_FragColor = vec4(colour, 1.0);
  }
`;

export interface CurlMaterialOptions {
  tightness: number;
  origin: number;
  originEdge: number;
  paper: string;
  lightA: { x: number; y: number; z: number; intensity: number };
  lightB: { x: number; y: number; z: number; intensity: number };
  roughness: number;
  reflect: number;
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
    // Both sides: the inside of the roll is as much of the sheet as the front.
    side: DoubleSide,
    uniforms: {
      uCurlAmount: { value: 0 },
      uCurlTightness: { value: o.tightness },
      uCurlOrigin: { value: o.origin },
      uCurlOriginEdge: { value: o.originEdge },
      uAspect: { value: 1 },
      uMouse: { value: new Vector2(0, 0) },
      uMouseTilt: { value: (o.mouseTiltDeg * Math.PI) / 180 },
      uMap: { value: null },
      uHasMap: { value: 0 },
      uPaper: { value: new Color(o.paper) },
      uLightAPos: { value: new Vector3(o.lightA.x, o.lightA.y, o.lightA.z) },
      uLightBPos: { value: new Vector3(o.lightB.x, o.lightB.y, o.lightB.z) },
      uLightA: { value: o.lightA.intensity },
      uLightB: { value: o.lightB.intensity },
      uRoughness: { value: o.roughness },
      uReflect: { value: o.reflect },
      uHairline: { value: new Vector2(0, 0) },
      uEdgeInk: { value: new Color(o.edgeInk) },
      uEdgeAlpha: { value: o.edgeAlpha },
    } satisfies CurlUniforms,
  });
  return material as unknown as CurlMaterial;
}

/** Retune a live material from the dock, without rebuilding it. */
export function applyCurlOptions(material: CurlMaterial, o: CurlMaterialOptions): void {
  const u = material.uniforms;
  u.uCurlTightness.value = o.tightness;
  u.uCurlOrigin.value = o.origin;
  u.uCurlOriginEdge.value = o.originEdge;
  u.uMouseTilt.value = (o.mouseTiltDeg * Math.PI) / 180;
  u.uPaper.value.set(o.paper);
  u.uLightAPos.value.set(o.lightA.x, o.lightA.y, o.lightA.z);
  u.uLightBPos.value.set(o.lightB.x, o.lightB.y, o.lightB.z);
  u.uLightA.value = o.lightA.intensity;
  u.uLightB.value = o.lightB.intensity;
  u.uRoughness.value = o.roughness;
  u.uReflect.value = o.reflect;
  u.uEdgeInk.value.set(o.edgeInk);
  u.uEdgeAlpha.value = o.edgeAlpha;
}
