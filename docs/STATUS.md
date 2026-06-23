# 文档状态总表

> **文档版本**: docs-v0.3
> **最后更新**: 2026-06-18

| 文档 | 层级 | 类型 | 文档状态 | 实现状态 |
|---|---|---|---|---|
| [product/README.md](./product/README.md) | 第一层 | 索引 | 已定稿 | — |
| [product/PRD.md](./product/PRD.md) | 第一层 | 产品需求 | 已定稿 | 未开始 |
| [product/08-需求与路线图.md](./product/08-需求与路线图.md) | 第一层 | 产品需求 | 已定稿 | 未开始 |
| [design/README.md](./design/README.md) | 第二层 | 索引 | 已定稿 | — |
| [design/01-核心设计.md](./design/01-核心设计.md) | 第二层 | 设计规格 | 已定稿 | 未开始 |
| [design/02-单个Agent功能.md](./design/02-单个Agent功能.md) | 第二层 | 设计规格 | 已定稿 | 未开始 |
| [design/03-生成引擎.md](./design/03-生成引擎.md) | 第二层 | 设计规格 | 已定稿 | 未开始 |
| [design/04-集成与编排.md](./design/04-集成与编排.md) | 第二层 | 设计规格 | 已定稿 | 未开始 |
| [design/05-CLI与API.md](./design/05-CLI与API.md) | 第二层 | 设计规格 | 已定稿 | 未开始 |
| [design/06-可视化面板.md](./design/06-可视化面板.md) | 第二层 | 设计规格 | 已定稿 | 未开始 |
| [design/07-技术选型与架构.md](./design/07-技术选型与架构.md) | 第二层 | 设计规格 | 已定稿 | 未开始 |
| [design/TECH-DESIGN.md](./design/TECH-DESIGN.md) | 第二层 | 设计规格 | 已定稿 | 未开始 |
| [design/附录-生成示例.md](./design/附录-生成示例.md) | 第二层 | 设计规格 | 已定稿 | 未开始 |
| [ops/README.md](./ops/README.md) | 第三层 | 索引 | 已定稿 | — |
| [ops/GUIDE.md](./ops/GUIDE.md) | 第三层 | 使用指南 | 草案 | 未开始 |
| [ops/DEPLOY.md](./ops/DEPLOY.md) | 第三层 | 部署手册 | 草案 | 未开始 |
| [ops/TEST.md](./ops/TEST.md) | 第三层 | 测试策略 | 草案 | 未开始 |

## 图例

- **文档状态**：已定稿 = 设计内容稳定；草案 = 目标行为描述，待实现验证
- **实现状态**：未开始 = 对应代码尚未开发

## 模块实现进度（规划）

| 模块 | 设计 | 实现 | 测试 |
|---|---|---|---|
| @agentforge/types | ✅ | ⬜ | ⬜ |
| @agentforge/core | ✅ | ⬜ | ⬜ |
| @agentforge/sdk | ✅ | ⬜ | ⬜ |
| @agentforge/cli | ✅ | ⬜ | ⬜ |
| @agentforge/http-server | ✅ | ⬜ | ⬜ |
| @agentforge/dashboard | ✅ | ⬜ | ⬜ |

设计 ✅ 表示第二层文档已覆盖该模块规格。

## 口径统一记录（docs-v0.3）

| 议题 | 统一口径 | 涉及文档 |
|---|---|---|
| Dashboard 创建页路由 | `/agents/create` | ops/GUIDE |
| 框架 HTTP 启动命令 | `agentforge serve` | product/08 |
| 单 Agent `/api/status` | `ready` / `degraded` / `unhealthy` | design/02、05、TECH-DESIGN、ops/GUIDE、ops/DEPLOY |
| 单 Agent `/api/health` | 轻量探活，`{ "status": "ok" }` | design/05 §5.3.1、ops/GUIDE |
| Vitest 版本 | `^2.0` | ops/TEST |
