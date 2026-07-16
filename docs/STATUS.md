# 文档状态总表

> **文档版本**: docs-v0.6
> **最后更新**: 2026-07-16

| 文档                                                                             | 层级   | 类型     | 文档状态 | 实现状态 |
| -------------------------------------------------------------------------------- | ------ | -------- | -------- | -------- |
| [product/README.md](./product/README.md)                                         | 第一层 | 索引     | 已定稿   | —        |
| [product/PRD.md](./product/PRD.md)                                               | 第一层 | 产品需求 | 已定稿   | 部分完成 |
| [product/08-需求与路线图.md](./product/08-需求与路线图.md)                       | 第一层 | 产品需求 | 已定稿   | 部分完成 |
| [design/README.md](./design/README.md)                                           | 第二层 | 索引     | 已定稿   | —        |
| [design/01-核心设计.md](./design/01-核心设计.md)                                 | 第二层 | 设计规格 | 已定稿   | 已完成   |
| [design/02-单个Agent功能.md](./design/02-单个Agent功能.md)                       | 第二层 | 设计规格 | 已定稿   | 已完成   |
| [design/03-生成引擎.md](./design/03-生成引擎.md)                                 | 第二层 | 设计规格 | 已定稿   | 已完成   |
| [design/04-集成与编排.md](./design/04-集成与编排.md)                             | 第二层 | 设计规格 | 已定稿   | 已完成   |
| [design/05-CLI与API.md](./design/05-CLI与API.md)                                 | 第二层 | 设计规格 | 已定稿   | 已完成   |
| [design/06-可视化面板.md](./design/06-可视化面板.md)                             | 第二层 | 设计规格 | 已定稿   | 已完成   |
| [design/07-技术选型与架构.md](./design/07-技术选型与架构.md)                     | 第二层 | 设计规格 | 已定稿   | 已完成   |
| [design/08-客户端Agent与无状态Agent.md](./design/08-客户端Agent与无状态Agent.md) | 第二层 | 设计规格 | 已定稿   | 已完成   |
| [design/09-能力市场与下发.md](./design/09-能力市场与下发.md)                     | 第二层 | 设计规格 | 已定稿   | 已完成   |
| [design/10-安全模型.md](./design/10-安全模型.md)                                 | 第二层 | 设计规格 | 已定稿   | 已完成   |
| [design/11-开发约定.md](./design/11-开发约定.md)                                 | 第二层 | 设计规格 | 已定稿   | 已完成   |
| [design/TECH-DESIGN.md](./design/TECH-DESIGN.md)                                 | 第二层 | 设计规格 | 已定稿   | 已完成   |
| [design/附录-生成示例.md](./design/附录-生成示例.md)                             | 第二层 | 设计规格 | 已定稿   | 已完成   |
| [ops/README.md](./ops/README.md)                                                 | 第三层 | 索引     | 已定稿   | —        |
| [ops/GUIDE.md](./ops/GUIDE.md)                                                   | 第三层 | 使用指南 | 已定稿   | 已完成   |
| [ops/DEPLOY.md](./ops/DEPLOY.md)                                                 | 第三层 | 部署手册 | 已定稿   | 已完成   |
| [ops/TEST.md](./ops/TEST.md)                                                     | 第三层 | 测试策略 | 已定稿   | 已完成   |
| [ops/IMPLEMENTATION.md](./ops/IMPLEMENTATION.md)                                 | 第三层 | 开发计划 | 已定稿   | 已完成   |

## 图例

- **文档状态**：已定稿 = 设计内容稳定；草案 = 目标行为描述，待实现验证
- **实现状态**：未开始 = 对应代码尚未开发；已完成 = 对应代码已实现并通过基础测试

## 模块实现进度（规划）

| 模块                       | 设计 | 实现 | 测试 |
| -------------------------- | ---- | ---- | ---- |
| @agentforge/types          | ✅   | ✅   | ✅   |
| @agentforge/core           | ✅   | ✅   | ✅   |
| @agentforge/sdk            | ✅   | ✅   | ✅   |
| @agentforge/runtime-client | ✅   | ✅   | ✅   |
| @agentforge/cli            | ✅   | ✅   | ✅   |
| @agentforge/http-server    | ✅   | ✅   | ✅   |
| @agentforge/dashboard      | ✅   | ✅   | ✅   |

