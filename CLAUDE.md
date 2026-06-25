# CLAUDE.md

本文件为 Claude Code（claude.ai/code）在本仓库中工作提供指引。它只说明项目状态、文档结构和关键入口；具体的实现约定（技术栈、monorepo 结构、架构细节、编码规范、环境变量、CI/CD 等）见 [docs/design/11-开发约定.md](./docs/design/11-开发约定.md)。

## 项目状态

**AgentForge** 目前处于**设计文档阶段**。仓库在 `docs/` 目录下包含产品需求、设计规范和运维手册。实际代码（Node.js/TypeScript monorepo）已规划但尚未实现。`docs/STATUS.md` 是判定哪些规范已最终定稿、哪些模块已实现代码的权威依据。

- 根 README：`README.md`
- 文档总览：`docs/README.md`
- 代码地图：`docs/CODEMAP.md`
- 状态追踪：`docs/STATUS.md`
- 类型权威：`docs/design/01-核心设计.md`
- 架构总览：`docs/design/TECH-DESIGN.md`
- 开发约定：`docs/design/11-开发约定.md`

## 文档结构

文档分为三层。编辑或新增文档时，请遵循 `docs/_meta/header-template.md` 中的标题约定，并参考其中记录的链接规范。

| 层级 | 目录 | 用途 |
|---|---|---|
| 产品需求 | `docs/product/` | 做什么、为什么：PRD、用户故事、路线图 |
| 设计规范 | `docs/design/` | 如何实现：接口、数据模型、模块交互、开发约定 |
| 运维手册 | `docs/ops/` | 使用草案：CLI、部署、测试（目标行为，尚未实现） |

重要文档：

- `docs/product/PRD.md` — 问题定义、目标、v1 非目标
- `docs/product/08-需求与路线图.md` — 用户故事、路线图、成功指标
- `docs/design/01-核心设计.md` — `IAgent`、`AgentConfig`、`ModelConfig`、`AgentTask`、`AgentResult`、`IProvider`、`PipelineControlSignal` 等核心类型的规范定义
- `docs/design/TECH-DESIGN.md` — 完整系统架构、模块职责、部署、可观测性、安全与兼容性规划
- `docs/design/04-集成与编排.md` — 集成模式与 Pipeline 编排细节
- `docs/design/05-CLI与API.md` — CLI 命令与 HTTP/WebSocket API 规范
- `docs/design/11-开发约定.md` — 技术栈、monorepo 结构、架构约定、编码规范、环境变量、CI/CD 计划
- `docs/ops/GUIDE.md` — 目标 CLI 与 SDK 用法
- `docs/ops/DEPLOY.md` — 目标部署模式（ClientAgent 本地安装包、Capability Hub Docker/Kubernetes、SDK 嵌入）
- `docs/ops/TEST.md` — 目标测试策略与 Vitest 约定

## 开始工作前

1. 阅读 `docs/STATUS.md`，确认哪些模块已规范完成。
2. 涉及核心类型时，阅读 `docs/design/01-核心设计.md`。
3. 涉及系统架构时，阅读 `docs/design/TECH-DESIGN.md`。
4. 进入实现阶段时，阅读 `docs/design/11-开发约定.md`。
