/**
 * The dev dials' SAVED state: every persisted DialKit panel (`dialkit:<id>`)
 * and the app's own `discommode-dials` (src/dev/Dials.tsx), in this origin's
 * localStorage. Dev-only: every importer is behind an `import.meta.env.DEV`
 * import.
 *
 * localStorage is per ORIGIN, and in Conductor an origin is a PORT that every
 * workspace's dev server takes in turn. A tab on :5174 restores whatever the
 * last branch on :5174 saved, under the same keys, whatever those dials meant
 * there. On 2026-09-28 that left card 04's hero dead on :5174 (the grid live,
 * the hero on its still) until the origin's site data was cleared; a sweep of
 * saved values found `null`s (a NaN, serialised) and out-of-range numbers in
 * `discommode-dials` that did the same (docs/covers.md, "When card 04 does not
 * react").
 *
 * So the saved state is VERSIONED and VALIDATED:
 *
 *   version   bump DIAL_STATE_VERSION when a persisted dial is renamed,
 *             removed, re-ranged or changes meaning. Every saved panel from
 *             another version is deleted on load, before any panel restores.
 *   validate  DialKit's panels clamp a restored slider to its range and step,
 *             keep a select only if it is still an option, and drop keys they
 *             no longer have; `discommode-dials` keeps only keys DEFAULTS has,
 *             of the default's type (finite numbers), and each slider clamps
 *             its start into its range (Dials.tsx).
 *   reset     the dock's DIALS panel, "Reset dials": every saved dial deleted
 *             and the page reloaded on the defaults.
 */
export const DIAL_STATE_VERSION = 2;

const APP_KEY = 'discommode-dials';
const KIT_PREFIX = 'dialkit:';
const VERSION_SUFFIX = `-v${DIAL_STATE_VERSION}`;

/** A persisted DialKit panel's id at this version; DialKit saves it under
 *  `dialkit:<id>`. */
export function persistedPanelId(name: string): string {
  return `${name}${VERSION_SUFFIX}`;
}

function remove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // best effort
  }
}

function savedKeys(): string[] {
  try {
    return Object.keys(localStorage).filter((k) => k === APP_KEY || k.startsWith(KIT_PREFIX));
  } catch {
    return [];
  }
}

/** Delete every saved dial from another version. Runs once, as this module is
 *  first imported — before any panel that imports it registers and restores. */
function pruneOtherVersions() {
  for (const key of savedKeys()) {
    if (key.startsWith(KIT_PREFIX)) {
      if (!key.endsWith(VERSION_SUFFIX)) remove(key);
      continue;
    }
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? 'null') as { version?: unknown } | null;
      if (!saved || saved.version !== DIAL_STATE_VERSION) remove(key);
    } catch {
      remove(key);
    }
  }
}
pruneOtherVersions();

/**
 * The app's saved dials, validated against `defaults`: a key DEFAULTS does not
 * have is dropped, and so is a value not of its default's type (a number must
 * be finite — `null` is what a NaN saves as). Ranges are clamped where each
 * dial is declared (Dials.tsx), which is where they are known.
 */
export function loadAppDials<T extends object>(defaults: T): Partial<T> {
  const out: Partial<T> = {};
  try {
    const saved = JSON.parse(localStorage.getItem(APP_KEY) ?? 'null') as { version?: unknown; values?: unknown } | null;
    if (!saved || saved.version !== DIAL_STATE_VERSION || !saved.values || typeof saved.values !== 'object') return out;
    const values = saved.values as Record<string, unknown>;
    for (const [key, def] of Object.entries(defaults)) {
      const v = values[key];
      if (typeof v !== typeof def) continue;
      if (typeof v === 'number' && !Number.isFinite(v)) continue;
      (out as Record<string, unknown>)[key] = v;
    }
  } catch {
    remove(APP_KEY);
  }
  return out;
}

export function saveAppDials(values: object) {
  try {
    localStorage.setItem(APP_KEY, JSON.stringify({ version: DIAL_STATE_VERSION, values }));
  } catch {
    // best effort
  }
}

/** Every saved dial deleted, of any version, and the page reloaded on the
 *  defaults. */
export function resetDials() {
  const clear = () => {
    for (const key of savedKeys()) remove(key);
  };
  clear();
  // A panel can save again before the page goes (the COVER readout writes once
  // a second): clear once more on the way out.
  addEventListener('pagehide', clear);
  location.reload();
}

/** A slider's start: `v` clamped into [min, max], or `fallback` if it is not
 *  a finite number. */
export function clampDial(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.min(max, Math.max(min, n));
}
