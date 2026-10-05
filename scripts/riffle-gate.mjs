/**
 * THE RIFFLE'S FRAME BUDGET, gated on its control (verify:reader `frames`,
 * docs/reader.md "Running the checks").
 *
 * A riffle lifts the same full-size leaves an ordinary Next does, several at
 * once, for ~4 s; it drops a frame now and then, and so does an ordinary Next
 * on the same machine in the same minute. What the check asks is whether the
 * riffle drops frames MEANINGFULLY MORE OFTEN than that control:
 *
 *   rate     dropped vsyncs per frame (a frame over 20 ms; a 50 ms frame is
 *            two), riffles and control each pooled over the run;
 *   margin   RATE_MARGIN: the riffle may drop up to twice as often as the
 *            control before it counts as worse;
 *   evidence it fails only when that is shown at ALPHA — a one-sided exact
 *            test: given all the drops seen, how likely is it that at least
 *            this many fell in the riffles, if the riffle's rate were exactly
 *            RATE_MARGIN × the control's (each drop lands in the riffles with
 *            probability q = M·nR / (M·nR + nC))? Below ALPHA, it fails.
 *
 * So a control that happened to drop nothing cannot fail a riffle on its own
 * (the test asks for evidence, not a zero), and a riffle that drops several
 * times as often as an ordinary Next, over enough frames, does.
 */
export const RATE_MARGIN = 2;
export const ALPHA = 0.05;

const lnFact = (() => {
  const t = [0];
  return (n) => {
    for (let i = t.length; i <= n; i++) t[i] = t[i - 1] + Math.log(i);
    return t[n];
  };
})();

/** P(X ≥ k) for X ~ Binomial(n, q). */
export function binomTail(k, n, q) {
  if (k <= 0) return 1;
  if (k > n) return 0;
  if (q <= 0) return 0;
  if (q >= 1) return 1;
  let p = 0;
  for (let i = k; i <= n; i++) p += Math.exp(lnFact(n) - lnFact(i) - lnFact(n - i) + i * Math.log(q) + (n - i) * Math.log(1 - q));
  return Math.min(1, p);
}

/** Dropped vsyncs in a list of rAF intervals (ms): 33 ms is one, 50 ms two. */
export const droppedVsyncs = (dts) => dts.reduce((a, d) => a + (d > 20 ? Math.max(1, Math.round(d / (1000 / 60)) - 1) : 0), 0);

/**
 * `riffle` and `control`: { frames, drops } pooled over a run. Returns pass,
 * the p-value, both rates (drops per 1000 frames) and q.
 */
export function riffleGate(riffle, control, margin = RATE_MARGIN, alpha = ALPHA) {
  const rateR = (1000 * riffle.drops) / Math.max(1, riffle.frames);
  const rateC = (1000 * control.drops) / Math.max(1, control.frames);
  const q = (margin * riffle.frames) / (margin * riffle.frames + control.frames);
  const p = binomTail(riffle.drops, riffle.drops + control.drops, q);
  return { pass: p >= alpha, p, rateR, rateC, q };
}
