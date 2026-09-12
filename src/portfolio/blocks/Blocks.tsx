import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { charDelayMs } from '../portfolioMotion';
import { useScroller } from '../scroller';
import type { Block, Media, Stat, TwoUpColumn } from './types';
import './blocks.css';

/**
 * The block renderers — one per variant of {@link Block}, plus the two media
 * components that need to know where the scroller is (a video only plays while
 * it is on screen; a Rive artboard only exists while it is within a viewport of
 * it, so nothing is left running behind the scrim).
 *
 * Every block is a reveal target: it carries the reveal class and `data-reveal`
 * for the sheet's single IntersectionObserver to pick up, and a
 * `--reveal-delay` from its position among its section's siblings. The
 * animations themselves are entirely in `reveal.css` — nothing here animates.
 */

/**
 * Which reveal a block gets. A title animates its CHARACTERS, so the block
 * itself must not fade as one lump — it only carries `data-reveal` so the
 * observer has something to switch on. Everything else takes the standard
 * reveal, or the 3D flip when the project asks for one.
 */
function revealClass(block: Block): string {
  if (block.type === 'title') return 'pv-block reveal-chars';
  return block.flip ? 'pv-block reveal-flip' : 'pv-block reveal';
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
 * view is not a nicety: every page of a project is mounted at once and the
 * sheet can be closed at any scroll position, and a decoding video costs frames
 * wherever it is.
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
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void el.play().catch(() => {});
        else el.pause();
      },
      { root: scroller, threshold: 0.01 },
    );
    io.observe(el);

    // The crossfade is driven off a native listener, not React's
    // `onLoadedData`: `loadeddata` can already have fired by the time the
    // handler is attached, and then the clip would sit at opacity 0 while
    // happily playing. Check the state we have, then listen for the rest.
    const onData = () => markLoaded(el);
    if (el.readyState >= HAVE_CURRENT_DATA) onData();
    el.addEventListener('loadeddata', onData);

    return () => {
      io.disconnect();
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
 * Its observer is rooted on the PAGE, not the sheet scroller — the one place in
 * the view that differs. A page clips its own content, and an ancestor clip is
 * applied before the root margin is, so a margin measured against the scroller
 * would be thrown away at the page's edge and the artboard would only ever
 * mount as it came into view. Rooted on the page the margin means what it says:
 * one viewport of warning in either direction.
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
      root: el.closest('.pv-page') ?? scroller,
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

/** One block, wrapped in its reveal target. `--reveal-delay` staggers it behind
 *  its siblings in the same section. */
export function BlockView({ block, index }: { block: Block; index: number }) {
  const bleed = block.type === 'image' && block.bleed;
  const className = bleed ? `${revealClass(block)} pv-block--bleed` : revealClass(block);
  return (
    <div
      data-reveal=""
      data-block={block.type}
      className={className}
      style={{ '--reveal-delay': `calc(var(--pv-reveal-stagger, 30ms) * ${index})` } as CSSProperties}
    >
      <BlockBodyView block={block} />
    </div>
  );
}
