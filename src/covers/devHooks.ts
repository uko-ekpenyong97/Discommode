import { pinCoverTime, coverTime } from './coverClock';
import { coverStageProbe } from './coverStage';
import { coverCropOf } from './coverRenderer';
import { benchCoverDraw, benchPresent } from './bench';
import { COVERS } from './covers';
import { setSiteCoverDials, siteCoverDials } from './coverDials';
import type { Crop } from './types';

/**
 * DEV ONLY (imported under import.meta.env.DEV): `window.__covers`, for
 * `npm run verify:cover`. Pin the clock, read what the stage is doing, and
 * benchmark a draw and a copy.
 */
export function installCoverDevHooks() {
  const probe = coverStageProbe();
  (window as unknown as { __covers: unknown }).__covers = {
    pin: (s: number | null) => pinCoverTime(s),
    stage: probe,
    cropOf: coverCropOf,
    time: () => coverTime(),
    presenters: probe.presenters,
    frames: probe.frames,
    lastMs: probe.lastMs,
    site: siteCoverDials,
    setSite: setSiteCoverDials,
    /** GPU ms for one stage draw of `id` at pxW × pxH (the shared tile draw). */
    benchStage: (id: string, pxW: number, pxH: number) => {
      const gl = probe.renderer;
      const cover = probe.cover(id);
      if (!gl || !cover || !cover.ready()) return null;
      const def = COVERS[id];
      probe.draw(id, pxW, pxH, 1); // sizes the stage canvas
      const crop: Crop = coverCropOf(def.frame.w, def.frame.h, pxW, pxH, { x0: 0, y0: 0, w: 1, h: 1 });
      return benchCoverDraw(gl, cover, null, { t: 1, crop, pxW, pxH, dome: { x: 450, y: 600, amp: 0 }, backdrop: null });
    },
    /** ms for one instance's copy (drawImage of a pxW × pxH draw). */
    benchPresent: (pxW: number, pxH: number) => {
      const gl = probe.renderer;
      return gl ? benchPresent(gl.domElement, pxW, pxH) : null;
    },
  };
}
