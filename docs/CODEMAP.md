# AgentForge 代码地图

> **作用**：本文件是代码与架构的**导航索引**，不是设计规格。它告诉你“某个概念在哪里实现/将会在哪里实现”。具体设计 rationale 请回查对应的设计文档。
>
> **维护方式**：每次新增/移动包、公开导出、CLI 命令、API 路由、Dashboard 路由时，同步更新本文件。
>
> **状态标记**：
> - `[planned]` — 位置已确定，代码尚未实现
> - `[implemented]` — 代码已实现
> - `[partial]` — 部分实现或路径有调整
> - `[deprecated]` — 旧路径，不再使用

---

## 快速入口

- 文档导航：`docs/README.md`
- 实现状态：`docs/STATUS.md`
- 类型权威：`docs/design/01-核心设计.md`
- 架构总览：`docs/design/TECH-DESIGN.md`
- 项目指引：`CLAUDE.md`

---

## Monorepo 布局一览

```
agentforge/
├── packages/
│   ├── types/                 # 纯类型定义（零运行时依赖）
│   ├── core/                  # IAgent、BaseAgent、Provider、Generator、Plugin
│   ├── sdk/                   # AgentFramework、Pipeline、EventBus
│   ├── cli/                   # Commander CLI
│   ├── http-server/           # ClientAgent 本地调试 HTTP/WebSocket 服务（可选，非主要生产路径）
│   ├── dashboard/             # Capability Hub Web 面板 + 后端
│   └── runtime-client/        # 客户端 Agent 运行时（连接 Capability Hub）
├── templates/                 # EJS 模板
│   ├── base/                  # 通用脚手架
│   └── roles/                 # 岗位模板
├── examples/                  # 使用示例
├── docs/                      # 文档（含本文件）
└── client-agents/             # 默认生成的 ClientAgent 输出目录（运行时产生）
```

### 包依赖关系

```
@agentforge/types
        ↑
@agentforge/core
        ↑        ↑        ↑
@agentforge/sdk  @agentforge/runtime-client  @agentforge/http-server
        ↑        ↑        ↑
@agentforge/dashboard        @agentforge/cli
```

> 说明：`@agentforge/cli` 依赖上述所有包（用于生成、运行、启动 Hub 与调试服务）；`@agentforge/dashboard` 依赖 `@agentforge/sdk` 以复用编排能力。

---

## 包地图

### `@agentforge/types`

- **职责**：所有包共享的纯类型定义，零运行时依赖。
- **关键文件（planned）**：
  - `packages/types/src/index.ts` — 统一导出
  - `packages/types/src/agent.ts` — `IAgent`、`AgentStatus`、`AgentCapability`
  - `packages/types/src/config.ts` — `AgentConfig`、`ModelConfig`
  - `packages/types/src/task.ts` — `AgentTask`、`Message`
  - `packages/types/src/result.ts` — `AgentResult`、`Artifact`、`ToolCallRecord`
  - `packages/types/src/pipeline.ts` — `PipelineControlSignal`、`StepSnapshot`、`PipelineConfig`
  - `packages/types/src/provider.ts` — `IProvider`、`ChatParams`、`ChatResponse`
- **设计权威**：`docs/design/01-核心设计.md`

### `@agentforge/core`

- **职责**：Agent 运行时、Provider 适配、生成引擎、插件系统。
- **关键文件（planned）**：
  - `packages/core/src/agent/IAgent.ts` — `IAgent` 接口（或从 types 重导出）
  - `packages/core/src/agent/BaseAgent.ts` — 抽象基类，实现生命周期、中间件、事件
  - `packages/core/src/runtime/AgentRegistry.ts` — Agent 注册表
  - `packages/core/src/runtime/AgentExecutor.ts` — 执行器
  - `packages/core/src/runtime/MiddlewareChain.ts` — 中间件链
  - `packages/core/src/provider/IProvider.ts` — Provider 接口
  - `packages/core/src/provider/ProviderFactory.ts` — Provider 工厂
  - `packages/core/src/provider/OpenAIProvider.ts` — OpenAI 适配
  - `packages/core/src/provider/AnthropicProvider.ts` — Anthropic 适配
  - `packages/core/src/provider/OllamaProvider.ts` — Ollama 适配
  - `packages/core/src/generator/AgentGenerator.ts` — 生成引擎主类
  - `packages/core/src/generator/PromptBuilder.ts` — Prompt 构建
  - `packages/core/src/generator/TemplateEngine.ts` — EJS 模板渲染
  - `packages/core/src/generator/SkillMatcher.ts` — 工具推荐
  - `packages/core/src/generator/CodeEmitter.ts` — 文件写入
  - `packages/core/src/plugin/IPlugin.ts` — 插件接口
  - `packages/core/src/plugin/PluginManager.ts` — 插件管理
