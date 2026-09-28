import { beforeEach, describe, expect, it, vi } from 'vitest';

/** A Map-backed localStorage: dialState prunes as it is imported, so each test
 *  seeds this and imports the module afresh. */
function stubStorage(seed: Record<string, string>) {
  const m = new Map(Object.entries(seed));
  const storage = {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
  // Object.keys(localStorage) lists the stored keys in a browser.
  const proxy = new Proxy(storage, { ownKeys: () => [...m.keys()], getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) });
  vi.stubGlobal('localStorage', proxy);
  return m;
}

async function dialState() {
  vi.resetModules();
  return import('./dialState');
}

beforeEach(() => vi.unstubAllGlobals());

describe('saved dial state', () => {
  it('deletes every saved panel and app blob from another version, and keeps this one', async () => {
    const m = stubStorage({
      'dialkit:cover-nosey-v1': '{"version":1,"values":{}}',
      'dialkit:detail-paper-v2': '{"version":1,"values":{}}',
      'discommode-dials': '{"snapMs":600}',
      'unrelated': 'kept',
    });
    const { DIAL_STATE_VERSION, persistedPanelId } = await dialState();
    expect(DIAL_STATE_VERSION).toBe(2);
    expect(persistedPanelId('cover-nosey')).toBe('cover-nosey-v2');
    expect([...m.keys()].sort()).toEqual(['dialkit:detail-paper-v2', 'unrelated']);
  });

  it('keeps the app blob of this version, and drops one that does not parse', async () => {
    const ok = stubStorage({ 'discommode-dials': '{"version":2,"values":{"snapMs":700}}' });
    await dialState();
    expect(ok.has('discommode-dials')).toBe(true);
    const bad = stubStorage({ 'discommode-dials': '{not json' });
    await dialState();
    expect(bad.has('discommode-dials')).toBe(false);
  });

  it('loads only keys the defaults have, of their type, finite', async () => {
    stubStorage({
      'discommode-dials': JSON.stringify({
        version: 2,
        values: { a: 5, b: null, c: 'x', d: true, gone: 1 },
      }),
    });
    const { loadAppDials } = await dialState();
    expect(loadAppDials({ a: 1, b: 2, c: 3, d: false })).toEqual({ a: 5, d: true });
  });

  it('saves with the version, and reads back what it saved', async () => {
    const m = stubStorage({});
    const { saveAppDials, loadAppDials } = await dialState();
    saveAppDials({ a: 3 });
    expect(JSON.parse(m.get('discommode-dials')!)).toEqual({ version: 2, values: { a: 3 } });
    expect(loadAppDials({ a: 1 })).toEqual({ a: 3 });
  });

  it('clamps a slider start into its range, and falls back when it is not a number', async () => {
    stubStorage({});
    const { clampDial } = await dialState();
    expect(clampDial(1e6, 1, 0.3, 1)).toBe(1);
    expect(clampDial(-1, 1, 0.3, 1)).toBe(0.3);
    expect(clampDial(null, 0.85, 0.3, 1)).toBe(0.85);
    expect(clampDial(0.5, 0.85, 0.3, 1)).toBe(0.5);
  });
});
