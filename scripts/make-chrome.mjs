/**
 * THE CHROME'S PAPER SHAPES — Uko's SVG exports from the Figma frame
 * "readerview" (Discommode-Website, node 6:2), split into what the site draws.
 *
 *   ~/Discommode-pages/ui/reader-bar/<shape>.svg      (sources, outside the repo)
 *   public/ui/chrome/<shape>-paper.svg                the hand-cut outline
 *   public/ui/chrome/<shape>-ink.svg                  the glyph (or the pill's hairline)
 *   src/chrome/shapes.json                            the geometry the components lay out by
 *
 *   npm run chrome
 *
 * Each export is one shape in Figma's placeholder greys: a BASE (a circle, or
 * the pill's rounded rect) and the scalloped EDGE around it (an outlined
 * stroke), both `#D9D9D9`, and on top the glyph in white / `#F9F9F9`. On the
 * site the paper's colour comes from the sky and the ink's is picked against it
 * (src/chrome/chromeColor.ts), so neither colour can be baked in: both layers
 * are used as CSS MASKS, and a mask only reads alpha. So this script does not
 * redraw anything and does not recolour anything. It sorts the elements by the
 * fill Figma gave them — grey is paper, white is ink — and writes each set to
 * its own file with the export's own viewBox, so the two layers stay registered.
 *
 * What it does change, and why:
 *   - numbers are rounded to 2 decimals (0.01 of a Figma px, invisible at any
 *     DPR the site draws at) — the exports carry 4 and are 300 KB between them;
 *   - the root gets `preserveAspectRatio="none"`, so the pill's middle can be
 *     stretched (src/chrome/PaperPill.tsx). At a box of the viewBox's own ratio
 *     it is the same picture;
 *   - a grey element drawn OVER the ink (after it in the file) is a cut: the
 *     2026-10-05 books are a solid white book with their spine and edges drawn
 *     on top in the paper's grey. A mask only reads alpha, so on the paper
 *     layer that line would sit UNDER the ink and vanish. It is written into
 *     the ink file as an SVG <mask> instead, black where the line is, so the
 *     ink has the line cut out of it and the paper shows through — the picture
 *     the export draws, in the two layers the site needs;
 *   - the pill's two numbers ("01", "02") are DROPPED: on the site they are live
 *     text in Bowlby One. Its hairline (the thin wobbly vertical, a 1px vector
 *     in the file) is kept as the pill's ink. They are told apart by shape: the
 *     hairline is the one ink path under 4 units wide.
 *
 * The manifest records, per shape, the viewBox and the BASE's box inside it —
 * the base is the "size" the frame gives (58, 46, 131×46); the edge bleeds a few
 * units past it, so a component lays out the base and lets the paper overhang.
 * Byte-stable: a re-run on unchanged sources writes identical files.
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(homedir(), 'Discommode-pages', 'ui', 'reader-bar');
const OUT = join(ROOT, 'public', 'ui', 'chrome');
const MANIFEST = join(ROOT, 'src', 'chrome', 'shapes.json');

const PAPER = new Set(['#d9d9d9']);
const INK = new Set(['white', '#ffffff', '#fff', '#f9f9f9']);

const round = (s) => s.replace(/-?\d*\.\d+/g, (n) => String(Math.round(Number(n) * 100) / 100));

/** Every element with a fill, in document order. */
function elements(svg) {
  const out = [];
  for (const m of svg.matchAll(/<(path|circle|rect)\b([^>]*?)\/?>/g)) {
    const attrs = m[2];
    const fill = (attrs.match(/\bfill="([^"]*)"/)?.[1] ?? '').toLowerCase();
    out.push({ tag: m[1], attrs, fill, src: m[0] });
  }
  return out;
}

/** A bbox from a path's absolute commands (Figma writes only M L H V C Z),
 *  control points included — tight for a circle's or rounded rect's kappa arcs. */
function pathBox(d) {
  const xs = [];
  const ys = [];
  let x = 0;
  let y = 0;
  for (const [, cmd, args] of d.matchAll(/([MLHVCZ])([^MLHVCZ]*)/g)) {
    const n = (args.match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []).map(Number);
    if (cmd === 'H') for (const v of n) (x = v), xs.push(x), ys.push(y);
    else if (cmd === 'V') for (const v of n) (y = v), xs.push(x), ys.push(y);
    else for (let i = 0; i + 1 < n.length; i += 2) (x = n[i]), (y = n[i + 1]), xs.push(x), ys.push(y);
  }
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
}

/** An element's own `transform` as [a b c d e f] (matrix or translate; Figma
 *  writes a mirror as `matrix(-1 0 0 1 tx ty)`), or the identity. */
