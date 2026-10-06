import { memo, useEffect, useRef } from 'react';
import { useDialKit, useDialKitController } from 'dialkit';
import type { DialConfig as KitConfig } from 'dialkit';
import { COVERS } from '../covers/covers';
import { SITE_COVER_DEFAULTS, coverValues, setCoverValues, setSiteCoverDials } from '../covers/coverDials';
import type { DialValues } from '../covers/dialValues';
import { peekRiveInstance, riveStatus } from '../covers/rive/riveCover';
import type { RiveInstanceStatus, RivePointerStatus } from '../covers/rive/riveCover';
import { persistedPanelId } from './dialState';
import { useResetDialsPanel } from './resetDialsPanel';
import './statusReadout.css';

const S = SITE_COVER_DEFAULTS;

/**
 * The COVER panel — one per live cover (docs/covers.md): every dial the tuning
 * bench has (the cover's JSON, stage toggles included), plus the site's own:
 * coverBackdrop, coverMaxDpr, coverRenderMax and coverPaperShade. Copy pastes into src/covers/covers/<id>.json.
 *
 * Registered from OUTSIDE src/reader: DialKit's store is global, so the panel
 * shows in whichever dock is mounted — the doorway's at #item-02?intro (the
 * view is suspended there, which is why this host is mounted even then) and the
 * app's own at /?intro.
 *
 * Card 02's `lava` folder is not here: it is the LAVA panel, below.
 *
 * Card 03's (COVER · DREX) is its JSON only, below. A Rive cover's panel
 * (card 04, at #item-04?intro) is its JSON only too — riveFocusAt,
 * riveMaxDpr, and its own coverPaperShade — and no site folder: two persisted
 * panels writing the same site dials would each overwrite the other's.
 */
function useCoverPanel(id: string) {
  const { lava: _lava, ...dials } = COVERS[id].dials as KitConfig;
  void _lava;
  const v = useDialKit(
    `COVER · ${id}`,
    {
      site: {
        coverBackdrop: { type: 'select', options: ['sky', 'solid'], default: S.coverBackdrop },
        coverBackdropColor: S.coverBackdropColor,
        coverMaxDpr: [S.coverMaxDpr, 0.5, 3, 0.25],
        coverRenderMax: [S.coverRenderMax, 256, 2048, 16],
        coverPaperShade: [S.coverPaperShade, 0, 1, 0.01],
      },
      ...dials,
    } as KitConfig,
    { id: persistedPanelId(`cover-${id}`), persist: true },
  );
  useEffect(() => {
    const { site, ...cover } = v as unknown as { site: typeof S } & DialValues;
    setSiteCoverDials({
      coverBackdrop: site.coverBackdrop === 'solid' ? 'solid' : 'sky',
      coverBackdropColor: site.coverBackdropColor,
      coverMaxDpr: site.coverMaxDpr,
      coverRenderMax: site.coverRenderMax,
      coverPaperShade: site.coverPaperShade,
    });
    // the LAVA panel's folder as that panel last set it
    const lava = coverValues(id).lava;
    setCoverValues(id, lava === undefined ? cover : { ...cover, lava });
  }, [id, v]);
}

function RiveSitePanel() {
  useCoverPanel('rive-site');
  return null;
}

/**
 * LAVA — card 02's blobs (src/covers/covers/lava.ts): how many, how big, how
 * fast they rise, how much they wobble, how softly they merge; how the
 * pointer warms them (radius, strength, toward or away); and the cover's solid
 * background. Its own panel, at #item-02?intro with COVER · rive-site. Copy
 * pastes into rive-site.json's `lava` folder.
 */
function LavaPanel() {
  const v = useDialKit('LAVA', COVERS['rive-site'].dials.lava as KitConfig, {
    id: persistedPanelId('cover-rive-site-lava'),
    persist: true,
  });
  useEffect(() => setCoverValues('rive-site', { ...coverValues('rive-site'), lava: v as unknown as DialValues }), [v]);
  return null;
}

/**
 * Card 03's panel, COVER · DREX: its JSON only (drex.json — every DEFAULTS
 * value of drexCover.js: Figma's risograph, dither and hover reveal, and the
 * site's rest dials), and no site folder — card 02's panel writes the site's
 * dials, and two persisted panels writing them would overwrite each other.
 * The inks and the paper are RGBA sliders, not colour dials: a colour dial is
 * 8 bits a channel, and Figma's values (0.91, 0.278, …) are not.
 */
function DrexPanel() {
  const v = useDialKit('COVER · DREX', COVERS.drex.dials as KitConfig, { id: persistedPanelId('cover-drex'), persist: true });
  useEffect(() => setCoverValues('drex', v as unknown as DialValues), [v]);
  return null;
}

