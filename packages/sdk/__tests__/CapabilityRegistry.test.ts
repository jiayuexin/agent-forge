import { describe, it, expect } from 'vitest';
import { CapabilityRegistry } from '../src/CapabilityRegistry.js';
import { CapabilityConflictError } from '../src/errors.js';
import type { Capability } from '@agentforge/types';

const baseCapability: Capability = {
  id: 'cap-1',
  type: 'agent',
  name: 'capability-one',
  description: 'First capability',
};

describe('CapabilityRegistry', () => {
  it('registers and retrieves a capability', () => {
    const registry = new CapabilityRegistry();
    registry.register(baseCapability);
    expect(registry.get('cap-1')).toEqual(baseCapability);
  });

  it('lists capabilities', () => {
    const registry = new CapabilityRegistry();
    registry.register(baseCapability);
    expect(registry.list()).toHaveLength(1);
  });

  it('unregisters a capability', () => {
    const registry = new CapabilityRegistry();
    registry.register(baseCapability);
    registry.unregister('cap-1');
    expect(registry.get('cap-1')).toBeUndefined();
  });

  it('filters by type', () => {
    const registry = new CapabilityRegistry();
    registry.register({ ...baseCapability, id: 'a', type: 'agent' });
    registry.register({ ...baseCapability, id: 'b', type: 'tool' });
    expect(registry.list({ type: 'agent' })).toHaveLength(1);
    expect(registry.list({ type: ['agent', 'tool'] })).toHaveLength(2);
  });

  it('filters by tags', () => {
    const registry = new CapabilityRegistry();
    registry.register({ ...baseCapability, id: 'a', tags: ['alpha'] });
    registry.register({ ...baseCapability, id: 'b', tags: ['beta'] });
    expect(registry.list({ tags: ['alpha'] })).toHaveLength(1);
  });

  it('keeps higher version by default', () => {
    const registry = new CapabilityRegistry();
    registry.register({ ...baseCapability, version: '1.0.0' });
    registry.register({ ...baseCapability, name: 'updated', version: '1.1.0' });
    expect(registry.get('cap-1')?.name).toBe('updated');

    registry.register({ ...baseCapability, name: 'older', version: '0.9.0' });
    expect(registry.get('cap-1')?.name).toBe('updated');
  });

  it('overwrites when explicitly requested', () => {
    const registry = new CapabilityRegistry();
    registry.register({ ...baseCapability, version: '2.0.0' });
    registry.register({ ...baseCapability, name: 'forced', version: '1.0.0' }, { onConflict: 'overwrite' });
    expect(registry.get('cap-1')?.name).toBe('forced');
  });

  it('ignores when explicitly requested', () => {
    const registry = new CapabilityRegistry();
    registry.register(baseCapability);
    registry.register({ ...baseCapability, name: 'ignored' }, { onConflict: 'ignore' });
    expect(registry.get('cap-1')?.name).toBe('capability-one');
  });

  it('throws on conflict when requested', () => {
    const registry = new CapabilityRegistry();
    registry.register(baseCapability);
    expect(() => registry.register({ ...baseCapability }, { onConflict: 'throw' })).toThrow(CapabilityConflictError);
  });

  it('renders a prompt with capability details', () => {
    const registry = new CapabilityRegistry();
    registry.register({
      ...baseCapability,
      riskLevel: 'high',
      tags: ['critical'],
      inputSchema: { type: 'object' },
      sensitiveOperations: ['delete'],
    });
    const prompt = registry.toPrompt();
    expect(prompt).toContain('cap-1');
    expect(prompt).toContain('riskLevel: high');
    expect(prompt).toContain('critical');
    expect(prompt).toContain('delete');
  });
});
