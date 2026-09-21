import { useEffect } from 'react';
import { DialRoot, useDialKit } from 'dialkit';
import { JUMP } from './jump';
import type { JumpMode, RiffleCurve } from './jump';

/** The shipped values, so leaving the dock puts them back. */
const SHIPPED = { ...JUMP };

/**
 * The dev-only READER NAV dock, at `#read-NN?intro`: the jump dials, written
 * live into `JUMP` (which the engine reads at the start of every jump). `jump.ts`
 * is the source of truth — tuned values are pasted back there. Tree-shaken from
 * the build with the rest of DialKit.
 */
export default function ReaderNavDialKit() {
  const nav = useDialKit(
    'READER NAV',
    {
      riffleMsPer20: [SHIPPED.riffleMsPer20, 400, 4000, 10],
      riffleMinMs: [SHIPPED.riffleMinMs, 200, 2000, 10],
      riffleOverlap: [SHIPPED.riffleOverlap, 0.05, 0.95, 0.01],
      riffleMaxInAir: [SHIPPED.riffleMaxInAir, 1, 6, 1],
      riffleCurve: {
        type: 'select',
        options: ['easeInOutCubic', 'easeInOutSine', 'easeInOutQuint', 'linear'],
        default: SHIPPED.riffleCurve,
      },
      jumpMode: { type: 'select', options: ['riffle', 'cut'], default: SHIPPED.mode },
    },
    { id: 'reader-nav-2' },
  );

  useEffect(() => {
    JUMP.riffleMsPer20 = nav.riffleMsPer20;
    JUMP.riffleMinMs = nav.riffleMinMs;
    JUMP.riffleOverlap = nav.riffleOverlap;
    JUMP.riffleMaxInAir = nav.riffleMaxInAir;
    JUMP.riffleCurve = nav.riffleCurve as RiffleCurve;
    JUMP.mode = nav.jumpMode as JumpMode;
  }, [nav.riffleMsPer20, nav.riffleMinMs, nav.riffleOverlap, nav.riffleMaxInAir, nav.riffleCurve, nav.jumpMode]);

  useEffect(
    () => () => {
      Object.assign(JUMP, SHIPPED);
    },
    [],
  );

  return <DialRoot position="top-right" />;
}
