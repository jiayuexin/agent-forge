# AgentForge 技术设计文档

> **文档版本**: v1.5
> **最后更新**: 2026-03-27
> **文档性质**: 技术设计规格（面向开发团队）
> **配套文档**: [PRD.md](./PRD.md)（产品需求）、[01-核心设计.md](./01-核心设计.md)（接口定义）

---

## 1. 技术概览

| 项 | 值 |
|---|---|
| 语言 | TypeScript 5.4+ |
| 运行时 | Node.js ≥ 18 |
| 包管理 | pnpm workspace（Monorepo） |
| 构建工具 | tsup（后端）、Vite（前端） |
| 测试框架 | Vitest |
| 代码规范 | ESLint 9 + Prettier 3 |
| 前端框架 | React 18 + TailwindCSS 4 |

---

## 2. 系统架构

### 2.1 分层架构

```
┌─────────────────────────────────────────────────────┐
│  用户交互层                                           │
│  CLI (commander)  │  Dashboard (React)  │  npm install │
├─────────────────────────────────────────────────────┤
│  产品包层（独立发布）                                   │
│  @agentforge/cli  │  @agentforge/sdk  │  dashboard  │
├─────────────────────────────────────────────────────┤
│  基础层（所有包共享）                                   │
│  @agentforge/core  │  @agentforge/types              │
├─────────────────────────────────────────────────────┤
│  Agent 产出层（用户按需发布）                            │
│  agent-customer-service  │  agent-code-reviewer  │ ... │
├─────────────────────────────────────────────────────┤
│  外部 Provider                                       │
│  OpenAI  │  Anthropic  │  Ollama  │  Custom API     │
└─────────────────────────────────────────────────────┘
```

### 2.1.1 架构全景图（Mermaid）

```mermaid
flowchart TB
    subgraph Users["用户"]
        U_CLI["CLI 用户"]
        U_SDK["SDK 开发者"]
        U_HTTP["HTTP 客户端"]
    end

    subgraph Entry["接入层"]
        CLI["@agentforge/cli"]
        SDK["@agentforge/sdk"]
        HTTP["HTTP Server"]
    end

    subgraph Core["@agentforge/core"]
        Runtime["AgentRuntime"]
        Gen["AgentGenerator"]
        PF["ProviderFactory"]
    end

    subgraph Providers["Provider 适配器"]
        OpenAI["OpenAIProvider"]
        Anthropic["AnthropicProvider"]
        Ollama["OllamaProvider"]
    end

    subgraph External["外部 LLM API"]
        OAI_API["OpenAI API"]
        ANT_API["Anthropic API"]
        OLL_API["Ollama API"]
    end

    subgraph Dash["Dashboard"]
        DashUI["React 面板"]
    end

    U_CLI --> CLI
    U_SDK --> SDK
    U_HTTP --> HTTP

    CLI --> Core
    SDK --> Core
    HTTP --> Core

    Runtime --> PF
    PF --> OpenAI
    PF --> Anthropic
    PF --> Ollama

    OpenAI --> OAI_API
    Anthropic --> ANT_API
    Ollama --> OLL_API

    DashUI <--|"WebSocket"|--> Core
```

### 2.2 Monorepo 目录结构

```
agentforge/
├── packages/
│   ├── core/                  # 核心运行时
│   │   └── src/
│   │       ├── agent/         # IAgent 接口 + BaseAgent 抽象类
│   │       ├── runtime/       # AgentRegistry, AgentExecutor, MiddlewareChain
│   │       ├── provider/      # IProvider + OpenAI/Anthropic/Ollama 实现
│   │       ├── plugin/        # IPlugin + PluginManager
│   │       └── generator/     # AgentGenerator + PromptBuilder + TemplateEngine
│   ├── types/                 # 纯类型定义（零运行时依赖）
│   ├── sdk/                   # 编排 SDK
│   │   └── src/
│   │       ├── AgentFramework.ts   # 框架主类
│   │       ├── Pipeline.ts         # 流水线（串行/并行/分支/回退）
│   │       ├── EventBus.ts         # 事件总线
│   │       └── index.ts
│   ├── cli/                   # CLI 工具
│   │   └── src/commands/       # create, batch, serve, list, run, dashboard
│   └── dashboard/             # Web 管理面板
│       └── src/
│           ├── pages/         # Home, AgentList, AgentCreate, Playground, Monitor
│           ├── components/    # UI 组件
│           ├── api/           # 后端 API 调用
│           └── store/         # 状态管理
├── templates/                 # EJS 代码模板
│   ├── base/                  # 通用模板（index.ts / prompts.ts / tools.ts）
│   └── roles/                 # 岗位模板（customer-service / code-reviewer / ...）
├── examples/                  # 使用示例
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

---

## 3. 核心模块设计

### 3.1 IAgent 接口

所有 Agent 的统一契约：

```typescript
interface IAgent<TConfig extends AgentConfig = AgentConfig> {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly version: string;
  readonly capabilities: AgentCapability[];
  readonly status: AgentStatus;

  init(config: TConfig): Promise<void>;
  execute(task: AgentTask): Promise<AgentResult>;
  stream(task: AgentTask): AsyncIterable<AgentStreamChunk>;
  destroy(): Promise<void>;
  use(plugin: IPlugin): this;
  on(event: AgentEvent, handler: EventHandler): this;
  off(event: AgentEvent, handler: EventHandler): this;
}
```

**状态机：**
```
UNINITIALIZED → INITIALIZING → READY → RUNNING → READY
                                       → ERROR → READY
                                       → PAUSED → RUNNING
                                  → DESTROYED（不可逆）
```

### 3.2 AgentConfig（多 Provider 联合类型）

```typescript
type ModelConfig =
  | { provider: 'openai';    modelName: string; apiKey: string; baseUrl?: string }
  | { provider: 'anthropic'; modelName: string; apiKey: string; baseUrl?: string }
  | { provider: 'ollama';    modelName: string; baseUrl?: string }
  | { provider: string;      modelName: string; apiKey?: string; baseUrl?: string; [key: string]: any };

interface AgentConfig {
  model: ModelConfig;
  systemPrompt: string;
  tools?: ToolDefinition[];
  middlewares?: MiddlewareConfig[];
  custom?: Record<string, any>;
}
```

### 3.3 Provider 适配器

```typescript
interface IProvider {
  chat(params: ChatParams): Promise<ChatResponse>;
  chatStream(params: ChatParams): AsyncIterable<ChatChunk>;
  validate(): Promise<boolean>;
}
```

Provider 工厂根据 `config.model.provider` 自动选择对应实现：

```typescript
class ProviderFactory {
  private static registry = new Map<string, new (config: any) => IProvider>();