- **设计权威**：`docs/design/01-核心设计.md`、`docs/design/TECH-DESIGN.md` §3 / §4

### `@agentforge/runtime-client`

- **职责**：客户端 Agent 运行时。每个生成的 ClientAgent 依赖此包，用于连接 Capability Hub 并接收远程控制，同时管理本地能力缓存。
- **关键文件（planned）**：
  - `packages/runtime-client/src/AgentRuntimeClient.ts` — 运行时主类
  - `packages/runtime-client/src/WebSocketTransport.ts` — WebSocket 连接管理
  - `packages/runtime-client/src/HeartbeatManager.ts` — 心跳管理
  - `packages/runtime-client/src/CapabilityCache.ts` — 本地能力缓存
  - `packages/runtime-client/src/index.ts` — 统一导出
- **设计权威**：`docs/design/01-核心设计.md` §1.13、`docs/design/08-客户端Agent与无状态Agent.md`、`docs/design/09-能力市场与下发.md`

### `@agentforge/sdk`

- **职责**：面向开发者的编排 SDK。核心是基于 LLM 的模型驱动编排器。
- **关键文件（planned）**：
  - `packages/sdk/src/index.ts` — 统一导出
  - `packages/sdk/src/AgentFramework.ts` — 框架主类
  - `packages/sdk/src/discovery/CapabilityRegistry.ts` — 能力注册表
  - `packages/sdk/src/planner/PlannerAgent.ts` — 规划 Agent
  - `packages/sdk/src/planner/PlanExecutor.ts` — 计划执行器
  - `packages/sdk/src/Pipeline.ts` — Pipeline 底层执行引擎
  - `packages/sdk/src/EventBus.ts` — 事件总线
  - `packages/sdk/src/ModelRegistry.ts` — 多端点模型解析
- **设计权威**：`docs/design/04-集成与编排.md`、`docs/design/TECH-DESIGN.md` §5

### `@agentforge/cli`

- **职责**：命令行入口。
- **关键文件（planned）**：
  - `packages/cli/src/index.ts` — CLI 入口
  - `packages/cli/src/commands/create.ts` — `agentforge create`（生成 ClientAgent）
  - `packages/cli/src/commands/run.ts` — `agentforge run`（启动 ClientAgent 守护进程）
  - `packages/cli/src/commands/dashboard.ts` — `agentforge dashboard`（启动 Capability Hub）
  - `packages/cli/src/commands/capability.ts` — `agentforge capability`（能力市场管理）
  - `packages/cli/src/commands/batch.ts` — `agentforge batch`（批量生成 ClientAgent）
  - `packages/cli/src/commands/serve.ts` — `agentforge serve`（本地调试 HTTP 服务，可选）
  - `packages/cli/src/commands/list.ts` — `agentforge list`（列出已生成的 ClientAgent）
- **设计权威**：`docs/design/05-CLI与API.md` §5、`docs/ops/GUIDE.md`

### `@agentforge/http-server`

- **职责**：可选的本地 HTTP/WebSocket 服务，仅用于开发调试单个 ClientAgent（非主要生产路径）。
- **关键文件（planned）**：
  - `packages/http-server/src/server.ts` — 服务入口
  - `packages/http-server/src/routes/agents.ts` — ClientAgent 执行/流式/状态路由
  - `packages/http-server/src/routes/health.ts` — `/api/health`、`/api/status`、`/api/metrics`
- **设计权威**：`docs/design/05-CLI与API.md`

### `@agentforge/dashboard`

