import { describe, expect, it } from 'vitest';
import {
  HINT_MS,
  REDUCED_MS,
  baselineIn,
  hintAlphaAt,
  layoutBlock,
  layoutHint,
  matchGlyphs,
  norm,
  planMorph,
  sampleItem,
  sampleMorph,
  scrambleChar,
  swapArrow,
} from './quoteMorph';
import type { Glyph, Measure, MorphSettings, TextBlock } from './quoteMorph';
import { QUOTE_DEFAULTS, QUOTE_PAGES } from './quotes';

/** A monospace: every character 10 wide, ascent 8, descent 2. */
const mono: Measure = (_font, text) => ({ width: text.length * 10, ascent: 8, descent: 2 });

const S: MorphSettings = {
  durationMs: 2400,
  staggerMs: 800,
  arcPx: 60,
  easing: 'inOutCubic',
  reuseOutOfOrder: true,
  scramble: true,
};

const at = (x: number, y = 0, ch = 'a', block = 'q'): Glyph => ({ ch, x, y, block });

describe('layout', () => {
  const block: TextBlock = { key: 'q', font: 'f', lineHeight: 20, align: 'center', anchorX: 100, top: 50, lines: { es: ['ab c', 'de'], en: ['x'] } };

  it('centres each line, puts each letter at the width of the line before it, and skips spaces', () => {
    const g = layoutBlock(block, 'es', mono);
    // 'ab c' is 40 wide, centred on 100 → starts at 80; the baseline sits at
    // the half-leading (20 − 10) / 2 = 5 plus the ascent 8 below the line's top.
    expect(g.map((x) => [x.ch, x.x, x.y])).toEqual([
      ['a', 80, 63],
      ['b', 90, 63],
      ['c', 110, 63],
      ['d', 90, 83],
      ['e', 100, 83],
    ]);
  });

  it('right-aligns on the anchor', () => {
    const g = layoutBlock({ ...block, align: 'right', anchorX: 200 }, 'es', mono);
    expect(g[0].x).toBe(160);
    expect(g.at(-1)!.x).toBe(190);
  });

  it('left-aligns on the anchor', () => {
    const g = layoutBlock({ ...block, align: 'left', anchorX: 50 }, 'es', mono);
    expect(g.map((x) => x.x)).toEqual([50, 60, 80, 50, 60]);
  });

  it('keeps the kern before a letter: "Ya" set tight puts the a under the Y', () => {
    // Monospace, but "Ya" kerned 2 tighter, as Lora sets "Yá".
    const kerned: Measure = (_font, text) => ({ width: text.length * 10 - (text.includes('Ya') ? 2 : 0), ascent: 8, descent: 2 });
    const g = layoutBlock({ ...block, align: 'left', anchorX: 0, lines: { es: ['xYaz'], en: ['x'] } }, 'es', kerned);
    expect(g.map((x) => [x.ch, x.x])).toEqual([
      ['x', 0],
      ['Y', 10],
      ['a', 18],
      ['z', 28],
    ]);
  });

  it('puts the baseline where CSS centres a line box', () => {
    expect(baselineIn(68, { width: 0, ascent: 51.33, descent: 16.55 })).toBeCloseTo(51.39, 2);
  });

  it('spaces the hint as CSS letter-spacing, centred, its first word Spanish and its last English', () => {
    const h = layoutHint({ font: 'f', text: 'ES ⇄ EN', letterSpacingPx: 2, lineHeight: 10, centerX: 100, top: 0 }, mono);
    // 7 characters, 70 + 7 × 2 = 84 wide → starts at 58.
    expect(h.map((g) => [g.ch, g.x, g.lang, g.arrow])).toEqual([
      ['E', 58, 'es', false],
      ['S', 70, 'es', false],
      ['⇄', 94, null, true],
      ['E', 118, 'en', false],
      ['N', 130, 'en', false],
    ]);
  });

  it('measures the arrow as a letter, never as the ⇄ (no face here has one)', () => {
    const seen: string[] = [];
    layoutHint({ font: 'f', text: 'ES ⇄ EN', letterSpacingPx: 0, lineHeight: 10, centerX: 0, top: 0 }, (f, t) => (seen.push(t), mono(f, t)));
    expect(seen.some((t) => t.includes('⇄'))).toBe(false);
  });

  it('draws the ⇄ as a right arrow over a left one, inside its cell, at Space Mono’s stem', () => {
    const a = swapArrow(100, 200, 24, 700);
    expect(a.width).toBeCloseTo(0.126 * 24, 9);
    expect(swapArrow(100, 200, 24, 400).width).toBeCloseTo(0.078 * 24, 9);
    const xs = a.paths.flat().map(([x]) => x);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(100);
    expect(Math.max(...xs)).toBeLessThanOrEqual(100 + 0.612 * 24);
    const [topShaft, topHead, botShaft, botHead] = a.paths;
    expect(topShaft[0][1]).toBeLessThan(botShaft[0][1]); // the right arrow is the upper
    expect(topHead[1][0]).toBe(topShaft[1][0]); // its head at its right end
    expect(botHead[1][0]).toBe(botShaft[1][0]); // the left arrow's at its left
    expect(botShaft[1][0]).toBeLessThan(botShaft[0][0]);
    // Centred on half the cap height.
    expect((topShaft[0][1] + botShaft[0][1]) / 2).toBeCloseTo(200 - 0.35 * 24, 9);
  });
});

