/**
 * WHICH SITE A DEVICE GETS — by what it can do, never by its user agent
 * (docs/mobile.md).
 *
 *   phone    a pointer that is coarse and cannot hover, on a screen whose
 *            SHORT side is under 600 CSS px: it gets the door (phone.html), not
 *            the desktop experience. Or anything with `?phone` in the query or
 *            the hash's query, to look at the door on a desktop.
 *   touch    a coarse pointer, whatever the screen (tablets): the full site,
 *            with touch standing in for hover where a hover did something.
 *
 * `index.html` runs the phone test inline before the app's module loads (it
 * has to: the desktop bundle must not even start on a phone), so the two must
 * agree: `PHONE_SHORT_SIDE` and the queries are written there too.
 */
export const PHONE_SHORT_SIDE = 600;

const mq = (q: string): boolean => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches;

/** `?phone` in the query or in the hash's query (`#read-01/3?phone`). */
export function phoneForced(): boolean {
  if (typeof location === 'undefined') return false;
  const has = (q: string) => /(^|[?&])phone(=|&|$)/.test(q);
  return has(location.search.slice(1)) || has(location.hash.split('?')[1] ?? '');
}

/** A phone, by capability (see above). */
export function isPhone(): boolean {
  if (phoneForced()) return true;
  if (!mq('(pointer: coarse)') || !mq('(hover: none)')) return false;
  return Math.min(screen.width, screen.height) < PHONE_SHORT_SIDE;
}
