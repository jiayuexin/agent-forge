import type {
  AgentIdentity,
  AgentTemplate,
  ClientAgentConfig,
  ClientAgentSecurityConfig,
  ToolDefinition,
} from '@agentforge/types';

export interface GenerateInput {
  description: string;
  name?: string;
  templateId?: string;
  outputDir?: string;
  config?: Partial<ClientAgentConfig>;
  custom?: Record<string, unknown>;
}

export interface ParsedDescription {
  role: string;
  name: string;
  displayName: string;
  capabilities: string[];
  scenarios: string[];
  toolCategories: string[];
  riskLevel: 'low' | 'medium' | 'high';
}

export interface TemplateSet {
  id: string;
  meta: AgentTemplate;
  files: Record<string, string>;
}

export interface TemplateData {
  identity: AgentIdentity;
  parsed: ParsedDescription;
  systemPrompt: string;
  tools: ToolDefinition[];
  config: Partial<ClientAgentConfig>;
  security: ClientAgentSecurityConfig;
  versions: { core: string; runtimeClient: string };
}

export interface EmitContext {
  template: TemplateSet;
  parsed: ParsedDescription;
  systemPrompt: string;
  tools: ToolDefinition[];
  config: Partial<ClientAgentConfig>;
}

export interface GenerateResult {
  files: Record<string, string>;
  metadata: ParsedDescription;
}
