import { describe, it, expect } from 'vitest';
import { PromptBuilder } from '../PromptBuilder.js';
import type { ParsedDescription } from '../types.js';

describe('PromptBuilder', () => {
  it('builds a system prompt with role and constraints', () => {
    const builder = new PromptBuilder();
    const parsed: ParsedDescription = {
      role: 'customer-service',
      name: 'customer-service',
      displayName: 'Customer Service Agent',
      capabilities: ['answer questions', 'process refunds'],
      scenarios: ['user asks for refund'],
      toolCategories: ['crm'],
      riskLevel: 'medium',
    };

    const prompt = builder.build(parsed);

    expect(prompt).toContain('Customer Service Agent');
    expect(prompt).toContain('answer questions');
    expect(prompt).toContain('crm');
    expect(prompt).toContain('destructive');
  });
});
