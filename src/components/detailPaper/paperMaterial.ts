import { ShaderMaterial, Vector2, Vector3, Vector4 } from 'three';
import type { IUniform, Texture } from 'three';

/**
 * THE DETAIL CARDS' PAPER — one plane per card, pixel-matched to the DOM card it
 * replaces, and a material that turns it into a sheet: a crease texture that
 * refracts and lights the artwork, a dent under the cursor, a squash with the
 * row's velocity, a resting ripple, and a fold that un-crumples a card into its
 * slot. The reference is justinesoulie.fr; its behaviour is ported, its numbers
 * are not (see paperDials.ts).
 *
 * ── THE INVARIANT ─────────────────────────────────────────────────────────
 *
 * With every effect at zero — `uCreaseBlend`, `uCreaseDisplacement`, `uHover`,
 * `uVelocity`, `uRipple`, `uFold`, `uBoil` — the plane draws exactly the DOM image it
 * replaces: its rect is the card's rect, its texture is the card's face resized
 * to the card's device pixels (so it samples 1:1), and every term below either
 * multiplies by one of those uniforms or is exactly 0 or 1 when they are 0. That
 * is how the hand-off is verified, so every new term has to keep it.
 *
 * ── WHERE Z GOES ──────────────────────────────────────────────────────────
 *
 * The camera is ORTHOGRAPHIC in CSS pixels, which is what makes the plane land
 * on the card to the pixel — and an orthographic camera cannot see z. So the
 * vertex stage applies a CSS-style perspective of its own after the
 * deformation: a point `z` card heights toward the viewer is pushed away from
 * the viewport centre by `P / (P − z)`. At z = 0 that is exactly 1, which is why
 * the flat plane is still pixel-matched; the dent, the squash and the fold are
 * what move z.
 */

/** The perspective distance, in viewport heights: roughly where CSS's own
 *  `perspective` lands a card that should read as lying on a table in front of
 *  you rather than as a lens. */
export const PERSPECTIVE_VH = 2;

/** The DOM card's `border-radius`, in its own (unscaled) px. */
export const CARD_RADIUS_PX = 6;

/** The DOM card's `box-shadow: 0 24px 70px rgba(0,0,0,.55)`, which the canvas
 *  draws while it carries the cards (see DetailPaperLayer on why). */
export const SHADOW = { y: 24, blur: 70, alpha: 0.55 } as const;

/** Most hover sprites a card can carry a mask for. The cover has twenty. */
export const MAX_SPRITES = 24;

export interface PaperUniforms {
  [name: string]: IUniform;
  uMap: IUniform<Texture | null>;
  uCreases: IUniform<Texture | null>;
  /** Centre (x, y down) and on-screen size, CSS px. */
  uRect: IUniform<Vector4>;
  uViewport: IUniform<Vector2>;
  uPerspective: IUniform<number>;
  uPixelRatio: IUniform<number>;
  /** The on-screen corner radius, CSS px. */
  uRadius: IUniform<number>;
  uIndex: IUniform<number>;
  uAlpha: IUniform<number>;
  /** 1: uMap is PREMULTIPLIED and not opaque — a live cover (docs/covers.md). */
  uPremul: IUniform<number>;
  uCreaseBlend: IUniform<number>;
  uCreaseDisplacement: IUniform<number>;
  uHover: IUniform<number>;
  /** The cursor, in UV − 0.5. */
  uHit: IUniform<Vector2>;
  uHoverRadius: IUniform<number>;
  uHoverDepth: IUniform<number>;
  uVelocity: IUniform<number>;
  uSquash: IUniform<number>;
  uSquashScale: IUniform<number>;
  uRipple: IUniform<number>;
  uFold: IUniform<number>;
  uFoldAmp: IUniform<number>;
  /**
   * The cover's BOIL (src/reader/coverLife.ts): a rigid offset (x, y down, CSS
   * px on screen) and rotation (z, radians, clockwise on screen) about the
   * card's centre — the very translate/rotate the CoverAnimLayer's sprites are
   * given, so plate and sprites move together.
   */
  uBoil: IUniform<Vector3>;
  /** UV rects (y up) where the crease displacement is held at 0. */
  uSprites: IUniform<Vector4[]>;
  uSpriteCount: IUniform<number>;
}

