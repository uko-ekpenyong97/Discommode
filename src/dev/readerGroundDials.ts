import { useEffect } from 'react';
import { useDialKit } from 'dialkit';
import { READER_GROUND_DEFAULTS, resetReaderGround, setReaderGround } from '../reader/ground';

const D = READER_GROUND_DEFAULTS;

/**
 * The READER GROUND panel — the sky under the book (src/reader/ground.ts).
 *
 * Registered in the READER NAV dock at `#read-NN?intro` and the doorway's dock
 * at `#item-NN?intro`. Not persisted, like READER NAV: leaving the dock puts the
 * shipped values back, and `ground.ts` is where tuned values are pasted.

 *
 * Dev-only: every dock that calls it is behind an `import.meta.env.DEV` import.
 */
export function useReaderGroundDials(): void {
  const v = useDialKit(
    'READER GROUND',
    {
      readerScrim: [D.readerScrim, 0, 0.95, 0.01],
      readerBookShadow: [D.readerBookShadow, 0, 0.8, 0.01],
      readerFlipSplat: [D.readerFlipSplat, 0, 3, 0.05],
    },
    { id: 'reader-ground' },
  );

  useEffect(() => {
    setReaderGround({
      readerScrim: v.readerScrim,
      readerBookShadow: v.readerBookShadow,
      readerFlipSplat: v.readerFlipSplat,
    });
  }, [v.readerScrim, v.readerBookShadow, v.readerFlipSplat]);

  useEffect(() => resetReaderGround, []);
}