设计 ✅ 表示第二层文档已覆盖该模块规格。

## 实施阶段状态

| 阶段                                        | 描述                                                                         | 状态        |
| ------------------------------------------- | ---------------------------------------------------------------------------- | ----------- |
| Phase 0 — Monorepo 初始化                   | pnpm workspace、tsup、Vitest、ESLint、Prettier 骨架                          | ✅ 已完成   |
| Phase 1 — `packages/types`                  | 核心类型定义                                                                 | ✅ 已完成   |
| Phase 2 — `packages/core`                   | BaseAgent、Provider、生成引擎                                                | ✅ 已完成   |
| Phase 3 — Templates                         | 基础模板与角色模板                                                           | ✅ 已完成   |
| Phase 4 — `packages/runtime-client`         | WebSocket 运行时客户端                                                       | ✅ 已完成   |
| Phase 5 — `packages/sdk`                    | AgentFramework、Pipeline、编排                                               | ✅ 已完成   |
| Phase 6 — `packages/http-server` + Hub 后端 | 本地调试服务与 Hub API                                                       | ✅ 已完成   |
| Phase 7 — `packages/dashboard` 前端         | Capability Hub 可视化面板                                                    | ✅ 已完成   |
| Phase 8 — `packages/cli`                    | CLI 命令                                                                     | ✅ 已完成   |
| Phase 9 — 安全层                            | 本地命令授权、Token、签名、审计                                              | ✅ 已完成   |
| Phase 10 — 可观测性                         | 日志、指标、成本守护已实现；OpenTelemetry 待接入                             | 🟡 部分完成 |
| Phase 11 — 测试                             | 单元/集成已实现；Playwright E2E 已稳定入门禁；黄金路径回归已纳入 `pnpm test` | 🟡 部分完成 |
| Phase 12 — CI/CD + Docker                   | CI/Docker 已覆盖 `dev`；npm 独立包 dry-run 就绪，真发受包名冲突阻塞          | 🟡 部分完成 |

## docs-v0.6 能力执行闭环

- Tool：Provider 多轮 tool call、真实 handler/端点执行、结果回填、调用上限、事件与敏感参数脱敏已实现。
- CapabilityExecutor：Agent、Remote-Agent、Tool、Skill、Plugin 五类分派已实现；Planner 仅暴露当前可执行能力。
- Skill：使用默认模型与 Tool 白名单创建临时受限 StatelessAgent。
- Plugin：进程内 `IPlugin` 已移除，统一采用签名 WASM、Worker-backed WASI、严格 JSON ABI 与能力白名单。
- ClientAgent：Hub 下发能力可写入本地缓存；Tool/Skill/Plugin 在更新、删除及重启加载后进入动态执行源。
- 本轮验证基线为 `pnpm build`、`pnpm type-check`、`pnpm test`、`pnpm lint`；Playwright E2E 由 CI `e2e` job 单独跑且已稳定入门禁。

## 2026-07-16 交付同步（PR #3 → `dev`）

- **黄金路径**：`examples/golden-path` 可本地演示 Tool 安装与执行（无需 Hub / API Key），并进入 Vitest workspace。
- **Phase 11**：Dashboard Playwright E2E（环境启停、fixture、helpers）已稳定；CI 对 `main`/`dev` 的 PR/push 跑 lint/typecheck/test/build + e2e。
- **Phase 12**：CI 已覆盖 `dev`；各可发布包 `0.1.0` + `publish.yml` dry-run 就绪。真实 npm 发布仍阻塞：`@agentforge/core` / `@agentforge/cli` 等包名在 npmjs 已被第三方占用（dry-run 对冲突包以 `npm pack --dry-run` 验收）。
- **下一步 Top3**：离线能力验收（US8，见 `examples/golden-path/run-offline.mjs`）→ 真发解阻（改 scope/包名或协调占用）→ 可观测性 OpenTelemetry。
- **US8 演示入口**：`pnpm demo:offline-capability` / `node examples/golden-path/run-offline.mjs`；回归含于 `examples/golden-path/golden-path.test.ts`。

