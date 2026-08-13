import { describe, it, expect } from 'vitest';
import { AgentGenerator } from '../AgentGenerator.js';
import { PromptBuilder } from '../PromptBuilder.js';
import { SkillMatcher } from '../SkillMatcher.js';
import { TemplateEngine } from '../TemplateEngine.js';
import { CodeEmitter } from '../CodeEmitter.js';
import { verifyGeneratedTypeScript } from '../GeneratedProjectVerifier.js';

describe('default skill catalog and generated project verification', () => {
  it('injects catalog tools for matching descriptions', async () => {
    const generator = new AgentGenerator(
      new PromptBuilder(),
      new SkillMatcher(),
      new TemplateEngine(),
      new CodeEmitter()
    );
    const result = await generator.generate({
      description: 'A local command helper that can list files over http api',
      name: 'catalog-agent',
      templateId: 'general',
    });
    expect(result.files['src/tools.ts']).toContain('git-status');
    expect(result.files['src/tools.ts']).toContain('http-get');
  });

  it('fails closed on invalid generated JSON', () => {
    expect(() =>
      verifyGeneratedTypeScript({
        'package.json': '{ not json',
      })
    ).toThrow(/invalid JSON/);
  });
});
