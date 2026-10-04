import { useEffect } from 'react';
import { useDialKit } from 'dialkit';
import { setSinglePage } from '../reader/singlePage';

/**
 * READER PAGE, in the READER NAV dock at `#read-NN?intro`: `singlePage` reads
 * one page at a time on a portrait screen (src/reader/singlePage.ts). Off by
 * default, and off again when the dock goes. Dev-only: the dock that calls it
 * is behind an `import.meta.env.DEV` import.
 */
export function useReaderPageDials(): void {
  const v = useDialKit('READER PAGE', { singlePage: false }, { id: 'reader-page-1' });
  useEffect(() => setSinglePage(v.singlePage), [v.singlePage]);
  useEffect(() => () => setSinglePage(false), []);
}