describe('matching', () => {
  it('ignores accents and case', () => {
    expect(norm('Á')).toBe('a');
    expect(norm('é')).toBe(norm('e'));
    expect(norm('ñ')).toBe('n');
  });

  it('keeps shared letters in order (the longest common subsequence)', () => {
    const src = [...'abcd'].map((ch, i) => at(i * 10, 0, ch));
    const dst = [...'xbzd'].map((ch, i) => at(i * 10, 0, ch));
    expect([...matchGlyphs(src, dst, false)]).toEqual([
      [1, 1],
      [3, 3],
    ]);
  });

  it('reuses out-of-order letters, nearest first and never twice', () => {
    // "ab" → "ba": the LCS keeps one; the nearest pass gives the other its letter.
    const src = [at(0, 0, 'a'), at(100, 0, 'b'), at(300, 0, 'b')];
    const dst = [at(0, 0, 'b'), at(100, 0, 'a')];
    expect(matchGlyphs(src, dst, false).size).toBe(1);
    const pairs = matchGlyphs(src, dst, true);
    expect(pairs.size).toBe(2);
    expect(new Set(pairs.values()).size).toBe(2);
    expect(pairs.get(0)).toBe(1); // the nearer of the two b's
  });

  it('looks no further than 650px for an out-of-order letter', () => {
    const src = [at(0, 0, 'a'), at(1000, 0, 'b')];
    const dst = [at(0, 0, 'b'), at(1000, 0, 'a')];
    expect(matchGlyphs(src, dst, true).size).toBe(1);
  });
});

