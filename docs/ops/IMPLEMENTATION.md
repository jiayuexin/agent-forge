> ⚠️ **开发计划文档**：本文描述 v1 开发任务与实施顺序；当前 Phase 0–12 已完成。权威规格见 [TECH-DESIGN.md](../design/TECH-DESIGN.md) 与 [01-核心设计.md](../design/01-核心设计.md)。
>
> **文档层级**: 第三层 · 操作手册
> **文档类型**: 开发计划
> **文档状态**: 已定稿
> **文档版本**: docs-v0.5
> **最后更新**: 2026-06-27
> **实现状态**: 已完成

# 开发任务拆分与路线图

本文档根据 [PRD.md](../product/PRD.md)、[08-需求与路线图.md](../product/08-需求与路线图.md)、[TECH-DESIGN.md](../design/TECH-DESIGN.md)、[01-核心设计.md](../design/01-核心设计.md) 与 [11-开发约定.md](../design/11-开发约定.md) 整理出 AgentForge v1 的实施路径。它面向核心开发者，用于拆分里程碑、识别阻塞依赖、跟踪落地进度。

## 1. 实施原则

- **接口优先**：先完成 `packages/types`，再写实现；任何实现变更必须同步回类型定义。
- **依赖顺序不可逆**：`types` → `core` → (`sdk` + `runtime-client`) → (`http-server` + `dashboard`) → `cli`。
- **端到端可验证**：每个阶段至少有一条可运行的端到端路径（哪怕只是单元测试或最小可执行脚本）。
- **文档即状态**：每完成一个任务，同步更新 `docs/STATUS.md` 的实现状态列。
- **安全不后置**：本地命令授权、节点认证、审计日志在核心路径可用时即纳入，不在最后补。

## 2. 包依赖关系

```
packages/types
    ↑
packages/core
    ↑
    ├── packages/sdk
    ├── packages/runtime-client
    └── packages/http-server
         ↑
    packages/dashboard  ← 依赖 sdk + runtime-client + http-server
         ↑
    packages/cli  ← 依赖所有包
```

- `types`：零运行时依赖，所有包均依赖它。
- `core`：实现 `BaseAgent`、Provider、生成引擎，是 SDK 与 runtime-client 的共同基础。
- `sdk` 与 `runtime-client`：可并行开发，但二者都依赖 `core`。
- `dashboard`：依赖 SDK 复用编排能力，依赖 runtime-client 协议理解节点通信。
- `cli`：最后集成，调用 generator、runtime-client、dashboard 等能力。

## 3. 阶段拆分

### Phase 0 — Monorepo 初始化

**目标**：建立可编译、可测试、可 Lint 的代码仓库骨架。

| 任务 | 交付物 | 依赖 | 验收标准 |
|---|---|---|---|
| 0.1 初始化 workspace | `package.json`、`pnpm-workspace.yaml`、`tsconfig.base.json` | 无 | `pnpm install` 成功，根目录 `pnpm run build`/`lint`/`test` 占位可用 |
| 0.2 配置构建工具 | `tsup` 配置、各包 `tsconfig.json` | 0.1 | 空包可 `pnpm run build` 出 `dist/` |
| 0.3 配置代码质量 | ESLint 9、Prettier 3、husky（可选） | 0.1 | `pnpm run lint` 通过；提交前自动格式化 |
| 0.4 配置测试框架 | Vitest ^2.0、`@vitest/coverage-v8` | 0.1 | `pnpm test` 运行空测试套件成功 |
| 0.5 配置日志与链路追踪 | `pino`、`pino-pretty`、OpenTelemetry SDK 初始化 | 0.1 | 可输出 JSON / pretty 两种格式日志；Trace Context 可注入 |

### Phase 1 — `packages/types`

**目标**：把 [01-核心设计.md](../design/01-核心设计.md) 中的类型权威落地为零依赖类型包。

