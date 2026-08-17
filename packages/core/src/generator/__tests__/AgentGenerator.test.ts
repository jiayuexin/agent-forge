import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
    expect(JSON.parse(result.files['package.json']).dependencies['@agentforge/core']).toBe(
      'workspace:*'
    );
    expect(JSON.parse(result.files['tsconfig.json']).extends).toBe('../../tsconfig.base.json');
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

  it('generates standalone dependencies and TypeScript config outside the repository', async () => {
    const generator = new AgentGenerator(
      new PromptBuilder(),
      new SkillMatcher(),
      new TemplateEngine(),
      new CodeEmitter()
    );
    const outputDir = await mkdtemp(join(tmpdir(), 'agentforge-generator-'));

    await generator.generate({
      description: 'standalone agent',
      name: 'standalone-agent',
      templateId: 'general',
      outputDir: join(outputDir, 'standalone-agent'),
    });

    const packageJson = JSON.parse(
      await readFile(join(outputDir, 'standalone-agent', 'package.json'), 'utf-8')
    );
    const tsconfig = JSON.parse(
      await readFile(join(outputDir, 'standalone-agent', 'tsconfig.json'), 'utf-8')
    );

    expect(packageJson.dependencies['@agentforge/core']).toBe('0.1.0');
    expect(packageJson.dependencies['@agentforge/runtime-client']).toBe('0.1.0');
    expect(packageJson.dependencies['@agentforge/types']).toBe('0.1.0');
    expect(packageJson.devDependencies['@types/node']).toBeDefined();
    expect(tsconfig.extends).toBeUndefined();
    expect(tsconfig.compilerOptions.module).toBe('NodeNext');
  });
});
