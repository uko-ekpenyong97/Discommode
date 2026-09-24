/**
 * A cover's dials are a DialKit config (src/covers/covers/<id>.json) — the same
 * object the COVER panel and the tuning bench register — and its DEFAULTS are
 * the tuned values. This reads the defaults out of it, the way DialKit does:
 * a slider tuple is its first number, a select its `default`, a toggle, colour
 * or text itself; folders recurse; actions and `_`-keys are not values.
 */
export type DialConfig = { [key: string]: unknown };
export type DialValues = { [key: string]: unknown };

export function dialDefaults(config: DialConfig): DialValues {
  const out: DialValues = {};
  for (const [key, v] of Object.entries(config)) {
    if (key.startsWith('_')) continue;
    if (Array.isArray(v)) out[key] = v[0];
    else if (v && typeof v === 'object') {
      const o = v as { type?: string; default?: unknown };
      if (o.type === 'action') continue;
      if (o.type === 'select' || o.type === 'text' || o.type === 'color') out[key] = o.default;
      else if (o.type) out[key] = o.default;
      else out[key] = dialDefaults(o as DialConfig);
    } else out[key] = v;
  }
  return out;
}
