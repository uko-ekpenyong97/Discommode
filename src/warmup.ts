import { isBusy, whenSettled } from './activity';
import { CONTENT, itemFace, itemHeroFace } from './content';
import { coverStillUrl } from './covers/covers';
import { paperWarmComplete, warmPaper } from './components/detailPaper/paperGL';
import type { WarmGate } from './components/detailPaper/paperGL';

/**
 * THE PAGE'S IDLE WARM-UP, after load: everything a first hover and a first
 * arrival would otherwise pay for in the frames a person is watching, done
 * while nobody is.
 *
 *   plates   card 01's hover plate (`.grid-card__overlay`), decoded on its own
 *            <img> elements. It is at opacity 0 until the first hover, so the
 *            browser never rasterised it, and the first hover's frame waited
 *            on a 65–69 ms WebP decode on a raster worker (a 50 ms frame on a
 *            production build, the commit blocked behind it).
 *   morph    the pictures the grid→detail morph shows that the grid never
 *            drew: the live tiles' own stills (`.cover-tile__still`, hidden
 *            once a cover draws — the morph's centre card shows it until the
 *            cover's first draw), every cover's full still (the neighbours'),
 *            and an issue's drawn cover at rest (its hero face; the grid shows
 *            the photograph). The morph's first frame waited on one of them, a
 *            ~28 ms decode: 33–67 ms frames in the first arrival of cards
 *            02–04 (docs/perf/flaky-checks.md).
 *   paper    the detail paper's warm-up (paperGL.ts, `warmPaper`): the
 *            context, the programs and their first draw, the crease map,
 *            every face's upload, each shader cover's renderer in the paper's
 *            context. It used to start on the first hover of a card.
 *
 * Guards: each step is its own `requestIdleCallback` (no timeout: only a real
 * idle moment), only while the tab is visible and nothing is moving — no
 * arrival or exit, slide, doorway, page turn or jump (src/activity.ts). Busy:
 * it waits for the motion to settle and goes on from the same step. A hover
 * (or a press, or a direct load) before it is done warms the paper on demand
 * exactly as before, from wherever this chain is (`warmPaper` without a gate).
 *
 * Done: `performance.mark('warmup:done')` once every step has run and every
 * face is uploaded — what `verify:jank` waits on.
 */

type Cancel = () => void;

const ric = (fn: () => void): Cancel => {
  if (window.requestIdleCallback) {
    const id = window.requestIdleCallback(fn);
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(fn, 50);
  return () => window.clearTimeout(id);
};

/** Call `go` in an idle callback that finds the tab visible and nothing
 *  moving; waits (and asks again) otherwise. */
const gate: WarmGate = (go) => {
  let cancelled = false;
  let cancelWait: Cancel = () => {};
  const attempt = () => {
    if (cancelled) return;
    cancelWait = ric(() => {
      if (cancelled) return;
      if (document.visibilityState !== 'visible') {
        const on = () => {
          if (document.visibilityState !== 'visible') return;
          document.removeEventListener('visibilitychange', on);
          attempt();
        };
        document.addEventListener('visibilitychange', on);
        cancelWait = () => document.removeEventListener('visibilitychange', on);
        return;
      }
      if (isBusy()) {
        cancelWait = whenSettled(attempt);
        return;
      }
      // One mark a step, for a trace (and verify:jank) to see when they ran.
      performance.mark('warmup:step');
      go();
    });
  };
  attempt();
  return () => {
    cancelled = true;
    cancelWait();
  };
};

const step = () => new Promise<void>((resolve) => void gate(resolve));

/** Images the page has not drawn yet, decoded where they will be drawn, one
 *  idle step per picture: card 01's hover plates, then the covers' stills.
 *  Only the ones already loaded (or loading eagerly): `decode()` on a lazy
 *  image the page has not asked for would wait for a load that never starts. */
async function decodeUndrawn(selector: string) {
  const imgs = [...document.querySelectorAll<HTMLImageElement>(selector)].filter(
    (img) => img.complete || img.loading !== 'lazy',
  );
  const bySrc = new Map<string, HTMLImageElement[]>();
  for (const img of imgs) {
    const k = img.currentSrc || img.src;
    if (!k) continue;
    bySrc.set(k, [...(bySrc.get(k) ?? []), img]);
  }
  for (const group of bySrc.values()) {
    await step();
    await Promise.all(group.map((img) => img.decode().catch(() => {})));
  }
}

/** The morph's pictures that are not in the grid's DOM, decoded through
 *  elements kept here: one an `Image` nothing held would be collected with
 *  its decode before the click. */
const morphImages: HTMLImageElement[] = [];
async function decodeMorphFaces() {
  const urls = new Set<string>();
  for (const item of CONTENT) {
    if (item.cover) urls.add(coverStillUrl(item.cover.id, 'full'));
    const hero = itemHeroFace(item);
    if (hero && hero !== itemFace(item)) urls.add(hero);
  }
  for (const url of urls) {
    await step();
    const img = new Image();
    img.src = url;
    morphImages.push(img);
    await img.decode().catch(() => {});
  }
}

let started = false;

/** Start the idle warm-up once the page has loaded (idempotent). */
export function startIdleWarmup(): void {
  if (started) return;
  started = true;
  const begin = async () => {
    await decodeUndrawn('img.grid-card__overlay');
    await decodeUndrawn('.grid-stage img.cover-tile__still');
    await decodeMorphFaces();
    await step();
    warmPaper(0, { gate });
    // Done once the paper's last step has run and its faces are in — or the
    // warm-up was taken over on demand and finished at today's pace.
    while (!paperWarmComplete()) {
      await new Promise<void>((r) => void ric(r));
      await new Promise<void>((r) => window.setTimeout(r, 100));
    }
    performance.mark('warmup:done');
  };
  if (document.readyState === 'complete') void begin();
  else window.addEventListener('load', () => void begin(), { once: true });
}
