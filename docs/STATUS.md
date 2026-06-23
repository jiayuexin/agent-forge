# 文档状态总表

> **文档版本**: docs-v0.4
> **最后更新**: 2026-06-23

| 文档 | 层级 | 类型 | 文档状态 | 实现状态 |
|---|---|---|---|---|
| [product/README.md](./product/README.md) | 第一层 | 索引 | 已定稿 | — |
| [product/PRD.md](./product/PRD.md) | 第一层 | 产品需求 | 重构中 | 未开始 |
| [product/08-需求与路线图.md](./product/08-需求与路线图.md) | 第一层 | 产品需求 | 重构中 | 未开始 |
| [design/README.md](./design/README.md) | 第二层 | 索引 | 已定稿 | — |
| [design/01-核心设计.md](./design/01-核心设计.md) | 第二层 | 设计规格 | 重构中 | 未开始 |
| [design/02-单个Agent功能.md](./design/02-单个Agent功能.md) | 第二层 | 设计规格 | 重构中 | 未开始 |
| [design/03-生成引擎.md](./design/03-生成引擎.md) | 第二层 | 设计规格 | 重构中 | 未开始 |
| [design/04-集成与编排.md](./design/04-集成与编排.md) | 第二层 | 设计规格 | 重构中 | 未开始 |
| [design/05-CLI与API.md](./design/05-CLI与API.md) | 第二层 | 设计规格 | 重构中 | 未开始 |
| [design/06-可视化面板.md](./design/06-可视化面板.md) | 第二层 | 设计规格 | 重构中 | 未开始 |
| [design/07-技术选型与架构.md](./design/07-技术选型与架构.md) | 第二层 | 设计规格 | 重构中 | 未开始 |
| [design/08-客户端Agent与无状态Agent.md](./design/08-客户端Agent与无状态Agent.md) | 第二层 | 设计规格 | 重构中 | 未开始 |
| [design/09-能力市场与下发.md](./design/09-能力市场与下发.md) | 第二层 | 设计规格 | 重构中 | 未开始 |
| [design/10-安全模型.md](./design/10-安全模型.md) | 第二层 | 设计规格 | 重构中 | 未开始 |
| [design/TECH-DESIGN.md](./design/TECH-DESIGN.md) | 第二层 | 设计规格 | 重构中 | 未开始 |
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
| @agentforge/runtime-client | ✅ | ⬜ | ⬜ |
| @agentforge/cli | ✅ | ⬜ | ⬜ |
| @agentforge/http-server | ✅ | ⬜ | ⬜ |
| @agentforge/dashboard | ✅ | ⬜ | ⬜ |

设计 ✅ 表示第二层文档已覆盖该模块规格。

## 口径统一记录（docs-v0.4）

| 议题 | 统一口径 | 涉及文档 |
|---|---|---|
| 产品定位 | 客户端 Agent 应用平台：ClientAgent + Capability Hub + StatelessAgent SDK 编排 | README、docs/README、PRD、TECH-DESIGN |
| 生成产物默认目录 | `./client-agents/<name>/` | ops/GUIDE、ops/DEPLOY、CODEMAP |
| 主要运行命令 | `agentforge run ./client-agents/<name>` | ops/GUIDE、05-CLI与API |
| Hub 启动命令 | `agentforge dashboard` | ops/GUIDE、05-CLI与API |
| ClientAgent 连接端点 | `wss://<hub>/ws/nodes/:nodeId` | 01-核心设计、05-CLI与API、08-客户端Agent |
| Dashboard 创建页路由 | `/agents/create` | 06-可视化面板、CODEMAP |
| 本地调试 HTTP 服务命令 | `agentforge serve`（可选，非主要生产路径） | 04-集成与编排、05-CLI与API、ops/GUIDE |
| 单 Agent `/api/health` | 轻量探活，`{ "status": "ok" }` | design/05 §5.3.1、ops/GUIDE |
| Vitest 版本 | `^2.0` | ops/TEST |
