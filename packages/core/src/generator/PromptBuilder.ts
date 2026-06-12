/**
 * PromptBuilder — builds a 6-section system prompt from a parsed description.
 *
 * Sections: identity, core capabilities, behavior norms, tool usage,
 * output format, constraints.
 */

export interface ParsedDescription {
  title: string;
  capabilities: string[];
  scenarios: string[];
  tone?: string;
  constraints?: string[];
}

export class PromptBuilder {
  /**
   * Build a complete system prompt string from a parsed description.
   * The prompt follows the 6-section format defined in the generation engine design.
   */
  build(description: ParsedDescription, tools?: { name: string; description: string }[]): string {
    const sections: string[] = [];

    // 1. Identity
    sections.push(this.buildIdentity(description));

    // 2. Core capabilities
    sections.push(this.buildCapabilities(description));

    // 3. Behavior norms
    sections.push(this.buildBehaviorNorms(description));

    // 4. Tool usage
    sections.push(this.buildToolUsage(tools ?? []));

    // 5. Output format
    sections.push(this.buildOutputFormat());

    // 6. Constraints
    sections.push(this.buildConstraints(description));

    return sections.join('\n\n');
  }

  private buildIdentity(desc: ParsedDescription): string {
    return `# ${desc.title}\n\n## Identity\nYou are a ${desc.title}. Your purpose is to assist users with tasks related to ${desc.scenarios.join(', ')}.`;
  }

  private buildCapabilities(desc: ParsedDescription): string {
    const items = desc.capabilities.map((c, i) => `${i + 1}. ${c}`).join('\n');
    return `## Core Capabilities\n${items}`;
  }

  private buildBehaviorNorms(desc: ParsedDescription): string {
    const tone = desc.tone ?? 'professional and helpful';
    const norms = [
      `Always maintain a ${tone} tone in all interactions.`,
      'Respond accurately and honestly; if uncertain, state your uncertainty clearly.',
      'Prioritize user needs and provide actionable guidance.',
      'Handle errors gracefully and provide constructive alternatives.',
      'Respect user privacy and do not request unnecessary personal information.',
    ];
    return `## Behavior Norms\n${norms.map((n) => `- ${n}`).join('\n')}`;
  }

  private buildToolUsage(tools: { name: string; description: string }[]): string {
    if (tools.length === 0) {
      return '## Tool Usage\nNo specific tools are available for this role.';
    }
    const toolList = tools.map((t) => `- **${t.name}**: ${t.description}`).join('\n');
    return `## Tool Usage\nYou can use the following tools:\n${toolList}\n\nUse tools when they are relevant to the user's request. Always explain the result of a tool call in natural language.`;
  }

  private buildOutputFormat(): string {
    return `## Output Format\n- Provide clear, well-structured responses.\n- Use markdown formatting when appropriate (headings, lists, code blocks).\n- For structured data, prefer JSON format.\n- Include relevant context and reasoning in your responses.`;
  }

  private buildConstraints(desc: ParsedDescription): string {
    const defaultConstraints = [
      'Do not generate harmful, illegal, or unethical content.',
      'Do not fabricate information or make unsupported claims.',
      'Stay within the scope of your defined role and capabilities.',
    ];
    const allConstraints = [...defaultConstraints, ...(desc.constraints ?? [])];
    return `## Constraints\n${allConstraints.map((c) => `- ${c}`).join('\n')}`;
  }
}
