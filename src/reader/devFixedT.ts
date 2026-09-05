/**
 * Frozen-t scrub, for tuning BETA, STRIP_COUNT and the ease by eye. Opt in with
 * `#read-NN?debug`; dev builds only (`import.meta.env.DEV` is replaced with
 * `false` in production, so this module tree-shakes away entirely).
 *
 *   n  build a NEXT curl, hold at t = 0.5
 *   b  build a PREV curl, hold at t = 0.5
 *   [  t -= 0.05        ]  t += 0.05        (Shift for +/- 0.01)
 *   x  drop the turn layer
 *
 * A parked curl is live, not inert: grabbing it in its own direction picks the
 * drag up from wherever it was scrubbed to, and arrow keys restart it.
 */
import type { FlipEngine } from './flipEngine';

export function attachFixedT(engine: FlipEngine): () => void {
  let t = 0.5;

  const badge = document.createElement('div');
  badge.className = 'flip-debug';
  badge.textContent = 'n / b = curl · [ ] = t · x = clear';
  document.body.append(badge);

  const show = (dir: string): void => {
    badge.textContent = `${dir}  t = ${t.toFixed(2)}`;
  };

  const onKey = (e: KeyboardEvent): void => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key;

    if (key === 'n' || key === 'b') {
      const dir = key === 'n' ? 'next' : 'prev';
      t = 0.5;
      if (engine.startTurn(dir)) {
        engine.applyTurn(t);
        show(dir);
      } else {
        badge.textContent = `${dir}  out of range`;
      }
      return;
    }

    if (key === 'x') {
      engine.clearTurn();
      badge.textContent = 'cleared';
      return;
    }

    if (key === '[' || key === ']' || key === '{' || key === '}') {
      const step = key === '{' || key === '}' ? 0.01 : 0.05;
      const sign = key === '[' || key === '{' ? -1 : 1;
      t = Math.min(1, Math.max(0, t + sign * step));
      engine.applyTurn(t);
      show('t');
    }
  };

  window.addEventListener('keydown', onKey);
  return () => {
    window.removeEventListener('keydown', onKey);
    badge.remove();
  };
}
