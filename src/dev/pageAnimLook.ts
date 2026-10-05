import { useEffect } from 'react';
import { useDialKit } from 'dialkit';
import { PAGE_ANIM_LOOK, setPageAnimLook } from '../reader/pageAnimPlayer';

/** What ships: the sprites over the paper. */
const SHIPPED = { ...PAGE_ANIM_LOOK };

/**
 * The PAGE ANIM panel, in the READER NAV dock at `#read-NN?intro`: how the
 * inside pages' sprites sit on their pages (pageAnimPlayer.ts,
 * `PAGE_ANIM_LOOK`). "in paper" multiplies them into the plate and gives the
 * ink the paper's tooth; `tooth` is its strength. Off by default, and back to
 * off when the dock goes. Dev-only: the dock that calls it is behind an
 * `import.meta.env.DEV` import.
 */
export function usePageAnimLook(): void {
  const v = useDialKit(
    'PAGE ANIM',
    {
      inPaper: { type: 'select', options: ['off', 'in paper'], default: SHIPPED.inPaper ? 'in paper' : 'off' },
      tooth: [SHIPPED.tooth, 0, 1, 0.01],
    },
    { id: 'page-anim-look-1' },
  );
  useEffect(() => {
    setPageAnimLook({ inPaper: v.inPaper === 'in paper', tooth: v.tooth });
  }, [v.inPaper, v.tooth]);
  useEffect(() => () => setPageAnimLook(SHIPPED), []);
}
