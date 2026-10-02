/**
 * Is the page in the middle of something a person is watching? The detail
 * view's arrival and exit (the morph, then the paper's hand-in), a Prev/Next
 * slide, the doorway, a page turn or jump. Each owner registers a PROBE — a
 * function that reads its own live state — so nothing here has to be told when
 * a motion ends, and an owner that unmounts mid-motion cannot leave the page
 * "busy" forever.
 *
 * Read by the idle warm-up (src/warmup.ts), which must not put GPU work —
 * a context, a program's first draw, an upload — into frames that are moving.
 */

type Probe = () => boolean;

const probes = new Set<Probe>();

/** Register a probe; returns its removal. */
export function registerBusy(probe: Probe): () => void {
  probes.add(probe);
  return () => {
    probes.delete(probe);
  };
}

export function isBusy(): boolean {
  for (const p of probes) if (p()) return true;
  return false;
}

/**
 * Call `fn` once nothing is busy (now, if nothing is). Polled, ~6 times a
 * second, and only while someone is waiting. Returns a cancel.
 */
export function whenSettled(fn: () => void): () => void {
  let t = 0;
  let done = false;
  const check = () => {
    if (done) return;
    if (isBusy()) {
      t = window.setTimeout(check, 150);
      return;
    }
    done = true;
    fn();
  };
  check();
  return () => {
    done = true;
    window.clearTimeout(t);
  };
}
