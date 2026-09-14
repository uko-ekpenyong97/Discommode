import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { charDelayMs } from '../portfolioMotion';
import { useScroller } from '../scrollerContext';
import type { Block, Media, Stat, TwoUpColumn } from './types';
import './blocks.css';

/**
 * The block renderers — one per variant of {@link Block}, plus the two media
 * components that need to know where the scroller is (a video only plays while
 * it is on screen; a Rive artboard only exists while it is within a viewport of
 * it, so nothing is left running behind the scrim).
 *
 * Every block is a reveal target: it carries the reveal class and `data-reveal`
 * for its page's IntersectionObserver to pick up, and a `--reveal-delay` from
 * its position among its run's siblings. The animations themselves are entirely
 * in `reveal.css` — nothing here animates.
 */

/**
 * Which reveal a block gets. A title animates its CHARACTERS, so the block
 * itself must not fade as one lump — it only carries `data-reveal` so the
 * observer has something to switch on. Everything else takes the standard
 * reveal, or the 3D flip when the project asks for one.
 */
function revealClass(block: Block): string {
  if (block.type === 'title') return 'pv-block reveal-chars';
  // The letterhead is what the section's CAPTURE is a picture of, so it must
  // be at rest in that capture rather than part-way through a reveal.
  if (block.type === 'letterhead') return 'pv-block';
  return block.flip ? 'pv-block reveal-flip' : 'pv-block reveal';
}

/** The page's grid: twelve columns between the two insets. */
const GRID_COLUMNS = 12;

/**
 * How many of the twelve a block takes when the project does not say.
 *
 * Everything is the full measure. That is the whole change from the 656px
 * column this replaced: a page is as wide as the sheet it is printed on, text
 * runs to the right inset, and media spans the measure rather than sitting in a
 * gutter of its own. The blocks that are already several things side by side divide the
 * twelve INSIDE themselves rather than each taking a share of it — a nested
 * grid on the same gutter lands on exactly the same lines, and it keeps
 * `twoUp`'s two cells one block rather than two.
 */
function spanOf(block: Block): number {
  return block.span ?? GRID_COLUMNS;
}

/**
 * Crossfade placeholder → loaded. The class is added imperatively rather than
 * held in state: there are up to five articles of media on screen, and none of
 * them should cost a render when a byte arrives. The callback ref covers the
 * cached case, where `load` has already fired by the time React attaches.
 */
function markLoaded(el: HTMLElement | null): void {
  el?.classList.add('is-loaded');
}

function imageRef(el: HTMLImageElement | null): void {
  if (el?.complete) markLoaded(el);
}

/** `HTMLMediaElement.HAVE_CURRENT_DATA` — a frame is decoded and paintable. */
const HAVE_CURRENT_DATA = 2;

/** ↗ — the LinkPill's "this leaves the site" mark. */
function ExternalIcon() {
  return (
    <svg className="pv-linkpill__icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="M6 3h7v7M13 3 4 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * A muted, looping clip that plays only while it is on screen. Pausing out of
 * view is not a nicety: every page of a project is mounted at once, all in the
 * same rect, and the view can be closed at any scroll position — a decoding
 * video costs frames wherever it is, including under a sheet.
 */
function VideoMedia({
  src,
  poster,
  w,
  h,
  className,
}: {
  src: string;
  poster: string;
  w: number;
  h: number;
  className?: string;
}) {
  const scroller = useScroller();
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // TWO conditions, not one. On screen is the obvious half; the other is that
    // this clip's PAGE is still being read — a page that is not the live one is
    // `visibility: hidden`, and a page part-way through its exit is tilting
    // away at 58% with nobody watching it. IntersectionObserver notices
    // neither, so without this a video would keep decoding behind a sheet.
    // `pv:shown` is the Scroller telling us either has changed.
    const page = el.closest<HTMLElement>('.pv-page');
    let onScreen = false;
    const sync = () => {
      const showing =
        !page || (page.style.visibility !== 'hidden' && !page.hasAttribute('data-exiting'));
      if (onScreen && showing) void el.play().catch(() => {});
      else el.pause();
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        sync();
      },
      { root: el.closest('.pv-page__scroll') ?? scroller, threshold: 0.01 },
    );
    io.observe(el);
    page?.addEventListener('pv:shown', sync);

    // The crossfade is driven off a native listener, not React's
    // `onLoadedData`: `loadeddata` can already have fired by the time the
    // handler is attached, and then the clip would sit at opacity 0 while
    // happily playing. Check the state we have, then listen for the rest.
    const onData = () => markLoaded(el);
    if (el.readyState >= HAVE_CURRENT_DATA) onData();
    el.addEventListener('loadeddata', onData);

    return () => {
      io.disconnect();
      page?.removeEventListener('pv:shown', sync);
      el.removeEventListener('loadeddata', onData);
      el.pause();
    };
  }, [scroller]);

  return (
    <video
      ref={ref}
      className={className ? `pv-video ${className}` : 'pv-video'}
      poster={poster}
      muted
      loop
      playsInline
      preload="metadata"
      src={src}
      // The intrinsic size, so the box is the right height before a byte of
      // video arrives — with `width: 100%; height: auto` the browser derives
      // the aspect ratio from these and reserves the space.
      width={w}
      height={h}
    />
  );
}

