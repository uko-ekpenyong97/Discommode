import type { DialValues } from './dialValues';
import type { CoverDef, Dome, DomeMotion } from './types';

/**
 * The mouse dome of one instance: its centre follows the pointer on a damped
 * spring and its height eases to 1 while the pointer is over the instance, back
 * to 0 when it leaves (the prototype's, on the CPU; the shader only gets the
 * result). Stepped by wall time, so calling `step` twice in one frame — the
 * hero's is read by both the DOM panel and the paper plane — integrates once.
 *
 * Or, for a cover whose `domeMotion` is an EASE (card 03's light), both close
 * a fixed share of the way each frame (`ease`), and the height is how far the
 * cover has gone from its rest toward the pointer.
 */
export class DomeSpring {
  readonly state: Dome = { x: 450, y: 663, amp: 0 };
  private vx = 0;
  private vy = 0;
  private ampV = 0;
  private tx = 0;
  private ty = 0;
  private on = false;
  private last = -1;
  /** Whose `ext` the state carries (a cover id): a grid slot's tile shows
   *  every cover in turn. */
  private extId = '';
  /** When it last took over another instance's state (`adopt`), until its
   *  first step: -1 otherwise. */
  private adopted = -1;
  /** When the pointer last left it (performance.now ms). */
  private leftAt = 0;

  /** The pointer is over the instance, at frame (fx, fy). */
  point(fx: number, fy: number) {
    if (!this.on && this.state.amp < 0.01) {
      // A dome that was at rest starts under the pointer rather than flying in.
      this.state.x = fx;
      this.state.y = fy;
      this.vx = this.vy = 0;
    }
    this.on = true;
    this.tx = fx;
    this.ty = fy;
  }

  leave() {
    if (this.on) this.leftAt = performance.now();
    this.on = false;
  }

  /** Which instance keeps its own draw when they are capped (coverStage.ts):
   *  the one under the pointer, then the one it left most recently. */
  priority(): number {
    return this.on ? Infinity : this.leftAt;
  }

  /** Is anything still moving (or held up)? */
  active(): boolean {
    return this.on || domeUp(this.state);
  }

  /** The cover's per-instance state for `def` (made on first use, and anew
   *  when the instance shows another cover), or none if it keeps none. */
  extFor(def: CoverDef) {
    if (!def.instanceExtra) return undefined;
    if (!this.state.ext || this.extId !== def.id) {
      this.state.ext = def.instanceExtra();
      this.extId = def.id;
    }
    return this.state.ext;
  }

  /**
   * Take over `from`'s state — centre, height, their velocities and its
   * cover's extra — as the pointer leaves it: the clicked grid tile hands its
   * warmth to the morph card and the hero, which share this dome, and it eases
   * out from there instead of starting at rest. If nothing steps this dome
   * soon after (the click did not open the detail view), it goes to rest.
   */
  adopt(from: DomeSpring, now: number, def: CoverDef) {
    const s = this.state;
    s.x = from.state.x;
    s.y = from.state.y;
    s.amp = from.state.amp;
    this.vx = from.vx;
    this.vy = from.vy;
    this.ampV = from.ampV;
    this.tx = from.tx;
    this.ty = from.ty;
    this.on = false;
    this.last = from.last;
    this.adopted = now;
    const ext = this.extFor(def);
    if (ext && from.state.ext) ext.copyFrom(from.state.ext);
    else ext?.reset();
  }

  /** One step of whichever motion the cover asks for. */
  advance(now: number, m: DomeMotion) {
    if (this.adopted >= 0) {
      if (now - this.adopted > 800) this.reset();
      this.adopted = -1;
    }
    if ('ease' in m) this.ease(now, m.ease);
    else this.step(now, m.spring, m.damping);
  }

  /**
   * The ease: the centre and the height each close `perFrame` of the way to
   * where they are going every 60 Hz frame — by wall time, so a 120 Hz display
   * eases at the same speed. A dome that was at rest starts under the pointer
   * (`point`), so it is the height that carries the cover from its rest to the
   * pointer, and back once the pointer leaves.
   */
  ease(now: number, perFrame: number) {
    if (now <= this.last) return;
    const dt = this.last < 0 ? 0 : Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (dt <= 0) return;
    const k = 1 - Math.pow(1 - Math.min(1, Math.max(0, perFrame)), dt * 60);
    const s = this.state;
    if (this.on) {
      s.x += (this.tx - s.x) * k;
      s.y += (this.ty - s.y) * k;
    }
    s.amp += ((this.on ? 1 : 0) - s.amp) * k;
    this.ampV = 0;
    if (!this.on && s.amp < 1e-3) s.amp = 0;
  }

  step(now: number, spring: number, damping: number) {
    // The stage steps with the frame's rAF time and the paper with
    // performance.now(), so two calls can arrive out of order: the clock only
    // ever moves forward.
    if (now <= this.last) return;
    const dt = this.last < 0 ? 0 : Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (dt <= 0) return;
    const k = spring * 10;
    const c = (damping / 100) * 2 * Math.sqrt(k);
    const s = this.state;
    const n = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      if (this.on) {
        this.vx += ((this.tx - s.x) * k - c * this.vx) * h;
        s.x += this.vx * h;
        this.vy += ((this.ty - s.y) * k - c * this.vy) * h;
        s.y += this.vy * h;
      }
      this.ampV += ((this.on ? 1 : 0) - s.amp) * k * h - c * this.ampV * h;
      s.amp += this.ampV * h;
    }
    if (!this.on && Math.abs(s.amp) < 1e-4 && Math.abs(this.ampV) < 1e-4) {
      s.amp = 0;
      this.ampV = 0;
    }
  }

  reset() {
    this.on = false;
    this.state.amp = 0;
    this.ampV = 0;
    this.state.ext?.reset();
  }
}

/** Is this instance off its rest state — its dome up, or its cover's extra
 *  not settled? Then it is drawn for itself, not by the shared draw. */
export function domeUp(d: Dome): boolean {
  return d.amp !== 0 || (!!d.ext && !d.ext.settled());
}

/** One frame of an instance's dome and its cover's extra, at wall time `now`
 *  and the cover clock's `t`. */
export function advanceDome(d: DomeSpring, now: number, def: CoverDef, values: DialValues, t: number) {
  d.advance(now, def.domeMotion(values));
  d.extFor(def)?.step(now, t, d.state, values);
}

/**
 * A cover's DETAIL dome: one per cover, for its card in the detail view
 * whatever role it has there — the morph card, the centre card (its DOM face
 * and its paper plane) and a live side card (docs/covers.md, "The live side
 * card"). Only the centre card's panel drives it (CoverTile's `input`); as a
 * side card nothing points it, so it eases to rest. Being the SAME spring in
 * every role, a card that leaves the centre warm (card 02's lava, card 03's
 * light under the pointer) eases out as a side card instead of snapping to
 * rest, and a side card becoming the centre card starts from where it was —
 * not from the last centre card's dome, which the one shared hero dome handed
 * it until 2026-10-06.
 */
const detailDomes = new Map<string, DomeSpring>();
export function detailDome(id: string): DomeSpring {
  let d = detailDomes.get(id);
  if (!d) detailDomes.set(id, (d = new DomeSpring()));
  return d;
}
