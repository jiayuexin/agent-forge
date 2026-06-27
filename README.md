# AgentForge

AgentForge 是一个**客户端 Agent 应用平台**：从岗位描述生成可本地运行的 **ClientAgent**，并通过 **Capability Hub** 集中管理其能力、远程下发任务与监控运行状态。也支持开发者通过 SDK 编排 **StatelessAgent** 并与 ClientAgent 协同。

**当前阶段**：核心平台已实现（Phase 0–12），Monorepo 可 build/test。完整文档见 [docs/README.md](docs/README.md)，实现进度见 [docs/STATUS.md](docs/STATUS.md)。

## 文档三层结构

| 层级 | 目录 | 回答的问题 |
|---|---|---|
| 第一层 · 产品需求 | [docs/product/](docs/product/) | 做什么、为什么、优先级与路线图 |
| 第二层 · 设计规格 | [docs/design/](docs/design/) | 怎么设计、接口是什么、模块如何协作 |
| 第三层 · 操作手册 | [docs/ops/](docs/ops/) | 未来怎么用、怎么部署、怎么测（草案） |

## 快速入口

- [文档导航](docs/README.md)
- [文档状态总表](docs/STATUS.md)
- [产品需求（PRD）](docs/product/PRD.md)
- [技术设计总览](docs/design/TECH-DESIGN.md)

## 技术栈（规划）

Node.js ≥ 18 · TypeScript · pnpm Monorepo · React Dashboard
