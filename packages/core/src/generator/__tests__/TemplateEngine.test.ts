import { describe, it, expect } from 'vitest';
import { TemplateEngine } from '../TemplateEngine.js';
import type { TemplateData } from '../types.js';

const baseData: TemplateData = {
  identity: { name: 'test', role: 'test', version: '0.0.1' },
  parsed: {
    role: 'test',
    name: 'test-agent',
    displayName: 'Test Agent',
    capabilities: [],
    scenarios: [],
    toolCategories: [],
    riskLevel: 'low',
  },
  systemPrompt: 'helpful',
  tools: [],
  config: {},
  security: { localCommandAuth: { level: 'disabled' } },
  versions: { core: '0.0.0', runtimeClient: '0.0.0' },
};

describe('TemplateEngine', () => {
  it('loads filesystem base + role templates', async () => {
    const engine = new TemplateEngine();
    const template = await engine.load('general');

    expect(template.files['package.json']).toBeDefined();
    expect(template.files['src/main.ts']).toBeDefined();
    expect(template.files['.agentforge/config.json']).toBeDefined();
    expect(template.meta.riskLevel).toBe('low');
  });

  it('loads role-specific metadata', async () => {
    const engine = new TemplateEngine();
    const template = await engine.load('customer-service');

    expect(template.meta.displayName).toBe('Customer Service Agent');
    expect(template.meta.riskLevel).toBe('medium');
    expect(template.meta.defaultTools).toHaveLength(2);
    expect(template.files['src/tools.ts']).toBeDefined();
  });

  it('renders templates with data', async () => {
    const engine = new TemplateEngine();
    const template = await engine.load('general');
    const rendered = engine.render(template, baseData);

    expect(rendered['package.json']).toContain('test-agent');
    expect(rendered['src/prompts.ts']).toContain('helpful');
  });

  it('falls back to inline templates for unknown roles', async () => {
    const engine = new TemplateEngine();
    const template = await engine.load('non-existent-role');

    expect(template.files['package.json']).toBeDefined();
    expect(template.files['src/main.ts']).toBeDefined();
  });
});