| 任务 | 交付物 | 依赖 | 验收标准 |
|---|---|---|---|
| 1.1 Agent 类型 | `IAgent`、`AgentStatus`、`AgentCapability`、`AgentEvent` 等 | 无 | 类型导出完整，无实现代码 |
| 1.2 配置与任务类型 | `AgentConfig`、`ModelConfig`、`AgentTask`、`Message` | 1.1 | 覆盖 OpenAI / Anthropic / Ollama / Custom 配置变体 |
| 1.3 Provider 类型 | `IProvider`、`ChatParams`、`ChatResponse`、`ChatChunk` | 1.2 | 支持同步与流式响应签名 |
| 1.4 Pipeline 类型 | `Pipeline`、`PipelineControlSignal`、`StepSnapshot` | 1.1 | 包含 `add`/`parallel`/`branch`/`fork`/`intercept`/`back` 的 API 类型 |
| 1.5 编排类型 | `AgentFramework`、`CapabilityRegistry`、`ExecutionPlan`、`PlannerAgent` | 1.1 | 覆盖规划、执行、审批、事件总线 |
| 1.6 运行时类型 | `IAgentRuntimeClient`、`RemoteTask`、`ControlMessage`、`AgentMessage` | 1.1 | 覆盖 WebSocket 控制协议 |
| 1.7 工具与插件类型 | `ToolDefinition`、`ToolHandler`、`IPlugin`、`Middleware` | 1.2 | `ToolDefinition` 使用 `JSONSchema` 拼写 |

### Phase 2 — `packages/core`

**目标**：实现 Agent 生命周期、Provider 抽象与生成引擎。

| 任务 | 交付物 | 依赖 | 验收标准 |
|---|---|---|---|
| 2.1 BaseAgent | `BaseAgent.ts` 抽象类 | 1.1 | 实现 `init`/`execute`/`stream`/`destroy`/`use`/`on`/`off`，状态机正确 |
| 2.2 AgentLifeCycle | `AgentLifeCycle.ts` | 1.1 | `UNINITIALIZED → INITIALIZING → READY → RUNNING/DAEMON_RUNNING → DESTROYED` 状态转换可测 |
| 2.3 MiddlewareChain | `MiddlewareChain.ts` | 1.7 | 支持前置/后置/错误拦截 |
| 2.4 PluginManager | `PluginManager.ts` | 1.7 | 插件加载、卸载、事件转发 |
| 2.5 ProviderFactory | `ProviderFactory.ts` | 1.3 | 可按 `provider` 字段创建 OpenAI / Anthropic / Ollama / custom 实例 |
| 2.6 Provider 适配器 | `OpenAIProvider.ts`、`AnthropicProvider.ts`、`OllamaProvider.ts` | 2.5 | 完成 `ToolDefinition` ↔ provider function-calling 双向映射 |
| 2.7 AgentGenerator | `AgentGenerator.ts` | 1.1、2.1 | 支持 `generate()` 与 `batch()` 入口 |
| 2.8 PromptBuilder | `PromptBuilder.ts` | 2.7 | 根据解析结果与模板构建系统提示词 |
| 2.9 TemplateEngine | `TemplateEngine.ts` | 2.7 | 基于 EJS 渲染 `main.ts`、`agent.ts`、`prompts.ts`、`tools.ts`、`runtime.ts`、`package.json` 等 |
| 2.10 SkillMatcher | `SkillMatcher.ts` | 2.7 | 基于描述推荐工具 |
| 2.11 CodeEmitter | `CodeEmitter.ts` | 2.7 | 写入最终文件树至 `./client-agents/<agent-name>/` |
| 2.12 AgentExecutor | `AgentExecutor.ts` | 2.1 | 负责单 Agent 执行与流式输出封装 |

### Phase 3 — Templates

**目标**：提供可生成可运行 ClientAgent 的模板库。

| 任务 | 交付物 | 依赖 | 验收标准 |
|---|---|---|---|
| 3.1 Base 模板 | `templates/base/` | 2.9 | 包含通用项目骨架，生成后可直接 `pnpm install` + `pnpm dev` |
| 3.2 角色模板 | `templates/roles/customer-service/`、`sales-assistant/`、`code-reviewer/`、`content-writer/`、`data-analyst/`、`general/` | 3.1 | 每个模板包含专属系统提示词、推荐工具、示例配置 |
| 3.3 模板校验 | 模板编译测试 | 3.2 | 每个模板渲染后通过类型检查与基础冒烟测试 |