- **职责**：Capability Hub。管理 ClientAgent 模板、客户端节点注册表、能力市场、远程命令下发、事件流。
- **关键文件（planned）**：
  - `packages/dashboard/src/main.tsx` — 入口
  - `packages/dashboard/src/App.tsx` — 根组件
  - `packages/dashboard/src/pages/Home.tsx` — 首页 `/`
  - `packages/dashboard/src/pages/AgentList.tsx` — ClientAgent 模板列表 `/agents`
  - `packages/dashboard/src/pages/AgentCreate.tsx` — 创建 ClientAgent `/agents/create`
  - `packages/dashboard/src/pages/NodeList.tsx` — 节点列表 `/nodes`
  - `packages/dashboard/src/pages/NodeDetail.tsx` — 节点详情 `/nodes/:id`
  - `packages/dashboard/src/pages/CapabilityList.tsx` — 能力市场 `/capabilities`
  - `packages/dashboard/src/pages/Playground.tsx` — 调试台 `/playground`
  - `packages/dashboard/src/pages/Monitor.tsx` — 监控 `/monitor`
  - `packages/dashboard/src/api/` — 后端 API 调用
  - `packages/dashboard/src/store/` — Zustand 状态管理
- **设计权威**：`docs/design/06-可视化面板.md`、`docs/design/09-能力市场与下发.md`、`docs/design/TECH-DESIGN.md` §8

### `@agentforge/runtime-client`

- **职责**：客户端运行时。每个生成的 Agent 依赖此包，用于连接 Dashboard 并接收远程控制。
- **关键文件（planned）**：
  - `packages/runtime-client/src/AgentRuntimeClient.ts` — 运行时主类
  - `packages/runtime-client/src/WebSocketTransport.ts` — WebSocket 连接管理
  - `packages/runtime-client/src/HeartbeatManager.ts` — 心跳管理
  - `packages/runtime-client/src/index.ts` — 统一导出
- **设计权威**：`docs/design/05-CLI与API.md`、`docs/design/06-可视化面板.md`、`docs/design/01-核心设计.md` §1.13

---

## 核心类型索引

| 类型 | 权威来源 | 所在包 | 计划路径 | 状态 |
|---|---|---|---|---|
| `IAgent` / `AgentStatus` / `AgentCapability` | `01-核心设计.md` §1.1 | `types` / `core` | `packages/types/src/agent.ts` | [planned] |
| `AgentConfig` / `ModelConfig` | `01-核心设计.md` §1.2 | `types` | `packages/types/src/config.ts` | [planned] |
| `AgentTask` / `Message` | `01-核心设计.md` §1.3 | `types` | `packages/types/src/task.ts` | [planned] |
| `ModelRegistry` / `ModelEndpoint` / `ModelRef` | `01-核心设计.md` §1.4 | `types` / `sdk` | `packages/types/src/model-registry.ts` | [planned] |
| `AgentResult` / `Artifact` / `ToolCallRecord` | `01-核心设计.md` §1.5 | `types` | `packages/types/src/result.ts` | [planned] |
| `IPlugin` / `Middleware` / `MiddlewareChain` | `01-核心设计.md` §1.6 | `core` | `packages/core/src/plugin/IPlugin.ts` / `packages/core/src/runtime/MiddlewareChain.ts` | [planned] |
| `AgentMeta` / `AgentTemplate` / `ExecutionRecord` | `01-核心设计.md` §1.7 | `types` | `packages/types/src/models.ts` | [planned] |
| `PipelineControlSignal` / `StepSnapshot` / `BacktrackEvent` | `01-核心设计.md` §1.8 | `types` / `sdk` | `packages/types/src/pipeline.ts` | [planned] |
| `DebugConfig` / `InjectedTool` / `MockToolConfig` / `CallTrace` | `01-核心设计.md` §1.9 | `types` | `packages/types/src/debug.ts` | [planned] |
| `IProvider` / `ChatParams` / `ChatResponse` / `ChatChunk` | `01-核心设计.md` §1.10 | `core` / `types` | `packages/core/src/provider/IProvider.ts` | [planned] |
| `FrameworkConfig` / `StepOptions` / `ParallelStep` / `ForkBranch` | `01-核心设计.md` §1.11 | `sdk` / `types` | `packages/sdk/src/framework/types.ts` | [planned] |
| `Capability` / `CapabilityRegistry` / `ExecutionPlan` / `PlanStep` / `PlanResult` / `IPlannerAgent` / `IPlanExecutor` / `ApprovalHandler` / `ApprovalResult` | `01-核心设计.md` §1.12 | `types` / `sdk` | `packages/types/src/orchestration.ts` / `packages/sdk/src/planner/` | [planned] |
| `AgentRuntimeConfig` / `RemoteTask` / `ControlMessage` / `AgentMessage` / `IAgentRuntimeClient` | `01-核心设计.md` §1.13 | `types` / `runtime-client` | `packages/types/src/runtime.ts` / `packages/runtime-client/src/` | [planned] |
| `AgentNode` | `01-核心设计.md` §1.7 | `types` / `dashboard` | `packages/types/src/models.ts` / `packages/dashboard/src/store/` | [planned] |

