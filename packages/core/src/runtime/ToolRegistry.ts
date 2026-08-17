import type { ToolDefinition } from '@agentforge/types';
import { CoreError } from '../errors.js';

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  constructor(tools: readonly ToolDefinition[] = []) {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new CoreError('DUPLICATE_TOOL', `Tool "${tool.name}" is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  resolve(name: string): ToolDefinition {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new CoreError('TOOL_NOT_FOUND', `Tool "${name}" is not registered`);
    }
    return tool;
  }

  listProviderTools(): ToolDefinition[] {
    return Array.from(this.tools.values(), ({ name, description, parameters, required }) => ({
      name,
      description,
      parameters,
      ...(required === undefined ? {} : { required }),
    }));
  }
}