### Phase 4 — `packages/runtime-client`

**目标**：让 ClientAgent 能连接 Capability Hub。

| 任务 | 交付物 | 依赖 | 验收标准 |
|---|---|---|---|
| 4.1 WebSocketTransport | `WebSocketTransport.ts` | 1.6 | 支持连接、断开、重连、发送/接收消息 |
| 4.2 HeartbeatManager | `HeartbeatManager.ts` | 4.1 | 按配置发送心跳，检测超时 |
| 4.3 AgentRuntimeClient | `AgentRuntimeClient.ts` | 4.1、4.2、2.1 | 实现 `IAgentRuntimeClient`，注册为 `AgentNode`，上报状态/指标 |
| 4.4 CapabilityCache | `CapabilityCache.ts` | 4.3 | 本地缓存能力，支持离线执行 |
| 4.5 远程任务执行 | 任务接收与结果上报 | 4.3 | 能接收 `RemoteTask`，调用本地 Agent 执行，返回 `AgentMessage` |

### Phase 5 — `packages/sdk`

**目标**：实现模型驱动的 StatelessAgent 编排。

| 任务 | 交付物 | 依赖 | 验收标准 |
|---|---|---|---|
| 5.1 Pipeline | `Pipeline.ts` | 1.4 | 实现 `.add()`、`.parallel()`、`.branch()`、`.fork()`、`.config()`、`PipelineControlSignal` |
| 5.2 EventBus | `EventBus.ts` | 1.5 | 支持 `on`/`once`/`off`/`emit` |
| 5.3 ModelRegistry | `ModelRegistry.ts` | 1.2 | 多端点路由，命中解析顺序，未找到时抛 `ModelNotFoundError` |
| 5.4 CapabilityRegistry | `CapabilityRegistry.ts` | 1.5 | 注册 Agent/Tool/Skill/Plugin，冲突处理，生成 prompt |
| 5.5 PlannerAgent | `PlannerAgent.ts` | 5.4 | 根据任务生成 `ExecutionPlan` |
| 5.6 PlanExecutor | `PlanExecutor.ts` | 5.1、5.5 | 解析依赖、调度并行、变量绑定、失败触发重新规划 |
| 5.7 AgentFramework | `AgentFramework.ts` | 5.1–5.6 | 提供 `register`/`loadAll`/`run`/`orchestrate`/`plan`/`executePlan` |
| 5.8 ClientAgentProxy | `ClientAgentProxy.ts`（若存在） | 5.7、4.3 | SDK 可远程调用已连接 ClientAgent |

### Phase 6 — `packages/http-server` + Capability Hub 后端

**目标**：提供本地调试服务与 Hub 后端能力。

| 任务 | 交付物 | 依赖 | 验收标准 |
|---|---|---|---|
| 6.1 http-server 骨架 | `packages/http-server/src/server.ts` | 2.1 | 可启动 HTTP 服务，暴露 `/health` |
| 6.2 ClientAgent 调试路由 | `/api/execute`、`/api/stream`、`/api/status`、`/api/capabilities` | 6.1 | 能触发本地 Agent 执行与流式返回 |
| 6.3 metrics 端点 | `GET /api/metrics` | 6.1 | 返回 Prometheus 格式指标 |
| 6.4 dashboard 后端骨架 | `packages/dashboard/server/index.ts` | 6.1 | 可启动独立服务 |
| 6.5 节点管理 API | `/api/nodes/*` | 6.4、4.3 | 可列出、查看、断开已连接节点 |
| 6.6 远程任务派发 API | `/api/nodes/:id/execute`、`/api/nodes/:id/stream` | 6.5 | 可向指定节点派发任务并接收结果 |
| 6.7 能力管理 API | `/api/capabilities/*` | 6.4、4.4 | 可发布、列表、下发能力 |
| 6.8 Hub WebSocket | `/ws/nodes/:nodeId` | 6.4、4.1 | 控制命令与事件/结果双向通信 |