/**
 * A Rive cover's panel: its dials, and a STATUS readout under them — what the
 * cover is actually doing, the first thing to read when it does not react
 * (docs/covers.md, "When card 04 does not react"): the file's load state (and
 * its error), its one instance (artboard, state machine, view model, which
 * instance, whether it is advancing), its focus and what the file is doing
 * with it (the face's state, the characters out or parked), what shows it
 * (the grid's tiles, the morph card, the side or centre card, the paper's
 * plane — live, or the still — and whether new frames are uploaded to it),
 * the last pointer event from a tile and from the centre card (in artboard
 * space), and the reduced-motion media query. Text fields, checked four
 * times a second and set only when their text changes, in rows of a fixed
 * height (statusReadout.css); the console carries the same as it changes
 * (`[covers] nosey: …`).
 */
const STATUS = {
  file: { type: 'text', default: '' },
  showing: { type: 'text', default: '' },
  instance: { type: 'text', default: '' },
  focus: { type: 'text', default: '' },
  plane: { type: 'text', default: '' },
  tilePointer: { type: 'text', default: '' },
  centrePointer: { type: 'text', default: '' },
  reducedMotion: { type: 'text', default: '' },
} as const;

/**
 * The readout's lines are STATES, not counters: lines that ticked (a frame
 * count, an age, a pointer's coordinates while it moves) would change on every
 * check. A change re-renders this panel's controls; it used to re-render the
 * whole dock — ~300 ms in a dev build with every panel open, and four 50 ms
 * commits a time while the rows resized to their text — which is why the rows
 * are a fixed height now and the other panels are folded (dockPanels.ts). The
 * live numbers are in the console and `__covers.rive.status(id)`. The face's
 * state is one: it changes every few seconds, not every frame.
 */
function instanceLine(p: RiveInstanceStatus | null, advancing: boolean | null): string {
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
    const last = { frames: -1, uploads: -1 };
    // "advancing" and "uploading" stay judged over a SECOND (every fourth
    // check), as they were: a quarter-second window would flip them on a
    // single slow frame.
    const judged = { advancing: null as boolean | null, uploading: false };
    let n = 0;
    const tick = () => {
      const st = riveStatus(id);
      const at = Object.entries(st.at)
        .map(([k, ms]) => `${k} +${ms}`)
        .join(', ');
      const now = performance.now();
      const plane = st.plane && now - st.plane.t < 500 ? st.plane : null;
      if (n++ % 4 === 0) {
        const f = st.instance?.frames ?? -1;
        judged.advancing = st.instance ? last.frames >= 0 && f > last.frames : null;
        last.frames = f;
        judged.uploading = plane ? plane.uploads > last.uploads && last.uploads >= 0 : false;
        if (plane) last.uploads = plane.uploads;
      }
      const vm = peekRiveInstance(id)?.viewModel();
      const face = vm ? String(vm['noseyAgent/agentStatus'] ?? '–') : '–';
      const out = vm && typeof vm.burst === 'number' ? (vm.burst >= 1 ? 'the characters out' : 'the characters parked') : '';
      const swap = st.swaps.at(-1);
      const next = {
        file: `${st.file}${st.error ? `: ${st.error}` : ''} (${at} ms)`,
        showing: `${st.showing || 'nothing'}${swap ? ` (was: ${swap.from || 'nothing'})` : ''}`,
        instance: instanceLine(st.instance, judged.advancing),
        focus: st.instance ? `${st.instance.focused ? 'focused (the centre card)' : 'unfocused'} · the face: ${face}${out ? ` · ${out}` : ''}` : '–',
        plane: plane
          ? plane.shows === 'live'
            ? `${plane.slot}, live · ${judged.uploading ? 'new frames uploading' : 'no new frame uploaded in the last second'}`
            : `${plane.slot}, ${plane.shows} — the instance is not on the plane`
          : 'not drawing (paper off, or not a live card)',
        tilePointer: pointerLine(st.pointers.tile, now),
        centrePointer: pointerLine(st.pointers.centre, now),
        reducedMotion: st.reducedMotion ? 'reduce (the still, nothing live)' : 'no-preference',
      };
      const json = JSON.stringify(next);
      if (json === shown) return;
      shown = json;
      setValues({ status: next } as never);
    };
    tick();
    // Four times a second at most: a change re-renders the panel's own rows,
    // which hold their height (statusReadout.css), so it moves nothing else.
    const t = window.setInterval(tick, 250);
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
 *  is registered here too, and shows in whichever dock is up. Memoised (no
 *  props): it re-rendered with every App render — every hover — and
 *  re-serialised four panels' configs each time. */
function CoverDials() {
  return (
    <>
      <DialsPanel />
      <RiveSitePanel />
      <LavaPanel />
      <DrexPanel />
      <NoseyPanel />
    </>
  );
}

export default memo(CoverDials);
