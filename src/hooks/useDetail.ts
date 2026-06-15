import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CONTENT, CONTENT_COUNT, indexForSlug } from '../content';
import { config } from '../config';
import { mod } from '../grid';

export type DetailMode = 'grid' | 'detail';
/** 'enter' / 'exit' are the transition phases; 'active' is settled in detail. */
export type DetailPhase = 'enter' | 'active' | 'exit';

/** The clicked card's on-screen rect — the FLIP transition expands from here. */
export interface FlipOrigin {
  /** Card centre in viewport px. */
  cx: number;
  cy: number;
  /** Card size in viewport px (already scaled). */
  w: number;
  h: number;
}

export interface DetailController {
  mode: DetailMode;
  /** Content index of the active detail item. */
  activeIndex: number;
  phase: DetailPhase;
  /** The grid card the view was opened from — the FLIP origin (null = deep-link). */
  origin: FlipOrigin | null;
  /** True during the grid↔detail transition — input should be ignored. */
  transitioning: boolean;
  /** Open the detail view on an item (from the grid), optionally from a card rect. */
  open: (index: number, origin?: FlipOrigin | null) => void;
  /** Switch the active item without leaving detail (mini-map, dropdown, sides). */
  goto: (index: number) => void;
  next: () => void;
  prev: () => void;
  /** Leave detail and return to the grid. */
  close: () => void;
}

function hashSlug(): string {
  return window.location.hash.replace(/^#/, '');
}
function pushDetail(index: number): void {
  window.history.pushState(null, '', `#${CONTENT[index].slug}`);
}
function pushGrid(): void {
  window.history.pushState(null, '', window.location.pathname + window.location.search);
}

/**
 * App-level mode + routing for the detail view. The URL hash is the shared
 * source of truth: a slug means detail, no hash means grid. User actions update
 * state and push history; browser back/forward arrive as `popstate` and the
 * state follows. Exiting clears the hash and calls `onExitFocus` with the item
 * just viewed so the grid can re-centre on it (shortest-path glide).
 */
export function useDetail(onExitFocus: (index: number) => void): DetailController {
  const initial = indexForSlug(hashSlug());
  const [mode, setMode] = useState<DetailMode>(initial >= 0 ? 'detail' : 'grid');
  const [activeIndex, setActiveIndex] = useState(initial >= 0 ? initial : 0);
  const [phase, setPhase] = useState<DetailPhase>(initial >= 0 ? 'enter' : 'active');
  // FLIP origin: the card rect a click opened from. Null for deep-link / back
  // (no originating card) → the transition falls back to a centred scale.
  const [origin, setOrigin] = useState<FlipOrigin | null>(null);

  const modeRef = useRef(mode);
  const activeRef = useRef(activeIndex);
  const onExitFocusRef = useRef(onExitFocus);
  useLayoutEffect(() => {
    modeRef.current = mode;
    activeRef.current = activeIndex;
    onExitFocusRef.current = onExitFocus;
  });

  const exitTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Finish leaving detail: focus the grid on the viewed item, then show grid.
  const finishExit = useCallback(() => {
    onExitFocusRef.current(activeRef.current);
    setMode('grid');
    setPhase('active');
  }, []);

  // Begin the exit transition; the grid appears after detailTransitionMs.
  // (Reduced motion keeps the timing but cuts to an opacity-only fade in CSS.)
  const startExit = useCallback(() => {
    if (modeRef.current !== 'detail') return;
    setPhase('exit');
    clearTimeout(exitTimer.current);
    exitTimer.current = setTimeout(finishExit, config.detailTransitionMs);
  }, [finishExit]);

  const open = useCallback((index: number, from: FlipOrigin | null = null) => {
    if (modeRef.current !== 'grid') return;
    modeRef.current = 'detail'; // synchronously block a duplicate open in the same tick
    pushDetail(index);
    clearTimeout(exitTimer.current);
    setOrigin(from);
    setActiveIndex(index);
    setMode('detail');
    setPhase('enter');
  }, []);

  const goto = useCallback((index: number) => {
    if (modeRef.current !== 'detail' || index === activeRef.current) return;
    pushDetail(index);
    setActiveIndex(index);
  }, []);

  const next = useCallback(() => goto(mod(activeRef.current + 1, CONTENT_COUNT)), [goto]);
  const prev = useCallback(() => goto(mod(activeRef.current - 1, CONTENT_COUNT)), [goto]);

  const close = useCallback(() => {
    if (modeRef.current !== 'detail') return;
    pushGrid();
    startExit();
  }, [startExit]);

  // Drive the enter transition: paint the 'enter' state, then flip to 'active'
  // on the next frame so the CSS transition animates.
  useEffect(() => {
    if (phase !== 'enter') return;
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setPhase('active')));
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  // Browser back/forward: reconcile state to the hash.
  useEffect(() => {
    const sync = () => {
      const idx = indexForSlug(hashSlug());
      if (idx >= 0) {
        clearTimeout(exitTimer.current);
        if (modeRef.current === 'grid') {
          setOrigin(null); // back/forward into detail has no originating card rect
          setActiveIndex(idx);
          setMode('detail');
          setPhase('enter');
        } else {
          setActiveIndex(idx);
        }
      } else if (modeRef.current === 'detail') {
        startExit();
      }
    };
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
    };
  }, [startExit]);

  // Esc closes from anywhere in detail.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modeRef.current === 'detail') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  return {
    mode,
    activeIndex,
    phase,
    origin,
    transitioning: phase !== 'active',
    open,
    goto,
    next,
    prev,
    close,
  };
}
