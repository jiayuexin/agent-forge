import { describe, it, expect } from 'vitest';
import { AgentGenerator } from '../AgentGenerator.js';
import { PromptBuilder } from '../PromptBuilder.js';
import { SkillMatcher } from '../SkillMatcher.js';
import { TemplateEngine } from '../TemplateEngine.js';
import { CodeEmitter } from '../CodeEmitter.js';

describe('AgentGenerator', () => {
  it('generates a ClientAgent project from filesystem templates', async () => {
    const generator = new AgentGenerator(
      new PromptBuilder(),
      new SkillMatcher(),
      new TemplateEngine(),
      new CodeEmitter()
    );

    const result = await generator.generate({
      description: 'A customer service agent that handles refunds',
      name: 'refund-agent',
      templateId: 'customer-service',
    });

    expect(result.files['package.json']).toBeDefined();
    expect(result.files['src/main.ts']).toBeDefined();
    expect(result.files['src/agent.ts']).toBeDefined();
    expect(result.files['src/config.ts']).toBeDefined();
    expect(result.files['src/prompts.ts']).toBeDefined();
    expect(result.files['src/tools.ts']).toBeDefined();
    expect(result.files['src/types.ts']).toBeDefined();
    expect(result.files['src/runtime.ts']).toBeDefined();
    expect(result.files['tsconfig.json']).toBeDefined();
    expect(result.files['README.md']).toBeDefined();
    expect(result.files['.agentforge/security.json']).toBeDefined();
    expect(result.files['.agentforge/config.json']).toBeDefined();

    expect(result.metadata.name).toBe('refund-agent');
    expect(result.metadata.riskLevel).toBe('medium');
  });

  it('applies role default tools', async () => {
    const generator = new AgentGenerator(
      new PromptBuilder(),
      new SkillMatcher(),
      new TemplateEngine(),
      new CodeEmitter()
    );

    const result = await generator.generate({
      description: 'customer service',
      name: 'cs-agent',
      templateId: 'customer-service',
    });

    expect(result.files['src/tools.ts']).toContain('lookup-order');
    expect(result.files['src/tools.ts']).toContain('create-refund');
  });
});