  static register(type: string, ctor: new (config: any) => IProvider): void;
  static create(modelConfig: ModelConfig): IProvider;
  // 内置注册 openai / anthropic / ollama
  // 用户可通过 plugin 注册 custom provider
}
```

### 3.4 BaseAgent 抽象类

生成 Agent 的基类，内置通用能力：

```typescript
abstract class BaseAgent implements IAgent {
  private _status: AgentStatus = AgentStatus.UNINITIALIZED;
  private eventBus: EventEmitter3;
  private pluginManager: PluginManager;
  private middlewareChain: MiddlewareChain;
  private provider: IProvider;

  async init(config: AgentConfig): Promise<void> {
    this._status = AgentStatus.INITIALIZING;
    // 1. 创建 Provider
    this.provider = ProviderFactory.create(config.model);
    // 2. 加载插件
    this.pluginManager.loadPlugins(config);
    // 3. 验证状态
    await this.provider.validate();
    this._status = AgentStatus.READY;
    this.emit('initialized');
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    this._status = AgentStatus.RUNNING;
    try {
      // 1. before 中间件链
      const processedTask = await this.middlewareChain.runBefore(task);
      // 2. 子类实现具体逻辑
      const result = await this.doExecute(processedTask);
      // 3. after 中间件链
      const finalResult = await this.middlewareChain.runAfter(result, task);
      this._status = AgentStatus.READY;
      this.emit('after:execute', { task, result: finalResult });
      return finalResult;
    } catch (error) {
      this._status = AgentStatus.ERROR;
      const result = await this.middlewareChain.runOnError(error, task);
      this.emit('error', { error, task });
      return result;
    }
  }

  protected abstract doExecute(task: AgentTask): Promise<AgentResult>;
}
```

### 3.5 中间件链

```typescript
interface Middleware {
  name: string;
  before?: (task: AgentTask) => Promise<AgentTask>;
  after?: (result: AgentResult, task: AgentTask) => Promise<AgentResult>;
  onError?: (error: Error, task: AgentTask) => Promise<AgentResult>;
}

class MiddlewareChain {
  private middlewares: Middleware[] = [];

  use(middleware: Middleware): this;
  async runBefore(task: AgentTask): Promise<AgentTask>;
  async runAfter(result: AgentResult, task: AgentTask): Promise<AgentResult>;
  async runOnError(error: Error, task: AgentTask): Promise<AgentResult>;
}
```

### 3.6 插件系统

```typescript
interface IPlugin {
  name: string;
  version: string;
  install(agent: IAgent, context: PluginContext): void;
  uninstall?(agent: IAgent): void;
}

interface PluginContext {
  registerTool(tool: ToolDefinition): void;
  registerMiddleware(middleware: Middleware): void;
  registerProvider(type: string, ctor: new (config: any) => IProvider): void;
  config: AgentConfig;
  logger: Logger;
}
```

---

## 4. 生成引擎设计

### 4.1 生成流程

```
用户描述 → 描述解析 → 模板匹配 → Prompt 构建 → 工具推荐 → 代码渲染 → 项目配置 → 文档生成 → 编译验证
```

### 4.2 AgentGenerator

```typescript
class AgentGenerator {
  constructor(
    private promptBuilder: PromptBuilder,
    private templateEngine: TemplateEngine,
    private skillMatcher: SkillMatcher,
    private codeEmitter: CodeEmitter,
  ) {}

  async generate(input: GenerateInput): Promise<GenerateResult> {
    // 1. 解析描述
    const parsed = await this.parseDescription(input.description);
    // 2. 匹配模板
    const template = this.matchTemplate(parsed, input.templateId);
    // 3. 构建 Prompt
    const systemPrompt = await this.promptBuilder.build(parsed, template);
    // 4. 推荐工具
    const tools = this.skillMatcher.match(parsed, template);
    // 5. 渲染代码
    const files = await this.codeEmitter.emit({
      template,
      parsed,
      systemPrompt,
      tools,
      config: input.config,
    });
    // 6. 输出项目
    return { files, metadata: parsed };
  }

  async batch(inputs: GenerateInput[]): Promise<GenerateResult[]> {
    return Promise.all(inputs.map(input => this.generate(input)));
  }
}
```

### 4.3 PromptBuilder

根据岗位描述 + 模板生成系统提示词：

```typescript
class PromptBuilder {
  async build(parsed: ParsedDescription, template: AgentTemplate): Promise<string> {
    // 结构：
    // 1. 角色定义（来自描述）
    // 2. 核心能力（从描述提取）
    // 3. 行为规范（模板默认 + 描述补充）
    // 4. 工具使用说明（工具列表）
    // 5. 输出格式定义（结构化输出 Schema）
    // 6. 限制条件
  }
}
```

### 4.4 模板引擎

使用 EJS 渲染代码模板：

```typescript
class TemplateEngine {
  private templates: Map<string, TemplateSet> = new Map();

  loadTemplate(id: string, templateDir: string): void;
  getTemplate(id: string): TemplateSet;

  async render(templateId: string, data: TemplateData): Promise<Record<string, string>> {
    const template = this.getTemplate(templateId);
    return {
      'src/index.ts': ejs.render(template.main, data),
      'src/prompts.ts': ejs.render(template.prompts, data),
      'src/tools.ts': ejs.render(template.tools, data),
      'src/types.ts': ejs.render(template.types, data),
      'package.json': ejs.render(template.config, data),
      'tsconfig.json': ejs.render(template.tsconfig, data),
      'README.md': ejs.render(template.readme, data),
    };
  }
}
```

### 4.5 预置模板

| 模板 ID | 适用场景 | 内置工具 |
|---|---|---|
| `customer-service` | 客服、投诉处理 | 订单查询、退款、通知 |
| `sales-assistant` | 产品推荐、报价 | 产品搜索、报价生成 |
| `code-reviewer` | 代码质量审查 | 文件读取、Lint 执行 |
| `content-writer` | 文案撰写、翻译 | 无（纯文本） |
| `data-analyst` | 数据查询、报表 | 数据库查询、图表生成 |
| `general` | 通用 Agent | 无 |

---

## 5. SDK 编排设计

### 5.1 AgentFramework 主类

```typescript
class AgentFramework {
  private registry: AgentRegistry;
  private provider: IProvider;

  constructor(config: FrameworkConfig);

  // Agent 管理
  register(name: string, AgentClass: new () => IAgent): this;
  get(name: string): IAgent;
  loadAll(): Promise<void>;

  // 直接调用
  async run(name: string, task: AgentTask): Promise<AgentResult>;

