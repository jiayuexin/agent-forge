import {
  AgentGenerator,
  CodeEmitter,
  PromptBuilder,
  SkillMatcher,
  TemplateEngine,
  registerDefaultSkillCatalog,
} from '@agentforge/core';

export function createGenerator(): AgentGenerator {
  const skillMatcher = new SkillMatcher();
  registerDefaultSkillCatalog(skillMatcher);
  return new AgentGenerator(
    new PromptBuilder(),
    skillMatcher,
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

export function defaultOutputDir(name: string): string {
  return `./client-agents/${name}`;
}
