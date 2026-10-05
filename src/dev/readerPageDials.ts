import { useEffect } from 'react';
import { useDialKit } from 'dialkit';
import { setSinglePage, singlePageDefault } from '../reader/singlePage';

/**
 * READER PAGE, in the READER NAV dock at `#read-NN?intro`: `singlePage` reads
 * one page at a time on a portrait screen (src/reader/singlePage.ts). On by
 * default on a touch screen, off anywhere else, and back to that default when
 * the dock goes. Dev-only: the dock that calls it is behind an
 * `import.meta.env.DEV` import.
 */
export function useReaderPageDials(): void {
  const v = useDialKit('READER PAGE', { singlePage: singlePageDefault() }, { id: 'reader-page-2' });
  useEffect(() => setSinglePage(v.singlePage), [v.singlePage]);
  useEffect(() => () => setSinglePage(singlePageDefault()), []);
}