  // Pipeline
  pipeline(name?: string): Pipeline;

  // 事件总线
  on(event: string, handler: Function): this;
  once(event: string, handler: Function): this;
  off(event: string, handler: Function): this;
  emit(event: string, data: any): void;
}
```

### 5.2 Pipeline 流水线

#### 基础能力

```typescript
class Pipeline {
  // 串行步骤
  add(agentName: string, options: StepOptions): this;

  // 并行步骤
  parallel(steps: ParallelStep[]): this;

  // 条件分支
  branch(condition: (output: AgentResult) => StepOptions): this;

  // 步骤间拦截器
  intercept(stepName: string, handler: InterceptorHandler): this;

  // 分叉
  fork(stepName: string, branches: ForkBranch[]): this;

  // 全局配置
  config(options: PipelineConfig): this;

  // 执行
  async run(): Promise<PipelineResult>;
}
```

#### 模型注册表与路由

编排器通过 `ModelRegistry` 集中管理多个模型端点，Agent 只需引用模型名：

```typescript
// 框架初始化时注册端点
const framework = new AgentFramework({
  modelRegistry: {
    endpoints: [
      { id: 'openai', baseUrl: 'https://api.openai.com/v1', provider: 'openai',
        apiKey: '...', models: ['gpt-4o', 'gpt-4o-mini'] },
      { id: 'ollama', baseUrl: 'http://localhost:11434', provider: 'ollama',
        models: ['qwen2.5:14b'] },
    ],
    defaultEndpoint: 'openai',
    defaultModel: 'gpt-4o',
  },
});

// Pipeline 中 Agent 只写模型名
  .pipeline('workflow')
  .add('step1', { task: '...', model: 'gpt-4o-mini' })     // 自动路由到 openai 端点
  .add('step2', { task: '...', model: { model: 'gpt-4o', endpoint: 'proxy' } }) // 指定端点
```

路由解析：`指定 endpoint` → `自动匹配第一个包含该模型的端点` → `Pipeline defaultModel` → `报错`

单 Agent 独立运行时直接用 `ModelConfig`（一个 provider + baseUrl + modelName）。

#### 回退跳转机制

下游 Agent 或拦截器通过 `PipelineControlSignal` 控制流向：

> 类型定义参见 [01-核心设计.md §1.8](01-核心设计.md#18-pipeline-编排类型)

**安全防护：**
- `PipelineConfig.maxBacktracks`：全局最大回退次数（默认 5）
- `PipelineConfig.defaultMaxRetry`：每步默认最大重试次数（默认 2）
- 每步执行完自动保存快照（`StepSnapshot`），回退时精确恢复
- 回退历史记录（`BacktrackEvent[]`）用于审计和可视化

**Agent 主动回退示例：**
```typescript
// Agent 内部逻辑
if (issues.critical) {
  return {
    output: { content: '合同有问题' },
    control: { action: 'back', targetStep: 'draft', message: '条款不合规', maxRetries: 2 },
  };
}
```

**外部拦截器示例：**
```typescript
.intercept('validate', (output) => {
  if (output.errorCount > 5) {
    return { action: 'back', targetStep: 'extract', message: '错误太多' };
  }
  return { action: 'continue' };
})
```

### 5.3 EventBus 事件总线

```typescript
// 发布 / 订阅模式，Agent 间松耦合通信
framework.on('order:created', async (data) => { ... });
framework.emit('order:created', orderData);
```

### 5.4 编排模式对比

| 模式 | 耦合度 | 适用场景 | 回退支持 |
|---|---|---|---|
| Pipeline | 中 | 固定流程、数据逐步传递 | ✅ back/jump/fork |
| EventBus | 低 | 异步通知、一对多广播 | ❌ |
| Direct | 高 | 简单 A 调 B | ❌（手动处理） |

---

## 6. CLI 设计

### 6.1 命令结构

```
agentforge <command> [options]

Commands:
  create <description>    创建 Agent（交互式）
  batch <config-file>     批量创建 Agent（YAML/JSON）
  serve [agent-dir]       启动 HTTP 服务
  list                    列出已生成 Agent
  run <agent-name>        直接运行 Agent（交互式对话）
  dashboard               启动 Web 管理面板

Options:
  --output, -o <dir>      输出目录（默认 ./agents）
  --template, -t <id>     指定模板（默认自动匹配）
  --provider, -p <type>   指定 Provider（默认 openai）
  --model, -m <name>      指定模型
  --port                  HTTP 服务端口（默认 3001）
  --verbose, -v           详细输出
```

### 6.2 create 命令流程

```
agentforge create "一个客服Agent，处理用户咨询和投诉"

