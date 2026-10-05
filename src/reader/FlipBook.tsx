import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Ref } from 'react';
import type { Page, Spread } from './issue-01';
import { pageLabel } from './issue-01';
import { createFlipEngine } from './flipEngine';
import type { FlipEngine } from './flipEngine';
import { attachFixedT } from './devFixedT';
import { CoverAnimLayer } from '../components/CoverAnimLayer';
import { createPageAnimPlayer } from './pageAnimPlayer';
import type { PageAnimPlayer } from './pageAnimPlayer';
import { animsOnPage } from './pageAnims';
import { createQuotePlayer } from './quotePlayer';
import { quoteOnPage } from './quotes';
import type { QuotePage } from './quotes';
import './flipbook.css';

interface FlipBookProps {
  spreads: Spread[];
  spread: number;
  onSpreadChange: (index: number) => void;
  /** Dev-only frozen-t scrub, from `#read-NN?debug`. */
  debug?: boolean;
  /**
   * Hands the freshly-created engine up. The reader's chrome drives it (Prev /
   * Next, the Cover and Back cover jumps, finishing a jump on Escape), and the
   * doorway drives the cover turn through it.
   */
  onEngineReady?: (engine: FlipEngine) => void;
  /** Cover-animation manifest URL (`Issue.anims`), if the issue has one. */
  anims?: string;
  /** Inside-page sprite-atlas manifest URL (`Issue.pageAnims`), if any. */
  pageAnims?: string;
}

/** 'COVER' / 'BACK' for the plates, 'Page 07' for a numbered page. */
const altFor = (page: Page): string => page.label ?? `Page ${pageLabel(page)}`;

/**
 * An animated page's layer over its baked `<img>`, in the same slot: the plate
 * and the canvas its sprites are drawn on. Keyed by page, so each page's is a
 * fresh element — hidden until the player shows it (flipbook.css). Decorative:
 * the baked page under it carries the alt text.
 */
function PageAnimLayer({ page, ref }: { page: Page; ref: Ref<HTMLDivElement> }) {
  return (
    <div className="page-anim" ref={ref} data-page={page.n} aria-hidden="true">
      {/* No src until the player shows the page: a riffle renders this for every
          spread it passes, and must not fetch a full-size plate for each. */}
      <img className="page-anim__plate" data-src={page.plate} alt="" draggable={false} />
      <canvas className="page-anim__sprites" />
    </div>
  );
}

/** The page's own file, "05" — what the checks read a slot by, whatever its
 *  `src` (a quote page's is its bake). */
const fileOf = (page: Page): string => page.src.split('/').pop()!.replace(/\.webp$/, '');

const pct = (v: number) => `${v * 100}%`;

/**
 * A quote page's layer over its baked `<img>` (quotePlayer.ts): the plate (the
 * quote removed), the canvas the letters and the hint are drawn on, and the
 * button over the quote. Keyed by page, hidden until the player shows it. The
 * player writes the button's name, the quote it describes (in its language)
 * and the live region's text; its pointer events are the engine's (`.book *`
 * takes none), so the button is reached by keyboard and by tap through
 * `tapTarget`.
 */
function QuoteLayer({ page, quote, ref }: { page: Page; quote: QuotePage; ref: Ref<HTMLDivElement> }) {
  const { x, y, w, h } = quote.hitArea;
  return (
    <div className="quote-layer" ref={ref} data-page={page.n}>
      <img className="quote-layer__plate" data-src={page.plate} alt="" aria-hidden="true" draggable={false} />
      <canvas className="quote-layer__letters" aria-hidden="true" />
      <button
        type="button"
        className="quote-layer__hit"
        style={{ left: pct(x / 2000), top: pct(y / 2600), width: pct(w / 2000), height: pct(h / 2600) }}
        aria-describedby={`quote-${page.n}-text`}
      >
        <span className="quote-layer__text-alt visually-hidden" id={`quote-${page.n}-text`} />
      </button>
      <p className="visually-hidden" aria-live="polite" />
    </div>
  );
}

/**
 * Renders the STATIC spread and the empty host the engine builds its turn layer
 * into — and nothing else. React never re-renders per frame; it only hears back
 * from the engine once a turn has completed, via `onSpreadChange`.
 *
 * The controls live in the reader's bar (ReaderPage), which drives the engine
 * handed up through `onEngineReady`: `.book *` has `pointer-events: none` so the
 * book element itself can own the drag, and nothing here competes for it.
 */
