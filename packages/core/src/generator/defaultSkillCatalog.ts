import type { ToolDefinition } from '@agentforge/types';
import type { SkillCatalog } from './SkillMatcher.js';

export const DEFAULT_SKILL_CATALOG: SkillCatalog = {
  local: [
    {
      name: 'git-status',
      description: 'Show the Git working tree status',
      parameters: { type: 'object' },
      endpointType: 'local-command',
      endpoint: { target: 'git status --porcelain', method: 'exec' },
    },
    {
      name: 'list-files',
      description: 'List files in the current directory',
      parameters: { type: 'object' },
      endpointType: 'local-command',
      endpoint: { target: 'ls', method: 'exec' },
    },
  ],
  http: [
    {
      name: 'http-get',
      description: 'Fetch a public HTTPS URL as text',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string' } },
        required: ['url'],
      },
      endpointType: 'http',
      endpoint: { target: 'https://example.com', method: 'get' },
    },
  ],
  data: [
    {
      name: 'parse-json',
      description: 'Parse a JSON document locally',
      parameters: { type: 'object' },
      endpointType: 'local-function',
      endpoint: { target: 'tools.parseJson', method: 'call' },
    },
  ],
};

export function registerDefaultSkillCatalog(
  matcher: { registerCategory(category: string, tools: ToolDefinition[]): void },
  catalog: SkillCatalog = DEFAULT_SKILL_CATALOG
): void {
  for (const [category, tools] of Object.entries(catalog)) {
    matcher.registerCategory(category, tools);
  }
}
