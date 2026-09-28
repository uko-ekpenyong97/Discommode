import { useEffect, useRef } from 'react';
import { useDialKit, useDialKitController } from 'dialkit';
import type { DialConfig as KitConfig } from 'dialkit';
import { COVERS } from '../covers/covers';
import { SITE_COVER_DEFAULTS, setCoverValues, setSiteCoverDials } from '../covers/coverDials';
import type { DialValues } from '../covers/dialValues';
import { riveStatus } from '../covers/rive/riveCover';
import type { RivePlayerStatus } from '../covers/rive/riveCover';

const S = SITE_COVER_DEFAULTS;

/**
 * The COVER panel — one per live cover (docs/covers.md): every dial the tuning
 * bench has (the cover's JSON, stage toggles included), plus the site's own:
 * coverBackdrop, coverMaxDpr and coverPaperShade. Copy pastes into src/covers/covers/<id>.json.
 *
 * Registered from OUTSIDE src/reader: DialKit's store is global, so the panel
 * shows in whichever dock is mounted — the doorway's at #item-02?intro (the
 * view is suspended there, which is why this host is mounted even then) and the
 * app's own everywhere else.
 *
 * A Rive cover's panel (card 04, at #item-04?intro) is its JSON only — riveSwapAt,
 * riveMaxDpr, and its own coverPaperShade — and no site folder: two persisted
 * panels writing the same site dials would each overwrite the other's.
 */
function useCoverPanel(id: string) {
  const def = COVERS[id];
  const v = useDialKit(
    `COVER · ${id}`,
    {
      site: {
        coverBackdrop: { type: 'select', options: ['sky', 'solid'], default: S.coverBackdrop },
        coverBackdropColor: S.coverBackdropColor,
        coverMaxDpr: [S.coverMaxDpr, 0.5, 3, 0.25],
        coverPaperShade: [S.coverPaperShade, 0, 1, 0.01],
      },
      ...(def.dials as KitConfig),
    } as KitConfig,
    { id: `cover-${id}-v1`, persist: true },
  );
  useEffect(() => {
    const { site, ...cover } = v as unknown as { site: typeof S } & DialValues;
    setSiteCoverDials({
      coverBackdrop: site.coverBackdrop === 'solid' ? 'solid' : 'sky',
      coverBackdropColor: site.coverBackdropColor,
      coverMaxDpr: site.coverMaxDpr,
      coverPaperShade: site.coverPaperShade,
    });
    setCoverValues(id, cover);
  }, [id, v]);
}

function RiveSitePanel() {
  useCoverPanel('rive-site');
  return null;
}

/**
 * A Rive cover's panel: its dials, and a STATUS readout under them — what the
 * cover is actually doing, the first thing to read when it does not react
 * (docs/covers.md, "When card 04 does not react"): the file's load state (and
 * its error), each instance (artboard, state machine, view model, frames its
 * state machine has advanced, the last step), the last pointer event an
 * instance received (in artboard space, and how long ago), and the
 * reduced-motion media query. Text fields, checked four times a second and set
 * only when their text changes; the
 * console carries the same as it changes (`[covers] nosey: …`).
 */
const STATUS = {
  file: { type: 'text', default: '' },
  grid: { type: 'text', default: '' },
  hero: { type: 'text', default: '' },
  pointer: { type: 'text', default: '' },
  reducedMotion: { type: 'text', default: '' },
} as const;

function playerLine(p: RivePlayerStatus | undefined): string {
  if (!p) return 'no instance';
  return `"${p.artboard}" / "${p.stateMachine}" / vm ${p.viewModel ?? 'none'} · ${p.frames} frames, dt ${(p.lastDt * 1000).toFixed(1)} ms · #${p.instances}`;
}

function useRiveCoverPanel(id: string) {
  const { values, setValues } = useDialKitController(
    `COVER · ${id}`,
    { ...(COVERS[id].dials as KitConfig), status: STATUS } as KitConfig,
    { id: `cover-${id}-v1`, persist: true },
  );
  // The cover reads its dials, not the readout: only a change in THEM rebinds.
  const last = useRef('');
  useEffect(() => {
    const { status: _status, ...cover } = values as unknown as { status: unknown } & DialValues;
    void _status;
    const json = JSON.stringify(cover);
    if (json === last.current) return;
    last.current = json;
    setCoverValues(id, cover);
  }, [id, values]);
  useEffect(() => {
    let shown = '';
    const tick = () => {
      const st = riveStatus(id);
      const at = Object.entries(st.at)
        .map(([k, ms]) => `${k} +${ms}`)
        .join(', ');
      const p = st.pointer;
      const next = {
        file: `${st.file}${st.error ? `: ${st.error}` : ''} (${at} ms)`,
        grid: playerLine(st.players.grid),
        hero: playerLine(st.players.hero),
        // The age in half-seconds: a text that changed every tick would re-render the dock every tick.
        pointer: p ? `${p.role} ${p.kind} (${p.x}, ${p.y}) · ${(Math.floor((performance.now() - p.t) / 500) / 2).toFixed(1)} s ago · ${p.n} total` : 'none received',
        reducedMotion: st.reducedMotion ? 'reduce (the still, nothing live)' : 'no-preference',
      };
      const json = JSON.stringify(next);
      if (json === shown) return;
      shown = json;
      setValues({ status: next } as never);
    };
    tick();
    const t = window.setInterval(tick, 250);
    return () => window.clearInterval(t);
  }, [id, setValues]);
}

function NoseyPanel() {
  useRiveCoverPanel('nosey');
  return null;
}

/** Mounted by App in dev, suspended or not. */
export default function CoverDials() {
  return (
    <>
      <RiveSitePanel />
      <NoseyPanel />
    </>
  );
}
