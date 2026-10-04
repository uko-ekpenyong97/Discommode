import { describe, expect, it } from 'vitest';
import { overFrames } from './frame-rule.mjs';

describe('the frame rule (drag, jank)', () => {
  it('forgives one isolated dropped vsync, whatever its jitter', () => {
    expect(overFrames([16.7, 33.2, 16.7])).toEqual([]);
    expect(overFrames([16.7, 33.6, 16.7, 16.6])).toEqual([]);
    expect(overFrames([33.4, 16.7, 33.4])).toEqual([]);
  });
  it('fails a frame that dropped two vsyncs in a row (50 ms)', () => {
    expect(overFrames([16.7, 50.0, 16.7])).toEqual([1]);
    expect(overFrames([41.7])).toEqual([0]); // 120 Hz: five of its ticks
  });
  it('fails two dropped frames in a row (33 + 33)', () => {
    expect(overFrames([16.7, 33.4, 33.3, 16.7])).toEqual([1, 2]);
    expect(overFrames([33.3, 50.1])).toEqual([0, 1]);
  });
  it('with a budget of three (the dock), forgives one 50 ms frame alone', () => {
    expect(overFrames([16.7, 50.0, 16.7], 3)).toEqual([]);
    expect(overFrames([50.0, 50.0], 3)).toEqual([0, 1]);
    expect(overFrames([66.7], 3)).toEqual([0]);
  });
});
