import { useCallback, useEffect } from 'react';
import { useDialKit } from 'dialkit';
import { CHROME_DEFAULTS, chromeSnippet, setChrome } from '../chrome/chromeDials';
import { persistedPanelId } from './dialState';

const D = CHROME_DEFAULTS;

/**
 * The CHROME panel — the paper buttons and their colour from the sky
 * (src/chrome/chromeDials.ts; docs/reader.md and docs/detail-paper.md,
 * "Chrome").
 *
 * Registered in the READER NAV dock at `#read-NN?intro`, the doorway's dock at
 * `#item-NN?intro`, and the app's own dev dock at `/?intro#item-NN` (where the
 * detail view's chrome is on screen): one panel id, persisted, so a value set
 * in one is the value the others open with. **Copy** writes a paste-ready
 * `CHROME_DEFAULTS` to the clipboard (and the console).
 *
 * `chromeFillLightness` runs the whole way from ink-dark to paper-white; the
 * ink follows it (white on dark, ink-black on light), and wherever a glyph
 * would fall under 4.5:1 the paper is clamped away from it — the probe
 * (`__chromeProbe()`) says where.
 *
 * Dev-only: every dock that calls it is behind an `import.meta.env.DEV` import.
 */
export function useChromeDials(): void {
  const onAction = useCallback((action: string) => {
    if (action !== 'copy') return;
    const snippet = chromeSnippet();
    navigator.clipboard?.writeText(snippet).catch(() => {});
    console.log(snippet);
  }, []);

  const v = useDialKit(
    'CHROME',
    {
      chromeFillLightness: [D.chromeFillLightness, 0.02, 0.98, 0.01],
      chromeFillSaturation: [D.chromeFillSaturation, 0, 1.5, 0.01],
      chromeInkMix: [D.chromeInkMix, 0, 0.6, 0.01],
      chromeSkyStep: [D.chromeSkyStep, 0, 0.3, 0.005],
      chromeColorEase: [D.chromeColorEase, 0, 3000, 10],
      chromeSampleMs: [D.chromeSampleMs, 100, 3000, 50],
      chromeHoverLift: [D.chromeHoverLift, 1, 1.2, 0.005],
      chromeHoverTilt: [D.chromeHoverTilt, 0, 10, 0.25],
      chromeHoverMs: [D.chromeHoverMs, 0, 600, 10],
      chromePressNudge: [D.chromePressNudge, 0, 0.2, 0.005],
      chromeScale: [D.chromeScale, 0.6, 1.6, 0.01],
      chromeMargin: [D.chromeMargin, 8, 80, 1],
      chromeGap: [D.chromeGap, 0, 60, 1],
      copy: { type: 'action', label: 'Copy' },
    },
    { id: persistedPanelId('chrome'), persist: true, onAction },
  );

  useEffect(() => {
    setChrome({
      chromeFillLightness: v.chromeFillLightness,
      chromeFillSaturation: v.chromeFillSaturation,
      chromeInkMix: v.chromeInkMix,
      chromeSkyStep: v.chromeSkyStep,
      chromeColorEase: v.chromeColorEase,
      chromeSampleMs: v.chromeSampleMs,
      chromeHoverLift: v.chromeHoverLift,
      chromeHoverTilt: v.chromeHoverTilt,
      chromeHoverMs: v.chromeHoverMs,
      chromePressNudge: v.chromePressNudge,
      chromeScale: v.chromeScale,
      chromeMargin: v.chromeMargin,
      chromeGap: v.chromeGap,
    });
  }, [v]);
}
