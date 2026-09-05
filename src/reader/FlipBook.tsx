import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { Spread } from './issue-01';
import { createFlipEngine } from './flipEngine';
import type { FlipEngine } from './flipEngine';
import { attachFixedT } from './devFixedT';
import './flipbook.css';

interface FlipBookProps {
  spreads: Spread[];
  spread: number;
  onSpreadChange: (index: number) => void;
  /** Dev-only frozen-t scrub, from `#read-NN?debug`. */
  debug?: boolean;
}

const label = (n: number): string => String(n).padStart(2, '0');

/**
 * Renders the STATIC spread and the empty host the engine builds its turn layer
 * into — and nothing else. React never re-renders per frame; it only hears back
 * from the engine once a turn has completed, via `onSpreadChange`.
 *
 * The prev/next buttons live outside `.book` on purpose: `.book *` has
 * `pointer-events: none` so the book element itself can own the drag.
 */
export function FlipBook({ spreads, spread, onSpreadChange, debug = false }: FlipBookProps) {
  const bookRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<FlipEngine | null>(null);
  const leftImgRef = useRef<HTMLImageElement>(null);
  const rightImgRef = useRef<HTMLImageElement>(null);

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
    });
    engineRef.current = engine;

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [onSpreadChange]);

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

  const turnPrev = useCallback(() => engineRef.current?.turn('prev'), []);
  const turnNext = useCallback(() => engineRef.current?.turn('next'), []);

  const [left, right] = spreads[spread];

  return (
    <div className="book-stage">
      <button
        type="button"
        className="book-nav book-nav--prev"
        aria-label="Previous spread"
        disabled={spread === 0}
        onClick={turnPrev}
      >
        &lsaquo;
      </button>

      <div className="book" ref={bookRef}>
        <div className="book__page book__page--left">
          {left && (
            <img ref={leftImgRef} src={left.src} alt={`Page ${label(left.n)}`} draggable={false} />
          )}
        </div>
        <div className="book__page book__page--right">
          {right && (
            <img ref={rightImgRef} src={right.src} alt={`Page ${label(right.n)}`} draggable={false} />
          )}
        </div>
        <div className="book__turn-host" ref={hostRef} />
      </div>

      <button
        type="button"
        className="book-nav book-nav--next"
        aria-label="Next spread"
        disabled={spread >= spreads.length - 1}
        onClick={turnNext}
      >
        &rsaquo;
      </button>
    </div>
  );
}
