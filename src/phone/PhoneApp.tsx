import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { CONTENT } from '../content';
import type { PosterItem } from '../content';
import { buildSpreads, issue01, issueCover, pageLabel } from '../reader/issue-01';
import type { Page } from '../reader/issue-01';
import { projectById } from '../portfolio/projects';
import type { Block, Media, Paragraph, Project } from '../portfolio/blocks/types';
import { PillFace, ShapeFace } from '../chrome/Paper';

/**
 * THE PHONE DOOR (docs/mobile.md). A phone does not get the desktop
 * experience — no three.js, no sky, no fluid, no reader engine — but the
 * same things to read, in the same language: the issue's cover and a way in,
 * its pages as a stack, and the three projects as pages that scroll.
 *
 * The desktop's links work here: `#read-01/<spread>` opens the stack at that
 * spread's first page (and the hash follows the scroll, so a link copied from
 * here opens there on a desktop too), `#item-NN` and `#view-NN[/page]` open
 * project NN, anything else (and `#item-01`, the issue's card) is the door.
 */

type Route =
  | { view: 'door' }
  | { view: 'stack'; spread: number }
  | { view: 'project'; item: PosterItem; project: Project };

function routeOf(hash: string): Route {
  const h = hash.replace(/^#/, '').split('?')[0];
  const read = h.match(/^read-(\d+)(?:\/(\d+))?$/);
  if (read) return { view: 'stack', spread: read[2] ? Number(read[2]) : 0 };
  const item = h.match(/^(?:item|view)-(\d+)(?:\/\d+)?$/);
  if (item) {
    const it = CONTENT.find((c) => c.slug === `item-${item[1].padStart(2, '0')}`);
    const project = it?.project ? projectById(it.project) : null;
    if (it && project) return { view: 'project', item: it, project };
  }
  return { view: 'door' };
}

const subscribe = (fn: () => void) => {
  window.addEventListener('hashchange', fn);
  return () => window.removeEventListener('hashchange', fn);
};
const getHash = () => window.location.hash;

/** `?phone` (a desktop looking at the door) is kept on every link. */
const keep = () => {
  const q = window.location.hash.split('?')[1];
  return q ? `?${q}` : '';
};
const href = (h: string) => `#${h}${keep()}`;

export default function PhoneApp() {
  const hash = useSyncExternalStore(subscribe, getHash);
  const route = routeOf(hash);
  const key = route.view === 'project' ? `p-${route.item.slug}` : route.view;
  // A new view starts at its top (the stack scrolls itself to its page).
  useLayoutEffect(() => {
    if (route.view !== 'stack') window.scrollTo(0, 0);
  }, [key, route.view]);
  return (
    <div className="ph" data-view={route.view} data-chrome="">
      {route.view === 'door' && <Door />}
      {route.view === 'stack' && <Stack spread={route.spread} />}
      {route.view === 'project' && <ProjectPage item={route.item} project={route.project} />}
    </div>
  );
}

function Pill({ to, children, label }: { to: string; children: ReactNode; label?: string }) {
  return (
    <a className="paper ph-pill" href={href(to)} aria-label={label}>
      <PillFace>{children}</PillFace>
    </a>
  );
}

function Back() {
  return (
    <a className="paper ph-back" href={href('')} aria-label="Back to the door">
      <ShapeFace shape="escape" />
    </a>
  );
}

// ── the door ───────────────────────────────────────────────────────────

function Door() {
  const projects = CONTENT.filter((c) => c.project);
  return (
    <main className="ph-door">
      <h1 className="ph-mast">Discommode</h1>
      <a className="ph-cover" href={href('read-01')} aria-label="Read Issue 01">
        <img src={issueCover('01')} width={1000} height={1300} alt="Discommode, Issue 01: the cover" />
      </a>
      {/* PLACEHOLDER COPY — the final wording is Uko's (docs/mobile.md). */}
      <p className="ph-note">
        Discommode is made for bigger screens: the moving covers, the sky, the paper that turns. On a phone, here is the
        lighter way in.
      </p>
      <div className="ph-actions">
        <Pill to="read-01">Read Issue 01</Pill>
      </div>
      <h2 className="ph-h2">The work</h2>
      <ul className="ph-cards">
        {projects.map((c) => (
          <li key={c.slug}>
            <a className="ph-card" href={href(c.slug)}>
              <img src={c.image} width={900} height={1200} alt="" loading="lazy" decoding="async" />
              <span className="ph-card__no">{c.title}</span>
              <span className="ph-card__caption">{c.captions.slice(1).join(' · ')}</span>
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}

// ── Issue 01, as a stack ───────────────────────────────────────────────

const SPREADS = buildSpreads(issue01);
/** The pages in reading order, the reader's cover and back (the drawn, resting ones). */
const PAGES: Page[] = SPREADS.flat().filter((p): p is Page => !!p);
const spreadOf = (n: number) => SPREADS.findIndex((s) => s.some((p) => p?.n === n));

function Stack({ spread }: { spread: number }) {
  const first = SPREADS[Math.max(0, Math.min(SPREADS.length - 1, spread))]?.find((p) => p) ?? PAGES[0];
  const listRef = useRef<HTMLOListElement>(null);
  // Open at the linked spread's first page.
  useLayoutEffect(() => {
    const el = document.getElementById(`ph-page-${first.n}`);
    if (el && first.n !== PAGES[0].n) el.scrollIntoView({ block: 'start' });
    else window.scrollTo(0, 0);
    // Once, on arrival: the hash written below must not scroll the stack again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The hash follows the page at the top, so a copied link opens there.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const n = Number((e.target as HTMLElement).dataset.n);
          const next = `#read-01/${spreadOf(n)}${keep()}`;
          if (window.location.hash !== next) history.replaceState(null, '', next);
        }
      },
      { rootMargin: '-45% 0px -54% 0px' },
    );
    for (const li of list.children) io.observe(li);
    return () => io.disconnect();
  }, []);
  return (
    <main className="ph-stack">
      <header className="ph-bar">
        <Back />
        <span className="ph-bar__title">Issue 01</span>
      </header>
      <ol className="ph-pages" ref={listRef}>
        {PAGES.map((p, i) => (
          <li key={p.n} id={`ph-page-${p.n}`} data-n={p.n} className="ph-page">
            <img
              src={p.src}
              srcSet={p.riffle ? `${p.riffle} 1000w, ${p.src} 2000w` : undefined}
              sizes={p.riffle ? '(min-width: 760px) 720px, 100vw' : undefined}
              width={issue01.pageW / 2}
              height={issue01.pageH / 2}
              loading={i < 2 ? 'eager' : 'lazy'}
              decoding="async"
              alt={`Page ${pageLabel(p)}`}
            />
            <span className="ph-page__label">{pageLabel(p)}</span>
          </li>
        ))}
      </ol>
      <footer className="ph-end">
        <Pill to="">Back to the door</Pill>
      </footer>
    </main>
  );
}

// ── a project ──────────────────────────────────────────────────────────

function ProjectPage({ item, project }: { item: PosterItem; project: Project }) {
  return (
    <main className="ph-project">
      <header className="ph-bar">
        <Back />
        <span className="ph-bar__title">{`No ${item.title}`}</span>
      </header>
      {item.image && <img className="ph-project__cover" src={item.image} width={900} height={1200} alt="" />}
      <h1 className="ph-h1">{project.title}</h1>
      {project.sections.map((s, i) => (
        <section key={i} className="ph-section">
          {s.title && <h2 className="ph-h2">{s.title}</h2>}
          {s.blocks.map((b, j) => (
            <BlockView key={j} block={b} />
          ))}
        </section>
      ))}
      <footer className="ph-end">
        <Pill to="">Back to the door</Pill>
      </footer>
    </main>
  );
}

function Para({ p }: { p: Paragraph }) {
  if (typeof p === 'string') return <p>{p}</p>;
  return (
    <p>
      {p.text}{' '}
      <a href={p.link.href} target="_blank" rel="noreferrer">
        {p.link.label}
      </a>
    </p>
  );
}

function MediaView({ m }: { m: Media }) {
  if (m.kind === 'image') return <img src={m.src} width={m.w} height={m.h} alt={m.alt ?? ''} loading="lazy" decoding="async" />;
  return <Video src={m.src} webm={m.webm} poster={m.poster} w={m.w} h={m.h} />;
}

/** Muted, inline, looping, with its poster; it plays only while on screen. */
function Video({ src, webm, poster, w, h }: { src: string; webm?: string; poster: string; w: number; h: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = true;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) void v.play().catch(() => {});
      else v.pause();
    });
    io.observe(v);
    return () => io.disconnect();
  }, []);
  return (
    <video ref={ref} muted playsInline loop preload="none" poster={poster} width={w} height={h}>
      {webm && <source src={webm} type="video/webm" />}
      <source src={src} type="video/mp4" />
    </video>
  );
}