### Phase 7 — `packages/dashboard` 前端

**目标**：提供 Capability Hub 可视化控制面。

| 任务 | 交付物 | 依赖 | 验收标准 |
|---|---|---|---|
| 7.1 前端工程初始化 | Vite 5 + React 18 + Ant Design 5 + TailwindCSS 4 + Zustand + React Router | 0.1 | 可 `pnpm dev` 启动 |
| 7.2 页面路由 | `Home`、`ClientAgentList`、`ClientAgentDetail`、`NodeList`、`NodeDetail`、`CapabilityList`、`CapabilityMarket`、`CapabilityDistribute`、`Playground`、`Monitor` | 7.1 | 路由可正常跳转 |
| 7.3 API 对接 | `dashboard/src/api/` 封装 | 6.4 | 可拉取节点列表、能力列表 |
| 7.4 节点管理页面 | `NodeList` / `NodeDetail` / `NodeChat` | 7.2、7.3 | 可查看节点状态、远程聊天/执行任务 |
| 7.5 ClientAgent 管理页面 | `ClientAgentList` / `ClientAgentCreate` / `ClientAgentDetail` | 7.2、7.3 | 可查看、创建、配置本地 ClientAgent |
| 7.6 能力市场页面 | `CapabilityMarket` / `CapabilityDistribute` | 7.2、7.3 | 可浏览、安装、下发能力 |
| 7.7 Playground | `Playground` | 7.2、7.3 | 可在线调试 Agent 与工具 |
| 7.8 监控面板 | `Monitor` | 7.2、7.3 | 展示日志、指标、链路追踪入口 |

### Phase 8 — `packages/cli`

**目标**：提供开发者入口命令。

| 任务 | 交付物 | 依赖 | 验收标准 |
|---|---|---|---|
| 8.1 CLI 骨架 | Commander 入口、`--help` | 0.1 | `agentforge --help` 可运行 |
| 8.2 `create` | `create.ts` | 2.7–2.11、3.2 | `agentforge create <description>` 生成可运行 ClientAgent |
| 8.3 `batch` | `batch.ts` | 8.2 | 从 YAML/JSON 批量生成 |
| 8.4 `run` | `run.ts` | 4.3 | 启动 ClientAgent 守护进程并连接 Hub |
| 8.5 `serve` | `serve.ts` | 6.1 | 启动本地调试 HTTP 服务 |
| 8.6 `dashboard` | `dashboard.ts` | 6.4、7.1 | 启动 Capability Hub |
| 8.7 `capability` | `capability.ts` | 6.7 | 发布/列表/安装/下发能力 |
| 8.8 `list` | `list.ts` | 8.2 | 列出已生成的 ClientAgent |

### Phase 9 — 安全层

**目标**：贯穿核心路径的安全机制。

| 任务 | 交付物 | 依赖 | 验收标准 |
|---|---|---|---|
| 9.1 本地命令授权 | `LocalCommandAuthConfig` 实现 | 2.1 | 支持 `disabled`/`readonly`/`whitelist`/`full` 四级 |
| 9.2 节点 Token 认证 | 连接时 `nodeId` 范围 Token 校验 | 4.3 | 无效 Token 拒绝连接 |
| 9.3 能力签名验证 | 签名插件分发与校验 | 2.4 | 篡改/未签名插件被拒绝加载 |
| 9.4 输入校验 | Zod schema 校验 | 6.1 | 所有外部输入经过 schema 校验 |
| 9.5 审计日志 | 审计日志模块 | 9.1–9.4 | 记录关键操作，支持 90 天查询 |
| 9.6 本地二次确认 | 高风险操作弹窗/CLI 确认 | 9.1 | `full` 模式下危险命令需用户确认 |

### Phase 10 — 可观测性

**目标**：生产环境可监控、可排错。

