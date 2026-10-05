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

- **The door** (`#`, `#item-01`, anything unknown): DISCOMMODE, Issue 01's
  cover, a note — "Discommode is made for bigger screens. Open it on a
  computer or tablet for the full issue. Here's the pocket version." — Read
  Issue 01, and the three projects' covers.
  The chrome's own paper shapes (`PillFace`, `ShapeFace`) in a clear day's
  colours, Bowlby One, a flat light sky (#cfe0f1).
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

Layout, emulated (iPad Pro 12.9" 1024×1366, iPad Air 11" 820×1180, iPad mini
744×1133, @2×, both orientations): the 10:13 hero and the open spread fit the
viewport in all six; in portrait the spread is scaled to the width.

## Not done, and yours to decide

- **Portrait reading.** Today: the spread scaled to the width. And a dial,
  READER NAV › READER PAGE › `singlePage` (dev dock, **off**, portrait only;
  `src/reader/singlePage.ts`): the stage at twice its size, one page centred.
  Turning is still the engine's (it decides Next or Prev by the half of the
  book pressed, and one half is on screen); a tap on the screen's other side,
  toward the spread's other page, moves there instead of turning; a Next lands
  on the new spread's left page, a Prev on its right. Checked on an emulated
  iPad mini: right (pan), right (turn to 07 | 08, left page), left (turn back,
  right page), left (pan), no errors. Which of the two portrait reading should
  be is yours.
- **DPR caps for touch devices**: not changed. Emulation runs on this Mac's
  GPU and proves nothing about an iPad's; the existing dials
  (`coverMaxDpr`, `coverRenderMax`, `skyResolution`, `skyMaxMegapixels`) are
  where to cap, after a look on a real iPad.
- The door's note (placeholder) and its colours.