const COMMON = /* glsl */ `
  uniform vec4 uRect;
  uniform vec2 uViewport;
  uniform float uPerspective;
  uniform float uIndex;
  uniform float uHover;
  uniform vec2 uHit;
  uniform float uHoverRadius;

  float hoverInfluence(vec2 uv) {
    return 1.0 - smoothstep(0.0, uHoverRadius, distance(uv - 0.5, uHit));
  }
`;

const VERTEX = /* glsl */ `
  ${COMMON}
  uniform float uHoverDepth;
  uniform float uVelocity;
  uniform float uSquash;
  uniform float uSquashScale;
  uniform float uRipple;
  uniform float uFold;
  uniform float uFoldAmp;
  uniform vec3 uBoil;

  varying vec2 vUv;

  void main() {
    vUv = uv;
    // The plane's own coordinates, in card units: x across, y up, z toward the
    // viewer, each in [-0.5, 0.5] across the card (z in card HEIGHTS).
    vec2 p = position.xy;
    float z = 0.0;

    // The dent: the sheet gives under the cursor.
    z -= hoverInfluence(uv) * uHover * uHoverDepth;

    // The squash: the row's velocity pushes the sheet back and swells it, so it
    // reads as having mass. Clamped so a flick cannot throw it through the table.
    float speed = abs(uVelocity);
    z += max(speed * -uSquash, -0.1);
    float swell = 1.0 + min(speed / 10.0, uSquashScale);

    // The resting ripple — a sheet that has been handled never lies quite flat.
    // Each card's phase is its own.
    z -= sin(uv.y * 10.0 + uIndex) * uRipple;
    p.y -= cos(uv.x * 10.0 + uIndex + 100.0) * uRipple * 0.35;

    // The fold: crumpled toward the viewer and buckled along a diagonal.
    float f = uFold * uFoldAmp;
    float a = uv.x * 0.4 + uv.y * 6.2831853 + uIndex * 0.05;
    z += f * 0.4;
    z -= cos(a) * 0.15 * f;
    p.y -= cos(a) * 0.35 * f;

    // To CSS px (y down), about the card's centre.
    vec2 css = uRect.xy + vec2(p.x * uRect.z, -p.y * uRect.w) * swell;
    // The perspective the orthographic camera cannot supply: exactly 1 at z = 0.
    float zpx = z * uRect.w;
    vec2 c = uViewport * 0.5;
    css = c + (css - c) * (uPerspective / (uPerspective - zpx));

    // The boil, last and in screen space: exactly what CSS does to the DOM
    // sprites over this plate (rotate about the centre, then translate), on top
    // of the dent. At uBoil = 0 it is exactly the identity (cos 0 = 1, sin 0 = 0).
    vec2 rel = css - uRect.xy;
    float bc = cos(uBoil.z);
    float bs = sin(uBoil.z);
    css = uRect.xy + vec2(rel.x * bc - rel.y * bs, rel.x * bs + rel.y * bc) + uBoil.xy;

    gl_Position = projectionMatrix * viewMatrix * vec4(css.x, -css.y, 0.0, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  ${COMMON}
  uniform sampler2D uMap;
  uniform sampler2D uCreases;
  uniform float uPixelRatio;
  uniform float uRadius;
  uniform float uAlpha;
  uniform float uPremul;
  uniform float uCreaseBlend;
  uniform float uCreaseDisplacement;
  uniform float uFold;
  uniform vec4 uSprites[${MAX_SPRITES}];
  uniform int uSpriteCount;

  varying vec2 vUv;

  // Remap v from [a, b] to [c, d], clamped.
  float cmap(float v, float a, float b, float c, float d) {
    return mix(c, d, clamp((v - a) / (b - a), 0.0, 1.0));
  }

  // 1 inside any hover sprite's box, else 0.
  float spriteMask(vec2 uv) {
    float m = 0.0;
    for (int i = 0; i < ${MAX_SPRITES}; i++) {
      if (i >= uSpriteCount) break;
      vec4 r = uSprites[i];
      m = max(m, step(r.x, uv.x) * step(uv.x, r.z) * step(r.y, uv.y) * step(uv.y, r.w));
    }
    return m;
  }

  // Textures are uploaded top row first (no flip), so v is read downward.
  vec4 face(vec2 uv) {
    return texture2D(uMap, vec2(uv.x, 1.0 - uv.y));
  }

  void main() {
    // The un-crumple's reveal: a slightly skewed edge sweeping down the card.
    // Rescaled from the reference's (y − 0.04x) < fold so that fold 0 discards
    // nothing — the raw form eats a 4% sliver of the bottom-right at rest.
    if ((vUv.y - vUv.x * 0.04) < uFold * 1.04 - 0.04) discard;

    // The crease texel, turned a quarter per card so no two cards share folds.
    float ang = uIndex * 1.5707963;
    mat2 rot = mat2(cos(ang), sin(ang), -sin(ang), cos(ang));
    vec3 texel = texture2D(uCreases, rot * (vUv - 0.5) + 0.5).rgb;

    // Refraction: the creases push the artwork, harder under the cursor. Held at
    // 0 under the hover sprites, which are DOM and must stay registered.
    float hover = hoverInfluence(vUv) * uHover;
    float disp = uCreaseDisplacement * (1.0 - spriteMask(vUv));
    vec2 uv = vUv - texel.g * disp - hover * disp * texel.g;
    // A live cover's texture is premultiplied and mostly not opaque (the sky
    // shows through its ground): light the colour it HAS, un-premultiplied, and
    // carry its alpha through. An opaque face (every other card) has a = 1 and
    // this is exactly the old path.
    vec4 texel4 = face(uv);
    float ta = uPremul > 0.5 ? texel4.a : 1.0;
    vec3 col = uPremul > 0.5 ? texel4.rgb / max(ta, 1e-4) : texel4.rgb;

    // Light: the ridges screen into the artwork, the troughs shade it — and the
    // shading sharpens under the cursor.
    vec3 screen = 1.0 - (1.0 - col) * (1.0 - texel);
    col = mix(col, screen, uCreaseBlend);
    col -= (cmap(texel.g, 0.0, 0.1, 0.05, 0.0) - texel.g * hover * 0.1) * (uCreaseBlend / 0.2);

    // The card's rounded corners, antialiased. Only inside the corner squares:
    // the straight edges are the triangles' own, and multisampled.
    vec2 local = (vUv - 0.5) * uRect.zw;
    vec2 q = abs(local) - uRect.zw * 0.5 + uRadius;
    float corner = 1.0;
    if (q.x > 0.0 && q.y > 0.0) {
      corner = clamp(0.5 - (length(q) - uRadius) * uPixelRatio, 0.0, 1.0);
    }

    float a = uAlpha * corner * ta;
    gl_FragColor = vec4(clamp(col, 0.0, 1.0) * a, a);
  }
`;

