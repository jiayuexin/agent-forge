import {
  AgentGenerator,
  CodeEmitter,
  PromptBuilder,
  SkillMatcher,
  TemplateEngine,
} from '@agentforge/core';

export function createGenerator(): AgentGenerator {
  return new AgentGenerator(
    new PromptBuilder(),
    new SkillMatcher(),
    new TemplateEngine(),
    new CodeEmitter()
  );
}

export function slugifyName(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'agent'
  );
}
