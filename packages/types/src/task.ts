/** @see docs/01-核心设计.md §1.3 */

/** 对话消息 — 聊天历史中的单条消息 */
export interface Message {
  /** 角色: system / user / assistant / tool */
  role: 'system' | 'user' | 'assistant' | 'tool';
  /** 消息内容 */
  content: string;
  /** 工具调用 ID(role=tool 时,标识对应哪次工具调用) */
  toolCallId?: string;
  /** 工具调用名称(role=tool 时) */
  toolName?: string;
  /** 消息时间戳 */
  timestamp?: number;
  /** 附加元数据 */
  metadata?: Record<string, unknown>;
}

export interface AgentTask {
  type: string;
  input: Record<string, unknown>;
  context?: {
    conversationId?: string;
    history?: Message[];
    userId?: string;
    metadata?: Record<string, unknown>;
  };
  meta?: {
    priority?: number;
    timeout?: number;
    traceId?: string;
  };
}