export function FlipBook({
  spreads,
  spread,
  onSpreadChange,
  debug = false,
  onEngineReady,
  anims,
  pageAnims,
}: FlipBookProps) {
  const bookRef = useRef<HTMLDivElement>(null);
  // The book element is also the pointer host for the cover's hover layer (the
  // layer itself takes no pointer events, and `.book *` cannot), so it is held
  // in state as well as a ref — the layer's listener has to re-bind when it
  // mounts.
  const [bookEl, setBookEl] = useState<HTMLDivElement | null>(null);
  const setBook = useCallback((el: HTMLDivElement | null) => {
    bookRef.current = el;
    setBookEl(el);
  }, []);
  // True from the frame a turn layer goes up to the frame it comes down.
  const [turning, setTurning] = useState(false);
  // The inside pages' sprites (pageAnimPlayer.ts) hear of a turn HERE, in the
  // engine's own call, not through the `turning` render: the engine reports a
  // turn before the strips first move, and a render can land a frame later — a
  // frame in which the static slot would still show the plate and a sprite
  // where the curl's face shows the baked page.
  const pageAnimRef = useRef<PageAnimPlayer | null>(null);
  // The chapter-break quotes (quotePlayer.ts) hear of it the same way: a morph
  // lands and the layer goes before the leaf lifts. A quote page is shown — by
  // the static slot and by every turn — as its bake in its current language;
  // the store re-renders the slot when that changes.
  const [quote] = useState(createQuotePlayer);
  useSyncExternalStore(quote.subscribe, quote.version);
  const onTurnActive = useCallback(
    (active: boolean) => {
      pageAnimRef.current?.setTurning(active);
      quote.setTurning(active);
      setTurning(active);
    },
    [quote],
  );
  const leftQuoteRef = useRef<HTMLDivElement>(null);
  const rightQuoteRef = useRef<HTMLDivElement>(null);
  const leftAnimRef = useRef<HTMLDivElement>(null);
  const rightAnimRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<FlipEngine | null>(null);
  const leftImgRef = useRef<HTMLImageElement>(null);
  const rightImgRef = useRef<HTMLImageElement>(null);
  const leftSlotRef = useRef<HTMLDivElement>(null);
  const rightSlotRef = useRef<HTMLDivElement>(null);
  // The closed face under each hover layer, which boils with it (the layer's
  // plate covers it, but not its contact shadow or its edge): the cover sits in
  // the right slot at data-pos="cover", the back in the left at "back".
  const coverSlot = useCallback(() => [rightSlotRef.current], []);
  const backSlot = useCallback(() => [leftSlotRef.current], []);

  // The engine reads these through getters so it always sees live values
  // without being torn down and rebuilt on every spread change.
  const spreadRef = useRef(spread);
  const spreadsRef = useRef(spreads);
  useLayoutEffect(() => {
    spreadRef.current = spread;
    spreadsRef.current = spreads;
  });

  // Made before the engine (layout effects run in order), so the engine's first
  // `onTurnActive` already has somewhere to go.
  useLayoutEffect(() => {
    if (!pageAnims) return;
    const player = createPageAnimPlayer(pageAnims);
    pageAnimRef.current = player;
    return () => {
      player.destroy();
      pageAnimRef.current = null;
    };
  }, [pageAnims]);

  // The quotes' player goes live before the engine, like the sprites'.
  useLayoutEffect(() => (bookRef.current ? quote.attach(bookRef.current) : undefined), [quote]);

  useLayoutEffect(() => {
    const book = bookRef.current;
    const turnHost = hostRef.current;
    if (!book || !turnHost) return;

    const engine = createFlipEngine({
      book,
      turnHost,
      // Read at the moment a turn needs them, so a quote's language is always
      // the one it is in NOW.
      getSpreads: () => quote.mapSpreads(spreadsRef.current),
      getSpread: () => spreadRef.current,
      onSpreadChange,
      onTurnActive,
      tapTarget: quote.tapAt,
      liftSrc: (page) => pageAnimRef.current?.frozenSrc(page.n) ?? null,
    });
    engineRef.current = engine;
    onEngineReady?.(engine);
    // Dev-only handle for the browser checks (the riffle probe among them).
    if (import.meta.env.DEV) (window as unknown as { __flip?: FlipEngine }).__flip = engine;

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [onSpreadChange, onEngineReady, onTurnActive, quote]);

  // DEVIATION 2: the turn layer is dropped HERE, after React has committed the
  // new static spread — not inside the engine's completion callback, where the
  // removal would land a frame before the new spread renders and flash the old
  // one. The engine defers the removal further until these <img> elements have
  // actually decoded; see `handoff`.
  useLayoutEffect(() => {
    const images = [leftImgRef.current, rightImgRef.current].filter(
      (img): img is HTMLImageElement => img !== null,
    );
    engineRef.current?.handoff(images);
  }, [spread]);

  // The open spread's animated pages, to the player: it shows them once the
  // book has settled (now, if nothing is turning), and keeps the atlases either
  // side decoded.
  useLayoutEffect(() => {
    pageAnimRef.current?.setSlots(spread, spreads, [leftAnimRef.current, rightAnimRef.current]);
  }, [spread, spreads, pageAnims]);

  // …and its quote pages, to theirs.
  useLayoutEffect(() => {
    quote.setSlots(spread, spreads, [leftQuoteRef.current, rightQuoteRef.current]);
  }, [quote, spread, spreads]);

  // Frozen-t scrub for tuning BETA / STRIP_COUNT / the ease. `import.meta.env.DEV`
  // is replaced with `false` in a production build, so the branch and its import
  // are both dropped by tree-shaking.
  useEffect(() => {
    const engine = engineRef.current;
    if (!import.meta.env.DEV || !debug || !engine) return;
    return attachFixedT(engine);
  }, [debug]);

  // Decode the adjacent spreads ahead of the turn that needs them — an undecoded
  // page would otherwise stall the first flip.
  useEffect(() => {
    const srcs = new Set<string>();
    const shown = quote.mapSpreads(spreads);
    for (const i of [spread - 1, spread + 1]) {
      const adjacent = shown[i];
      if (!adjacent) continue;
      for (const page of adjacent) if (page) srcs.add(page.src);
    }
    for (const src of srcs) {
      const img = new Image();
      img.src = src;
      img.decode().catch(() => {}); // decode() rejects if the image is swapped out
    }
  }, [quote, spread, spreads]);

  // Guard the index: a caller that hasn't clamped shouldn't throw here. The
  // pages as printed (what the layers are keyed on), and as shown.
  const [left, right] = spreads[spread] ?? [null, null];
  const shownSpread = quote.mapSpreads(spreads)[spread] ?? [null, null];
  const [leftSrc, rightSrc] = [shownSpread[0]?.src, shownSpread[1]?.src];
  const leftQuote = left && quoteOnPage(left.n);
  const rightQuote = right && quoteOnPage(right.n);

  // Which closed/open position the book rests at (drives the settled slide via
  // CSS; the engine takes over inline during a cover/back turn).
  const pos = spread === 0 ? 'cover' : spread >= spreads.length - 1 ? 'back' : 'mid';

  return (
    <div className="book-stage">
      <div className="book" ref={setBook} data-pos={pos}>
        <div className="book__page book__page--left" ref={leftSlotRef}>
          {left && (
            <img ref={leftImgRef} src={leftSrc} data-file={fileOf(left)} alt={altFor(left)} draggable={false} />
          )}
          {pageAnims && left?.plate && animsOnPage(left.n).length > 0 && (
            <PageAnimLayer key={left.n} page={left} ref={leftAnimRef} />
          )}
          {left?.plate && leftQuote && <QuoteLayer key={left.n} page={left} quote={leftQuote} ref={leftQuoteRef} />}
        </div>
        <div className="book__page book__page--right" ref={rightSlotRef}>
          {right && (
            <img ref={rightImgRef} src={rightSrc} data-file={fileOf(right)} alt={altFor(right)} draggable={false} />
          )}
          {pageAnims && right?.plate && animsOnPage(right.n).length > 0 && (
            <PageAnimLayer key={right.n} page={right} ref={rightAnimRef} />
          )}
          {right?.plate && rightQuote && (
            <QuoteLayer key={right.n} page={right} quote={rightQuote} ref={rightQuoteRef} />
          )}
        </div>
        <div className="book__turn-host" ref={hostRef} />
      </div>

      {/* The cover's hover animations. Deliberately a SIBLING of `.book`, not a
          child: everything inside `.book` has `pointer-events: none` so the book
          can own the drag, and the turn layer replaces that subtree wholesale
          mid-flip. Kept out of both, this box just sits on the cover slot — which
          at `data-pos="cover"` is exactly the hero rect (see the CSS).

          It exists only while the closed cover is genuinely at rest: spread 0,
          no turn in the air. `turning` flips true inside `startTurn`, before the
          leaf has moved, so the layer is gone by the first frame of the lift. */}
      {anims && spread === 0 && !turning && (
        <div className="book-anim">
          <CoverAnimLayer manifest={anims} listen={bookEl} boilWith={coverSlot} />
        </div>
      )}
      {/* The back cover's, on exactly the mirrored rule: the last spread, nothing
          in the air. At data-pos="back" the book slides the other way and its
          LEFT slot lands on the hero rect — the same box as the cover's, so the
          same `.book-anim` placement holds. */}
      {anims && spread === spreads.length - 1 && !turning && (
        <div className="book-anim">
          <CoverAnimLayer manifest={anims} listen={bookEl} face="back" boilWith={backSlot} />
        </div>
      )}
    </div>
  );
}
