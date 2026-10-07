import { useCallback, useEffect } from 'react';
import { useDialKit } from 'dialkit';
import { SIZE_DEFAULTS, setSize, sizeSnippet } from '../layout/sizeDials';
import { persistedPanelId } from './dialState';

const D = SIZE_DEFAULTS;

/**
 * READER SIZE, DETAIL SIZE and READER CHROME SCALE — how big the open book and
 * the detail card get on a screen smaller than the Studio Display
 * (src/layout/sizeDials.ts, src/layout/hero.ts). The Studio Display's gaps and
 * faces are the maximums; these are the floors the gaps and the chrome's faces
 * shrink to, the height the chrome starts shrinking at, and the share of what
 * is left that each view takes. Nothing here moves the layout at 2560×1440.
 *
 * The detail card and the reader's closed cover are one rect (the doorway opens
 * the one into the other), so the smaller of the two fills wins wherever both
 * are held by the same edge (the height, on a landscape screen). The floors
 * are the chrome's, the same in both views: the gaps' in READER SIZE, the
 * faces' in READER CHROME SCALE.
 *
 * Registered in the READER NAV dock at `#read-NN?intro`, the doorway's dock at
 * `#item-NN?intro`, and the app's own dock at `/?intro#item-NN`: one panel id
 * each, persisted, so a value set in one is the value the others open with.
 * **Copy** writes a paste-ready `SIZE_DEFAULTS` to the clipboard (and the
 * console).
 *
 * Dev-only: every dock that calls it is behind an `import.meta.env.DEV` import.
 */
export function useSizeDials(): void {
  const onAction = useCallback((action: string) => {
    if (action !== 'copy') return;
    const snippet = sizeSnippet();
    navigator.clipboard?.writeText(snippet).catch(() => {});
    console.log(snippet);
  }, []);

  const reader = useDialKit(
    'READER SIZE',
    {
      readerFill: [D.readerFill, 0.5, 1, 0.01],
      marginMin: [D.marginMin, 0, 40, 1],
      gapMin: [D.gapMin, 0, 60, 1],
      sideMin: [D.sideMin, 0, 80, 1],
      copy: { type: 'action', label: 'Copy' },
    },
    { id: persistedPanelId('reader-size'), persist: true, onAction },
  );
  const detail = useDialKit(
    'DETAIL SIZE',
    {
      detailFill: [D.detailFill, 0.5, 1, 0.01],
      copy: { type: 'action', label: 'Copy' },
    },
    { id: persistedPanelId('detail-size'), persist: true, onAction },
  );
  const chrome = useDialKit(
    'READER CHROME SCALE',
    {
      faceMinFine: [D.faceMinFine, 24, 58, 1],
      faceMinTouch: [D.faceMinTouch, 32, 58, 1],
      heightRef: [D.heightRef, 900, 1600, 10],
      copy: { type: 'action', label: 'Copy' },
    },
    { id: persistedPanelId('reader-chrome-scale'), persist: true, onAction },
  );

  useEffect(() => {
    setSize({
      readerFill: reader.readerFill,
      marginMin: reader.marginMin,
      gapMin: reader.gapMin,
      sideMin: reader.sideMin,
      detailFill: detail.detailFill,
      faceMinFine: chrome.faceMinFine,
      faceMinTouch: chrome.faceMinTouch,
      heightRef: chrome.heightRef,
    });
  }, [reader.readerFill, reader.marginMin, reader.gapMin, reader.sideMin, detail.detailFill, chrome.faceMinFine, chrome.faceMinTouch, chrome.heightRef]);
}
