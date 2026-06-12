import type { ToolDefinition } from '@agentforge/types';
import { PromptBuilder, type ParsedDescription } from './PromptBuilder';
import { TemplateEngine } from './TemplateEngine';
import { SkillMatcher } from './SkillMatcher';
import { CodeEmitter } from './CodeEmitter';

export interface GenerateInput {
  description: string;
  templateId?: string;
  outputDir?: string;
  config?: Record<string, unknown>;
}

export interface GenerateResult {
  files: Record<string, string>; // relative path -> content
  metadata: {
    parsed: ParsedDescription;
    templateId: string;
    tools: ToolDefinition[];
  };
}

/**
 * AgentGenerator — main entry point for the 8-step generation pipeline.
 *
 * Steps:
 *  1. Parse description -> ParsedDescription
 *  2. Match template
 *  3. Build prompt (6-section system prompt)
 *  4. Match tools
 *  5. Render templates (EJS)
 *  6-8. Config, docs, validation (simplified for v1)
 */
export class AgentGenerator {
  private readonly promptBuilder = new PromptBuilder();
  private readonly templateEngine: TemplateEngine;
  private readonly skillMatcher = new SkillMatcher();
  private readonly codeEmitter = new CodeEmitter();

  constructor(private readonly templateDir: string) {
    this.templateEngine = new TemplateEngine(templateDir);
  }

  /**
   * Generate agent code from a description.
   * If `input.outputDir` is provided, files are also written to disk.
   */
  async generate(input: GenerateInput): Promise<GenerateResult> {
    // 1. Parse description
    const parsed = this.parseDescription(input.description);

    // 2. Match template (defaults to 'general')
    const templateId = input.templateId ?? this.matchTemplate(parsed);

    // 3. Build system prompt
    const tools = this.skillMatcher.match(parsed.title, parsed.capabilities);
    const systemPrompt = this.promptBuilder.build(parsed, tools);

    // 4. Match tools (already done above for prompt)
    // Tools are matched based on role

    // 5. Render templates
    const agentName = parsed.title.toLowerCase().replace(/\s+/g, '-');
    const packageId = `agent-${agentName}`;

    const templateData = {
      agentName,
      agentRole: parsed.title,
      systemPrompt,
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
      modelConfig: input.config?.modelConfig ?? {
        provider: 'openai',
        modelName: 'gpt-4o',
        temperature: 0.7,
        maxTokens: 4096,
      },
      packageId,
      version: '1.0.0',
      ...input.config,
    };

    const files = await this.templateEngine.render(templateId, templateData);

    // 6-8. Config, docs, validation (simplified for v1)
    // Template rendering already includes package.json, tsconfig, README

    // Write to disk if outputDir is specified
    if (input.outputDir) {
      await this.codeEmitter.emit(input.outputDir, files);
    }

    return {
      files,
      metadata: {
        parsed,
        templateId,
        tools,
      },
    };
  }

  /**
   * Generate multiple agents with concurrency control.
   */
  async batch(inputs: GenerateInput[], maxConcurrency = 3): Promise<GenerateResult[]> {
    const results: GenerateResult[] = [];
    const queue = [...inputs];

    const worker = async (): Promise<void> => {
      while (queue.length > 0) {
        const input = queue.shift();
        if (input) {
          results.push(await this.generate(input));
        }
      }
    };

    const workers = Array.from({ length: Math.min(maxConcurrency, inputs.length) }, () => worker());
    await Promise.all(workers);

    return results;
  }