/** Rive files start with the ASCII fingerprint "RIVE". */
function isRiv(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false;
  const head = new Uint8Array(buffer, 0, 4);
  return head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x56 && head[3] === 0x45;
}

/**
 * A Rive artboard, mounted only once the block is within ONE VIEWPORT of the
 * scroll position and torn down the moment it leaves (or the view closes) — a
 * Rive instance runs its own rAF loop, so one left alive behind the scrim would
 * cost frames on the grid for as long as the tab is open.
 *
 * Its observer is rooted on the page's own scroll box, and the margin then
 * means what it says: one viewport of warning in either direction. Rooted
 * anywhere further out, an ancestor clip would be applied before the root
 * margin was and the artboard would only ever mount as it came into view.
 *
 * The `.riv` is fetched first and the runtime imported only if those bytes
 * exist: a project that has no artboard yet costs one 404, not a megabyte of
 * WASM. Until then the block renders its own animated stand-in, which mounts
 * and unmounts on exactly the same schedule — so the lazy-mount behaviour is
 * still what you are looking at.
 */
function RiveBlock({
  src,
  artboard,
  stateMachine,
  label,
  w,
  h,
}: {
  src: string;
  artboard?: string;
  stateMachine?: string;
  label?: string;
  w: number;
  h: number;
}) {
  const scroller = useScroller();
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);
  const [missing, setMissing] = useState(false);

  // Within one viewport, in either direction — the lazy-mount window.
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), {
      root: el.closest('.pv-page__scroll') ?? scroller,
      rootMargin: '100% 0px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, [scroller]);

  useEffect(() => {
    if (!near) return;
    let cancelled = false;
    let instance: { cleanup: () => void } | null = null;

    void (async () => {
      let buffer: ArrayBuffer;
      try {
        const res = await fetch(src);
        if (!res.ok) throw new Error(String(res.status));
        buffer = await res.arrayBuffer();
        // A missing file is not always a 404: the dev server answers an unknown
        // path with the SPA's index.html, and Vite's preview does the same. The
        // fingerprint is the only reliable "are these Rive bytes?".
        if (!isRiv(buffer)) throw new Error('not a .riv');
      } catch {
        if (!cancelled) setMissing(true);
        return;
      }
      try {
        const rive = await import('@rive-app/canvas');
        if (cancelled || !canvasRef.current) return;
        instance = new rive.Rive({
          buffer,
          canvas: canvasRef.current,
          artboard,
          stateMachines: stateMachine,
          autoplay: true,
          onLoadError: () => setMissing(true),
        });
      } catch {
        if (!cancelled) setMissing(true);
      }
    })();

    return () => {
      cancelled = true;
      instance?.cleanup();
    };
  }, [near, src, artboard, stateMachine]);

  return (
    // The artboard's ratio holds the box open from the first frame: the lazy
    // mount has to be invisible to layout, or arriving at the block would
    // lengthen the page and move every page start behind it.
    <div className="pv-rive" ref={hostRef} style={{ aspectRatio: `${w} / ${h}` }}>
      {near &&
        (missing ? (
          <div className="pv-rive__stand-in" role="img" aria-label={label ?? 'Animation placeholder'}>
            <span className="pv-rive__orbit" />
            <span className="pv-rive__label">{label ?? 'RIVE'}</span>
          </div>
        ) : (
          <canvas ref={canvasRef} className="pv-rive__canvas" width={1200} height={800} />
        ))}
    </div>
  );
}

function MediaView({ media, className }: { media: Media; className?: string }) {
  if (media.kind === 'video') {
    return (
      <VideoMedia
        src={media.src}
        poster={media.poster}
        w={media.w}
        h={media.h}
        className={className}
      />
    );
  }
  return (
    <img
      ref={imageRef}
      className={className ? `pv-img ${className}` : 'pv-img'}
      src={media.src}
      alt={media.alt ?? ''}
      loading="lazy"
      decoding="async"
      draggable={false}
      // Same reason as the video: the box has to be its final height before the
      // image decodes, or the page grows under the reader and every page start
      // behind it moves.
      width={media.w}
      height={media.h}
      onLoad={(e) => markLoaded(e.currentTarget)}
    />
  );
}

