/** Capability Hub 服务器配置 */
export interface HubServerConfig {
  /** 监听端口 */
  port?: number;
  /** 监听主机 */
  host?: string;
  /** 数据持久化目录 */
  dataDir?: string;
  /** 管理员令牌；若提供则所有管理接口必须携带 */
  adminToken?: string;
  /** 默认模型注册表 */
  modelRegistry?: unknown;
}

/** Capability Hub 运行时公开配置（已脱敏） */
export interface HubRuntimeConfig {
  port: number;
  host: string;
  version: string;
  logLevel: string;
}

/** Hub 节点认证令牌 */
export interface HubToken {
  /** 令牌 ID */
  id: string;
  /** 令牌明文；仅在创建时返回 */
  token?: string;
  /** 允许的节点 ID；为空表示不限制 */
  nodeIds?: string[];
  /** 创建时间 */
  createdAt: number;
  /** 过期时间 */
  expiresAt?: number;
  /** 备注 */
  note?: string;
}

/** 创建令牌请求 */
export interface CreateHubTokenRequest {
  nodeName?: string;
  nodeIds?: string[];
  expiresInHours?: number;
  note?: string;
}

/** 创建令牌响应 */
export interface CreateHubTokenResponse {
  token: string;
  tokenId: string;
  nodeId: string;
  expiresAt?: number;
}

/** ClientAgent 模板列表项 */
export interface ClientAgentTemplateListItem {
  id: string;
  name: string;
  displayName: string;
  description: string;
  category: string;
  tags: string[];
}

/** 已生成的 ClientAgent 列表项 */
export interface GeneratedClientAgentListItem {
  id: string;
  name: string;
  displayName: string;
  description: string;
  templateId: string;
  model?: string;
  createdAt: number;
}

/** 已生成的 ClientAgent 详情 */
export interface GeneratedClientAgentDetail extends GeneratedClientAgentListItem {
  outputDir: string;
  systemPrompt: string;
  riskLevel: 'low' | 'medium' | 'high';
}

/** Web 端创建 ClientAgent 请求 */
export interface CreateClientAgentRequest {
  name: string;
  description: string;
  templateId: string;
  model?: string;
}

/** 能力下发请求 */
export interface DistributeCapabilityRequest {
  /** 目标节点 ID 列表 */
  nodeIds: string[];
  /** 下发动作 */
  action: 'add' | 'update' | 'remove';
  /** 目标版本 */
  targetVersion?: string;
}

/** 节点执行任务请求 */
export interface NodeExecuteRequest {
  /** 任务类型 */
  type: string;
  /** 任务输入 */
  input?: Record<string, unknown>;
  /** 任务上下文 */
  context?: {
    conversationId?: string;
    history?: unknown[];
    userId?: string;
    metadata?: Record<string, unknown>;
  };
  /** 任务元数据 */
  meta?: {
    priority?: number;
    timeout?: number;
    traceId?: string;
  };
}

/** 节点流式任务请求，与 NodeExecuteRequest 同结构 */
export type NodeStreamRequest = NodeExecuteRequest;

/** 节点配置更新请求 */
export interface NodeConfigUpdateRequest {
  allowRemoteExecution?: boolean;
  heartbeatInterval?: number;
  requireLocalConfirmation?: string[];
  tags?: string[];
}
