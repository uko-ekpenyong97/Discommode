import { useCallback, useEffect, useRef } from 'react';
import { useDialKitController } from 'dialkit';
import type { DialKitController } from 'dialkit';
import type { FlipEngine } from '../reader/flipEngine';
import { issue01 } from '../reader/issue-01';
import { PAGE_ANIMS } from '../reader/pageAnims';
import type { PageAnim } from '../reader/pageAnims';
import { lockedH } from '../reader/pageAnimGeometry';
import { loadPageAnimManifest, rowOf, setAlign, setRowOverride } from '../reader/pageAnimPlayer';
import type { PageAnimManifest } from '../reader/pageAnimGeometry';
import { persistedPanelId } from './dialState';

const OFF = 'off';
const IDS = PAGE_ANIMS.map((r) => r.id);
type Slider = [number, number, number, number];

const CONFIG = {
  anim: { type: 'select' as const, options: [OFF, ...IDS], default: OFF },
  view: { type: 'select' as const, options: ['difference', 'plate'], default: 'difference' },
  x: [0, -800, 2800, 0.01] as Slider,
  y: [0, -800, 3400, 0.01] as Slider,
  w: [100, 10, 2400, 0.01] as Slider,
  rotation: [0, -90, 90, 0.01] as Slider,
  flipX: false as boolean,
  copy: { type: 'action' as const, label: 'Copy row' },
  reset: { type: 'action' as const, label: 'Reset to file' },
};
/** A slider moved this little from the row it was loaded with has not moved. */
const SAME = 0.006;

/** A row as `pageAnims.ts` writes it — what Copy puts on the clipboard. */
export function rowLine(r: PageAnim): string {
  const n = (v: number) => String(Math.round(v * 100) / 100);
  return `  { page: ${r.page}, id: '${r.id}', x: ${n(r.x)}, y: ${n(r.y)}, w: ${n(r.w)}, h: ${n(r.h)}, rotation: ${n(r.rotation)}${r.flipX ? ', flipX: true' : ''}${r.rest != null ? `, rest: ${r.rest}` : ''} },`;
}

// ── rows being aligned, kept across a reload ─────────────────────────────

/** Under DialKit's prefix and this dial-state version, so "Reset dials" and a
 *  version bump clear it with every other saved dial (dialState.ts). */
const ROWS_KEY = `dialkit:${persistedPanelId('page-anim-align-rows')}`;

function savedRows(): Record<string, PageAnim> {
  try {
    const v = JSON.parse(localStorage.getItem(ROWS_KEY) ?? '{}') as unknown;
    return v && typeof v === 'object' ? (v as Record<string, PageAnim>) : {};
  } catch {
    return {};
  }
}

/** Keep (or with null, forget) the row being aligned for `id`. */
function saveRow(id: string, row: PageAnim | null): void {
  try {
    const all = savedRows();
    if (row) all[id] = row;
    else delete all[id];
    if (Object.keys(all).length) localStorage.setItem(ROWS_KEY, JSON.stringify(all));
    else localStorage.removeItem(ROWS_KEY);
  } catch {
    // best effort: a row not kept is a row the file still has
  }
}