/** A ~120px display heading, one span per character. */
function Title({ text }: { text: string }) {
  const chars = [...text];
  return (
    <h1 className="pv-title">
      {chars.map((ch, i) => (
        <span
          // Characters repeat; the index IS the identity here.
          key={`${i}-${ch}`}
          className="reveal-char"
          style={{ transitionDelay: `${charDelayMs(i)}ms` }}
          aria-hidden={ch === ' ' ? true : undefined}
        >
          {ch === ' ' ? ' ' : ch}
        </span>
      ))}
    </h1>
  );
}

/**
 * A LIST ROW: text on the left across seven columns, media pinned to the right
 * across five. The reference's works list — the shape a project takes when what
 * it is saying is a table of things rather than an argument.
 */
function RowBlock({ heading, text, media }: { heading: string; text: string; media: Media }) {
  return (
    <div className="pv-row">
      <div className="pv-row__text">
        <h3 className="pv-heading">{heading}</h3>
        <p className="pv-body">{text}</p>
      </div>
      <div className="pv-row__media">
        <div className="pv-frame">
          <MediaView media={media} />
        </div>
      </div>
    </div>
  );
}

function TwoUpCell({ column }: { column: TwoUpColumn }) {
  return (
    <div className="pv-twoup__cell">
      <div className="pv-frame">
        <MediaView media={column.media} />
      </div>
      <p className="pv-twoup__text">{column.text}</p>
    </div>
  );
}

function StatCell({ stat }: { stat: Stat }) {
  return (
    <div className="pv-stat">
      <img
        ref={imageRef}
        className="pv-img"
        src={stat.src}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        width={stat.w}
        height={stat.h}
        onLoad={(e) => markLoaded(e.currentTarget)}
      />
      <span className="pv-stat__label">{stat.label}</span>
    </div>
  );
}

function BlockBodyView({ block }: { block: Block }) {
  switch (block.type) {
    case 'letterhead':
      return (
        <header className="pv-letterhead-block">
          <span className="pv-letterhead-block__no">{block.no}</span>
          <h2 className="pv-letterhead-block__title">{block.title}</h2>
          <span className="pv-letterhead-block__ref">{block.ref}</span>
        </header>
      );
    case 'title':
      return <Title text={block.text} />;
    case 'caption':
      return <p className="pv-caption">{block.text}</p>;
    case 'text':
      return (
        <>
          <h3 className="pv-heading">{block.heading}</h3>
          {block.body.map((para, i) => (
            <p key={i} className="pv-body">
              {para}
            </p>
          ))}
        </>
      );
    case 'twoUp':
      return (
        <div className="pv-twoup">
          <TwoUpCell column={block.columns[0]} />
          <TwoUpCell column={block.columns[1]} />
        </div>
      );
    case 'row':
      return <RowBlock heading={block.heading} text={block.text} media={block.media} />;
    case 'image':
      return (
        <figure className="pv-figure">
          <div className="pv-frame">
            <MediaView
              media={{ kind: 'image', src: block.src, alt: block.alt, w: block.w, h: block.h }}
            />
          </div>
          {block.caption && <figcaption className="pv-figcaption">{block.caption}</figcaption>}
        </figure>
      );
    case 'statGrid':
      return (
        <div className="pv-stats">
          {block.stats.map((stat) => (
            <StatCell key={stat.label} stat={stat} />
          ))}
        </div>
      );
    case 'linkPill':
      return (
        <a className="pv-linkpill" href={block.href} target="_blank" rel="noreferrer noopener">
          <span>{block.label}</span>
          <ExternalIcon />
        </a>
      );
    case 'video':
      return (
        <figure className="pv-figure">
          <div className="pv-frame">
            <VideoMedia src={block.src} poster={block.poster} w={block.w} h={block.h} />
          </div>
          {block.caption && <figcaption className="pv-figcaption">{block.caption}</figcaption>}
        </figure>
      );
    case 'rive':
      return (
        <RiveBlock
          src={block.src}
          artboard={block.artboard}
          stateMachine={block.stateMachine}
          label={block.label}
          w={block.w}
          h={block.h}
        />
      );
  }
}

/**
 * One block, wrapped in its reveal target — and placed on the page's grid.
 *
 * `--reveal-delay` staggers it behind its siblings in the same run; `--pv-span`
 * is how many of the twelve columns it takes. A `bleed` block leaves the grid
 * entirely and runs to the page's own edges.
 */
export function BlockView({ block, index }: { block: Block; index: number }) {
  const bleed =
    (block.type === 'image' || block.type === 'video' || block.type === 'rive') && block.bleed;
  const className = bleed ? `${revealClass(block)} pv-block--bleed` : revealClass(block);
  return (
    <div
      data-reveal=""
      data-block={block.type}
      className={className}
      style={
        {
          '--reveal-delay': `calc(var(--pv-reveal-stagger, 30ms) * ${index})`,
          '--pv-span': spanOf(block),
        } as CSSProperties
      }
    >
      <BlockBodyView block={block} />
    </div>
  );
}
