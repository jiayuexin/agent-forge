import { describe, it, expect } from 'vitest';
import type { AgentConfig, IAgent, IPlugin, ToolDefinition } from '@agentforge/types';
import { PluginManager } from '../PluginManager.js';
import { SimpleLogger } from '../../logger/SimpleLogger.js';

const mockAgent = {} as IAgent;
const mockConfig = {
  identity: { name: 'test', role: 'test', version: '0.0.1' },
  model: { provider: 'mock', modelName: 'mock-model' },
  systemPrompt: 'test',
} as AgentConfig;

const mockTool: ToolDefinition = {
  name: 'mock-tool',
  description: 'A mock tool',
  parameters: { type: 'object' },
};

describe('PluginManager', () => {
  it('registers a plugin and captures its tools', () => {
    const pm = new PluginManager(mockAgent, mockConfig, new SimpleLogger());

    const plugin: IPlugin = {
      name: 'test-plugin',
      version: '1.0.0',
      install: (_agent, context) => {
        context.registerTool(mockTool);
      },
    };

    pm.register(plugin);
    expect(pm.getTools()).toHaveLength(1);
    expect(pm.getTools()[0].name).toBe('mock-tool');
  });

  it('rejects duplicate plugin registration', () => {
    const pm = new PluginManager(mockAgent, mockConfig, new SimpleLogger());
    const plugin: IPlugin = {
      name: 'dup',
      version: '1.0.0',
      install: () => {},
    };

    pm.register(plugin);
    expect(() => pm.register(plugin)).toThrow();
  });

  it('uninstalls a plugin', () => {
    const pm = new PluginManager(mockAgent, mockConfig, new SimpleLogger());
    const plugin: IPlugin = {
      name: 'remove-me',
      version: '1.0.0',
      install: () => {},
      uninstall: () => {},
    };

    pm.register(plugin);
    pm.unregister(plugin);
    expect(pm.getTools()).toHaveLength(0);
  });
});