## 口径统一记录（docs-v0.4）

| 议题                          | 统一口径                                                                                                         | 涉及文档                                                     |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 产品定位                      | 客户端 Agent 应用平台：ClientAgent + Capability Hub + StatelessAgent SDK 编排                                    | README、docs/README、PRD、TECH-DESIGN                        |
| 生成产物默认目录              | `./client-agents/<name>/`                                                                                        | ops/GUIDE、ops/DEPLOY、CODEMAP                               |
| 主要运行命令                  | `agentforge run ./client-agents/<name>`                                                                          | ops/GUIDE、05-CLI与API                                       |
| Hub 启动命令                  | `agentforge dashboard`                                                                                           | ops/GUIDE、05-CLI与API                                       |
| ClientAgent 连接端点          | `wss://<hub>/ws/nodes/:nodeId`                                                                                   | 01-核心设计、05-CLI与API、08-客户端Agent                     |
| Dashboard 创建页路由          | `/client-agents/create`                                                                                          | 06-可视化面板、CODEMAP、TECH-DESIGN、ops/GUIDE               |
| 单 Agent `/api/status`        | `ready` / `degraded` / `unhealthy`                                                                               | design/02 §2.9.1、05、TECH-DESIGN、ops/GUIDE、ops/DEPLOY     |
| 本地调试 HTTP 服务命令        | `agentforge serve`（可选，非主要生产路径）                                                                       | 04-集成与编排、05-CLI与API、ops/GUIDE、product/08            |
| 单 Agent `/api/health`        | 轻量探活，`{ "status": "ok" }`                                                                                   | design/05 §5.3.1、ops/GUIDE、ops/DEPLOY                      |
| Vitest 版本                   | `^2.0`                                                                                                           | ops/TEST                                                     |
| `AgentStatus` 枚举            | 含 `daemon-running`，与 `02-单个Agent功能.md` 一致                                                               | design/01 §1.1                                               |
| `AgentNodeStatus`             | 定义为 `'online' \| 'offline' \| 'busy' \| 'error'`，用于 `AgentNode.status`，并通过 `AgentMessage.payload` 上报 | design/01 §1.7、§1.13                                        |
| `CapabilityDistributePayload` | 含 `targetVersion?: string`                                                                                      | design/01 §1.13、design/09                                   |
| `CapabilityAckPayload`        | 含 `installedVersion?: string`                                                                                   | design/01 §1.13、design/09                                   |
| `requireLocalConfirmation`    | 类型为 `string[]`（敏感操作标签列表）                                                                            | design/01 §1.13、design/02、ops/DEPLOY、design/附录-生成示例 |
| `FrameworkConfig`             | 含 `maxToolCalls?: number` 与 `onError?: (error: AgentError) => void`                                            | design/01 §1.11、TECH-DESIGN                                 |
| `AgentEvent`                  | 含 ClientAgent 专属事件 `agent:capability:installed`、`agent:hub:connected`、`agent:hub:disconnected`            | design/01 §1.1、design/02                                    |
| ClientAgent 核心依赖上限      | ≤ 2 个（`@agentforge/core` + `@agentforge/runtime-client`）                                                      | README、design/TECH-DESIGN、product/08                       |
| `AgentIdentity`               | `id? / name / role / version`；作为 `AgentConfig.identity` 必填字段                                              | design/01 §1.1、§1.4、design/附录-生成示例                   |
| `ToolDefinition`              | 含 `handler?: ToolHandler`，执行上下文为 `ToolContext`                                                           | design/01 §1.4、design/附录-生成示例                         |
| `ClientAgentSecurityConfig`   | `.agentforge/security.json` 的 Schema，含 `localCommandAuth`、`allowRemoteExecution`、`requireLocalConfirmation` | design/01 §1.2、ops/DEPLOY、ops/GUIDE                        |
| `01-核心设计.md` 章节顺序     | `1.1 → 1.2 → 1.3 → … → 1.15` 连续编号                                                                            | design/01、全 design 文档锚点                                |
| E2E 测试框架                  | 使用 Playwright 覆盖 CLI 流程与 Dashboard 页面                                                                   | design/TECH-DESIGN §13、ops/TEST                             |
