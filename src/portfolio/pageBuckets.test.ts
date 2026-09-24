import { describe, expect, it } from 'vitest';
import { CAPTURE_HEIGHT, PAGE_BUCKETS, bucketFor, pageWidthFor } from './pageBuckets';

describe('page buckets', () => {
  it('snaps DOWN to the nearest bucket, never up', () => {
    expect(bucketFor(1366)).toBe(1280);
    expect(bucketFor(1512)).toBe(1440);
    expect(bucketFor(1680)).toBe(1600);
    expect(bucketFor(2000)).toBe(1920);
    expect(bucketFor(3840)).toBe(2560);
  });

  it('is exact at a bucket, so both signed-off viewports lay out as they did', () => {
    for (const b of PAGE_BUCKETS) expect(bucketFor(b)).toBe(b);
    expect(pageWidthFor(1728, 48)).toBe(1632);
    expect(pageWidthFor(1440, 48)).toBe(1344);
  });

  it('has nothing to snap to below the smallest bucket', () => {
    expect(bucketFor(PAGE_BUCKETS[0] - 1)).toBeNull();
  });

  it('is sorted, and the capture is taller than a signed-off page', () => {
    expect([...PAGE_BUCKETS]).toEqual([...PAGE_BUCKETS].sort((a, b) => a - b));
    expect(CAPTURE_HEIGHT).toBeGreaterThan(996 - 56 - 96);
  });
});
