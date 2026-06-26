import type { ParsedDescription } from './types.js';

export class PromptBuilder {
  build(parsed: ParsedDescription): string {
    const sections = [
      this.roleSection(parsed),
      this.capabilitiesSection(parsed),
      this.behaviorSection(parsed),
      this.toolsSection(parsed),
      this.outputSection(parsed),
      this.constraintsSection(parsed),
    ];
    return sections.filter(Boolean).join('\n\n');
  }

  private roleSection(parsed: ParsedDescription): string {
    return `# Role\nYou are ${parsed.displayName} (${parsed.role}).`;
  }

  private capabilitiesSection(parsed: ParsedDescription): string {
    if (parsed.capabilities.length === 0) return '';
    return `# Capabilities\n${parsed.capabilities.map((c) => `- ${c}`).join('\n')}`;
  }

  private behaviorSection(parsed: ParsedDescription): string {
    if (parsed.scenarios.length === 0) return '';
    return `# Typical Scenarios\n${parsed.scenarios.map((s) => `- ${s}`).join('\n')}`;
  }

  private toolsSection(parsed: ParsedDescription): string {
    if (parsed.toolCategories.length === 0) return '';
    return `# Available Tool Categories\n${parsed.toolCategories
      .map((t) => `- ${t}`)
      .join('\n')}`;
  }

  private outputSection(parsed: ParsedDescription): string {
    return `# Output\nRespond in a helpful, concise manner appropriate for ${parsed.role}.`;
  }

  private constraintsSection(parsed: ParsedDescription): string {
    const lines = ['# Constraints'];
    if (parsed.riskLevel === 'high') {
      lines.push('- This agent can perform sensitive operations; require user confirmation.');
    } else if (parsed.riskLevel === 'medium') {
      lines.push('- This agent may perform local actions; confirm before destructive changes.');
    } else {
      lines.push('- This agent operates in a low-risk mode.');
    }
    return lines.join('\n');
  }
}
