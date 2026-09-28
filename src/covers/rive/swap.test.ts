import { describe, expect, it } from 'vitest';
import { morphRole, riveSwapAt } from './swap';

describe('riveSwapAt', () => {
  it('reads the dial, and anything but "start" is landing', () => {
    expect(riveSwapAt({ rive: { riveSwapAt: 'start' } })).toBe('start');
    expect(riveSwapAt({ rive: { riveSwapAt: 'landing' } })).toBe('landing');
    expect(riveSwapAt({ rive: {} })).toBe('landing');
    expect(riveSwapAt(undefined)).toBe('landing');
  });
});

describe('morphRole', () => {
  it('landing: the grid travels in, the hero travels out', () => {
    expect(morphRole('landing', true)).toBe('grid');
    expect(morphRole('landing', false)).toBe('hero');
  });
  it('start: the card is already what it will be', () => {
    expect(morphRole('start', true)).toBe('hero');
    expect(morphRole('start', false)).toBe('grid');
  });
});