/** A saved row, if it still describes its animation (same id and page, finite numbers). */
function validRow(id: string, r: PageAnim | undefined): PageAnim | null {
  const file = PAGE_ANIMS.find((f) => f.id === id);
  if (!file || !r || r.id !== id || r.page !== file.page) return null;
  if (![r.x, r.y, r.w, r.h, r.rotation].every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
  return r;
}

/** The spread a printed inside page opens on (Issue 01 has a cover). */
const spreadOfPage = (page: number) => Math.floor((page + 1) / 2);

/**
 * The PAGE ANIM ALIGN panel — registering an inside page's sprite on its page
 * (src/reader/pageAnims.ts; docs/reader.md, "Inside-page animations").
 *
 * In the READER NAV dock at `#read-NN?intro`. Pick an animation: the book
 * turns to its spread, and its REST frame is drawn over the BAKED page,
 * difference-blended — wherever it is off, its edges light up; registered, it
 * goes dark. `view: plate` shows it over the plate instead, as it ships. x, y
 * and w move it (h follows the drawing's own shape), rotation turns it about
 * its centre, flipX mirrors it. Arrow keys nudge 1px, Shift+arrow 10px, while
 * an animation is picked — and so do not turn the page. **Copy** writes the row
 * for `pageAnims.ts` to the clipboard (and the console); **Reset** goes back
 * to the file's row.
 *
 * Persisted: the pick and the view (the panel), and each animation's edited
 * row (localStorage, per id), which a reload draws again until Copy or Reset.
 * The rest frame is the row's (pageAnims.ts); the tool shows it, and Copy
 * keeps it.
 *
 * Dev-only: the dock that calls it is behind an `import.meta.env.DEV` import.
 */
export function usePageAnimAlign(): void {
  const manifest = useRef<PageAnimManifest | null>(null);
  const ctlRef = useRef<DialKitController<typeof CONFIG> | null>(null);
  // A row loaded into the sliders, until they report it back: the sliders'
  // values in between are the previous animation's.
  const pending = useRef<PageAnim | null>(null);

  const onAction = useCallback((action: string) => {
    const v = ctlRef.current?.getValues();
    if (!v || v.anim === OFF) return;
    if (action === 'copy') {
      const row = rowOf(v.anim);
      if (!row) return;
      const line = rowLine(row);
      navigator.clipboard?.writeText(line).catch(() => {});
      console.log(line);
      // Copied: it belongs in pageAnims.ts now, not in this browser.
      saveRow(v.anim, null);
    } else if (action === 'reset') {
      saveRow(v.anim, null);
      setRowOverride(v.anim, null);
      const row = rowOf(v.anim);
      if (row) {
        pending.current = row;
        ctlRef.current?.setValues(dialsOf(row));
      }
    }
  }, []);

  const ctl = useDialKitController('PAGE ANIM ALIGN', CONFIG, {
    id: persistedPanelId('page-anim-align'),
    persist: true,
    onAction,
  });
  useEffect(() => {
    ctlRef.current = ctl;
  });
  const v = ctl.values as Values;

  useEffect(() => {
    void loadPageAnimManifest(issue01.pageAnims ?? '').then((m) => {
      manifest.current = m;
    });
    // Rows aligned before a reload, drawn again until Copy or Reset.
    for (const [id, r] of Object.entries(savedRows())) {
      const row = validRow(id, r);
      if (row) setRowOverride(id, row);
      else saveRow(id, null);
    }
  }, []);

  // Picking an animation: its row into the sliders, the book to its spread.
  // The row loaded is the one the reader draws now: an edited one (this
  // session's, or restored from localStorage), else the file's.
  useEffect(() => {
    if (v.anim === OFF) return;
    const row = rowOf(v.anim);
    if (!row) return;
    pending.current = row;
    ctl.setValues(dialsOf(row));
    const flip = (window as unknown as { __flip?: FlipEngine }).__flip;
    const target = spreadOfPage(row.page);
    const hash = Number(location.hash.split('/')[1]?.split('?')[0] ?? 0);
    if (flip && hash !== target) flip.turnTo(target);
    // ctl is a new object each render; only the pick matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.anim]);

  // The sliders, as the row the reader draws.
  useEffect(() => {
    if (v.anim === OFF) return;
    const file = PAGE_ANIMS.find((r) => r.id === v.anim);
    if (!file) return;
    const p = pending.current;
    if (p) {
      const same =
        Math.abs(v.x - p.x) < SAME && Math.abs(v.y - p.y) < SAME && Math.abs(v.w - p.w) < SAME &&
        Math.abs(v.rotation - p.rotation) < SAME && v.flipX === !!p.flipX;
      if (!same) return;
      pending.current = null;
    }
    const aspect = manifest.current?.anims[v.anim]?.aspect ?? file.w / file.h;
    const row: PageAnim = {
      page: file.page,
      id: file.id,
      x: v.x,
      y: v.y,
      w: v.w,
      h: lockedH(v.w, aspect),
      rotation: v.rotation,
      ...(v.flipX ? { flipX: true } : {}),
    };
    const cur = rowOf(v.anim);
    if (cur?.rest != null) row.rest = cur.rest;
    const unchanged =
      cur && cur.x === row.x && cur.y === row.y && cur.w === row.w && cur.rotation === row.rotation && !!cur.flipX === !!row.flipX;
    if (unchanged) return;
    setRowOverride(v.anim, row);
    saveRow(v.anim, row);
  }, [v.anim, v.x, v.y, v.w, v.rotation, v.flipX]);

  // Which page is being aligned, and how it is shown.
  useEffect(() => {
    setAlign(v.anim === OFF ? null : { id: v.anim, view: v.view as 'difference' | 'plate' });
  }, [v.anim, v.view]);
  useEffect(() => () => setAlign(null), []);

  // Arrow keys nudge while an animation is picked — ahead of the engine's own
  // listener (window, bubbling), which would turn the page.
  useEffect(() => {
    if (v.anim === OFF) return;
    const onKey = (e: KeyboardEvent) => {
      const step = e.shiftKey ? 10 : 1;
      const nudges: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      const d = nudges[e.key];
      if (!d || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const cur = ctlRef.current?.getValues();
      if (!cur) return;
      ctlRef.current?.setValues({ x: cur.x + d[0], y: cur.y + d[1] });
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [v.anim]);
}

interface Values {
  anim: string;
  view: string;
  x: number;
  y: number;
  w: number;
  rotation: number;
  flipX: boolean;
}

const dialsOf = (r: PageAnim): Partial<Values> => ({ x: r.x, y: r.y, w: r.w, rotation: r.rotation, flipX: !!r.flipX });