export interface PaperMaterial extends ShaderMaterial {
  uniforms: PaperUniforms;
}

export function createPaperMaterial(creases: Texture | null): PaperMaterial {
  const uniforms: PaperUniforms = {
    uMap: { value: null },
    uCreases: { value: creases },
    uRect: { value: new Vector4() },
    uViewport: { value: new Vector2(1, 1) },
    uPerspective: { value: 1 },
    uPixelRatio: { value: 1 },
    uRadius: { value: CARD_RADIUS_PX },
    uIndex: { value: 0 },
    uAlpha: { value: 1 },
    uPremul: { value: 0 },
    uCreaseBlend: { value: 0 },
    uCreaseDisplacement: { value: 0 },
    uHover: { value: 0 },
    uHit: { value: new Vector2() },
    uHoverRadius: { value: 0.35 },
    uHoverDepth: { value: 0 },
    uVelocity: { value: 0 },
    uSquash: { value: 0 },
    uSquashScale: { value: 0 },
    uRipple: { value: 0 },
    uFold: { value: 0 },
    uFoldAmp: { value: 1 },
    uBoil: { value: new Vector3() },
    uSprites: { value: Array.from({ length: MAX_SPRITES }, () => new Vector4()) },
    uSpriteCount: { value: 0 },
  };
  return new ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    // Output is premultiplied (see the fragment), and so is the canvas.
    premultipliedAlpha: true,
    depthTest: false,
    depthWrite: false,
  }) as PaperMaterial;
}