function BlockView({ block: b }: { block: Block }) {
  switch (b.type) {
    case 'letterhead':
      return (
        <p className="ph-letterhead">
          <span>{`No ${b.no}`}</span> <span>{b.ref}</span>
        </p>
      );
    case 'title':
      return <h2 className="ph-h2">{b.text}</h2>;
    case 'caption':
      return <p className="ph-caption">{b.text}</p>;
    case 'text':
      return (
        <div className="ph-text">
          {b.heading && <h3 className="ph-h3">{b.heading}</h3>}
          {b.body.map((p, i) => (
            <Para key={i} p={p} />
          ))}
        </div>
      );
    case 'twoUp':
      return (
        <div className="ph-twoup">
          {b.columns.map((c, i) => (
            <figure key={i}>
              <MediaView m={c.media} />
              <figcaption>{c.text}</figcaption>
            </figure>
          ))}
        </div>
      );
    case 'row':
      return (
        <figure className="ph-row">
          <MediaView m={b.media} />
          <figcaption>
            <strong>{b.heading}</strong> {b.text}
          </figcaption>
        </figure>
      );
    case 'image':
      return (
        <figure className="ph-figure">
          <img src={b.src} width={b.w} height={b.h} alt={b.alt ?? ''} loading="lazy" decoding="async" />
          {b.caption && <figcaption>{b.caption}</figcaption>}
        </figure>
      );
    case 'statGrid':
      return (
        <ul className="ph-stats">
          {b.stats.map((s, i) => (
            <li key={i}>
              <img src={s.src} width={s.w} height={s.h} alt="" loading="lazy" decoding="async" />
              <span>{s.label}</span>
            </li>
          ))}
        </ul>
      );
    case 'linkPill':
      return (
        <p className="ph-actions">
          <a className="paper ph-pill" href={b.href} target="_blank" rel="noreferrer">
            <PillFace>{b.label}</PillFace>
          </a>
        </p>
      );
    case 'video':
      return (
        <figure className="ph-figure">
          <Video src={b.src} webm={b.webm} poster={b.poster} w={b.w} h={b.h} />
          {b.caption && <figcaption>{b.caption}</figcaption>}
        </figure>
      );
    case 'rive':
      // No Rive runtime on a phone; no project uses this block today.
      return b.label ? <p className="ph-caption">{b.label}</p> : null;
  }
}
