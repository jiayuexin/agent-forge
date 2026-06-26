import { describe, it, expect } from 'vitest';
import { TemplateEngine } from '../TemplateEngine.js';
import type { TemplateData } from '../types.js';

describe('TemplateEngine', () => {
  it('loads fallback templates', () => {
    const engine = new TemplateEngine();
    const template = engine.load('general');
    expect(template.files['package.json']).toBeDefined();
    expect(template.files['src/main.ts']).toBeDefined();
  });

  it('renders templates with data', () => {
    const engine = new TemplateEngine();
    const template = engine.load('general');
    const data: TemplateData = {
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

    const rendered = engine.render(template, data);
    expect(rendered['package.json']).toContain('test-agent');
    expect(rendered['src/prompts.ts']).toContain('helpful');
  });
});
