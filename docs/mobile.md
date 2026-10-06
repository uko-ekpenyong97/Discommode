# Phones and tablets

The site was built for a desktop and a Studio Display. This is what a touch
screen gets, decided by **capability, never by user agent**
(`src/device.ts`, and the inline script in `index.html`, which must agree):

| | test | gets |
| --- | --- | --- |
| desktop | a fine pointer that hovers | the site, exactly as before |
| tablet | a coarse pointer (`(pointer: coarse)`) | the full site, with touch standing in for hover |
| phone | a coarse pointer that cannot hover AND a screen whose short side is under 600 CSS px — or `?phone` anywhere in the query or the hash's query | the door (`phone.html`) |

## The phone door

`index.html` runs one inline script before anything else: on a phone it
`location.replace`s to `/phone.html`, keeping the query and the hash. The
build (`vite.config.ts`, `phoneDoor`) takes the site's own tags out of the
built `index.html` — its module, its modulepreload, its stylesheets — and
hands them to that script, which writes them back in place
(`document.write`, so they stay parser-inserted, deferred and render-blocking
as before) when it is not a phone. Without that the browser's preload scanner
fetched the desktop bundle on a phone before the script could send it away. In
dev, `index.html` keeps its tags and the script writes nothing.

`phone.html` loads `src/phone/` only: no three.js, sky, fluid, reader engine,
Lenis or Rive.

| JS, gzip | phone | desktop |
| --- | --- | --- |
| entry | 2.5 KB (`phone-*.js`) | 268.7 KB (`main-*.js`) |
| shared (React, content, the chrome's shapes) | 81.6 KB | the same 81.6 KB |
| on demand | — | 52.8 KB (the Rive runtime, `rive-*.js`), its wasm |
| **total** | **84 KB** | **350 KB + Rive** |

Views, by hash (the desktop's links work):

- **The door** (`#`, `#item-01`, anything unknown), top to bottom: Uko's
  logo, the disclaimer, Issue 01's cover, Read Issue 01, and the three
  projects' covers. The chrome's own paper shapes (`PillFace`, `ShapeFace`)
  in a clear day's colours, Bowlby One, a flat light sky (#cfe0f1). A shared
  link (`#read-01/<n>`, `#item-NN`, `#view-NN`) is its own view, so it opens
  on its target with neither above it.
- **The logo** is Uko's (Figma 430:41, `~/Discommode-pages/ui/door/logo.svg`,
  read only), through svgo by `npm run door` into `src/phone/door-logo.svg`
  (7.7 → 6.0 KB; the paths' numbers kept to the source's 4 decimals, nothing
  merged, the drop shadow kept; it draws the source's pixels exactly), inlined
  as the door's `h1` with the name "Discommode", in `currentColor`: the door's
  ink (#1d2230), as the type it replaced. Its shapes are as wide as that type
  was — 0.792 of the screen's width, up to 348.5 px on its side — and centred (`docs/mobile/door-logo-full.webp`; Figma's black beside
  the ink: `door-logo-ink-vs-black.webp`).
- **The disclaimer** is Uko's Figma frame "Disclaimer" (Discommode-Website,
  node 424:37, 812×1045), set exactly as drawn: the whole frame scaled to the
  phone's width (one Figma unit = width ÷ 812), every box at the frame's x, y
  and width (the 72 / 96 / 88 left edges are the frame's), the red #B82540
  edge to edge. On its side a phone gets the same frame at 480 px, centred.
  "DISCLAIMER!" in Frijole, the two paragraphs in Space Mono Bold (≥ 16 px:
  21.8 on an iPhone 15), both live type; Figma's line heights (97 and 67
  units) and its glyphs' place in the box (3 and 2.5 units lower than a
  browser's "normal") are set explicitly — measured against the frame's render,
  every line within 1 px in Chromium and WebKit
  (`docs/mobile/door-disclaimer-figma.webp`). The photo is the frame's own,
  cut from Uko's flattened export (`~/Discommode-pages/ui/door/disclaimer.png`,
  the caption edits in it) at 636 and 1272 px, lazy, its alt text the edited
  caption. `npm run door` (`scripts/make-door.mjs`) makes the photo and the
  two fonts: each cut to the glyphs the disclaimer sets (`src/phone/disclaimer.ts`;
  run it again after changing the words), their family names dropped (Frijole's
  is reserved under the OFL), served as 'Door Display' and 'Door Mono', 10.1 and
  4.4 KB, `font-display: block` and preloaded by phone.html only: no fallback
  flash, and the desktop never loads them. Captures: `docs/mobile/door-disclaimer.webp`.
