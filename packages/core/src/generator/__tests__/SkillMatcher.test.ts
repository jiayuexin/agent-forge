import { describe, it, expect } from 'vitest';
import type { ToolDefinition } from '@agentforge/types';
import { SkillMatcher } from '../SkillMatcher.js';
import type { ParsedDescription } from '../types.js';

const readFileTool: ToolDefinition = {
  name: 'read-file',
  description: 'Read a file',
  parameters: { type: 'object' },
};

const fetchTool: ToolDefinition = {
  name: 'fetch-url',
  description: 'Fetch a URL',
  parameters: { type: 'object' },
};

describe('SkillMatcher', () => {
  it('returns tools matching parsed categories', () => {
    const matcher = new SkillMatcher();
    matcher.registerCategory('local', [readFileTool]);
    matcher.registerCategory('http', [fetchTool]);

    const parsed: ParsedDescription = {
      role: 'test',
      name: 'test',
      displayName: 'Test',
      capabilities: [],
      scenarios: [],
      toolCategories: ['local'],
      riskLevel: 'low',
    };

    const tools = matcher.match(parsed);
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('read-file');
  });
});