1. 解析描述 → 提取岗位信息
2. 匹配模板 → customer-service
3. 生成 Prompt → 预览并确认
4. 推荐工具 → [query-order, refund, send-notification]
5. 生成代码 → ./agents/agent-customer-service/
6. 编译验证 → TypeScript 编译通过
7. 输出结果 → ✅ Agent 生成成功
```

---

## 7. HTTP 服务设计

### 7.1 Agent 自服务 API

每个 Agent 可独立启动 HTTP 服务：

| 端点 | 方法 | 说明 | 请求/响应 |
|---|---|---|---|
| `/api/execute` | POST | 同步执行 | `{ type, input }` → `AgentResult` |
| `/api/stream` | POST | 流式执行（SSE） | `{ type, input }` → `SSE stream` |
| `/api/status` | GET | 健康检查 | `{ status: 'ready', uptime: 3600 }` |
| `/api/capabilities` | GET | 能力声明 | `AgentCapability[]` |

### 7.2 Dashboard 后端 API

> 完整 API 参见 [05-CLI与API.md](05-CLI与API.md)

| 端点 | 方法 | 说明 |
|---|---|---|
| `/api/agents` | GET | Agent 列表 |
| `/api/agents` | POST | 创建 Agent |
| `/api/agents/:id` | GET | Agent 详情 |
| `/api/agents/:id/generate` | POST | 生成 Agent 代码 |
| `/api/debug/:id/chat` | POST | 调试对话（SSE） |
| `/api/debug/:id/trace/:sessionId` | GET | 调用链路 |
| `/api/debug/:id/tools` | GET | 已加载工具列表 |
| `/api/debug/:id/tools/inject` | POST | 注入临时工具 |
| `/api/debug/:id/tools/:name/mock` | POST/DEL | 设置/取消 Mock |
| `/api/debug/compare` | POST | 对比测试 |
| `/api/debug/:id/export/:sessionId` | GET | 导出报告 |
| `/api/nodes` | GET | 注册的 Agent 节点 |
| `/api/nodes/register` | POST | Agent 节点注册 |
| `/api/nodes/:name/heartbeat` | POST | 心跳上报 |
| `/ws/events` | WebSocket | 实时事件推送 |

---

## 8. Dashboard 设计

### 8.1 技术栈

- React 18 + TypeScript
- Vite 5 构建
- Ant Design 5 组件库
- TailwindCSS 4 样式辅助
- React Router 路由
- Zustand 状态管理
- Monaco Editor 代码编辑（调试台 Prompt 编辑）

### 8.2 页面路由

| 路由 | 页面 | 功能 |
|---|---|---|
| `/` | Home | 项目概览、快捷入口 |
| `/agents` | AgentList | Agent 列表、搜索、状态 |
| `/agents/create` | AgentCreate | 表单描述 → Prompt 预览 → 生成 |
| `/playground` | Playground | Agent 调试台（三栏布局） |
| `/monitor` | Monitor | 运行指标、日志、告警 |

### 8.3 调试台设计（核心页面）

```
┌──────────────┬──────────────────────┬───────────────────────┐
│   会话面板    │       对话区域        │      调试面板          │
│              │                      │                       │
│  📋 对话历史   │  👤 用户消息           │  📊 本次调用统计        │
│  ├─ 会话 1    │  🤖 Agent 回复(流式)   │  ├─ 耗时 / Token / 成本 │
│  ├─ 会话 2    │                      │                       │
│              │  ┌──────────────┐   │  🔍 调用链路追踪         │
│  ⚙ 调试配置   │  │  输入消息...   │   │  ├─ Prompt 构建 ✅     │
│  ├─ 模型选择   │  └──────────────┘   │  ├─ LLM 调用 ✅        │
│  ├─ 温度      │  [发送] [清空] [重试]   │  ├─ 工具调用 ✅        │
│  ├─ 工具开关   │                      │  └─ 结构化输出 ✅       │
│  └─ 🔌 插件市场 │                      │                       │
└──────────────┴──────────────────────┴───────────────────────┘
```

**工具插拟能力：**

| 功能 | 说明 |
|---|---|
| 动态注入工具 | 调试时挂载临时工具，指定 name / description / parameters / handler |
| Mock 工具 | once / always / sequence / error 四种模式，支持模拟延迟 |
| 工具开关 | 临时启用/禁用指定工具，测试不同工具组合 |
| 对比测试 | 同一输入同时发给不同模型/配置，左右对比输出 |
| 导出报告 | 对话记录 + 调用链路 + 统计 → Markdown / JSON |

---

## 9. 分离部署监控

### 9.1 架构

```
Dashboard Server          Agent Node 1          Agent Node 2
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ AgentRegistry │◄────│ 注册 + 心跳   │     │ 注册 + 心跳   │
│ (注册表)      │     └──────────────┘     └──────────────┘
│              │
│ MetricsPoller│──── 指标轮询 (每 30s) ────┘
│              │
│ WSEventRelay │──── WebSocket 事件转发 ───┘
└──────────────┘
```

### 9.2 注册发现

- Agent 启动时 POST `/api/nodes/register` 注册到 Dashboard
- Dashboard 分配唯一节点 ID，返回确认
- Agent 每 30 秒 POST `/api/nodes/:name/heartbeat` 上报心跳
- Dashboard 每 90 秒检查一次，超时标记节点为 `dead`
- Dashboard 指标轮询 GET `/api/metrics` 收集各节点运行数据

---

## 10. 数据存储

### 10.1 v1 存储策略

| 数据 | 存储方式 | 说明 |
|---|---|---|
| Agent 元数据 | `.agentforge.json` 文件 | 每个生成的 Agent 目录下 |
| 执行记录 | 内存（可选 SQLite） | Dashboard 运行时 |
| 调试会话 | 内存 | 调试台会话期间 |
| 调用链路 | 内存（可导出） | 每次调试的追踪数据 |
| Agent 注册表 | 内存（Dashboard 进程内） | 重启后 Agent 重新注册 |

> **v1 不引入数据库**，所有数据存储以文件和内存为主。v2 可考虑 SQLite / Redis。

---

## 11. 错误处理

### 11.1 错误分级

| 级别 | 说明 | 处理方式 |
|---|---|---|
| `VALIDATION_ERROR` | 输入校验失败 | 返回 400 + 错误详情 |
| `PROVIDER_ERROR` | LLM Provider 调用失败 | 自动重试（指数退避，最多 3 次）→ 返回 502 |
| `EXECUTION_ERROR` | Agent 执行内部错误 | 中间件 onError 处理 → 返回 500 |
| `GENERATION_ERROR` | Agent 代码生成失败 | 返回详细错误信息 + 降级提示 |
| `TIMEOUT_ERROR` | 执行超时 | 返回 504 + 已产生的部分结果 |

### 11.2 重试策略

```typescript
interface RetryConfig {
  maxRetries: number;      // 默认 3
  backoffMs: number;       // 初始退避 1000ms
  backoffMultiplier: number; // 退避倍数 2
  retryableErrors: string[]; // 可重试的错误类型
}
```

---

## 12. 安全设计（v1 基础）

| 措施 | 说明 |
|---|---|
| API Key 环境变量 | 敏感配置通过 `process.env` 传入，不硬编码 |
| CORS 白名单 | HTTP 服务默认只允许 localhost |
| 输入校验 | 所有 API 入参通过 Zod Schema 校验 |
| 工具沙箱 | 调试台注入的临时工具在沙箱中执行（v1 限制为同步表达式） |
| 无远程代码执行 | v1 不支持从远程加载 Agent 代码 |

---

## 13. 测试策略

### 13.1 测试分层

| 层级 | 覆盖范围 | 工具 | 目标 |
|---|---|---|---|
| 单元测试 | core/types/sdk 各模块 | Vitest | 覆盖率 ≥ 80% |
| 集成测试 | Provider 连接、生成流程、HTTP API | Vitest | 3 种集成模式覆盖 |
| E2E 测试 | CLI 完整流程、Dashboard 页面 | Playwright | 关键路径覆盖 |
| 生成验证 | 每个模板生成的 Agent | 自动脚本 | 编译通过 + 可执行 |

### 13.2 关键测试用例

```
tests/
├── core/
│   ├── BaseAgent.test.ts        # 生命周期 + 状态流转
│   ├── ProviderFactory.test.ts  # Provider 创建 + 自定义 Provider
│   ├── MiddlewareChain.test.ts   # 中间件顺序 + 错误处理
│   └── PluginManager.test.ts    # 插件安装 + 卸载
├── generator/
│   ├── PromptBuilder.test.ts    # Prompt 生成质量
│   ├── TemplateEngine.test.ts   # 模板渲染正确性
│   └── AgentGenerator.test.ts   # 端到端生成流程
├── sdk/
│   ├── Pipeline.test.ts         # 串行 / 并行 / 分支
│   ├── PipelineBacktrack.test.ts # 回退 / 跳转 / 快照
│   └── EventBus.test.ts         # 发布订阅
├── cli/
│   ├── create.test.ts           # 单个生成
│   └── batch.test.ts            # 批量生成
├── integration/
│   ├── npm-mode.test.ts         # npm 包集成
│   ├── http-mode.test.ts        # HTTP 服务集成
│   └── sdk-mode.test.ts         # SDK 编排集成
└── e2e/
    ├── cli-flow.test.ts         # CLI 完整流程
    └── dashboard.test.ts        # Dashboard 页面交互
