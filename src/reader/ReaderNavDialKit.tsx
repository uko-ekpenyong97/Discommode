import { useEffect } from 'react';
import { DialRoot, useDialKit } from 'dialkit';
import { JUMP } from './jump';
import type { JumpMode } from './jump';

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
      riffleTotalMs: [SHIPPED.riffleTotalMs, 200, 2000, 10],
      riffleMinLeafMs: [SHIPPED.riffleMinLeafMs, 16, 300, 1],
      jumpMode: { type: 'select', options: ['riffle', 'cut'], default: SHIPPED.mode },
    },
    { id: 'reader-nav' },
  );

  useEffect(() => {
    JUMP.riffleTotalMs = nav.riffleTotalMs;
    JUMP.riffleMinLeafMs = nav.riffleMinLeafMs;
    JUMP.mode = nav.jumpMode as JumpMode;
  }, [nav.riffleTotalMs, nav.riffleMinLeafMs, nav.jumpMode]);

  useEffect(
    () => () => {
      Object.assign(JUMP, SHIPPED);
    },
    [],
  );

  return <DialRoot position="top-right" />;
}
