import { pinCoverTime, coverTime } from './coverClock';
import { coverStageProbe } from './coverStage';
import { coverCropOf } from './coverRenderer';
import { CachedCoverRenderer } from './cachedCoverRenderer';
import { benchCoverDraw, benchDome, benchPresent } from './bench';
import { heroDome } from './dome';
import { LavaInstance, MAX_BLOBS } from './covers/lava';
import { lavaModel } from './covers/rive-site';
import { COVERS, shaderCover } from './covers';
import { riveProbe } from './rive/riveCover';
import { coverBackdrop, coverValues, setCoverValues, setSiteCoverDials, siteCoverDials } from './coverDials';
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
  const lavaExt = (which: 'rest' | 'hero' | number): LavaInstance | null => {
    const d = which === 'rest' ? null : which === 'hero' ? heroDome.state : probe.domeOf(which);
    return d?.ext instanceof LavaInstance ? d.ext : null;
  };
  (window as unknown as { __covers: unknown }).__covers = {
    pin: (s: number | null) => pinCoverTime(s),
    stage: probe,
    cropOf: coverCropOf,
    time: () => coverTime(),
    presenters: probe.presenters,
    frames: probe.frames,
    lastMs: probe.lastMs,
    ownDraws: probe.ownDraws,
    site: siteCoverDials,
    /** A cover's own backdrop, 'sky' or 'solid': the sky checks skip 'solid'. */
    backdrop: (id: string) => coverBackdrop(id),
    setSite: setSiteCoverDials,
    /** A cover's live dial values, and a patch over them (folders merge), or
     *  null to go back to its JSON's. */
    dials: (id: string) => coverValues(id),
    patchDials: (id: string, patch: DialValues | null) =>
      setCoverValues(id, patch ? merge(coverValues(id), patch) : dialDefaults(COVERS[id].dials)),
    /** GPU ms for one stage draw of `id` at pxW × pxH (the shared tile draw;
     *  `warm`: the hovered tile's own, under the pointer). */
    benchStage: (id: string, pxW: number, pxH: number, warm = false) => {
      const gl = probe.renderer;
      const cover = probe.cover(id);
      if (!gl || !cover || !cover.ready()) return null;
      const def = shaderCover(id);
      if (!def) return null;
      probe.draw(id, pxW, pxH, 1); // sizes the stage canvas
      const crop: Crop = coverCropOf(def.frame.w, def.frame.h, pxW, pxH, { x0: 0, y0: 0, w: 1, h: 1 });
      return benchCoverDraw(gl, cover, null, { t: 1, crop, pxW, pxH, dome: benchDome(def, warm), backdrop: null });
    },
    /**
     * One draw of shader cover `id` at w × h by the stage's renderer, at `t`,
     * under `dome` (frame units; at rest when omitted), read back: straight
     * RGBA, top row first, base64, and the smallest alpha in it.
     */
    renderFrame: (id: string, w: number, h: number, t: number, dome?: { x: number; y: number; amp: number }) => {
      const gl = probe.renderer;
      if (!gl || !probe.cover(id)?.ready() || !probe.draw(id, w, h, t, dome)) return null;
      const ctx = gl.getContext();
      const px = new Uint8Array(w * h * 4);
      ctx.readPixels(0, 0, w, h, ctx.RGBA, ctx.UNSIGNED_BYTE, px); // the draw is the canvas's bottom-left
      const out = new Uint8Array(w * h * 4);
      let minA = 255;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = ((h - 1 - y) * w + x) * 4;
          const j = (y * w + x) * 4;
          const a = px[i + 3];
          if (a < minA) minA = a;
          for (let k = 0; k < 3; k++) out[j + k] = a ? Math.min(255, Math.round((px[i + k] * 255) / a)) : 0;
          out[j + 3] = a;
        }
      }
      let bin = '';
      for (let i = 0; i < out.length; i += 0x8000) bin += String.fromCharCode(...out.subarray(i, i + 0x8000));
      return { w, h, minA, b64: btoa(bin) };
    },
    /** A cached-pass cover in the stage (card 03): its prints (pass A's renders
     *  so far, the last one's ms, the sizes kept), its programs and GL errors,
     *  and pass A's GPU ms at the crop a w × h box shows. */
    prints: (id: string) => {
      const c = probe.cover(id);
      return c instanceof CachedCoverRenderer ? c.printStats() : null;
    },
    diagnose: (id: string) => {
      const c = probe.cover(id);
      return c instanceof CachedCoverRenderer ? c.diagnose() : null;
    },
    benchPrint: (id: string, w: number, h: number) => {
      const c = probe.cover(id);
      if (!(c instanceof CachedCoverRenderer)) return null;
      return c.benchPrint(coverCropOf(c.def.frame.w, c.def.frame.h, w, h, { x0: 0, y0: 0, w: 1, h: 1 }), w, h);
    },
    /** ms for one instance's copy (drawImage of a pxW × pxH draw). */
    benchPresent: (pxW: number, pxH: number) => {
      const gl = probe.renderer;
      return gl ? benchPresent(gl.domElement, pxW, pxH) : null;
    },
    /**
     * Card 02's lava (src/covers/covers/lava.ts), for `lmove` / `lpointer`:
     * `blobs(which, t)` — every blob's centre (frame units) at `t` (the
     * clock's when omitted) for an instance: 'rest' (the shared draw), 'hero'
     * (the hero's dome), or the n-th presenter — with `drift` false, its own
     * extra phase but no pull, so the pull alone is the difference; `warmth(which)` — that
     * instance's warmth, the pointer it is eased to, its largest extra phase
     * (radians off the shared timeline) and whether it is settled.
     */
    lava: {
      blobs: (which: 'rest' | 'hero' | number, t = coverTime(), drift = true) => {
        const m = lavaModel(coverValues('rive-site'));
        let ext = lavaExt(which);
        if (ext && !drift) {
          const still = new LavaInstance(() => m);
          still.copyFrom(ext);
          still.heat = 0;
          ext = still;
        }
        const A = new Float32Array(MAX_BLOBS * 4);
        m.fill(t, ext, A, new Float32Array(MAX_BLOBS * 4), new Float32Array(MAX_BLOBS * 2));
        const out: [number, number][] = [];
        for (let i = 0; i < m.count(); i++) out.push([A[i * 4], A[i * 4 + 1]]);
        return out;
      },
      warmth: (which: 'rest' | 'hero' | number) => {
        const ext = lavaExt(which);
        if (!ext) return null;
        let extra = 0;
        for (const e of ext.extra) extra = Math.max(extra, Math.abs(e - 2 * Math.PI * Math.round(e / (2 * Math.PI))));
        return { heat: ext.heat, px: ext.px, py: ext.py, extra, settled: ext.settled() };
      },
    },
    /** Rive covers (card 04): `ready(id)`, `players()`, `player(id, role)`,
     *  `viewModel(id, role)`, `reset(id)`, and `costs()` — the main-thread ms
     *  of every recent frame's Rive work (draws, copies, the paper's upload). */
    rive: riveProbe(),
  };
}
