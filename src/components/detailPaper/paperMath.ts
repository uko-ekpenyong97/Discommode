/**
 * The paper driver's arithmetic, kept free of three.js and React so it can be
 * unit-tested (`paperMath.test.ts`).
 */

/** A card on screen, as the detail strip lays it out: centre + size, CSS px. */
export interface CardRect {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

/** A value moving from `from` to `to` over `ms`, starting at `start`. */
export interface Tween {
  from: number;
  to: number;
  start: number;
  ms: number;
}

export function sampleTween(t: Tween, now: number): number {
  if (t.ms <= 0) return t.to;
  const k = Math.min(1, Math.max(0, (now - t.start) / t.ms));
  return t.from + (t.to - t.from) * easeOutCubic(k);
}

export const tweenDone = (t: Tween, now: number): boolean => now - t.start >= t.ms;

/**
 * Retarget a tween from wherever it is NOW, so a reversal mid-flight never
 * jumps. A tween already heading to `to` is left alone.
 */
export function retarget(t: Tween, to: number, now: number, ms: number): Tween {
  if (t.to === to) return t;
  return { from: sampleTween(t, now), to, start: now, ms };
}

/**
 * The fold a panel is heading for, from its slot (its distance from the centre
 * panel, rounded, as the strip counts it). Slots 0 and 1 are on screen — the
 * hero and its two neighbours — and are flat; slot 2 is the buffer the strip
 * renders off screen, and is crumpled. So Prev/Next brings a card into a
 * neighbour slot folded and it opens out, and the card leaving does the reverse.
 */
export const foldTarget = (slot: number): number => (slot >= 2 ? 1 : 0);

/**
 * The fold the shader actually draws: the panel's own fold, scaled by how far it
 * is from the centre (capped at 1). THE HERO NEVER FOLDS — a card that is
 * becoming the hero takes the fold off continuously as it arrives, whatever its
 * tween is doing.
 */
export const effectiveFold = (fold: number, dist: number): number => fold * Math.min(1, Math.abs(dist));

/**
 * The strip's velocity in hero widths per 60Hz frame: the slide's position
 * change (in panels) times the panel step, over the hero width, rescaled from
 * this frame's `dt` to a nominal 1/60s so a 120Hz display squashes the same.
 */
export function stripVelocity(dpos: number, panelStep: number, heroW: number, dt: number): number {
  if (dt <= 0 || heroW <= 0) return 0;
  return ((dpos * panelStep) / heroW) * (1 / 60 / dt);
}

/** Frame-rate independent lerp factor for a per-60Hz-frame rate `k`. */
export const lerpK = (k: number, dt: number): number => 1 - (1 - k) ** (dt * 60);

/**
 * The pointer's UV on a card — y UP, three.js's convention — or null when it is
 * off the card. This is the raycast: the camera is orthographic in CSS pixels,
 * so a ray from the pointer meets the card's rest plane at exactly this point.
 * (It ignores the card's own deformation, which is a dent of a few pixels under
 * the very point being tested.)
 */
export function pointerUv(r: CardRect, x: number, y: number): { u: number; v: number } | null {
  const u = (x - (r.cx - r.w / 2)) / r.w;
  const v = 1 - (y - (r.cy - r.h / 2)) / r.h;
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  return { u, v };
}

/**
 * A hover sprite's box, from its inline px inside the (unscaled) panel, as a UV
 * rect `[u0, v0, u1, v1]`, y up. The layer fills the panel and the panel is
 * scaled as a whole, so the ratio is the same at any scale.
 */
export function spriteUvRect(
  left: number,
  top: number,
  width: number,
  height: number,
  panelW: number,
  panelH: number,
): [number, number, number, number] {
  return [left / panelW, 1 - (top + height) / panelH, (left + width) / panelW, 1 - top / panelH];
}

/** The source crop `object-fit: cover` takes of an image for a box — centred. */
export function coverCrop(
  imgW: number,
  imgH: number,
  boxW: number,
  boxH: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const box = boxW / boxH;
  const img = imgW / imgH;
  if (img > box) {
    const sw = imgH * box;
    return { sx: (imgW - sw) / 2, sy: 0, sw, sh: imgH };
  }
  const sh = imgW / box;
  return { sx: 0, sy: (imgH - sh) / 2, sw: imgW, sh };
}
