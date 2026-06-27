import { describe, it, expect } from 'vitest';
import { slugifyName, defaultOutputDir } from '../../lib/generator.js';
import { formatAgentList } from '../../lib/list-agents.js';
import { resolveHubBaseUrl } from '../../lib/hub-client.js';

describe('CLI helpers', () => {
  it('slugifies agent names', () => {
    expect(slugifyName('Customer Service Agent')).toBe('customer-service-agent');
  });

  it('builds default output directory', () => {
    expect(defaultOutputDir('my-agent')).toBe('./client-agents/my-agent');
  });

  it('formats agent list as table', () => {
    const output = formatAgentList(
      [{ name: 'demo', path: './client-agents/demo', role: 'assistant' }],
      'table'
    );
    expect(output).toContain('demo');
    expect(output).toContain('./client-agents/demo');
  });

  it('normalizes hub base url from websocket endpoint', () => {
    expect(resolveHubBaseUrl('ws://localhost:8080/ws/nodes/node-1')).toBe('http://localhost:8080');
  });
});
