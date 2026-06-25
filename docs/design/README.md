# 第二层 · 设计规格

回答 **怎么设计、接口是什么、模块如何协作**。

## 包含文档

| 文档 | 说明 |
|---|---|
| [01-核心设计.md](./01-核心设计.md) | IAgent 接口、数据模型（类型权威来源） |
| [02-单个Agent功能.md](./02-单个Agent功能.md) | ClientAgent 与 StatelessAgent 核心能力 |
| [03-生成引擎.md](./03-生成引擎.md) | ClientAgent 生成流程、Prompt 策略、模板库 |
| [04-集成与编排.md](./04-集成与编排.md) | SDK 编排、Pipeline、StatelessAgent 与 ClientAgent 协同 |
| [05-CLI与API.md](./05-CLI与API.md) | CLI 命令、Capability Hub HTTP / WebSocket API |
| [06-可视化面板.md](./06-可视化面板.md) | Capability Hub 面板、调试台、节点监控 |
| [07-技术选型与架构.md](./07-技术选型与架构.md) | 依赖选型、Monorepo 结构 |
| [08-客户端Agent与无状态Agent.md](./08-客户端Agent与无状态Agent.md) | 两种 Agent 形态的分野、共享接口、差异能力 |
| [09-能力市场与下发.md](./09-能力市场与下发.md) | Tool / Skill / Plugin 定义、版本管理、能力下发协议、本地缓存 |
| [10-安全模型.md](./10-安全模型.md) | 本地命令授权、能力下发安全、认证鉴权、沙箱隔离 |
| [11-开发约定.md](./11-开发约定.md) | 技术栈、monorepo 结构、编码规范、环境变量、CI/CD |
| [TECH-DESIGN.md](./TECH-DESIGN.md) | 技术总览、架构图、跨模块决策 |
| [附录-生成示例.md](./附录-生成示例.md) | 完整生成示例代码 |

## 推荐阅读顺序

1. [01-核心设计.md](./01-核心设计.md) — 掌握核心接口与类型
2. [TECH-DESIGN.md](./TECH-DESIGN.md) — 了解系统架构全貌
3. [11-开发约定.md](./11-开发约定.md) — 了解实现阶段的工程约定
4. 按需阅读 02–10 专题文档

产品背景见 [第一层 · 产品需求](../product/README.md)。未来用法见 [第三层 · 操作手册](../ops/README.md)（草案）。
