import { describe, it, expect } from 'vitest';
import { AgentStatus } from '@agentforge/types';
import { AgentLifeCycle } from '../AgentLifeCycle.js';

describe('AgentLifeCycle', () => {
  it('starts uninitialized', () => {
    const lc = new AgentLifeCycle();
    expect(lc.status).toBe(AgentStatus.UNINITIALIZED);
  });

  it('transitions through normal flow', () => {
    const lc = new AgentLifeCycle();
    lc.transition(AgentStatus.INITIALIZING);
    expect(lc.status).toBe(AgentStatus.INITIALIZING);
    lc.transition(AgentStatus.READY);
    expect(lc.status).toBe(AgentStatus.READY);
    lc.transition(AgentStatus.RUNNING);
    expect(lc.status).toBe(AgentStatus.RUNNING);
    lc.transition(AgentStatus.READY);
    expect(lc.status).toBe(AgentStatus.READY);
    lc.transition(AgentStatus.DESTROYED);
    expect(lc.status).toBe(AgentStatus.DESTROYED);
  });

  it('rejects illegal transitions', () => {
    const lc = new AgentLifeCycle();
    expect(() => lc.transition(AgentStatus.RUNNING)).toThrow();
  });

  it('canTransition reflects validity', () => {
    const lc = new AgentLifeCycle();
    expect(lc.canTransition(AgentStatus.INITIALIZING)).toBe(true);
    expect(lc.canTransition(AgentStatus.READY)).toBe(false);
  });

  it('assertStatus throws on mismatch', () => {
    const lc = new AgentLifeCycle();
    expect(() => lc.assertStatus(AgentStatus.READY)).toThrow();
  });

  it('reset returns to uninitialized', () => {
    const lc = new AgentLifeCycle();
    lc.transition(AgentStatus.INITIALIZING);
    lc.reset();
    expect(lc.status).toBe(AgentStatus.UNINITIALIZED);
  });
});
