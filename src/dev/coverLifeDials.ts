import { useEffect } from 'react';
import { useDialKit } from 'dialkit';
import { COVER_LIFE_DEFAULTS, setCoverLife } from '../reader/coverLife';
import { persistedPanelId } from './dialState';

const D = COVER_LIFE_DEFAULTS;

/**
 * The COVER LIFE panel — page hover and the boil (src/reader/coverLife.ts).
 *
 * Registered in the doorway's dock at `#item-NN?intro`, the READER NAV dock at
 * `#read-NN?intro`, and the app's own dev dock at plain `#item-NN` (where the
 * detail hero is uncovered and its paper boils). Same panel id, persisted, so a
 * value set in one dock is the value the others open with.
 *
 * Dev-only: every dock that calls it is behind an `import.meta.env.DEV` import.
 */
export function useCoverLifeDials(): void {
  const v = useDialKit(
    'COVER LIFE',
    {
      allOnHover: D.allOnHover,
      boilFps: [D.boilFps, 1, 24, 1],
      boilPx: [D.boilPx, 0, 6, 0.1],
      boilDeg: [D.boilDeg, 0, 3, 0.05],
      boilInMs: [D.boilInMs, 0, 1500, 10],
      boilOutMs: [D.boilOutMs, 0, 2000, 10],
      stagger: [D.stagger, 0, 400, 5],
    },
    { id: persistedPanelId('cover-life'), persist: true },
  );

  useEffect(() => {
    setCoverLife({
      allOnHover: v.allOnHover,
      boilFps: v.boilFps,
      boilPx: v.boilPx,
      boilDeg: v.boilDeg,
      boilInMs: v.boilInMs,
      boilOutMs: v.boilOutMs,
      stagger: v.stagger,
    });
  }, [v]);
}
