import { useEffect, useMemo, useState } from 'react';
import { FlipBook } from './FlipBook';
import { ISSUES, buildSpreads, issue01 } from './issue-01';
import './ReaderPage.css';

interface ReaderPageProps {
  /** Issue id from the `#read-NN` hash. */
  issue: string;
  /** Dev-only frozen-t scrub, from `#read-NN?debug`. */
  debug?: boolean;
}

const label = (n: number): string => String(n).padStart(2, '0');

/**
 * Temporary full-screen stage for the reader spike. The real entry point later
 * is the detail-view panel; for now `#read-NN` swaps the whole app for this.
 */
export default function ReaderPage({ issue, debug = false }: ReaderPageProps) {
  const data = ISSUES[issue] ?? issue01;
  const spreads = useMemo(() => buildSpreads(data), [data]);
  const [spread, setSpread] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        window.location.hash = '';
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const [left, right] = spreads[spread] ?? [null, null];
  const pages = [left, right].filter((p) => p !== null).map((p) => label(p.n));

  return (
    <div className="reader">
      <FlipBook spreads={spreads} spread={spread} onSpreadChange={setSpread} debug={debug} />
      <p className="reader__caption">
        <span>
          ISSUE {data.id} — SPREAD {spread + 1} / {spreads.length}
        </span>
        <span className="reader__pages">{pages.join(' – ')}</span>
      </p>
    </div>
  );
}