---

## 运行时交互地图

### 1. CLI 生成 Agent

```
packages/cli/src/commands/create.ts
        ↓
packages/core/src/generator/AgentGenerator.ts
        ↓
packages/core/src/generator/PromptBuilder.ts
packages/core/src/generator/SkillMatcher.ts
packages/core/src/generator/TemplateEngine.ts  ← templates/roles/<role>/
        ↓
packages/core/src/generator/CodeEmitter.ts
        ↓
./client-agents/<agent-name>/
```

### 2. SDK 模型驱动编排执行

```
用户调用 framework.orchestrate(task)
        ↓
packages/sdk/src/AgentFramework.ts
        ↓
packages/sdk/src/discovery/CapabilityRegistry.ts  ──→ 生成能力清单
        ↓
packages/sdk/src/planner/PlannerAgent.ts  ──→ 生成 ExecutionPlan
        ↓
packages/sdk/src/planner/PlanExecutor.ts
        ↓
构建 DAG → 拓扑排序 → 替换变量引用
        ↓
packages/sdk/src/Pipeline.ts  ──→ 串行/并行调度
        ↓
packages/core/src/runtime/AgentExecutor.ts
        ↓
Agent / Tool / Skill
```

### 3. ClientAgent 本地执行

```
生成的 ClientAgent ./client-agents/<name>/src/agent.ts
        ↓
packages/core/src/agent/BaseAgent.ts
        ↓
ProviderFactory → Provider → 外部 LLM
```

### 4. ClientAgent 本地调试 HTTP 服务（`agentforge serve`）

```
packages/cli/src/commands/serve.ts
        ↓
packages/http-server/src/server.ts
        ↓
packages/http-server/src/routes/agents.ts
        ↓
生成的 ClientAgent ./client-agents/<name>/src/agent.ts
        ↓
packages/core/src/agent/BaseAgent.ts
```

### 5. ClientAgent 连接 Capability Hub

```
packages/cli/src/commands/run.ts
        ↓
生成的 ClientAgent ./client-agents/<name>/src/main.ts
        ↓
packages/runtime-client/src/AgentRuntimeClient.ts
        ↓
packages/runtime-client/src/WebSocketTransport.ts
        ↓
连接 wss://hub.example.com/ws/nodes/:nodeId
        ↓
packages/dashboard/src/api/ + Capability Hub 后端
        ↓
注册到节点注册表，开始心跳
```

### 6. Capability Hub 远程触发 ClientAgent

```
packages/dashboard/src/pages/NodeDetail.tsx
        ↓
packages/dashboard/src/api/
        ↓
Capability Hub 后端
        ↓
WebSocket ControlMessage → 目标 AgentRuntimeClient
        ↓
ClientAgent.execute(task) / ClientAgent.stream(task)
        ↓
AgentMessage 返回 Capability Hub
        ↓
Capability Hub 前端展示结果
```

### 7. 人工确认流程

```
PlannerAgent 生成 ExecutionPlan
        ↓
检测到高风险能力 / requireApproval: true
        ↓
调用 ApprovalHandler
        ↓
Dashboard / 外部系统展示计划并等待确认
        ↓
approved === true
        ↓
packages/sdk/src/planner/PlanExecutor.ts 执行计划
```

### 8. 失败重新规划

```
PlanStep 执行失败
        ↓
packages/sdk/src/planner/PlanExecutor.ts 捕获错误
        ↓
packages/sdk/src/planner/PlannerAgent.ts.replan(failedStep, context)
        ↓
生成新的 ExecutionPlan
        ↓
继续执行新计划
```

### 9. Pipeline 底层控制信号（固定流程使用）

```
Agent.doExecute()
        ↓
返回 AgentResult.output.structured.__control
        ↓
packages/sdk/src/Pipeline.ts 读取 control
        ↓
从 StepSnapshot 恢复状态 → 重新执行目标步骤
```

---

## 入口点地图

### CLI 命令

