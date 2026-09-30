import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Page, Spread } from './issue-01';
import { pageLabel } from './issue-01';
import { createFlipEngine } from './flipEngine';
import type { FlipEngine } from './flipEngine';
import { attachFixedT } from './devFixedT';
import { CoverAnimLayer } from '../components/CoverAnimLayer';
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
}

/** 'COVER' / 'BACK' for the plates, 'Page 07' for a numbered page. */
const altFor = (page: Page): string => page.label ?? `Page ${pageLabel(page)}`;

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
  const onTurnActive = useCallback((active: boolean) => setTurning(active), []);
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

  useLayoutEffect(() => {
    const book = bookRef.current;
    const turnHost = hostRef.current;
    if (!book || !turnHost) return;

    const engine = createFlipEngine({
      book,
      turnHost,
      getSpreads: () => spreadsRef.current,
      getSpread: () => spreadRef.current,
      onSpreadChange,
      onTurnActive,
    });
    engineRef.current = engine;
    onEngineReady?.(engine);
    // Dev-only handle for the browser checks (the riffle probe among them).
    if (import.meta.env.DEV) (window as unknown as { __flip?: FlipEngine }).__flip = engine;

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [onSpreadChange, onEngineReady, onTurnActive]);

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
    for (const i of [spread - 1, spread + 1]) {
      const adjacent = spreads[i];
      if (!adjacent) continue;
      for (const page of adjacent) if (page) srcs.add(page.src);
    }
    for (const src of srcs) {
      const img = new Image();
      img.src = src;
      img.decode().catch(() => {}); // decode() rejects if the image is swapped out
    }
  }, [spread, spreads]);

  // Guard the index: a caller that hasn't clamped shouldn't throw here.
  const [left, right] = spreads[spread] ?? [null, null];

  // Which closed/open position the book rests at (drives the settled slide via
  // CSS; the engine takes over inline during a cover/back turn).
  const pos = spread === 0 ? 'cover' : spread >= spreads.length - 1 ? 'back' : 'mid';

  return (
    <div className="book-stage">
      <div className="book" ref={setBook} data-pos={pos}>
        <div className="book__page book__page--left" ref={leftSlotRef}>
          {left && (
            <img ref={leftImgRef} src={left.src} alt={altFor(left)} draggable={false} />
          )}
        </div>
        <div className="book__page book__page--right" ref={rightSlotRef}>
          {right && (
            <img ref={rightImgRef} src={right.src} alt={altFor(right)} draggable={false} />
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
