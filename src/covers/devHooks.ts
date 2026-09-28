import { pinCoverTime, coverTime } from './coverClock';
import { coverStageProbe } from './coverStage';
import { coverCropOf } from './coverRenderer';
import { benchCoverDraw, benchPresent } from './bench';
import { COVERS, shaderCover } from './covers';
import { riveProbe } from './rive/riveCover';
import { coverValues, setCoverValues, setSiteCoverDials, siteCoverDials } from './coverDials';
import { dialDefaults } from './dialValues';
import type { DialValues } from './dialValues';
import type { Crop } from './types';

function merge(base: DialValues, patch: DialValues): DialValues {
  const out: DialValues = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    const b = base[k];
    out[k] =
      v && typeof v === 'object' && !Array.isArray(v) && b && typeof b === 'object'
        ? merge(b as DialValues, v as DialValues)
        : v;
  }
  return out;
}

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
    /** A cover's live dial values, and a patch over them (folders merge), or
     *  null to go back to its JSON's. */
    dials: (id: string) => coverValues(id),
    patchDials: (id: string, patch: DialValues | null) =>
      setCoverValues(id, patch ? merge(coverValues(id), patch) : dialDefaults(COVERS[id].dials)),
    /** GPU ms for one stage draw of `id` at pxW × pxH (the shared tile draw). */
    benchStage: (id: string, pxW: number, pxH: number) => {
      const gl = probe.renderer;
      const cover = probe.cover(id);
      if (!gl || !cover || !cover.ready()) return null;
      const def = shaderCover(id);
      if (!def) return null;
      probe.draw(id, pxW, pxH, 1); // sizes the stage canvas
      const crop: Crop = coverCropOf(def.frame.w, def.frame.h, pxW, pxH, { x0: 0, y0: 0, w: 1, h: 1 });
      return benchCoverDraw(gl, cover, null, { t: 1, crop, pxW, pxH, dome: { x: 450, y: 600, amp: 0 }, backdrop: null });
    },
    /** ms for one instance's copy (drawImage of a pxW × pxH draw). */
    benchPresent: (pxW: number, pxH: number) => {
      const gl = probe.renderer;
      return gl ? benchPresent(gl.domElement, pxW, pxH) : null;
    },
    /** Rive covers (card 04): `ready(id)`, `players()`, `player(id, role)`,
     *  `viewModel(id, role)`, `reset(id)`, and `costs()` — the main-thread ms
     *  of every recent frame's Rive work (draws, copies, the paper's upload). */
    rive: riveProbe(),
  };
}