```

---

## 14. 开发规范

### 14.1 包发布策略

| 包 | 发布方式 | 版本 |
|---|---|---|
| `@agentforge/types` | npm public | 独立版本 |
| `@agentforge/core` | npm public | 独立版本 |
| `@agentforge/sdk` | npm public | 独立版本 |
| `@agentforge/cli` | npm public | 独立版本 |
| `@agentforge/dashboard` | npm public | 独立版本 |

### 14.2 依赖管理原则

- 生成的 Agent 核心依赖 ≤ 2 个（`@agentforge/core` + 选定的 Provider SDK）
- Provider SDK 作为 peerDependencies，由宿主项目安装
- 框架内部包通过 pnpm workspace 协议引用

### 14.3 代码规范

- TypeScript strict 模式
- ESLint + Prettier 强制一致
- 提交前 husky + lint-staged
- 语义化版本（Semantic Versioning）
- CHANGELOG.md 自动生成

### 14.4 术语与命名风格指南

- **Agent**（首字母大写）指类、接口或类型，如 `IAgent`、`BaseAgent`；**agent**（全小写）指实例，如 `const agent = new CustomerServiceAgent()`
- **API Key** 用于面向用户的文案和文档描述；**apiKey**（驼峰）用于代码属性名和配置字段

---

## 15. 部署与运维

### 15.1 部署模式

| 模式 | 适用场景 | 说明 |
|---|---|---|
| npm 嵌入 | 最简集成 | `npm install @agentforge/sdk`，直接在宿主项目中使用 |
| Docker 容器 | 推荐生产 | 独立容器部署，包含 serve / dashboard 两种模式 |
| Kubernetes | 大规模 | 多副本 + HPA + 滚动更新，适合企业级部署 |

### 15.2 Docker 镜像构建

多阶段构建，基于 `node:20-alpine`，ARG `ENTRYPOINT` 支持 `serve` / `dashboard` 两种模式。

```dockerfile
# ---- Stage 1: Build ----
FROM node:20-alpine AS builder

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/ ./packages/
COPY templates/ ./templates/

RUN pnpm install --frozen-lockfile
RUN pnpm run build

# ---- Stage 2: Production ----
FROM node:20-alpine AS runner

WORKDIR /app

# 非根用户
RUN addgroup --system agentforge && adduser --system --ingroup agentforge agentforge

COPY --from=builder /app/packages/cli/dist ./packages/cli/dist
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/sdk/dist ./packages/sdk/dist
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/dashboard/dist ./packages/dashboard/dist
COPY --from=builder /app/templates ./templates
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules

RUN chown -R agentforge:agentforge /app
USER agentforge

# 入口模式: serve | dashboard
ARG ENTRYPOINT=serve
ENV ENTRYPOINT_MODE=${ENTRYPOINT}

EXPOSE 3001

CMD ["sh", "-c", "node packages/cli/dist/index.js ${ENTRYPOINT_MODE}"]
```

### 15.3 CI/CD Pipeline

GitHub Actions 工作流草案：

```yaml
# .github/workflows/ci.yml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
  release:
    types: [published]

jobs:
  lint-typecheck-test-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm run lint
      - run: pnpm run type-check
      - run: pnpm run test
      - run: pnpm run build

  e2e:
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    needs: lint-typecheck-test-build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm run build
      - run: pnpm run test:e2e

  publish-and-docker:
    if: github.event_name == 'release'
    needs: lint-typecheck-test-build
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
          registry-url: https://registry.npmjs.org
      - run: pnpm install --frozen-lockfile
      - run: pnpm run build
      - run: pnpm -r publish --access public --no-git-checks
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
      - name: Docker Build & Push
        run: |
          docker build --build-arg ENTRYPOINT=serve \
            -t ghcr.io/${{ github.repository }}:serve-${{ github.ref_name }} .
          docker build --build-arg ENTRYPOINT=dashboard \
            -t ghcr.io/${{ github.repository }}:dashboard-${{ github.ref_name }} .
          docker push ghcr.io/${{ github.repository }}:serve-${{ github.ref_name }}
          docker push ghcr.io/${{ github.repository }}:dashboard-${{ github.ref_name }}