describe('the morph', () => {
  const q = QUOTE_PAGES[0];
  const es = q.blocks.flatMap((b) => layoutBlock(b, 'es', mono));
  const en = q.blocks.flatMap((b) => layoutBlock(b, 'en', mono));

  it('ends with every letter of the target where it lies, the leaving ones gone', () => {
    const plan = planMorph(es, en, S, false);
    const end = sampleMorph(plan, plan.totalMs);
    const key = (g: { ch: string; x: number; y: number; block: string }) => `${g.block}:${g.ch}@${g.x},${g.y}`;
    expect(end.map(key).sort()).toEqual(en.map(key).sort());
    expect(end.every((g) => g.alpha === 1)).toBe(true);
  });

  it('starts from the source: the letters as they were, nothing new yet', () => {
    const plan = planMorph(es, en, S, false);
    const start = sampleMorph(plan, 0);
    const key = (g: { ch: string; x: number; y: number; block: string }) => `${g.block}:${g.ch}@${g.x},${g.y}`;
    expect(start.map(key).sort()).toEqual(es.map(key).sort());
  });

  it('matches only within a block', () => {
    const plan = planMorph(es, en, S, false);
    for (const it of plan.items) if (it.kind === 'move') expect(es.some((g) => g.block === it.block && g.x === it.from.x && g.y === it.from.y)).toBe(true);
  });

  it('staggers by reading order: the first letter first, the last last, inside duration + stagger', () => {
    const plan = planMorph(es, en, S, false);
    const moves = plan.items.filter((i) => i.kind === 'move');
    expect(Math.min(...moves.map((m) => m.delay))).toBeLessThan(Math.max(...moves.map((m) => m.delay)));
    expect(plan.totalMs).toBeLessThanOrEqual(S.durationMs + S.staggerMs + 1e-9);
    const exits = plan.items.filter((i) => i.kind === 'exit');
    for (const e of exits) expect(e.dur).toBe(S.durationMs * 0.5);
  });

  it('lifts a travelling letter on its arc, scaled by how far it goes', () => {
    const plan = planMorph([at(0, 100, 'a')], [at(400, 100, 'a')], { ...S, staggerMs: 0 }, false);
    const mid = sampleItem(plan, plan.items[0], plan.items[0].dur / 2);
    expect(mid.y).toBeCloseTo(100 - S.arcPx, 6);
    const short = planMorph([at(0, 100, 'a')], [at(100, 100, 'a')], { ...S, staggerMs: 0 }, false);
    expect(sampleItem(short, short.items[0], short.items[0].dur / 2).y).toBeCloseTo(100 - S.arcPx / 4, 6);
  });

  it('swaps a travelling letter’s accent halfway', () => {
    const plan = planMorph([at(0, 0, 'a')], [at(10, 0, 'á')], { ...S, staggerMs: 0 }, false);
    const it0 = plan.items[0];
    expect(sampleItem(plan, it0, it0.dur * 0.49).ch).toBe('a');
    expect(sampleItem(plan, it0, it0.dur * 0.51).ch).toBe('á');
  });

  it('scrambles a new letter for the first 70% of its time, then settles on it', () => {
    const plan = planMorph([], [at(0, 0, 'z')], { ...S, staggerMs: 0 }, false);
    const it0 = plan.items[0];
    expect(it0.kind).toBe('enter');
    const seen = new Set<string>();
    for (let p = 0.01; p < 0.7; p += 0.02) seen.add(sampleItem(plan, it0, it0.delay + it0.dur * p).ch);
    expect(seen.size).toBeGreaterThan(3);
    expect(sampleItem(plan, it0, it0.delay + it0.dur * 0.75).ch).toBe('z');
    const plain = planMorph([], [at(0, 0, 'z')], { ...S, staggerMs: 0, scramble: false }, false);
    expect(sampleItem(plain, plain.items[0], plain.items[0].delay + plain.items[0].dur * 0.3).ch).toBe('z');
  });

  it('scrambles as a pure function of time', () => {
    expect(scrambleChar(3, 7)).toBe(scrambleChar(3, 7));
    expect(new Set(Array.from({ length: 40 }, (_, i) => scrambleChar(1, i))).size).toBeGreaterThan(10);
  });

  it('under reduced motion is a 300ms crossfade: nothing matched, nothing moves or scrambles', () => {
    const plan = planMorph(es, en, S, true);
    expect(plan.reduced).toBe(true);
    expect(plan.totalMs).toBeCloseTo(REDUCED_MS, 9);
    expect(plan.items.some((i) => i.kind === 'move')).toBe(false);
    const allowed = new Set([...es, ...en].map((g) => `${g.ch}@${g.x},${g.y}`));
    for (let ms = 0; ms <= REDUCED_MS; ms += 10) {
      for (const g of sampleMorph(plan, ms)) expect(allowed.has(`${g.ch}@${g.x},${g.y}`)).toBe(true);
    }
  });

  it('moves the hint’s emphasis over 300ms', () => {
    expect(hintAlphaAt('es', 'es', 'en', 0, 0.45)).toBe(1);
    expect(hintAlphaAt('es', 'es', 'en', HINT_MS, 0.45)).toBeCloseTo(0.45, 9);
    expect(hintAlphaAt('en', 'es', 'en', HINT_MS, 0.45)).toBe(1);
    expect(hintAlphaAt(null, 'es', 'en', HINT_MS / 2, 0.45)).toBe(1);
  });

  it('ships the brief’s settings', () => {
    expect(QUOTE_DEFAULTS).toMatchObject({ durationMs: 2400, staggerMs: 800, arcPx: 60, easing: 'inOutCubic', defaultLang: 'es' });
  });
});