| 命令 | 计划实现文件 | 设计来源 | 说明 |
|---|---|---|---|
| `agentforge create` | `packages/cli/src/commands/create.ts` | `05-CLI与API.md` §5.1 / `03-生成引擎.md` | 生成 ClientAgent |
| `agentforge run` | `packages/cli/src/commands/run.ts` | `05-CLI与API.md` §5.2 | 启动 ClientAgent 守护进程 |
| `agentforge dashboard` | `packages/cli/src/commands/dashboard.ts` | `05-CLI与API.md` §5.3 | 启动 Capability Hub |
| `agentforge capability` | `packages/cli/src/commands/capability.ts` | `05-CLI与API.md` §5.4 / `09-能力市场与下发.md` | 能力市场管理 |
| `agentforge batch` | `packages/cli/src/commands/batch.ts` | `05-CLI与API.md` §5.5 | 批量生成 ClientAgent |
| `agentforge serve` | `packages/cli/src/commands/serve.ts` | `05-CLI与API.md` §5.6 | 本地调试 HTTP 服务（可选） |
| `agentforge list` | `packages/cli/src/commands/list.ts` | `05-CLI与API.md` §5.7 | 列出已生成的 ClientAgent |

### ClientAgent 本地调试 HTTP API（`agentforge serve`，可选）

| 端点 | 方法 | 计划处理文件 | 说明 |
|---|---|---|---|
| `/api/execute` | POST | `packages/http-server/src/routes/agents.ts` | 同步执行 |
| `/api/stream` | POST | `packages/http-server/src/routes/agents.ts` | SSE 流式执行 |
| `/api/status` | GET | `packages/http-server/src/routes/health.ts` | `ready` / `degraded` / `unhealthy` |
| `/api/health` | GET | `packages/http-server/src/routes/health.ts` | 轻量探活 |
| `/api/capabilities` | GET | `packages/http-server/src/routes/agents.ts` | 能力声明 |
| `/api/metrics` | GET | `packages/http-server/src/routes/health.ts` | Prometheus 指标 |

### Capability Hub 路由

| 路由 | 页面组件 | 功能 |
|---|---|---|
| `/` | `packages/dashboard/src/pages/Home.tsx` | 项目概览 |
| `/agents` | `packages/dashboard/src/pages/AgentList.tsx` | ClientAgent 模板列表 |
| `/agents/create` | `packages/dashboard/src/pages/AgentCreate.tsx` | 创建 ClientAgent |
| `/nodes` | `packages/dashboard/src/pages/NodeList.tsx` | 已连接 ClientAgent 节点 |
| `/nodes/:id` | `packages/dashboard/src/pages/NodeDetail.tsx` | 节点详情与远程控制 |
| `/capabilities` | `packages/dashboard/src/pages/CapabilityList.tsx` | 能力市场 |
| `/playground` | `packages/dashboard/src/pages/Playground.tsx` | 调试台 |
| `/monitor` | `packages/dashboard/src/pages/Monitor.tsx` | 监控 |

---

## 文件命名与位置约定

- **包名**：`@agentforge/<name>` 对应 `packages/<name>/`
- **源码入口**：`packages/<name>/src/index.ts`
- **测试**：同目录 `__tests__/<module>.test.ts`（遵循 `docs/ops/TEST.md`）
- **生成 ClientAgent 默认目录**：`./client-agents/<agent-name>/`
- **ClientAgent 元数据**：`./client-agents/<agent-name>/.agentforge/config.json`
- **ClientAgent 安全配置**：`./client-agents/<agent-name>/.agentforge/security.json`
- **模板**：`templates/base/`（通用）、`templates/roles/<role>/`（岗位）
- **工具名**：kebab-case，如 `query-order`、`create-refund`
- **类型拼写**：`JSONSchema`（不是 `JsonSchema`）
- **Agent（大写）**：类/接口/类型；`agent`（小写）：实例

---

## 维护规则

更新本文件的情况：

1. 新增/删除包、公开导出、CLI 命令、API 路由、Dashboard 路由
2. 源文件被移动或重命名
3. 核心类型定义位置变化
4. 某个包从 `[planned]` 变为 `[implemented]`
5. 设计文档更新导致本文件索引失效

**不要**在本文件里重复设计 rationale，始终链接到对应的设计文档。

---

## 相关文档

- `docs/README.md` — 文档导航
- `docs/STATUS.md` — 实现状态追踪
- `CLAUDE.md` — Claude Code 项目指引
- `docs/design/01-核心设计.md` — 核心类型权威定义
- `docs/design/TECH-DESIGN.md` — 系统架构总览
- `docs/design/04-集成与编排.md` — 集成模式与 Pipeline 编排
- `docs/design/05-CLI与API.md` — CLI 与 HTTP API 规格
- `docs/design/06-可视化面板.md` — Dashboard 设计
