import { useEffect } from 'react';
import { useDialKit } from 'dialkit';
import type { DialConfig as KitConfig } from 'dialkit';
import { COVERS } from '../covers/covers';
import { SITE_COVER_DEFAULTS, setCoverValues, setSiteCoverDials } from '../covers/coverDials';
import type { DialValues } from '../covers/dialValues';

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

function useRiveCoverPanel(id: string) {
  const v = useDialKit(`COVER · ${id}`, COVERS[id].dials as KitConfig, { id: `cover-${id}-v1`, persist: true });
  useEffect(() => setCoverValues(id, v as unknown as DialValues), [id, v]);
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
