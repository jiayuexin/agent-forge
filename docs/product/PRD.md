# AgentForge 产品需求文档（PRD）

> **文档层级**: 第一层 · 产品需求
> **文档类型**: 产品需求
> **文档状态**: 已定稿
> **文档版本**: docs-v0.4
> **最后更新**: 2026-06-24
> **实现状态**: 未开始
> **详细需求与规划**: 参见 [08-需求与路线图.md](./08-需求与路线图.md)
> **详细设计文档**: 参见 [TECH-DESIGN.md](../design/TECH-DESIGN.md)
> **架构全景图**: 参见 [TECH-DESIGN.md §2](../design/TECH-DESIGN.md#2-系统架构)

---

## 1. 问题陈述

### 1.1 用户痛点

当前 AI Agent 的创建和使用存在以下问题：

- **创建门槛高**：搭建一个能在本地运行、能调用工具、能连接 LLM 的 Agent，需要手写大量样板代码（Prompt 工程、Function Calling、状态管理、错误处理），耗时数天。
- **能力管理分散**：每个 Agent 自带固定能力，新增或更新能力需要重新生成或修改代码，无法集中管理。
- **团队协作困难**：团队成员各自创建的 Agent 形态不一，有的用脚本、有的用某个框架、有的用某个 SaaS，难以统一管控和复用。
- **现有方案要么太重、要么太封闭**：LangChain、AutoGen 等框架学习曲线陡峭；SaaS 平台则受限于云端、数据隐私和自定义能力。

### 1.2 目标用户

| 用户画像 | 场景 | 核心需求 |
|---|---|---|
| **技术型个人用户** | 想在本地拥有一个可执行任务的 AI 助手 | 通过简单描述生成能长期运行的客户端 Agent |
| **团队管理员** | 需要为团队统一部署和管理多个本地 Agent | 通过 Capability Hub 集中管理 Agent 和能力，远程下发配置 |
| **开发者** | 需要编排多个无状态 Agent 完成复杂任务 | 通过 SDK 编排 StatelessAgent，并与 ClientAgent 通信 |
| **安全敏感型企业** | 数据不能上云，需要在本地运行 Agent | Agent 运行在用户机器，LLM 调用本地配置，能力可离线缓存 |

### 1.3 不解决的代价

- 每个人/每个团队重复造轮子，Agent 代码不可复用。
- 能力更新成本高，一个小工具改动需要重新生成整个 Agent。
- 缺乏统一的 Agent 管理和观察手段，无法规模化使用。
- 云端方案无法满足本地执行命令、访问本地资源、数据隐私等需求。

---

## 2. 产品目标

| # | 目标 | 衡量标准 | 类型 |
|---|---|---|---|
| G1 | 通过岗位描述生成可本地运行的客户端 Agent | 从描述到运行 < 5 分钟 | 用户目标 |
| G2 | 生成的 ClientAgent 具备基础本地能力 | 可调用终端/PowerShell、执行命令、配置 LLM | 用户目标 |
| G3 | 支持通过 Capability Hub 扩展 Agent 能力 | 向运行中的 ClientAgent 下发 Tool/Skill/Plugin | 用户目标 |
| G4 | ClientAgent 可在断网情况下使用已缓存能力 | 离线时本地能力可正常调用 | 用户目标 |
| G5 | 支持 StatelessAgent 编排与 ClientAgent 协同 | SDK 可编排无状态 Agent 并调用 ClientAgent | 用户目标 |
| G6 | 提供 Capability Hub 进行集中管理 | 覆盖 Agent 节点、能力市场、能力下发、调试 | 业务目标 |

---

## 3. 非目标（明确不做）

| 非目标 | 原因 |
|---|---|
| 不提供模型训练能力 | 定位是应用层平台，不是基础设施 |
| 不依赖特定 LLM 厂商 | 通过 Provider 抽象支持任意模型 |
| 不做多租户 SaaS 部署 | 面向单团队或本地使用，不做多租户 |
| 不做公开社区市场 | 能力市场面向团队内部或受信任分发，不做公开共享 |
| 不做 Agent 的自主进化/学习 | 这是 Agent 自身能力，不是平台职责 |
| 不做可视化拖拽编排 | 通过代码定义 Pipeline 和模型驱动编排 |
| 不做多模态输入（图片/语音） | 先做好文本场景 |
| 不做无限制的远程代码执行 | 能力下发需受控，Plugin 脚本必须签名并运行在沙箱中 |

---

## 4. 用户故事与需求规格

> 详细的用户故事、需求规格、成功指标、实施路线图见 [08-需求与路线图.md](./08-需求与路线图.md)。

---

## 5. 开放问题

| # | 问题 | 负责人 | 优先级 | 状态 |
|---|---|---|---|---|
| Q1 | ClientAgent 的本地命令执行授权采用几层模型？ | 产品 | — | 已解决（参见 [`docs/design/10-安全模型.md` §10.2](../design/10-安全模型.md#102-本地命令执行授权)） |
| Q2 | Capability Hub 是独立包还是合并到 Dashboard？ | 架构 | 非阻塞 | 已解决：合并到 `@agentforge/dashboard`，前端与后端统一在该包内实现（参见 [`docs/design/TECH-DESIGN.md` §2](../design/TECH-DESIGN.md#2-系统架构)） |
| Q3 | Plugin 脚本采用什么沙箱机制？ | 工程 | 非阻塞 | 已解决：运行在隔离沙箱（如 `isolated-vm`），默认无网络、文件系统只读（`readonly`），能力包需签名（参见 [`docs/design/10-安全模型.md` §10.3](../design/10-安全模型.md#103-能力下发安全)） |
| Q4 | ClientAgent 与 Capability Hub 断连后的重连和缓存策略？ | 工程 | 非阻塞 | 已解决：按 `AgentRuntimeConfig.reconnect` 策略重连，离线时本地已缓存能力仍可调用（参见 [`docs/design/01-核心设计.md` §1.15](../design/01-核心设计.md#115-远程控制与客户端运行时类型)） |
| Q5 | StatelessAgent 是否允许调用 ClientAgent 的本地命令能力？ | 产品 | 非阻塞 | 已解决：允许通过 Capability Hub 路由调用 ClientAgent 能力，但涉及本地命令等敏感操作时仍触发 ClientAgent 本地确认（参见 [`docs/design/08-客户端Agent与无状态Agent.md` §8.7](../design/08-客户端Agent与无状态Agent.md#87-安全边界差异)） |

---

## 附录 A：产品架构概览

```
用户交互层
├── CLI (agentforge create / run / dashboard)
└── Capability Hub Web 面板
              │
              ▼
平台层
├── @agentforge/cli         # 生成客户端应用、启动守护进程、启动 Hub
├── @agentforge/sdk         # 编排 StatelessAgent、与 ClientAgent 通信
└── @agentforge/dashboard   # Capability Hub 可视化界面 + 后端
              │
              ▼
运行时层
├── @agentforge/core        # IAgent、BaseAgent、Provider 适配
├── @agentforge/runtime-client   # ClientAgent 本地运行时、能力缓存、远程控制
└── StatelessAgent          # 进程内无状态 Agent，由 SDK 编排
              │
              ▼
外部 Provider
├── OpenAI / Anthropic / Ollama / Custom API
```

## 附录 B：设计文档索引

| 文档 | 说明 |
|---|---|
| [01-核心设计.md](../design/01-核心设计.md) | IAgent 接口、ClientAgent/StatelessAgent 类型、数据模型 |
| [02-单个Agent功能.md](../design/02-单个Agent功能.md) | ClientAgent 与 StatelessAgent 核心能力 |
| [03-生成引擎.md](../design/03-生成引擎.md) | 生成客户端应用的流程与产物 |
| [04-集成与编排.md](../design/04-集成与编排.md) | ClientAgent 运行、SDK 编排、Capability Hub 集成 |
| [05-CLI与API.md](../design/05-CLI与API.md) | CLI 命令、Capability Hub API、WebSocket 控制协议 |
| [06-可视化面板.md](../design/06-可视化面板.md) | Capability Hub 页面设计与远程控制 |
| [07-技术选型与架构.md](../design/07-技术选型与架构.md) | 依赖选型、Monorepo 结构、生成项目结构 |
| [08-客户端Agent与无状态Agent.md](../design/08-客户端Agent与无状态Agent.md) | 两种 Agent 形态的分野与选择 |
| [09-能力市场与下发.md](../design/09-能力市场与下发.md) | Tool/Skill/Plugin 管理与下发协议 |
| [10-安全模型.md](../design/10-安全模型.md) | 本地命令授权、能力下发安全、认证鉴权 |
| [TECH-DESIGN.md](../design/TECH-DESIGN.md) | 系统架构总览与跨模块决策 |
