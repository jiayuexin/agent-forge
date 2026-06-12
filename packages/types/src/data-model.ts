/** @see docs/01-核心设计.md §1.7 */

import type { AgentCapability } from './agent';
import type { AgentConfig } from './config';
import type { ToolDefinition } from './config';
import type { AgentTask } from './task';
import type { AgentResult } from './result';
import type { AgentMetrics } from './result';

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
  systemPromptTemplate: string;
  defaultTools: ToolDefinition[];
  defaultConfig: Partial<AgentConfig>;
  codeTemplates: {
    main: string;
    prompts: string;
    tools: string;
    config: string;
    test: string;
    readme: string;
  };
}

export interface ExecutionRecord {
  id: string;
  agentId: string;
  taskId: string;
  task: AgentTask;
  result: AgentResult;
  startedAt: string;
  completedAt: string;
  traceId: string;
}

/** AgentNode（Dashboard 注册表，用于分离部署监控） */
export interface AgentNode {
  name: string;
  url: string;
  tags: string[];
  capabilities: AgentCapability[];
  registeredAt: number;
  lastHeartbeat: number;
  status: 'alive' | 'dead';
  metrics: AgentMetrics | null;
  hostInfo?: {
    hostname: string;
    ip: string;
    pid: number;
  };
}
