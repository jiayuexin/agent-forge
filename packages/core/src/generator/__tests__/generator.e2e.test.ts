import { describe, it, expect, beforeAll } from 'vitest';
import { AgentGenerator } from '../AgentGenerator';
import path from 'path';

describe('AgentGenerator E2E', () => {
  const templateDir = path.resolve(__dirname, '../../../../../templates');
  const outputDir = path.resolve(__dirname, '__test_output__');
  let generator: AgentGenerator;

  beforeAll(() => {
    generator = new AgentGenerator(templateDir);
  });

  it('should generate a customer-service agent from description', async () => {
    const result = await generator.generate({
      description: '一个电商客服助手，帮助用户查询订单状态、处理退换货申请',
      templateId: 'customer-service',
      outputDir,
    });

    expect(result.files).toBeDefined();
    expect(Object.keys(result.files).length).toBeGreaterThan(0);
    expect(result.metadata.templateId).toBe('customer-service');
    expect(result.metadata.tools.length).toBeGreaterThan(0);

    // Verify key files exist (template keys are filenames without .ejs)
    expect(result.files['index.ts']).toBeDefined();
    expect(result.files['prompts.ts']).toBeDefined();
    expect(result.files['package.json']).toBeDefined();
    expect(result.files['package.json']).toContain('agent-');
    expect(result.files['tools.ts']).toBeDefined();
    expect(result.files['config.ts']).toBeDefined();
    expect(result.files['types.ts']).toBeDefined();
    expect(result.files['tsconfig.json']).toBeDefined();
    expect(result.files['README.md']).toBeDefined();
  });

  it('should batch generate multiple agents', async () => {
    const results = await generator.batch([
      { description: '销售助手', templateId: 'sales-assistant' },
      { description: '代码审查', templateId: 'code-reviewer' },
    ], 2);

    expect(results).toHaveLength(2);
    expect(results[0].metadata.templateId).toBe('sales-assistant');
    expect(results[1].metadata.templateId).toBe('code-reviewer');

    // Each result should have generated files
    expect(Object.keys(results[0].files).length).toBeGreaterThan(0);
    expect(Object.keys(results[1].files).length).toBeGreaterThan(0);
  });
});
