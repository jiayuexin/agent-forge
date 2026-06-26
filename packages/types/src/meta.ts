import type { AgentConfig } from './config.js';
import type { AgentCapability } from './core.js';
import type { ToolDefinition } from './tool.js';

/**
 * Metadata and template types.
 */

export interface AgentMeta {
  id: string;
  name: string;
  description: string;
  role: string;
  version: string;
  createdAt: string;
  updatedAt: string;
  author: string;
  tags: string[];
  capabilities: AgentCapability[];
  config: AgentConfig;
  dependencies: string[];
}

export interface AgentTemplate {
  id: string;
  name: string;
  displayName: string;
  description: string;
  category: string;
  riskLevel?: 'low' | 'medium' | 'high';
  systemPromptTemplate: string;
  defaultTools: ToolDefinition[];
  defaultConfig: Partial<AgentConfig>;
  codeTemplates: {
    main: string;
    agent: string;
    prompts: string;
    tools: string;
    types: string;
    runtime: string;
    config: string;
    tsconfig: string;
    readme: string;
    security: string;
    test?: string;
  };
}

export interface ExecutionRecord {
  id: string;
  agentId: string;
  taskId: string;
  task: import('./task.js').AgentTask;
  result: import('./result.js').AgentResult;
  startedAt: string;
  completedAt: string;
  traceId: string;
  metadata?: Record<string, unknown>;
}
