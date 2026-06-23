# AgentForge 文档导航

> **项目代号**: AgentForge
> **文档版本**: docs-v0.3
> **最后更新**: 2026-06-18
> **当前阶段**: 设计文档阶段，代码待开发

**AgentForge** 是一个基于 Node.js + TypeScript 的可插拔 Agent 批量生成框架。用户只需提供一段岗位描述，框架即可自动生成标准化的、可独立部署的 AI Agent。

完整文档状态见 [STATUS.md](./STATUS.md)。代码与架构导航见 [CODEMAP.md](./CODEMAP.md)。元信息规范见 [_meta/header-template.md](./_meta/header-template.md)。

---

## 按角色阅读

### 产品 / 决策者

1. [product/PRD.md](./product/PRD.md) — 问题陈述、产品目标、非目标
2. [product/08-需求与路线图.md](./product/08-需求与路线图.md) — 用户故事、路线图、成功指标

### 开发者 / 架构师

1. [design/01-核心设计.md](./design/01-核心设计.md) — IAgent 接口与类型权威定义
2. [design/TECH-DESIGN.md](./design/TECH-DESIGN.md) — 系统架构与跨模块决策
3. 按需阅读 [design/02–07](./design/README.md) 专题文档

### 运维 / 使用者（草案）

1. [ops/GUIDE.md](./ops/GUIDE.md) — 目标 CLI 与 SDK 用法
2. [ops/DEPLOY.md](./ops/DEPLOY.md) — 目标部署方案
3. [ops/TEST.md](./ops/TEST.md) — 目标测试策略

---

## 三层文档索引

### 第一层 · 产品需求 — [product/](./product/)

| 文档 | 类型 | 状态 | 说明 |
|---|---|---|---|
| [PRD.md](./product/PRD.md) | 产品需求 | 已定稿 | 问题陈述、产品目标、非目标、开放问题 |
| [08-需求与路线图.md](./product/08-需求与路线图.md) | 产品需求 | 已定稿 | 用户故事、需求规格、路线图、成功指标 |

### 第二层 · 设计规格 — [design/](./design/)

| 文档 | 类型 | 状态 | 说明 |
|---|---|---|---|
| [01-核心设计.md](./design/01-核心设计.md) | 设计规格 | 已定稿 | IAgent 接口、数据模型（类型权威来源） |
| [02-单个Agent功能.md](./design/02-单个Agent功能.md) | 设计规格 | 已定稿 | Agent 十大能力详解 |
| [03-生成引擎.md](./design/03-生成引擎.md) | 设计规格 | 已定稿 | 生成流程、Prompt 策略、模板库 |
| [04-集成与编排.md](./design/04-集成与编排.md) | 设计规格 | 已定稿 | 三种集成模式 + Pipeline 编排 |
| [05-CLI与API.md](./design/05-CLI与API.md) | 设计规格 | 已定稿 | CLI 命令、HTTP / WebSocket API |
| [06-可视化面板.md](./design/06-可视化面板.md) | 设计规格 | 已定稿 | Dashboard、调试台、分离部署监控 |
| [07-技术选型与架构.md](./design/07-技术选型与架构.md) | 设计规格 | 已定稿 | 依赖选型、Monorepo 结构 |
| [TECH-DESIGN.md](./design/TECH-DESIGN.md) | 设计规格 | 已定稿 | 技术总览、架构图、跨切面设计 |
| [附录-生成示例.md](./design/附录-生成示例.md) | 设计规格 | 已定稿 | 完整生成示例代码 |

架构全景图：[TECH-DESIGN.md §2](./design/TECH-DESIGN.md#2-系统架构)

### 第三层 · 操作手册 — [ops/](./ops/)

| 文档 | 类型 | 状态 | 说明 |
|---|---|---|---|
| [GUIDE.md](./ops/GUIDE.md) | 使用指南 | 草案 | 安装、CLI、SDK、HTTP 集成（目标行为） |
| [DEPLOY.md](./ops/DEPLOY.md) | 部署手册 | 草案 | npm / HTTP / Docker 部署（目标行为） |
| [TEST.md](./ops/TEST.md) | 测试策略 | 草案 | 测试分层、用例索引（目标行为） |

---

## 设计原则

| 原则 | 说明 |
|---|---|
| 接口优先 | 所有 Agent 遵循 `IAgent` 统一接口，保证可替换性 |
| 插件化 | 核心功能通过 Middleware 和 Plugin 机制扩展 |
| 零依赖生成 | 生成的 Agent 核心依赖 ≤ 2 个 |
| 约定优于配置 | 合理默认值，80% 场景零配置即可使用 |
| 可观测性 | 内置日志、指标、追踪，方便监控和调试 |

## 非目标（v1）

详见 [product/PRD.md §3](./product/PRD.md#3-非目标v1-明确不做)。概要：不做模型训练、Agent 市场、多租户 SaaS、可视化拖拽编排、多模态输入。

## 问题陈述

详见 [product/PRD.md §1](./product/PRD.md#1-问题陈述)。