- **The stack** (`#read-01`, `#read-01/<spread>`): every page in reading order
  (the reader's drawn cover and back), lazy past the first two, `srcset` of
  the 1000 px riffle pages and the 2000 px pages, `width`/`height` set so
  nothing jumps; pinch-zoom is the browser's. A link opens at its spread's
  first page, and the hash follows the scroll (`replaceState`), so a link
  copied from here opens the same spread on a desktop.
- **A project** (`#item-02..04`, `#view-02..04[/page]`): the project's
  blocks as one scrolling page — headings, text, images, the two-ups and rows
  stacked, stats, link pills — and its videos muted, inline, looping, with
  their posters (`preload="none"`), playing only while on screen.

## Tablets

Every change is gated so a mouse takes the same path as before:

| was hover-only | on touch now |
| --- | --- |
| the grid card's overlay — its number, captions, CTA (`usePanController`, `CardOverlay`) | on a screen that cannot hover, the **centred card** shows it whenever the grid is at rest |
| the grid's tilt and per-card facing | none (the cards rest flat) — unchanged |
| card 02's lava blobs, card 03's light, the dots' dome (`CoverTile`, `DomeSpring`) | follow a **finger while it is down**; lifting it is leaving, so they ease back (card 03's light drifts at rest, as it does) |
| card 04's Rive characters (`riveInput`) | the same: moves while down, an exit when the finger lifts |
| the detail paper's dent (`DetailPaperLayer`) | under a finger while it is down; springs back on lift |
| Issue 01's cover objects and boil (`CoverAnimLayer`) | **pressing** the cover plays them; on lift they run out their loop |
| the portfolio sheet's tilt toward the pointer (`SheetCanvas`) | touch puts it at rest (it used to hold the last touch) |
| the quote wand | fine pointers only, as before; a tap translates |
| the sky's wake | a finger already stirs it (unchanged) |
| `:hover` styles (the chrome's lift, the CTA, the portfolio's letterhead and links) | only under `@media (hover: hover)`: a tap no longer leaves them stuck |

Gestures: the grid's drag and fling were already pointer events
(`touch-action: none`); the reader's book takes every gesture on a coarse
pointer (`touch-action: none` — with `pan-y` a turn a little off the
horizontal became a `pointercancel`, and a double tap or pinch zoomed) and its
chrome takes taps without the double-tap wait (`touch-action:
manipulation`); taps on either half turn, the chrome's Cover and Back riffle.
The page is `100dvh` after `100vh` (iOS Safari's toolbar), and on a coarse
pointer has no rubber-band (not for a mouse: on a Mac `overscroll-behavior`
also takes the trackpad's swipe back). Videos were already `playsInline` and
muted. The chrome's hit areas are ≥ 44 px (`.paper`), unchanged.

**Size.** The chrome's gaps shrink with the screen's width, to 16 px floors,
and the book and the detail card take the rest (docs/reader.md, "The Studio
Display's gaps are the maximums"; `docs/mobile/sizing-ipad.webp`).

**Portrait: one page at a time, on by default for touch**
(`src/reader/singlePage.ts`; the READER PAGE dial in READER NAV, which a
mouse starts off). The hero is sized for one page, so the page fills the
screen (iPad 11": 773×1005, 94% of the width) and the detail card with it; the
open spread is two screens wide and the stage moves half a page to centre the
one shown. A tap on the screen's half toward the other page shows it; a tap on
the shown page's own half turns (a Next lands on the new spread's left page, a
Prev on its right); a swipe left shows the right page, then turns, and back the
same. Landscape keeps the spread. The doorway opens the full-height card into
the cover as before; after the opening turn the book pans a half page (260
ms) to the left page.

**Zoom to read** (`src/reader/pageZoom.ts`, touch pointers only): a pinch or a
double tap (to 2.4×) zooms the page, one finger pans it while zoomed (held to
the page), a pinch back under 1.08× or a double tap returns. No page turns
while zoomed; a new spread (the bar's arrows) or a resize returns it to 1.
A touch's tap waits out the double tap (300 ms) before it turns; drags turn at
once, the curl under the finger as before. A second finger landing takes over
a press that has not become a turn (`flipEngine.releasePress`); a page already
turning finishes. Safari's own page pinch is stopped in the reader
(`touch-action: none` and `gesturestart`). A mouse, pen or trackpad is
unchanged.

Checked, emulated (`.context` scripts, CDP touch): portrait — tap right
shows the right page, tap right again turns; double tap zooms; tap and drag
while zoomed pan without turning; double tap returns; pinch to 4× and back to
1; swipe left. Landscape — taps and drags turn; a pinch whose first finger
landed on the book zooms without a turn.

## Not done, and yours to decide

- **DPR caps for touch devices**: not changed. Emulation runs on this Mac's
  GPU and proves nothing about an iPad's; the existing dials
  (`coverMaxDpr`, `coverRenderMax`, `skyResolution`, `skyMaxMegapixels`) are
  where to cap, after a look on a real iPad.
- The door's colours.
