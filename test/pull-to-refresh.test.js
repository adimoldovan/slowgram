import { describe, it, expect } from 'vitest';
import {
  pullDistance,
  shouldRefresh,
  gestureAction,
  REFRESH_THRESHOLD,
} from '../src/pull-to-refresh';

describe('pullDistance', () => {
  it('is zero when the finger has not moved', () => {
    expect(pullDistance(0)).toBe(0);
  });

  it('is zero for upward movement', () => {
    expect(pullDistance(-50)).toBe(0);
  });

  it('dampens by the rubber-band formula', () => {
    // MAX_PULL * raw / (raw + MAX_PULL) with MAX_PULL = 150
    expect(pullDistance(70)).toBeCloseTo((150 * 70) / (70 + 150), 5);
  });

  it('applies resistance so the indicator lags behind the finger', () => {
    expect(pullDistance(100)).toBeLessThan(100);
  });

  it('increases monotonically as the pull grows', () => {
    expect(pullDistance(200)).toBeGreaterThan(pullDistance(100));
  });

  it('is capped no matter how far the finger travels', () => {
    const huge = pullDistance(100000);
    expect(huge).toBeLessThan(200);
    expect(pullDistance(1000000)).toBeLessThanOrEqual(huge + 1);
  });
});

describe('shouldRefresh', () => {
  it('does not refresh below the threshold', () => {
    expect(shouldRefresh(REFRESH_THRESHOLD - 1)).toBe(false);
  });

  it('refreshes at or above the threshold', () => {
    expect(shouldRefresh(REFRESH_THRESHOLD)).toBe(true);
    expect(shouldRefresh(REFRESH_THRESHOLD + 50)).toBe(true);
  });

  it('does not refresh on a zero-distance touch', () => {
    expect(shouldRefresh(0)).toBe(false);
  });
});

describe('gestureAction', () => {
  it('pulls on a mostly-vertical downward drag', () => {
    expect(gestureAction({ deltaX: 5, deltaY: 80 })).toBe('pull');
  });

  it('ignores an upward drag', () => {
    expect(gestureAction({ deltaX: 0, deltaY: -40 })).toBe('ignore');
  });

  it('ignores a horizontal-dominant drag (color-filter scroll)', () => {
    expect(gestureAction({ deltaX: 60, deltaY: 20 })).toBe('ignore');
    expect(gestureAction({ deltaX: -60, deltaY: 20 })).toBe('ignore');
  });
});
