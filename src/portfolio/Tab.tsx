import type { CSSProperties } from 'react';

/**
 * One tab on the notebook's left edge.
 *
 * THE Z RULE, which is the whole trick: every tab sits BELOW every section,
 * always and at every scroll position. Tabs never overlap the page. The tab of
 * the section you are in reads as continuous with the page because it is made
 * of the same glass at the same tint with nothing drawn between them — not
 * because it is in front. That means the tuck (the strip of tab that runs under
 * the page's left edge) never needs managing: it is simply behind the page, the
 * way a real divider's tab is behind the page it belongs to.
 *
 * The other tabs are the same shape in a lighter tint, dimmed and with a shadow
 * on their left so they sit back — and identically so whether their section is
 * before or after the one you are reading. A notebook does not distinguish
 * between dividers you have passed and dividers you have not.
 */
interface TabProps {
  index: number;
  title: string;
  hue: number;
  onSelect: (index: number) => void;
}

export function Tab({ index, title, hue, onSelect }: TabProps) {
  return (
    <button
      type="button"
      className="pv-tab"
      data-k={index}
      style={
        {
          '--pv-hue': hue,
          top: 'calc(var(--pv-tab-top, 0px) + var(--pv-k) * (var(--pv-tab-h, 132px) + var(--pv-tab-gap, 6px)))',
          '--pv-k': index,
        } as CSSProperties
      }
      onClick={() => onSelect(index)}
    >
      <span className="pv-tab__label">{title}</span>
    </button>
  );
}
