# 文档状态总表

> **文档版本**: docs-v0.4
> **最后更新**: 2026-06-26

| 文档 | 层级 | 类型 | 文档状态 | 实现状态 |
|---|---|---|---|---|
| [product/README.md](./product/README.md) | 第一层 | 索引 | 已定稿 | — |
| [product/PRD.md](./product/PRD.md) | 第一层 | 产品需求 | 已定稿 | 未开始 |
| [product/08-需求与路线图.md](./product/08-需求与路线图.md) | 第一层 | 产品需求 | 已定稿 | 未开始 |
| [design/README.md](./design/README.md) | 第二层 | 索引 | 已定稿 | — |
| [design/01-核心设计.md](./design/01-核心设计.md) | 第二层 | 设计规格 | 已定稿 | 未开始 |
| [design/02-单个Agent功能.md](./design/02-单个Agent功能.md) | 第二层 | 设计规格 | 已定稿 | 未开始 |
| [design/03-生成引擎.md](./design/03-生成引擎.md) | 第二层 | 设计规格 | 已定稿 | 未开始 |
| [design/04-集成与编排.md](./design/04-集成与编排.md) | 第二层 | 设计规格 | 已定稿 | 已完成 |
| [design/05-CLI与API.md](./design/05-CLI与API.md) | 第二层 | 设计规格 | 已定稿 | 未开始 |
| [design/06-可视化面板.md](./design/06-可视化面板.md) | 第二层 | 设计规格 | 已定稿 | 未开始 |
| [design/07-技术选型与架构.md](./design/07-技术选型与架构.md) | 第二层 | 设计规格 | 已定稿 | 未开始 |
| [design/08-客户端Agent与无状态Agent.md](./design/08-客户端Agent与无状态Agent.md) | 第二层 | 设计规格 | 已定稿 | 未开始 |
| [design/09-能力市场与下发.md](./design/09-能力市场与下发.md) | 第二层 | 设计规格 | 已定稿 | 未开始 |
| [design/10-安全模型.md](./design/10-安全模型.md) | 第二层 | 设计规格 | 已定稿 | 未开始 |
| [design/11-开发约定.md](./design/11-开发约定.md) | 第二层 | 设计规格 | 已定稿 | 未开始 |
| [design/TECH-DESIGN.md](./design/TECH-DESIGN.md) | 第二层 | 设计规格 | 已定稿 | 未开始 |
| [design/附录-生成示例.md](./design/附录-生成示例.md) | 第二层 | 设计规格 | 已定稿 | 未开始 |
| [ops/README.md](./ops/README.md) | 第三层 | 索引 | 已定稿 | — |
| [ops/GUIDE.md](./ops/GUIDE.md) | 第三层 | 使用指南 | 已定稿 | 未开始 |
| [ops/DEPLOY.md](./ops/DEPLOY.md) | 第三层 | 部署手册 | 已定稿 | 未开始 |
| [ops/TEST.md](./ops/TEST.md) | 第三层 | 测试策略 | 已定稿 | 未开始 |
| [ops/IMPLEMENTATION.md](./ops/IMPLEMENTATION.md) | 第三层 | 开发计划 | 草案 | 进行中 |

## 图例

- **文档状态**：已定稿 = 设计内容稳定；草案 = 目标行为描述，待实现验证
- **实现状态**：未开始 = 对应代码尚未开发

## 模块实现进度（规划）

| 模块 | 设计 | 实现 | 测试 |
|---|---|---|---|
| @agentforge/types | ✅ | ✅ | ✅ |
| @agentforge/core | ✅ | ✅ | ✅ |
| @agentforge/sdk | ✅ | ✅ | ✅ |
| @agentforge/runtime-client | ✅ | ✅ | ✅ |
| @agentforge/cli | ✅ | ⬜ | ⬜ |
| @agentforge/http-server | ✅ | ⬜ | ⬜ |
| @agentforge/dashboard | ✅ | ⬜ | ⬜ |

设计 ✅ 表示第二层文档已覆盖该模块规格。

## 实施阶段状态

