import { describe, expect, it } from 'vitest';
import { binomTail, droppedVsyncs, riffleGate } from './riffle-gate.mjs';

describe('the riffle gate (verify:reader frames)', () => {
  it('counts dropped vsyncs, not long frames', () => {
    expect(droppedVsyncs([16.7, 33.4, 16.7, 50.0, 19.9])).toBe(3);
  });
  it('binomial tail', () => {
    expect(binomTail(0, 5, 0.5)).toBe(1);
    expect(binomTail(5, 5, 0.5)).toBeCloseTo(1 / 32, 6);
    expect(binomTail(3, 4, 0.5)).toBeCloseTo(5 / 16, 6);
  });
  it('passes riffles that drop about as often as the control', () => {
    // tonight's typical run: 4 drops in ~2500 riffle frames, 1 in ~1200 control frames
    expect(riffleGate({ frames: 2500, drops: 4 }, { frames: 1200, drops: 1 }).pass).toBe(true);
    expect(riffleGate({ frames: 2500, drops: 8 }, { frames: 1200, drops: 2 }).pass).toBe(true);
  });
  it('does not fail on a control that happened to drop nothing', () => {
    expect(riffleGate({ frames: 2500, drops: 6 }, { frames: 1200, drops: 0 }).pass).toBe(true);
  });
  it('fails riffles that drop meaningfully more often than the control', () => {
    expect(riffleGate({ frames: 2500, drops: 40 }, { frames: 1200, drops: 1 }).pass).toBe(false);
    expect(riffleGate({ frames: 2500, drops: 30 }, { frames: 1200, drops: 0 }).pass).toBe(false);
    // 4× the control's rate, over enough frames
    expect(riffleGate({ frames: 25000, drops: 100 }, { frames: 12000, drops: 12 }).pass).toBe(false);
  });
  it('passes a riffle within the 2× margin even with many frames', () => {
    expect(riffleGate({ frames: 25000, drops: 40 }, { frames: 12000, drops: 12 }).pass).toBe(true);
  });
});
