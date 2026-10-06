/**
 * WEBKIT — Safari, and every browser on iOS and iPadOS. Not a capability test,
 * and the one place the site asks: what differs is a COST, measured, that no
 * feature test can see. WebKit uploads a 2D canvas into a WebGL texture at
 * ~8 ms a frame for card 04's 1351×1756 face, where Chrome takes 0.06 ms
 * (docs/perf/thirty-fps.md, "Card 04 into the paper"). Where that cost is,
 * the paper uploads less (src/covers/rive/drawPrint.ts, quality.ts
 * `sideFrame`); Chrome and Firefox are left as they were.
 *
 * DEV: `?webkit` (in the query or the hash's query) takes the WebKit paths in
 * any browser, so the suites can check them in Chrome.
 */
let cached: boolean | null = null;

export function webkitEngine(): boolean {
  if (cached !== null) return cached;
  if (typeof navigator === 'undefined') return (cached = false);
  if (import.meta.env.DEV && typeof location !== 'undefined') {
    const has = (q: string) => /(^|[?&])webkit(=|&|$)/.test(q);
    if (has(location.search.slice(1)) || has(location.hash.split('?')[1] ?? '')) return (cached = true);
  }
  // Every WebKit browser reports Apple's vendor string (Chrome on iOS too:
  // it is WebKit there); Chrome elsewhere says Google, Firefox nothing.
  return (cached = navigator.vendor === 'Apple Computer, Inc.');
}
