/**
 * DEV / verify: deliberately broken paths, so each of card 04's checks can be
 * run once against the failure it exists to catch (`verify:cover --fault
 * <name>`, which sets `window.__coversFault` before the page loads). Never in
 * a build: `import.meta.env.DEV` is false there and this is always false.
 *
 *   fresh      a fresh instance whenever what shows the cover changes (what
 *              the old per-role instances did): `rjump` must fail
 *   nofocus    `riveFocus(id, true)` ignored: `rfocus` must fail
 *   nounfocus  `riveFocus(id, false)` ignored: `runfocus` must fail
 *   latefocus  a focus wanted before the instance exists is applied a second
 *              into its life, not before its first advance: `rdeep` must fail
 *   frozen     the instance never advances: `rgrid` must fail
 *   sidestill  no cover is live as a side card: `rside`, `sside` and `sjump`
 *              must fail
 *   siderest   a shader cover's side card drawn at rest, not with its detail
 *              dome (what the paper did until 2026-10-06): a card leaving the
 *              centre warm snaps to rest — `sjump` must fail
 *   sideinput  the side cards take the pointer, as the centre card does:
 *              `sside` must fail
 */
export type CoverFault = 'fresh' | 'nofocus' | 'nounfocus' | 'latefocus' | 'frozen' | 'sidestill' | 'siderest' | 'sideinput';

export function coverFault(name: CoverFault): boolean {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false;
  const f = (window as unknown as { __coversFault?: string[] }).__coversFault;
  return !!f && f.includes(name);
}
