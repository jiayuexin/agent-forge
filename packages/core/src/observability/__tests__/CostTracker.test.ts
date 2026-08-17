import { describe, it, expect } from 'vitest';
import { CostTracker } from '../CostTracker.js';

describe('CostTracker', () => {
  it('tracks cumulative cost', () => {
    const tracker = new CostTracker(10);
    tracker.record(3);
    tracker.record(4);
    expect(tracker.getTotal()).toBe(7);
  });

  it('throws when monthly limit is exceeded', () => {
    const tracker = new CostTracker(1);
    tracker.record(0.5);
    expect(() => tracker.record(0.6)).toThrow(/Monthly cost limit exceeded/);
  });
});