  /**
   * Parse a natural language description into a structured ParsedDescription.
   * v1: regex-based heuristic parsing.
   * v2: LLM-assisted parsing (future).
   */
  private parseDescription(description: string): ParsedDescription {
    // Extract title from the first line or a pattern like "I need a X"
    const titleMatch = description.match(
      /(?:I need (?:a |an )?|We need (?:a |an )?|Create (?:a |an )?|Build (?:a |an )?|设计(?:一个)?|创建(?:一个)?)([^\n,.!。，！]+)/i,
    );
    const title = titleMatch?.[1]?.trim() ?? description.split(/[\n.。]/)[0]?.trim() ?? 'General Agent';

    // Extract capabilities from lines starting with - or numbered lists, or after keywords
    const capabilities: string[] = [];
    const capPatterns = [
      /(?:capable of|can|abilities|skills|能力|技能)[:\s]+([^\n]+)/gi,
      /[-*]\s+(.+)/g,
      /\d+\.\s+(.+)/g,
    ];

    for (const pattern of capPatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(description)) !== null) {
        const cap = match[1].trim();
        if (cap && cap.length > 2 && cap.length < 200) {
          capabilities.push(cap);
        }
      }
    }

    // If no capabilities found, try splitting by commas/semicolons after certain keywords
    if (capabilities.length === 0) {
      const capSection = description.match(/(?:capable of|can|should be able to|负责|能够)([^\n]+)/i);
      if (capSection?.[1]) {
        const items = capSection[1].split(/[,;，；、]/).map((s) => s.trim()).filter((s) => s.length > 2);
        capabilities.push(...items);
      }
    }

    // Default capability if none found
    if (capabilities.length === 0) {
      capabilities.push('Assist users with tasks related to ' + title);
    }

    // Extract scenarios
    const scenarios: string[] = [];
    const scenarioMatch = description.match(
      /(?:scenarios?|use cases?|situations?|场景|用例)[:\s]+([^\n]+)/i,
    );
    if (scenarioMatch?.[1]) {
      scenarios.push(
        ...scenarioMatch[1]
          .split(/[,;，；、]/)
          .map((s) => s.trim())
          .filter((s) => s.length > 2),
      );
    }
    if (scenarios.length === 0) {
      scenarios.push('General assistance');
    }

    // Extract tone
    const toneMatch = description.match(/(?:tone|style|语气|风格)[:\s]+([^\n,.]+)/i);
    const tone = toneMatch?.[1]?.trim() || undefined;

    // Extract constraints
    const constraints: string[] = [];
    const constraintMatch = description.match(
      /(?:constraints?|limitations?|restrictions?|限制|约束)[:\s]+([^\n]+)/i,
    );
    if (constraintMatch?.[1]) {
      constraints.push(
        ...constraintMatch[1]
          .split(/[,;，；、]/)
          .map((s) => s.trim())
          .filter((s) => s.length > 2),
      );
    }

    return {
      title,
      capabilities,
      scenarios,
      tone,
      constraints: constraints.length > 0 ? constraints : undefined,
    };
  }

  /**
   * Match a template based on the parsed description.
   * Returns the best-fit template ID or 'general' as fallback.
   */
  private matchTemplate(parsed: ParsedDescription): string {
    const availableRoles = this.skillMatcher.availableRoles();
    const titleNorm = parsed.title.toLowerCase().replace(/\s+/g, '-');

    // Direct match
    if (availableRoles.includes(titleNorm)) {
      return titleNorm;
    }

    // Keyword-based matching
    const roleKeywords: Record<string, string[]> = {
      'customer-service': ['customer', 'support', '客服', '售后'],
      'sales-assistant': ['sales', 'sell', '销售', '顾问'],
      'code-reviewer': ['code', 'review', '代码', '审查'],
      'content-writer': ['content', 'write', '写作', '文案'],
      'data-analyst': ['data', 'analy', '数据', '分析'],
    };

    const searchText = `${parsed.title} ${parsed.capabilities.join(' ')} ${parsed.scenarios.join(' ')}`.toLowerCase();

    for (const [roleId, keywords] of Object.entries(roleKeywords)) {
      if (keywords.some((kw) => searchText.includes(kw))) {
        return roleId;
      }
    }

    return 'general';
  }
}