| 任务 | 交付物 | 依赖 | 验收标准 |
|---|---|---|---|
| 10.1 结构化日志 | pino 全链路集成 | 0.5 | 所有包统一日志格式，支持 `LOG_LEVEL` |
| 10.2 链路追踪 | OpenTelemetry Trace Context 传播 | 0.5 | 跨 Provider/Agent/Hub 的 trace ID 一致 |
| 10.3 Prometheus 指标 | `/api/metrics` 暴露关键指标 | 6.3 | 可抓取请求量、节点数、任务数、成本 |
| 10.4 成本守护 | `MONTHLY_COST_LIMIT` 阈值控制 | 2.6 | 超出阈值时拒绝新请求并告警 |
| 10.5 调试配置 | `DebugConfig`、`InjectedTool`、`MockToolConfig` | 5.7 | 可在测试模式注入 mock 工具 |

### Phase 11 — 测试

**目标**：建立分层测试体系。

| 任务 | 交付物 | 依赖 | 验收标准 |
|---|---|---|---|
| 11.1 单元测试 | 各包 `__tests__` | 对应包 | 核心类覆盖 ≥ 80% |
| 11.2 集成测试 | Provider 适配、Pipeline、PlanExecutor 集成 | 5.7 | 模拟 Provider 返回，验证编排流程 |
| 11.3 生成校验测试 | `AgentGenerator` 输出编译测试 | 3.3 | 每个模板生成物可通过类型检查 |
| 11.4 E2E 测试 | Playwright 覆盖 Hub 前端 + CLI 关键路径 | 8.x、7.x | CI 中可运行 |
| 11.5 基准测试 | 生成耗时、端到端延迟 | 8.2 | 记录 5 秒生成目标基线 |
| 11.6 安全测试 | 本地命令授权、Token、签名用例 | 9.x | 覆盖主要攻击面 |

### Phase 12 — CI/CD + Docker

**目标**：自动化构建、测试、发布。

| 任务 | 交付物 | 依赖 | 验收标准 |
|---|---|---|---|
| 12.1 GitHub Actions | `.github/workflows/ci.yml` | 0.x | `install → lint → type-check → test → build` |
| 12.2 Docker 镜像 | `Dockerfile` for `serve`/`dashboard` | 6.x、7.x | 多阶段构建，镜像可运行 |
| 12.3 发布流程 | 版本号管理、npm 发布脚本 | 12.2 | `@agentforge/*` 包可发布 |
| 12.4 版本锁定 | `pnpm-lock.yaml` 提交规范 | 0.1 | CI 使用 `--frozen-lockfile` |

## 4. 关键阻塞点

以下任务被其他大量任务依赖，应优先保证质量与稳定性：

1. **Phase 1 `packages/types`**：所有后续开发的基础；接口一旦定稿，后续修改成本高。
2. **Phase 2.1 `BaseAgent` + 2.6 Provider 适配器**：SDK 与 runtime-client 都依赖它们。
3. **Phase 3.1 Base 模板**：CLI `create`/`batch` 只有在模板可运行时才有意义。
4. **Phase 4.3 `AgentRuntimeClient` + Phase 6.8 Hub WebSocket**：远程控制是 Capability Hub 的核心能力。
5. **Phase 5.7 `AgentFramework`**：模型驱动编排是 SDK 的核心价值。

## 5. 后续 Backlog（v2+）

这些能力不在 v1 范围，但可在架构设计时预留扩展点：

- 持久化后端：SQLite / Redis 替代纯内存存储
- 向量知识库：Chroma / Milvus 集成
- 可视化拖拽编排器
- 多模态输入（图片、语音）
- 多租户 SaaS
- Agent 市场与社区能力共享
- Grafana 监控模板
- 红队测试框架
- Codemod 迁移工具
- i18n 多语言支持

## 6. 文档维护

- 本文件应与 `docs/STATUS.md` 同步更新；每当一个阶段完成时，在 `STATUS.md` 的实现状态列标记为“已完成”。
- 若设计文档（01–10、TECH-DESIGN）发生变更，应回推检查本文件中的任务是否需要调整。
- 每个包进入实现前，先更新对应 `docs/CODEMAP.md` 中 `[planned]` 标记为实际路径或删除占位。