// ── the shadow ─────────────────────────────────────────────────────────────

const SHADOW_VERTEX = /* glsl */ `
  uniform vec4 uRect;      // the CARD's rect: centre (y down) + on-screen size
  uniform float uMargin;   // how far past the card the quad reaches, CSS px
  uniform float uOffsetY;
  varying vec2 vPx;        // this fragment, CSS px from the SHADOW's centre
  void main() {
    vec2 hs = uRect.zw * 0.5 + uMargin;
    vPx = vec2(position.x, -position.y) * 2.0 * hs;
    vec2 css = uRect.xy + vec2(0.0, uOffsetY) + vPx;
    gl_Position = projectionMatrix * viewMatrix * vec4(css.x, -css.y, 0.0, 1.0);
  }
`;

const SHADOW_FRAGMENT = /* glsl */ `
  uniform vec4 uRect;
  uniform float uSigma;
  uniform float uAlpha;
  uniform float uOffsetY;
  uniform float uHole;     // 1: not under the card itself (a transparent card)
  uniform float uRadius;
  varying vec2 vPx;

  // Abramowitz & Stegun 7.1.27; plenty for a shadow.
  vec2 erf2(vec2 x) {
    vec2 s = sign(x);
    vec2 a = abs(x);
    x = 1.0 + (0.278393 + (0.230389 + 0.078108 * (a * a)) * a) * a;
    x *= x;
    return s - s / (x * x);
  }

  void main() {
    // A gaussian-blurred rectangle is separable: the product of two 1D blurred
    // box edges. The card's 6px corners are lost inside a 35px sigma.
    vec2 hs = uRect.zw * 0.5;
    vec2 k = vec2(0.70710678 / uSigma);
    vec2 lo = erf2((vPx + hs) * k);
    vec2 hi = erf2((vPx - hs) * k);
    vec2 cover = 0.5 * (lo - hi);
    float a = cover.x * cover.y * uAlpha;
    // A CSS box-shadow is only ever painted OUTSIDE its box. Under an opaque
    // card that is invisible either way; under a live cover, whose ground lets
    // the sky through, it is the difference between the sky and a dark slab.
    if (uHole > 0.5) {
      vec2 q = abs(vPx + vec2(0.0, uOffsetY)) - hs + uRadius;
      float inside = clamp(0.5 - (length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRadius), 0.0, 1.0);
      a *= 1.0 - inside;
    }
    gl_FragColor = vec4(0.0, 0.0, 0.0, a);
  }
`;

export interface ShadowUniforms {
  [name: string]: IUniform;
  uRect: IUniform<Vector4>;
  uMargin: IUniform<number>;
  uOffsetY: IUniform<number>;
  uSigma: IUniform<number>;
  uAlpha: IUniform<number>;
  uHole: IUniform<number>;
  uRadius: IUniform<number>;
}

export interface ShadowMaterial extends ShaderMaterial {
  uniforms: ShadowUniforms;
}

export function createShadowMaterial(): ShadowMaterial {
  const uniforms: ShadowUniforms = {
    uRect: { value: new Vector4() },
    uMargin: { value: 0 },
    uOffsetY: { value: 0 },
    uSigma: { value: 1 },
    uAlpha: { value: 0 },
    uHole: { value: 0 },
    uRadius: { value: 6 },
  };
  return new ShaderMaterial({
    uniforms,
    vertexShader: SHADOW_VERTEX,
    fragmentShader: SHADOW_FRAGMENT,
    transparent: true,
    premultipliedAlpha: true,
    depthTest: false,
    depthWrite: false,
  }) as ShadowMaterial;
}