```

### 15.4 环境分层

| 环境 | 文件 | 用途 |
|---|---|---|
| 开发 | `.env.development` | 本地开发，DEBUG 级别日志 |
| 预发 | `.env.staging` | 预发验证，接近生产配置 |
| 生产 | `.env.production` | 正式环境，INFO 级别日志 |

**关键环境变量：**

| 变量名 | 说明 | 示例 |
|---|---|---|
| `OPENAI_API_KEY` | OpenAI API 密钥 | `sk-...` |
| `ANTHROPIC_API_KEY` | Anthropic API 密钥 | `sk-ant-...` |
| `AGENTFORGE_PORT` | HTTP 服务端口 | `3001` |
| `LOG_LEVEL` | 日志级别 | `debug` / `info` / `warn` / `error` |

### 15.5 配置管理

**优先级（从高到低）：**

1. 环境变量（`process.env`）
2. `.env` 文件（按环境分层加载）
3. 代码默认值（`config.default.ts`）

**Secret 注入：**

- 所有敏感配置（API Key 等）仅通过环境变量注入，不落盘、不写入 `.env` 文件
- `.env` 文件中加入 `.gitignore`，防止意外提交
- 生产环境推荐通过 Kubernetes Secret / AWS Secrets Manager 注入

**配置中心（v2 规划）：**

- 支持动态配置下发，无需重启
- 候选方案：etcd / Consul
- v1 阶段不实现，仅预留 `IConfigProvider` 接口

### 15.6 健康检查

**Liveness：** 响应时间 < 5s，否则视为不健康。

**Readiness：** 所有已注册 Provider 的 `validate()` 方法通过。

**端点：** `GET /api/status`

```json
{
  "status": "ready",
  "uptime": 3600,
  "version": "1.0.0"
}
```

`status` 取值：`ready`（所有 Provider 可用）/ `degraded`（部分 Provider 不可用）/ `unhealthy`（不可用）。

### 15.7 灾备与回滚

| 项 | 说明 |
|---|---|
| 数据备份 | `.agentforge.json` + 执行日志归档，每日增量备份 |
| RPO | 24 小时 |
| RTO | 15 分钟 |
| 回滚方式 | `git revert` + 重新部署容器镜像 |

**备份策略：**

- 每日凌晨 2:00 自动备份 `.agentforge/` 目录及所有 `.agentforge.json` 文件
- 备份保留 30 天，超期自动清理
- 执行日志归档至 `.agentforge/archive/` 目录（JSONL 格式）

### 15.8 容量规划

**单 Agent QPS 参考：**

| Provider | QPS（参考值） | 说明 |
|---|---|---|
| OpenAI | ~5 | 受 API Rate Limit 约束 |
| Ollama | ~10 | 本地推理，受 GPU 算力限制 |
| Anthropic | ~5 | 受 API Rate Limit 约束 |

**Dashboard 并发：**

- WebSocket 连接上限建议：100
- 超过 100 并发建议水平扩展 Dashboard 实例 + 负载均衡

---

## 16. 可观测性

### 16.1 日志方案

**日志库：** pino + pino-pretty

| 环境 | 输出格式 | 说明 |
|---|---|---|
| 开发 | pino-pretty（可读文本） | 彩色输出，便于调试 |
| 生产 | pino（JSON） | 结构化日志，便于日志平台采集 |

**日志级别：** `debug` / `info` / `warn` / `error` / `silent`

**结构化字段：**

```json
{
  "agentId": "agent-customer-service",
  "traceId": "abc123def456",
  "stepName": "Provider.chat",
  "duration": 1200,
  "model": "gpt-4o",
  "level": "info",
  "msg": "Agent execution completed"
}
```

### 16.2 链路追踪

**SDK：** OpenTelemetry SDK

**Trace 起始：** `AgentTask.meta.traceId`，每次执行自动生成或由上游传入。

**Span 粒度：**

| Span | 说明 |
|---|---|
| `Agent.init` | Agent 初始化（Provider 创建、插件加载） |
| `Agent.execute` | Agent 执行（含 before/after 中间件） |
| `Provider.chat` | LLM API 调用 |
| `Tool.execute` | 工具调用执行 |
| `Pipeline.step` | Pipeline 单步执行 |

**传播协议：** W3C Trace Context（`traceparent` / `tracestate` Header），支持跨服务传播。

### 16.3 指标

**格式：** Prometheus exposition format

**暴露端点：** `GET /api/metrics`

| 指标名 | 类型 | 标签 | 说明 |
|---|---|---|---|
| `agentforge_executions_total` | Counter | `agentId`, `status` | 执行总次数 |
| `agentforge_execution_duration_seconds` | Histogram | `agentId` | 执行耗时分布 |
| `agentforge_tokens_used_total` | Counter | `model` | Token 消耗总量 |
| `agentforge_tool_calls_total` | Counter | `tool` | 工具调用次数 |
| `agentforge_errors_total` | Counter | `type` | 错误次数（按类型） |

### 16.4 成本控制

| 控制项 | 默认值 | 配置方式 | 说明 |
|---|---|---|---|
| 单次执行 token 上限 | 100,000 | `FrameworkConfig.maxTokensPerExec` | 超限短路返回 `AgentResult.error` |
| 工具调用最大次数 | 20 | `FrameworkConfig.maxToolCalls` | 防止工具循环调用 |
| 月度成本告警阈值 | 不限 | 环境变量 `MONTHLY_COST_LIMIT` | 超限后拒绝新执行，返回错误提示 |

**短路机制：** 超限时立即返回 `AgentResult.error`，附带错误信息说明超限原因。

### 16.5 仪表盘集成

**Dashboard 内置指标页：**

- 使用 ECharts 渲染 Prometheus 数据
- 展示：执行趋势图、Token 消耗图、错误分布图、工具调用排行
- 自动刷新间隔：30 秒

**Grafana 集成：**

- 提供 `agentforge-dashboard.json` 模板文件，可直接导入 Grafana
- 包含预设面板：概览、Agent 维度、Provider 维度、成本追踪

---

## 17. AI 安全与合规

### 17.1 提示注入防护

| 防护措施 | 说明 |
|---|---|
| System Prompt 与用户输入隔离 | `Messages[]` 按 `role` 分层：`system` / `user` / `assistant` 严格区分，用户输入仅填充 `user` 角色 |
| 工具输出消毒 | 截断超长输出（默认 10,000 字符上限）+ 正则过滤敏感模式（如 URL、Base64 编码的可疑内容） |
| 危险关键词拦截 | 工具名 / 参数黑名单：`eval`、`exec`、`rm -rf`、`child_process`、`Function(` 等，匹配时拒绝执行并记录审计日志 |

### 17.2 PII 处理

**检测：** 输入端正则检测以下类型：

| 类型 | 正则示例 |
|---|---|
| 身份证号 | `/^\d{17}[\dXx]$/` |
| 手机号 | `/^1[3-9]\d{9}$/` |
| 银行卡号 | `/^\d{16,19}$/` |

**处理流程：**

1. 检测到 PII 后自动脱敏替换为 `***`
2. 审计日志记录原始值和脱敏结果（审计日志独立存储，访问受限）
3. PII 不落盘 — 不写入 `.agentforge.json`、不写入执行记录持久化文件
4. 审计日志保留 90 天后自动清理

### 17.3 幻觉缓解

| 策略 | 说明 |
|---|---|
| 强制工具调用优先 | 配置 `tool_first` 模式，Agent 优先调用工具获取事实数据，再生成回答 |
| 结构化输出校验 | 使用 JSON Schema 验证 LLM 输出，不符合 Schema 时触发重试 |
| 来源引用 | 工具输出附带 `source` 字段，Agent 回答时需引用数据来源 |

### 17.4 输出内容过滤

- **可配置违规词列表：** 存储在 `config/blocked-words.json`，支持热更新
- **敏感话题拦截：** 政治 / 暴力 / 色情关键词匹配
- **拦截后行为：** 返回固定回复 `"抱歉，我无法回答这个问题"`，并记录审计日志

### 17.5 工具沙箱

**运行时隔离：** 使用 `isolated-vm` 库

| 配额项 | 值 |
|---|---|
| 内存上限 | 64 MB |
| 执行时间上限 | 5 秒 |
| 网络访问 | 禁止 |
| 文件系统访问 | 禁止 |

替代 v1 中"同步表达式"的模糊表述，所有调试台注入的临时工具统一在 `isolated-vm` 沙箱中执行。

**v2 规划：** 考虑 Docker 容器级隔离（每个工具调用启动独立容器），提供更强的安全边界。

### 17.6 数据驻留与合规

| 要求 | 实现方式 |
|---|---|
| 模型 API 调用加密 | 所有 API 调用走 HTTPS |
| 用户数据本地加密 | AES-256 加密 `.agentforge.json` 中的敏感字段 |
| 跨境数据传输 | 配置项 `DATA_RESIDENCY_CHECK=true` 时，调用海外 Provider 前弹窗/日志确认 |
| GDPR 数据删除 | 支持数据删除请求 — 清理 `.agentforge.json` 和关联执行日志 |

### 17.7 红队测试

**执行方式：** 定期自动注入测试，通过 `agentforge batch` 命令跑红队测试集。

**攻击面清单：**

| 攻击类型 | 说明 |
|---|---|
| 直接注入 | 用户输入中嵌入恶意指令 |
| 间接注入 | 通过工具输出/外部数据注入恶意指令 |
| 工具滥用 | 诱导 Agent 调用未授权工具 |
| 越权 | 尝试访问非授权数据或执行非授权操作 |
| PII 泄露 | 尝试让 Agent 输出未脱敏的个人信息 |
| 拒绝服务 | 极端输入导致资源耗尽 |

**频率：** 每季度执行一次，结果记录在 `docs/red-team/reports/` 目录。

---

## 18. 评估与质量保障

### 18.1 评估方法学

**三个维度：**

| 维度 | 目标 | 计算方式 |
|---|---|---|
| 描述匹配正确率 | ≥ 90% | 生成的 Agent 角色与描述意图一致的比例 |
| 工具调用准确率 | ≥ 85% | 工具调用结果符合预期的比例 |
| 首次成功率 | ≥ 70% | 首次执行即返回正确结果的比例 |

**评估集：** 每个模板 20 个测试描述，共 120 个测试用例（6 个模板 × 20）。

**自动化：** 在 vitest 中集成评估跑分，作为 CI 的可选阶段。

### 18.2 回归测试

**PR 检查清单：**

1. 类型编译通过（`pnpm run type-check`）
2. 单元测试通过（`pnpm run test`）
3. 生成测试通过（每个模板生成 + 编译验证）
4. 匹配率不退化

**基线管理：**

- 基线文件：`docs/baselines/match-rates.json`
- CI 失败阈值：任何指标下降 > 5% 即标记为失败
- 基线更新：需人工审核后手动提交

### 18.3 A/B 测试

| 测试类型 | 说明 | 记录方式 |
|---|---|---|
| Provider 切换 | 同一任务跑 OpenAI vs Anthropic，对比质量 / 成本 | `ExecutionRecord.metadata` |
| Prompt 变体测试 | 通过 `DebugConfig.variables` 注入不同 Prompt 版本 | `ExecutionRecord.metadata.promptVariant` |

**结果记录：** 所有 A/B 测试结果存储在 `ExecutionRecord.metadata` 中，Dashboard 提供对比视图。

### 18.4 性能基准

**指标：**

| 指标 | 说明 |
|---|---|
| 响应延迟 | P50 / P95 / P99 |
| 并发吞吐 | QPS vs 并发数曲线 |
| 批量生成吞吐 | agents/min |

**基准套件：** `benchmarks/` 目录，使用 `vitest bench` 运行。

### 18.5 并发与限流

| 控制项 | 默认值 | 配置方式 |
|---|---|---|
| 批量生成最大并发数 | 3 | `config.maxConcurrency` |
| Provider 速率限制 | 按 Provider 文档 | 自动适配 |

**429 重试策略：** 指数退避 + jitter

```typescript
const delay = Math.min(
  baseDelay * Math.pow(2, attempt) + Math.random() * 1000,
  maxDelay
);
```

### 18.6 错误处理

**SDK 模式错误类型：**

```
AgentError (基类)
  ├── ProviderError    — LLM Provider 调用失败
  ├── ToolError        — 工具执行失败
  └── PipelineError    — Pipeline 编排失败
```

**HTTP 状态码映射：**

| 状态码 | 说明 |
|---|---|
| 400 | 参数错误（请求校验失败） |
| 401 | 认证失败（API Key 无效） |
| 429 | 限流（Provider Rate Limit） |
| 502 | Provider 不可用 |
| 500 | 内部错误 |

**断路器：** 连续 5 次失败后断开 30 秒，半开状态允许 1 次探测请求。

**全局错误处理器：** `FrameworkConfig.onError` — 用户可注册自定义错误处理逻辑。

### 18.7 i18n / a11y

**系统 Prompt 多语言：**

- 模板支持多语言变体：`templates/roles/<name>/prompts.zh-CN.ts.ejs`
- 默认中文变体，可选英文变体
- 通过 `AgentConfig.custom.locale` 指定语言

**Dashboard 国际化：**

- 使用 `react-i18next`
- 默认中文，支持英文切换
- 语言包目录：`packages/dashboard/src/locales/`

**WCAG 2.1 AA 无障碍：**

| 要求 | 实现方式 |
|---|---|
| 键盘导航 | 所有交互组件支持 Tab / Enter / Escape 操作 |
| 对比度 | 文本与背景对比度 ≥ 4.5:1 |
| ARIA 标签 | 所有交互元素添加 `aria-label` / `aria-describedby` |

---

## 19. 长期记忆与状态

### 19.1 会话内状态

- 当前状态存储在 `AgentTask.context.history`（`Message[]`）
- 每次调用 `execute` 独立运行，无跨会话持久化
- 单次会话内的多轮对话通过 `context.history` 累积传递

### 19.2 跨会话记忆

**可选存储后端：**

| 后端 | 适用场景 | 依赖 |
|---|---|---|
| 文件（JSON） | 最简，单机开发 | 无 |
| SQLite（better-sqlite3） | 推荐，单机生产 | `better-sqlite3` |
| Redis | 分布式部署 | `ioredis` |

**统一接口：**

```typescript
interface IAgentMemory {
  save(key: string, value: any, ttl?: number): Promise<void>;
  load(key: string): Promise<any | null>;
  delete(key: string): Promise<void>;
}
```

**v1 默认：** 文件模式，存储路径 `.agentforge/memory/<agentId>.json`

### 19.3 知识库

**接口预留：**

```typescript
interface IKnowledgeBase {
  query(embedding: number[], topK: number): Promise<KnowledgeEntry[]>;
}
```

| 阶段 | 说明 |
|---|---|
| v1 | 仅接口定义，不实现 |
| v2 | 实现基于 Chroma / Milvus 的向量检索 |

### 19.4 数据生命周期

| 配置项 | 值 | 说明 |
|---|---|---|
| 执行记录保留期 | 默认 7 天 | 超期自动清理 |
| 清理策略 | Dashboard 后台定时任务 | 每天 3:00 扫描过期记录 |
| 归档路径 | `.agentforge/archive/` | 导出为 JSONL 文件 |

### 19.5 Agent 升级与回滚

**模板版本化：**

- 模板 `manifest.json` 含 `version` 字段（如 `1.2.0`）
- 生成的 Agent 记录 `generatedBy` 信息：

```typescript
interface GeneratedBy {
  templateVersion: string;
  generatorVersion: string;
  timestamp: string;
}
```

**Regenerate 流程：**

1. 读取旧 Agent 描述（保留用户意图）
2. 用新模板重新生成代码
3. 保留用户自定义修改（diff-merge 策略）
4. 冲突部分提示用户手动解决

**回滚：**

- 旧版本保留在 `.agentforge/versions/<timestamp>/`
- 回滚时从版本目录恢复

---

## 20. 版本与兼容性

### 20.1 语义化版本

- 遵循 [semver 2.0](https://semver.org/)
- `major`：破坏性变更（Breaking Change）
- `minor`：新功能（向后兼容）
- `patch`：Bug 修复（向后兼容）
- 所有 `@agentforge/*` 包版本同步发布

### 20.2 API 版本管理

- URL 路径使用 `/v1/` 前缀（如 `/v1/api/execute`）
- `v1` = 初始版本
- 版本升级时旧版保留 6 个月，过期后返回 410 Gone

### 20.3 模板版本

- 模板 `manifest.json` 含 `version` 字段
- `AgentGenerator` 自动写回 `generatedBy.templateVersion`
- 模板升级时通过 Dashboard / CLI 提示用户 `regenerate`

### 20.4 Breaking Change 政策

| 阶段 | 说明 |
|---|---|
| 公告 | major 版本升级前 2 个月发布 `DEPRECATION.md` |
| 迁移指南 | 提供 `migrations/v2.md` 详细迁移步骤 |
| 运行时警告 | 使用已废弃 API 时输出 `console.warn`（含废弃版本和替代方案） |

### 20.5 升级路径

**Codemod 工具：**

```bash
agentforge migrate --from v1 --to v2
```

- 自动化 AST 变换处理类型 / 接口改名
- 迁移报告输出至 `migrations/report.json`
- 不确定项标记为 `MANUAL_REVIEW`，需人工确认

### 20.6 CHANGELOG 自动化

- 使用 [release-please](https://github.com/googleapis/release-please) 自动管理
- 从 conventional commits 自动生成变更日志
- `CHANGELOG.md` 位于仓库根目录
- Commit 规范：`feat:` / `fix:` / `feat!:`（Breaking） / `docs:` / `chore:`

---

## 附录 A：关键设计决策记录

| # | 决策 | 选择 | 备选方案 | 原因 |
|---|---|---|---|---|
| D1 | 语言 | TypeScript | Python | 用户画像为 Node.js 开发者 |
| D2 | 包管理 | pnpm workspace | npm/turborepo | pnpm 天然支持 workspace |
| D3 | 前端框架 | React | Vue/Svelte | 生态最成熟 |
| D4 | 模板引擎 | EJS | Handlebars/Markdown | EJS 支持完整 JS 语法 |
| D5 | 数据存储 | 文件+内存 | SQLite/PostgreSQL | v1 最简，不引入数据库 |
| D6 | 状态管理 | Zustand | Redux/Jotai | 轻量，适合中等规模面板 |
| D7 | 测试框架 | Vitest | Jest | 更快的 ESM 支持 |
| D8 | UI 组件 + 样式 | Ant Design + TailwindCSS | MUI / Chakra UI + CSS Modules | Ant Design 企业级组件丰富，TailwindCSS 补充原子化样式，兼顾效率与灵活 |
| D9 | v1 不引入数据库 | 文件 + 内存 | SQLite / Redis | v1 优先最小依赖和零运维，文件+内存满足 MVP 需求；v2 再引入 SQLite/Redis |
| D10 | Anthropic Function Call 适配层 | IProvider 统一抽象 + 适配器 | 直接集成 Anthropic SDK | Anthropic 的 tool_use 格式与 OpenAI 不同，通过 Provider 适配层抹平差异，上层代码无感知 |

## 附录 B：设计文档索引

| 文档 / 章节 | 说明 |
|---|---|
| [PRD.md](./PRD.md) | 产品需求文档 |
| [01-核心设计.md](./01-核心设计.md) | IAgent 接口、数据模型、Pipeline 类型 |
| [02-单个Agent功能.md](./02-单个Agent功能.md) | Agent 十大能力详解 |
| [03-生成引擎.md](./03-生成引擎.md) | 生成流程、Prompt 策略、模板库 |
| [04-集成与编排.md](./04-集成与编排.md) | 三种集成模式 + 三种编排模式 |
| [05-CLI与API.md](./05-CLI与API.md) | CLI 命令 + HTTP/WebSocket API |
| [06-可视化面板.md](./06-可视化面板.md) | Dashboard 设计 + 调试台 + 部署监控 |
| [07-技术选型与架构.md](./07-技术选型与架构.md) | 依赖选型 + Monorepo 结构 |
| [08-需求与路线图.md](./08-需求与路线图.md) | 原始需求与路线图（v1.5 设计稿） |
| §15 部署与运维 | Docker 镜像构建、CI/CD Pipeline、环境分层、健康检查、灾备回滚、容量规划 |
| §16 可观测性 | 日志方案（pino）、链路追踪（OpenTelemetry）、指标（Prometheus）、成本控制、仪表盘集成 |
| §17 AI 安全与合规 | 提示注入防护、PII 处理、幻觉缓解、输出内容过滤、工具沙箱、数据驻留、红队测试 |
| §18 评估与质量保障 | 评估方法学、回归测试、A/B 测试、性能基准、并发限流、错误处理、i18n/a11y |
| §19 长期记忆与状态 | 会话内状态、跨会话记忆、知识库接口、数据生命周期、Agent 升级与回滚 |
| §20 版本与兼容性 | 语义化版本、API 版本管理、模板版本、Breaking Change 政策、升级路径、CHANGELOG 自动化 |
