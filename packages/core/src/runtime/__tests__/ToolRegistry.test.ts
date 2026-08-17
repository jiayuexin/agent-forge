import { describe, expect, it } from 'vitest';
import type { ToolDefinition } from '@agentforge/types';
import { ToolRegistry } from '../ToolRegistry.js';
import * as core from '../../index.js';

const tool: ToolDefinition = {
  name: 'get-weather',
  description: 'Get the weather',
  parameters: { type: 'object' },
  handler: async () => ({ temperature: 20 }),
};

describe('ToolRegistry', () => {
  it('registers and resolves a tool by name', () => {
    const registry = new ToolRegistry([tool]);

    expect(registry.resolve('get-weather')).toBe(tool);
  });

  it('lists only provider-visible tool fields', () => {
    const registry = new ToolRegistry([tool]);

    expect(registry.listProviderTools()).toEqual([
      {
        name: 'get-weather',
        description: 'Get the weather',
        parameters: { type: 'object' },
      },
    ]);
  });

  it('rejects duplicate tool names instead of overwriting', () => {
    const registry = new ToolRegistry([tool]);

    expect(() => registry.register({ ...tool, description: 'Replacement' })).toThrow(
      expect.objectContaining({
        code: 'DUPLICATE_TOOL',
        message: 'Tool "get-weather" is already registered',
      })
    );
    expect(registry.resolve('get-weather')).toBe(tool);
  });

  it('throws a clear error for an unknown tool', () => {
    const registry = new ToolRegistry();

    expect(() => registry.resolve('missing-tool')).toThrow(
      expect.objectContaining({
        code: 'TOOL_NOT_FOUND',
        message: 'Tool "missing-tool" is not registered',
      })
    );
  });

  it('is exported with ToolRunner from the core package entrypoint', () => {
    expect(core.ToolRegistry).toBe(ToolRegistry);
    expect(core.ToolRunner).toBeTypeOf('function');
  });
});
