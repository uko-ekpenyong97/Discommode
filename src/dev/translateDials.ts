import { useCallback, useEffect } from 'react';
import { useDialKit } from 'dialkit';
import type { FlipEngine } from '../reader/flipEngine';
import { EASINGS } from '../reader/quoteMorph';
import type { Easing } from '../reader/quoteMorph';
import { QUOTED_PAGES, QUOTE_DEFAULTS, quoteSettings, quoteSettingsSnippet, setQuoteSettings } from '../reader/quotes';
import { persistedPanelId } from './dialState';

const D = QUOTE_DEFAULTS;

/** The spread a printed inside page opens on (Issue 01 has a cover). */
const spreadOfPage = (page: number) => Math.floor((page + 1) / 2);

/**
 * The TRANSLATE panel — the chapter-break quotes' morph (src/reader/quotes.ts,
 * `quotes.json`'s settings; docs/reader.md, "Chapter-break quotes").
 *
 * In the READER NAV dock at `#read-NN?intro`; persisted. The ranges run past
 * the prototype's (duration to 4000ms, stagger to 1500ms, arc to 120px).
 * **Translate** toggles the quote on the open spread — turning the book to the
 * first quote page if none is open. **Copy** writes the paste-ready `settings`
 * block for `quotes.json` to the clipboard (and the console).
 *
 * Dev-only: the dock that calls it is behind an `import.meta.env.DEV` import.
 */
export function useTranslateDials(): void {
  const onAction = useCallback((action: string) => {
    if (action === 'copy') {
      const snippet = quoteSettingsSnippet();
      navigator.clipboard?.writeText(snippet).catch(() => {});
      console.log(snippet);
      return;
    }
    if (action !== 'translate') return;
    const w = window as unknown as { __quote?: { toggle: (page: number) => boolean }; __flip?: FlipEngine };
    if (QUOTED_PAGES.some((p) => w.__quote?.toggle(p))) return;
    w.__flip?.turnTo(spreadOfPage(QUOTED_PAGES[0]));
  }, []);

  const v = useDialKit(
    'TRANSLATE',
    {
      durationMs: [D.durationMs, 400, 4000, 50],
      staggerMs: [D.staggerMs, 0, 1500, 10],
      arcPx: [D.arcPx, 0, 120, 1],
      easing: { type: 'select', options: EASINGS, default: D.easing },
      reuseOutOfOrder: D.reuseOutOfOrder,
      scramble: D.scramble,
      showHint: D.showHint,
      resetWhenPageLeaves: D.resetWhenPageLeaves,
      translate: { type: 'action', label: 'Translate' },
      copy: { type: 'action', label: 'Copy' },
    },
    { id: persistedPanelId('translate'), persist: true, onAction },
  );

  useEffect(() => {
    setQuoteSettings({
      durationMs: v.durationMs,
      staggerMs: v.staggerMs,
      arcPx: v.arcPx,
      easing: v.easing as Easing,
      reuseOutOfOrder: v.reuseOutOfOrder,
      scramble: v.scramble,
      showHint: v.showHint,
      resetWhenPageLeaves: v.resetWhenPageLeaves,
    });
  }, [v]);

  // Leaving the dock puts the shipped values back.
  useEffect(
    () => () => {
      Object.assign(quoteSettings, QUOTE_DEFAULTS);
    },
    [],
  );
}
