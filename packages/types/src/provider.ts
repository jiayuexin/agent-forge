/** @see docs/01-核心设计.md §1.4, §1.10 */

import type { Message } from './task';
import type { ToolDefinition } from './config';

/** 单个模型端点 — 一个 baseUrl 下可注册多个模型 */
export interface ModelEndpoint {
  /** 端点标识符，用于 agent 引用 */
  id: string;
  /** 端点地址 */
  baseUrl: string;
  /** Provider 类型 */
  provider: 'openai' | 'anthropic' | 'ollama' | string;
  /** API Key（openai/anthropic 需要） */
  apiKey?: string;
  /** 额外参数（anthropicVersion, organization 等） */
  extra?: Record<string, unknown>;
  /** 该端点下注册的模型列表 */
  models: string[];
}

/** 模型注册表 — 框架初始化时一次性配置 */
export interface ModelRegistry {
  /** 所有端点 */
  endpoints: ModelEndpoint[];
  /** 默认端点 id（Agent 不指定模型时的回退） */
  defaultEndpoint?: string;
  /** 默认模型名 */
  defaultModel?: string;
}

/** Agent 引用模型的方式 — 只需模型名 + 可选端点 id */
export interface ModelRef {
  /** 模型名（如 'gpt-4o', 'qwen2.5:14b'） */
  model: string;
  /** 指定使用哪个端点（可选，不指定时自动匹配第一个注册了该模型的端点） */
  endpoint?: string;
}

/** 工具调用请求 — LLM 返回的"我要调用这个工具" */
export interface ToolCallRequest {
  /** 工具名(kebab-case) */
  name: string;
  /** 调用参数 */
  args: Record<string, unknown>;
  /** 调用 ID(用于匹配结果) */
  callId: string;
}

/** 聊天请求参数 */
export interface ChatParams {
  /** 消息列表,含 system/user/assistant/tool 角色 */
  messages: Message[];
  /** 可用的工具定义(Function Calling) */
  tools?: ToolDefinition[];
  /** 生成参数 */
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
  /** 请求级超时(ms) */
  timeout?: number;
  /** 请求级追踪 ID,透传给 Provider */
  traceId?: string;
}

/** 聊天响应 — 同步模式 */
export interface ChatResponse {
  /** 消息内容(纯文本) */
  content: string;
  /** 结构化输出(若 Agent 配置了结构化输出) */
  structured?: Record<string, unknown>;
  /** 工具调用请求(若 LLM 决定调用工具) */
  toolCalls?: ToolCallRequest[];
  /** token 用量 */
  usage: { input: number; output: number; total: number };
  /** 使用的模型名 */
  model: string;
  /** 结束原因: stop / tool_call / max_tokens / error */
  finishReason: string;
}

/** 聊天流式 chunk */
export interface ChatChunk {
  type: 'text' | 'tool_call' | 'tool_result' | 'thinking' | 'done' | 'error';
  /** 文本内容增量 */
  delta?: string;
  /** 工具调用增量 */
  toolCallDelta?: {
    index: number;
    name?: string;
    argsDelta?: string;
  };
  /** 完成的工具调用(仅 type=tool_call 且调用完成时) */
  toolCall?: ToolCallRequest;
  /** 完成的工具结果(仅 type=tool_result) */
  toolResult?: { name: string; output: unknown };
  /** 用量(仅 type=done) */
  usage?: { input: number; output: number; total: number };
  /** 结束原因(仅 type=done) */
  finishReason?: string;
  /** 错误信息(仅 type=error) */
  error?: { code: string; message: string };
}

/** Provider 核心接口 */
export interface IProvider {
  /** Provider 标识 */
  readonly provider: string;
  /** 同步聊天 — 返回完整响应 */
  chat(params: ChatParams): Promise<ChatResponse>;
  /** 流式聊天 — 返回 AsyncIterable chunk */
  chatStream(params: ChatParams): AsyncIterable<ChatChunk>;
  /** 验证配置是否合法(如 API Key 格式、baseUrl 可达) */
  validate(): Promise<boolean>;
}