function transformOf(el) {
  const t = el.attrs.match(/\btransform="([^"]*)"/)?.[1];
  if (!t) return [1, 0, 0, 1, 0, 0];
  const n = (t.match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []).map(Number);
  if (/^\s*matrix\(/.test(t) && n.length === 6) return n;
  if (/^\s*translate\(/.test(t)) return [1, 0, 0, 1, n[0] ?? 0, n[1] ?? 0];
  throw new Error(`unsupported transform "${t}" — tell Uko which export, do not redraw it`);
}

/** A box through an affine transform: the box of its four corners. */
function transformBox(b, [a, bb, c, d, e, f]) {
  const pts = [
    [b.x, b.y],
    [b.x + b.w, b.y],
    [b.x, b.y + b.h],
    [b.x + b.w, b.y + b.h],
  ].map(([x, y]) => [a * x + c * y + e, bb * x + d * y + f]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

function boxOf(el) {
  let box;
  if (el.tag === 'circle') {
    const n = (k) => Number(el.attrs.match(new RegExp(`\\b${k}="([^"]*)"`))[1]);
    const r = n('r');
    box = { x: n('cx') - r, y: n('cy') - r, w: 2 * r, h: 2 * r };
  } else {
    box = pathBox(el.attrs.match(/\bd="([^"]*)"/)[1]);
  }
  return transformBox(box, transformOf(el));
}

const r2 = (b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, Math.round(v * 100) / 100]));

function doc(head, els, cut = [], [vw, vh] = [0, 0]) {
  const open = head.replace(/<svg\b/, '<svg preserveAspectRatio="none"');
  const body = els.map((e) => round(e.src)).join('\n');
  if (!cut.length) return `${open}\n${body}\n</svg>\n`;
  const holes = cut.map((e) => round(e.src).replace(/\bfill="[^"]*"/, 'fill="black"')).join('\n');
  return (
    `${open}\n<mask id="cut" maskUnits="userSpaceOnUse" x="0" y="0" width="${vw}" height="${vh}">\n` +
    `<rect width="${vw}" height="${vh}" fill="white"/>\n${holes}\n</mask>\n<g mask="url(#cut)">\n${body}\n</g>\n</svg>\n`
  );
}

async function main() {
  let files;
  try {
    files = (await readdir(SOURCE)).filter((f) => f.endsWith('.svg')).sort();
  } catch {
    console.error(`!! No sources at ${SOURCE}. Export the "readerview" shapes from Figma there.`);
    process.exit(1);
  }
  await mkdir(OUT, { recursive: true });
  const manifest = {};
  for (const file of files) {
    const name = file.replace(/\.svg$/, '');
    const svg = await readFile(join(SOURCE, file), 'utf8');
    const head = svg.match(/<svg\b[^>]*>/)[0];
    const [vw, vh] = head.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/).slice(1).map(Number);
    const els = elements(svg);
    // Grey after the first white is drawn over the ink: a cut, not paper.
    const firstInk = els.findIndex((e) => INK.has(e.fill));
    const cut = firstInk < 0 ? [] : els.slice(firstInk).filter((e) => PAPER.has(e.fill));
    const paper = els.filter((e) => PAPER.has(e.fill) && !cut.includes(e));
    let ink = els.filter((e) => INK.has(e.fill));
    const unknown = els.filter((e) => !PAPER.has(e.fill) && !INK.has(e.fill) && e.fill !== 'none' && e.fill !== '');
    if (unknown.length) console.warn(`  ${name}: ${unknown.length} element(s) of an unexpected fill (${unknown.map((e) => e.fill).join(', ')}) — left out`);
    if (paper.length === 0) throw new Error(`${name}: no paper (#D9D9D9) elements`);
    const base = boxOf(paper[0]);
    const entry = { viewBox: [vw, vh], base: r2(base) };
    if (name === 'pill') {
      const hair = ink.filter((e) => boxOf(e).w < 4);
      const text = ink.length - hair.length;
      ink = hair;
      entry.hairline = r2(boxOf(hair[0]));
      console.log(`  pill: ${text} text path(s) dropped — the numbers are live Bowlby One`);
    }
    const paperSvg = doc(head, paper);
    const inkSvg = doc(head, ink, cut, [vw, vh]);
    if (cut.length) console.log(`  ${name}: ${cut.length} grey element(s) over the ink — cut out of it`);
    await writeFile(join(OUT, `${name}-paper.svg`), paperSvg);
    await writeFile(join(OUT, `${name}-ink.svg`), inkSvg);
    manifest[name] = entry;
    const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(1)} KB`;
    console.log(
      `  ${name}: viewBox ${vw}×${vh}, base ${entry.base.w}×${entry.base.h} at ${entry.base.x},${entry.base.y}` +
        ` — paper ${paper.length} el. ${kb(paperSvg)}, ink ${ink.length} el. ${kb(inkSvg)} (source ${kb(svg)})`,
    );
  }
  await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`  → ${OUT}\n  → ${MANIFEST}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
