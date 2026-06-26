import { describe, it, expect } from 'vitest';
import { AgentGenerator } from '../AgentGenerator.js';
import { PromptBuilder } from '../PromptBuilder.js';
import { SkillMatcher } from '../SkillMatcher.js';
import { TemplateEngine } from '../TemplateEngine.js';
import { CodeEmitter } from '../CodeEmitter.js';

describe('AgentGenerator', () => {
  it('generates a ClientAgent project', async () => {
    const generator = new AgentGenerator(
      new PromptBuilder(),
      new SkillMatcher(),
      new TemplateEngine(),
      new CodeEmitter()
    );

    const result = await generator.generate({
      description: 'A customer service agent that handles refunds',
      name: 'refund-agent',
    });

    expect(result.files['package.json']).toBeDefined();
    expect(result.files['src/main.ts']).toBeDefined();
    expect(result.metadata.name).toBe('refund-agent');
  });
});
