import { shaderCover } from './covers';
import type { Dome } from './types';

/**
 * DEV / verify ONLY (every call site is behind `import.meta.env.DEV`, so none
 * of this is in a build): what each SHADER cover's draws cost, and what they
 * drew, for verify:cover's `sbudgets` and `sjump` (docs/covers.md, "The live
 * side card"). Both are off until a check turns them on (`window.__covers.probe`),
 * so a dev session pays nothing for them.
 *
 *   cost   per frame, per cover and ROLE (the paper's centre or side plane):
 *          the main-thread ms of the draw call — its uniforms, card 02's lava
 *          on the CPU, the GL calls. Its GPU ms is `__paper.benchCover`'s
 *          (bench.ts): a TIME_ELAPSED query was tried here, and on ANGLE's
 *          Metal backend it timed card 03's 0.12 ms draw at 5.5 ms — the
 *          command buffer's span, not the draw's
 *   drawn  per cover and SURFACE (a grid tile at rest or for itself, the morph
 *          card, the DOM centre or side card, the paper's centre or side
 *          plane): the last draw's clock and a copy of its dome, so a check
 *          can redraw exactly what was on screen at a fixed size, frame by
 *          frame, across a change of role
 */

export type CostRole = 'centre' | 'side';
export type DrawSurface = 'tiles' | 'tile own' | 'morph' | 'centre' | 'side' | 'paper centre' | 'paper side';

export interface CostRow {
  frame: number;
  id: string;
  role: CostRole;
  cpu: number;
  /** Draws summed into the row (one a frame, in practice). */
  n: number;
}

export interface DrawnNote {
  surface: DrawSurface;
  frame: number;
  seq: number;
  t: number;
  dome: Dome;
}

const state = { cost: false, drawn: false };
const rows: CostRow[] = [];
const MAX_ROWS = 4000;
const notes = new Map<string, Map<DrawSurface, DrawnNote>>();
let seq = 0;

function frameKey(): number {
  const t = document.timeline.currentTime;
  return typeof t === 'number' ? t : performance.now();
}

/** Run one draw of cover `id` in `role`, timed while the probe is on. */
export function measureDraw(id: string, role: CostRole, draw: () => boolean): boolean {
  if (!state.cost) return draw();
  const frame = frameKey();
  let row = rows.find((r) => r.frame === frame && r.id === id && r.role === role);
  if (!row) {
    row = { frame, id, role, cpu: 0, n: 0 };
    rows.push(row);
    if (rows.length > MAX_ROWS) rows.shift();
  }
  const t0 = performance.now();
  const drawn = draw();
  row.cpu += performance.now() - t0;
  row.n++;
  return drawn;
}

/** Are draws being noted? (So a caller can skip working out its surface.) */
export function noting(): boolean {
  return state.drawn;
}

/** A draw of cover `id` on `surface`, at `t`, under `dome`: kept (copied). */
export function noteDraw(id: string, surface: DrawSurface, t: number, dome: Dome) {
  if (!state.drawn) return;
  let m = notes.get(id);
  if (!m) notes.set(id, (m = new Map()));
  const copy: Dome = { x: dome.x, y: dome.y, amp: dome.amp };
  const def = shaderCover(id);
  if (dome.ext && def?.instanceExtra) {
    copy.ext = def.instanceExtra();
    copy.ext.copyFrom(dome.ext);
  }
  m.set(surface, { surface, frame: frameKey(), seq: ++seq, t, dome: copy });
}

/** Which surface shows a cover when several drew in the same frame. */
const RANK: Record<DrawSurface, number> = {
  'paper centre': 6,
  'paper side': 6,
  morph: 5,
  centre: 4,
  side: 4,
  'tile own': 3,
  tiles: 2,
};

/** The draw on screen: the latest frame's, the likeliest surface of it. */
export function shownNote(id: string): DrawnNote | null {
  const m = notes.get(id);
  if (!m) return null;
  let best: DrawnNote | null = null;
  for (const n of m.values()) {
    if (!best || n.frame > best.frame || (n.frame === best.frame && RANK[n.surface] > RANK[best.surface])) best = n;
  }
  return best;
}

export const drawProbe = {
  /** Turn the cost rows and/or the drawn notes on or off (clearing them). */
  set(o: { cost?: boolean; drawn?: boolean }) {
    if (o.cost !== undefined) {
      state.cost = o.cost;
      rows.length = 0;
    }
    if (o.drawn !== undefined) {
      state.drawn = o.drawn;
      notes.clear();
    }
  },
  costs(): CostRow[] {
    return rows.map((r) => ({ ...r }));
  },
  clearCosts() {
    rows.length = 0;
  },
  shown: shownNote,
};
