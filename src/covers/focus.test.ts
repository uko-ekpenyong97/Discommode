import { describe, expect, it } from 'vitest';
import { focusedIndex, riveFocusAt } from './focus';
import type { FocusState } from './focus';

const s = (o: Partial<FocusState>): FocusState => ({
  phase: 'active',
  transition: 'morph',
  activeIndex: 3,
  landed: true,
  focusAt: 'start',
  ...o,
});

describe('riveFocusAt', () => {
  it('reads the dial, and anything but "landing" is start', () => {
    expect(riveFocusAt({ rive: { riveFocusAt: 'landing' } })).toBe('landing');
    expect(riveFocusAt({ rive: { riveFocusAt: 'start' } })).toBe('start');
    expect(riveFocusAt({ rive: {} })).toBe('start');
    expect(riveFocusAt(undefined)).toBe('start');
  });
});

describe('focusedIndex', () => {
  it('the morph in: from its start, or from its landing', () => {
    expect(focusedIndex(s({ phase: 'enter', focusAt: 'start', landed: false }))).toBe(3);
    expect(focusedIndex(s({ phase: 'enter', focusAt: 'landing', landed: false }))).toBeNull();
    expect(focusedIndex(s({ phase: 'active', focusAt: 'landing' }))).toBe(3);
  });
  it('a deep link (the fade) is focused at once', () => {
    expect(focusedIndex(s({ phase: 'enter', transition: 'fade', focusAt: 'landing', landed: false }))).toBe(3);
  });
  it('a slide focuses as it lands, not while the strip moves', () => {
    expect(focusedIndex(s({ landed: false }))).toBeNull();
    expect(focusedIndex(s({ landed: true, activeIndex: 0 }))).toBe(0);
  });
  it('the way out: nothing is focused', () => {
    expect(focusedIndex(s({ phase: 'exit' }))).toBeNull();
  });
});
