import { useEffect, useRef } from 'react';
import { useDialKit, useDialKitController } from 'dialkit';
import type { DialConfig as KitConfig } from 'dialkit';
import { COVERS } from '../covers/covers';
import { SITE_COVER_DEFAULTS, setCoverValues, setSiteCoverDials } from '../covers/coverDials';
import type { DialValues } from '../covers/dialValues';
import { riveStatus } from '../covers/rive/riveCover';
import type { RivePlayerStatus, RivePointerStatus } from '../covers/rive/riveCover';
import { persistedPanelId } from './dialState';
import { useResetDialsPanel } from './resetDialsPanel';

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
    { id: persistedPanelId(`cover-${id}`), persist: true },
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
 * reduced-motion media query — the grid's instance and the hero's apart, with
 * what the paper's hero plane samples (live, or the still) and its uploads a
 * second, and what is on screen (the artboard swap is a change there). Text
 * fields, checked once a second and set only when their text changes; the
 * console carries the same as it changes (`[covers] nosey: …`).
 */
const STATUS = {
  file: { type: 'text', default: '' },
  showing: { type: 'text', default: '' },
  grid: { type: 'text', default: '' },
  gridPointer: { type: 'text', default: '' },
  hero: { type: 'text', default: '' },
  heroPointer: { type: 'text', default: '' },
  heroPlane: { type: 'text', default: '' },
  reducedMotion: { type: 'text', default: '' },
} as const;

/**
 * The readout's lines are STATES, not counters: every change is a DialKit
 * re-render of the dock, ~300 ms in a dev build, and lines that ticked (a frame
 * count, an age, a pointer's coordinates while it moves) made the page stutter
 * once a second with the dock open. The live numbers are in the console and
 * `__covers.rive.status(id)`.
 */
function playerLine(p: RivePlayerStatus | undefined, advancing: boolean | null): string {
  if (!p) return 'no instance';
  const state = advancing === null ? '' : advancing ? ' · advancing' : ' · not advancing (not on screen, or stalled)';
  return `"${p.artboard}" / "${p.stateMachine}" / vm ${p.viewModel ?? 'none'} · instance #${p.instances}${state}`;
}

function pointerLine(p: RivePointerStatus | undefined, now: number): string {
  if (!p) return 'none received';
  // While events keep coming the line holds still; once they stop it says where.
  return now - p.t < 600 ? 'receiving' : `last: ${p.kind} at (${p.x}, ${p.y}) in artboard space · ${p.n} in all`;
}

function useRiveCoverPanel(id: string) {
  const { values, setValues } = useDialKitController(
    `COVER · ${id}`,
    { ...(COVERS[id].dials as KitConfig), status: STATUS } as KitConfig,
    { id: persistedPanelId(`cover-${id}`), persist: true },
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
    const last = { grid: -1, hero: -1, uploads: -1 };
    const tick = () => {
      const st = riveStatus(id);
      const at = Object.entries(st.at)
        .map(([k, ms]) => `${k} +${ms}`)
        .join(', ');
      const now = performance.now();
      const plane = st.plane && now - st.plane.t < 500 ? st.plane : null;
      const moved = (role: 'grid' | 'hero') => {
        const f = st.players[role]?.frames ?? -1;
        const on = last[role] >= 0 && f > last[role];
        last[role] = f;
        return st.players[role] ? on : null;
      };
      const uploading = plane ? plane.uploads > last.uploads && last.uploads >= 0 : false;
      if (plane) last.uploads = plane.uploads;
      const swap = st.swaps.at(-1);
      const next = {
        file: `${st.file}${st.error ? `: ${st.error}` : ''} (${at} ms)`,
        showing: `${st.showing || 'nothing'}${swap ? ` (was: ${swap.from || 'nothing'})` : ''}`,
        grid: playerLine(st.players.grid, moved('grid')),
        gridPointer: pointerLine(st.pointers.grid, now),
        hero: playerLine(st.players.hero, moved('hero')),
        heroPointer: pointerLine(st.pointers.hero, now),
        heroPlane: plane
          ? plane.shows === 'live'
            ? `live Main Bounce · ${uploading ? 'new frames uploading' : 'no new frame uploaded in the last second'}`
            : `${plane.shows} — Main Bounce is not on the plane`
          : 'not drawing (paper off, or not the hero)',
        reducedMotion: st.reducedMotion ? 'reduce (the still, nothing live)' : 'no-preference',
      };
      const json = JSON.stringify(next);
      if (json === shown) return;
      shown = json;
      setValues({ status: next } as never);
    };
    tick();
    // Once a second: every change is a DialKit re-render of the dock, and in a
    // dev build that was a 280–340 ms frame every few seconds at four a second.
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [id, setValues]);
}

function NoseyPanel() {
  useRiveCoverPanel('nosey');
  return null;
}

function DialsPanel() {
  useResetDialsPanel();
  return null;
}

/** Mounted by App in dev, suspended or not — so the DIALS panel (Reset dials)
 *  is registered here too, and shows in whichever dock is up. */
export default function CoverDials() {
  return (
    <>
      <DialsPanel />
      <RiveSitePanel />
      <NoseyPanel />
    </>
  );
}
