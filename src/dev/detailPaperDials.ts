import { useEffect } from 'react';
import { useDialKit } from 'dialkit';
import { PAPER_DEFAULTS, setPaper } from '../components/detailPaper/paperDials';
import { persistedPanelId } from './dialState';

const D = PAPER_DEFAULTS;

/**
 * The DETAIL PAPER panel — the detail cards' paper (docs/detail-paper.md).
 *
 * Registered in TWO docks, never both at once: the doorway's at `#item-NN?intro`
 * (where the spec puts it, and where the reader's cover sits over the hero, so
 * it tunes what the neighbours show), and the app's own at `/?intro#item-NN`
 * (where the hero is uncovered and can be hovered). Same panel id, persisted,
 * so a value set in one is the value the other opens with.
 *
 * Dev-only: both docks are behind `import.meta.env.DEV` imports.
 */
export function useDetailPaperDials(): void {
  const v = useDialKit(
    'DETAIL PAPER',
    {
      paper: { type: 'select', options: ['on', 'off'], default: D.paper },
      creaseBlend: [D.creaseBlend, 0, 1, 0.01],
      creaseDisplacement: [D.creaseDisplacement, 0, 0.05, 0.001],
      hoverRadius: [D.hoverRadius, 0.05, 1, 0.01],
      hoverDepth: [D.hoverDepth, 0, 0.3, 0.005],
      hoverMs: [D.hoverMs, 0, 1500, 10],
      squash: [D.squash, 0, 3, 0.05],
      squashScale: [D.squashScale, 0, 0.5, 0.005],
      ripple: [D.ripple, 0, 0.05, 0.001],
      heroRipple: [D.heroRipple, 0, 0.05, 0.001],
      foldMs: [D.foldMs, 100, 2000, 10],
      foldAmp: [D.foldAmp, 0, 2, 0.05],
      segments: [D.segments, 4, 96, 1],
    },
    { id: persistedPanelId('detail-paper'), persist: true },
  );

  useEffect(() => {
    setPaper({
      paper: v.paper === 'off' ? 'off' : 'on',
      creaseBlend: v.creaseBlend,
      creaseDisplacement: v.creaseDisplacement,
      hoverRadius: v.hoverRadius,
      hoverDepth: v.hoverDepth,
      hoverMs: v.hoverMs,
      squash: v.squash,
      squashScale: v.squashScale,
      ripple: v.ripple,
      heroRipple: v.heroRipple,
      foldMs: v.foldMs,
      foldAmp: v.foldAmp,
      segments: Math.max(1, Math.round(v.segments)),
    });
  }, [v]);
}
