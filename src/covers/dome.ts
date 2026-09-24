import type { Dome } from './types';

/**
 * The mouse dome of one instance: its centre follows the pointer on a damped
 * spring and its height eases to 1 while the pointer is over the instance, back
 * to 0 when it leaves (the prototype's, on the CPU; the shader only gets the
 * result). Stepped by wall time, so calling `step` twice in one frame — the
 * hero's is read by both the DOM panel and the paper plane — integrates once.
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
    this.on = false;
  }

  /** Is anything still moving (or held up)? */
  active(): boolean {
    return this.on || this.state.amp !== 0;
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
  }
}

/** The hero's dome, shared by the DOM hero panel and the paper plane. */
export const heroDome = new DomeSpring();
