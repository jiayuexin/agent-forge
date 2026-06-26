import { randomUUID } from 'node:crypto';
import type {
  AgentIdentity,
  AgentTemplate,
  ClientAgentConfig,
  ClientAgentSecurityConfig,
  ToolDefinition,
} from '@agentforge/types';
import type {
  GenerateInput,
  GenerateResult,
  ParsedDescription,
  TemplateData,
} from './types.js';
import { PromptBuilder } from './PromptBuilder.js';
import { SkillMatcher } from './SkillMatcher.js';
import { TemplateEngine } from './TemplateEngine.js';
import { CodeEmitter } from './CodeEmitter.js';

export class AgentGenerator {
  constructor(
    private promptBuilder: PromptBuilder,
    private skillMatcher: SkillMatcher,
    private templateEngine: TemplateEngine,
    private codeEmitter: CodeEmitter
  ) {}

  async generate(input: GenerateInput): Promise<GenerateResult> {
    const template = await this.templateEngine.load(input.templateId ?? 'general');
    const parsed = this.parseDescription(input, template.meta);
    const systemPrompt = this.promptBuilder.build(parsed, template.meta.systemPromptTemplate);

    const matchedTools = this.skillMatcher.match(parsed);
    const tools = this.mergeTools(template.meta.defaultTools ?? [], matchedTools);

    const identity: AgentIdentity = {
      id: randomUUID(),
      name: parsed.name,
      role: parsed.role,
      version: '0.0.1',
    };

    const config: Partial<ClientAgentConfig> = {
      identity,
      systemPrompt,
      tools,
      ...template.meta.defaultConfig,
      ...input.config,
    };

    const security: ClientAgentSecurityConfig = {
      localCommandAuth: { level: 'disabled' },
      allowRemoteExecution: false,
      requireLocalConfirmation: [],
    };

    const templateData: TemplateData = {
      identity,
      parsed,
      systemPrompt,
      tools,
      config,
      security,
      versions: { core: '0.0.0', runtimeClient: '0.0.0' },
    };

    const rendered = this.templateEngine.render(template, templateData);

    const templateSet = { ...template, files: rendered };
    const ctx = { template: templateSet, parsed, systemPrompt, tools, config };

    if (input.outputDir) {
      return this.codeEmitter.emit(ctx, input.outputDir);
    }

    return { files: rendered, metadata: parsed };
  }

  async batch(inputs: GenerateInput[]): Promise<GenerateResult[]> {
    return Promise.all(inputs.map((input) => this.generate(input)));
  }

  private parseDescription(input: GenerateInput, meta: Partial<AgentTemplate>): ParsedDescription {
    const name =
      input.name ??
      input.description.split(/\s+/).slice(0, 3).join('-').toLowerCase() ??
      'agent';

    return {
      role: name,
      name,
      displayName: meta?.displayName ?? name,
      capabilities: [],
      scenarios: [input.description],
      toolCategories: this.extractToolCategories(input.description),
      riskLevel: meta?.riskLevel ?? 'low',
    };
  }

  private extractToolCategories(description: string): string[] {
    const categories: string[] = [];
    const lowered = description.toLowerCase();
    if (lowered.includes('file') || lowered.includes('command')) categories.push('local');
    if (lowered.includes('http') || lowered.includes('api')) categories.push('http');
    if (lowered.includes('data') || lowered.includes('sql')) categories.push('data');
    return categories;
  }

  private mergeTools(defaultTools: ToolDefinition[], matchedTools: ToolDefinition[]): ToolDefinition[] {
    const seen = new Set<string>();
    const tools: ToolDefinition[] = [];

    for (const tool of [...defaultTools, ...matchedTools]) {
      if (!seen.has(tool.name)) {
        seen.add(tool.name);
        tools.push(tool);
      }
    }

    return tools;
  }
}
