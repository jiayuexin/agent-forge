import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../src/EventBus.js';

describe('EventBus', () => {
  it('calls registered handlers on emit', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('event', handler);
    bus.emit('event', 'payload');
    expect(handler).toHaveBeenCalledWith('payload');
  });

  it('removes a handler with off', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('event', handler);
    bus.off('event', handler);
    bus.emit('event', 'payload');
    expect(handler).not.toHaveBeenCalled();
  });

  it('once handler fires only once', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.once('event', handler);
    bus.emit('event', 1);
    bus.emit('event', 2);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(1);
  });

  it('removeAllListeners clears all handlers when no event given', () => {
    const bus = new EventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on('a', a);
    bus.on('b', b);
    bus.removeAllListeners();
    bus.emit('a', 1);
    bus.emit('b', 2);
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  it('removeAllListeners clears only the specified event', () => {
    const bus = new EventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on('a', a);
    bus.on('b', b);
    bus.removeAllListeners('a');
    bus.emit('a', 1);
    bus.emit('b', 2);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledWith(2);
  });

  it('does not break other handlers when one throws', () => {
    const bus = new EventBus();
    const bad = vi.fn().mockImplementation(() => {
      throw new Error('boom');
    });
    const good = vi.fn();
    bus.on('event', bad);
    bus.on('event', good);
    bus.emit('event', 'payload');
    expect(bad).toHaveBeenCalled();
    expect(good).toHaveBeenCalledWith('payload');
  });
});
