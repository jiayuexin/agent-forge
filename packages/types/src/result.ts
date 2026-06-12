/** @see docs/01-核心设计.md §1.5 */

/** 输出产物 — Agent 生成的文件/数据/链接等 */
export interface Artifact {
  /** 产物类型 */
  type: 'file' | 'url' | 'data' | 'image';
  /** 产物名称 */
  name: string;
  /** 产物内容(文本/file 内容/url) */
  content?: string;
  /** 产物 URL(type=url 时) */
  url?: string;
  /** MIME 类型 */
  mimeType?: string;
  /** 附加元数据 */
  metadata?: Record<string, unknown>;
}

/** 工具调用记录 — 执行结果中记录已调用的工具 */
export interface ToolCallRecord {
  /** 工具名(kebab-case) */
  name: string;
  /** 调用参数 */
  args: Record<string, unknown>;
  /** 工具返回结果 */
  result: unknown;
  /** 调用耗时(ms) */
  duration: number;
  /** 调用状态 */
  status: 'success' | 'error';
  /** 错误信息(status=error 时) */
  error?: string;
}

/** Agent 运行时指标 — Dashboard 监控用 */
export interface AgentMetrics {
  /** 总执行次数 */
  totalExecutions: number;
  /** 成功次数 */
  successCount: number;
  /** 失败次数 */
  errorCount: number;
  /** 平均执行时长(ms) */
  avgDuration: number;
  /** 平均 token 消耗 */
  avgTokens: { input: number; output: number; total: number };
  /** 总 token 消耗 */
  totalTokens: { input: number; output: number; total: number };
  /** 工具调用次数统计(按工具名分组) */
  toolCallCounts: Record<string, number>;
  /** 上次执行时间戳 */
  lastExecutionAt: number;
}

export interface AgentResult {
  success: boolean;
  output: {
    content: string;
    structured?: Record<string, unknown>;
    artifacts?: Artifact[];
  };
  meta: {
    duration: number;
    tokensUsed: {
      input: number;
      output: number;
      total: number;
    };
    model: string;
    toolsCalled?: ToolCallRecord[];
  };
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}
