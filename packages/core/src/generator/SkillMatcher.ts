import type { ToolDefinition } from '@agentforge/types';
import type { ParsedDescription } from './types.js';

export interface SkillCatalog {
  [category: string]: ToolDefinition[];
}

export class SkillMatcher {
  private catalog: SkillCatalog = {};

  registerCategory(category: string, tools: ToolDefinition[]): void {
    this.catalog[category] = tools;
  }

  match(parsed: ParsedDescription): ToolDefinition[] {
    const tools: ToolDefinition[] = [];
    const seen = new Set<string>();

    for (const category of parsed.toolCategories) {
      const categoryTools = this.catalog[category] ?? [];
      for (const tool of categoryTools) {
        if (!seen.has(tool.name)) {
          seen.add(tool.name);
          tools.push(tool);
        }
      }
    }

    return tools;
  }
}