| 阶段 | 描述 | 状态 |
|---|---|---|
| Phase 0 — Monorepo 初始化 | pnpm workspace、tsup、Vitest、ESLint、Prettier 骨架 | ✅ 已完成 |
| Phase 1 — `packages/types` | 核心类型定义 | ✅ 已完成 |
| Phase 2 — `packages/core` | BaseAgent、Provider、生成引擎 | ✅ 已完成 |
| Phase 3 — Templates | 基础模板与角色模板 | ✅ 已完成 |
| Phase 4 — `packages/runtime-client` | WebSocket 运行时客户端 | ✅ 已完成 |
| Phase 5 — `packages/sdk` | AgentFramework、Pipeline、编排 | ✅ 已完成 |
| Phase 6 — `packages/http-server` + Hub 后端 | 本地调试服务与 Hub API | ⬜ 未开始 |
| Phase 7 — `packages/dashboard` 前端 | Capability Hub 可视化面板 | ⬜ 未开始 |
| Phase 8 — `packages/cli` | CLI 命令 | ⬜ 未开始 |
| Phase 9 — 安全层 | 本地命令授权、Token、签名、审计 | ⬜ 未开始 |
| Phase 10 — 可观测性 | 日志、链路追踪、指标、成本守护 | ⬜ 未开始 |
| Phase 11 — 测试 | 单元/集成/E2E 测试体系 | ⬜ 未开始 |
| Phase 12 — CI/CD + Docker | GitHub Actions、Docker 镜像、发布 | ⬜ 未开始 |

## 口径统一记录（docs-v0.4）

| 议题 | 统一口径 | 涉及文档 |
|---|---|---|
| 产品定位 | 客户端 Agent 应用平台：ClientAgent + Capability Hub + StatelessAgent SDK 编排 | README、docs/README、PRD、TECH-DESIGN |
| 生成产物默认目录 | `./client-agents/<name>/` | ops/GUIDE、ops/DEPLOY、CODEMAP |
| 主要运行命令 | `agentforge run ./client-agents/<name>` | ops/GUIDE、05-CLI与API |
| Hub 启动命令 | `agentforge dashboard` | ops/GUIDE、05-CLI与API |
| ClientAgent 连接端点 | `wss://<hub>/ws/nodes/:nodeId` | 01-核心设计、05-CLI与API、08-客户端Agent |
| Dashboard 创建页路由 | `/client-agents/create` | 06-可视化面板、CODEMAP、TECH-DESIGN |
| 本地调试 HTTP 服务命令 | `agentforge serve`（可选，非主要生产路径） | 04-集成与编排、05-CLI与API、ops/GUIDE |
| 单 Agent `/api/health` | 轻量探活，`{ "status": "ok" }` | design/05 §5.3.1、ops/GUIDE |
| Vitest 版本 | `^2.0` | ops/TEST |
| `AgentStatus` 枚举 | 含 `daemon-running`，与 `02-单个Agent功能.md` 一致 | design/01 §1.1 |
| `AgentNodeStatus` | 定义为 `'online' \| 'offline' \| 'busy' \| 'error'`，用于 `AgentNode.status`，并通过 `AgentMessage.payload` 上报 | design/01 §1.7、§1.13 |
| `CapabilityDistributePayload` | 含 `targetVersion?: string` | design/01 §1.13、design/09 |
| `CapabilityAckPayload` | 含 `installedVersion?: string` | design/01 §1.13、design/09 |
| `requireLocalConfirmation` | 类型为 `string[]`（敏感操作标签列表） | design/01 §1.13、design/02、ops/DEPLOY、design/附录-生成示例 |
| `FrameworkConfig` | 含 `maxToolCalls?: number` 与 `onError?: (error: AgentError) => void` | design/01 §1.11、TECH-DESIGN |
| `AgentEvent` | 含 ClientAgent 专属事件 `agent:capability:installed`、`agent:hub:connected`、`agent:hub:disconnected` | design/01 §1.1、design/02 |
| ClientAgent 核心依赖上限 | ≤ 2 个（`@agentforge/core` + `@agentforge/runtime-client`） | README、design/TECH-DESIGN、product/08 |
| `AgentIdentity` | `id? / name / role / version`；作为 `AgentConfig.identity` 必填字段 | design/01 §1.1、§1.4、design/附录-生成示例 |
| `ToolDefinition` | 含 `handler?: ToolHandler`，执行上下文为 `ToolContext` | design/01 §1.4、design/附录-生成示例 |
| `ClientAgentSecurityConfig` | `.agentforge/security.json` 的 Schema，含 `localCommandAuth`、`allowRemoteExecution`、`requireLocalConfirmation` | design/01 §1.2、ops/DEPLOY、ops/GUIDE |
| `01-核心设计.md` 章节顺序 | `1.1 → 1.2 → 1.3 → … → 1.15` 连续编号 | design/01、全 design 文档锚点 |
| E2E 测试框架 | 使用 Playwright 覆盖 CLI 流程与 Dashboard 页面 | design/TECH-DESIGN §13、ops/TEST |
