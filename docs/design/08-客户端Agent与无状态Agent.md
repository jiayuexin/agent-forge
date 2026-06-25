# 8. 客户端 Agent 与无状态 Agent

> **文档层级**: 第二层 · 设计规格
> **文档类型**: 设计规格
> **文档状态**: 已定稿
> **文档版本**: docs-v0.4
> **最后更新**: 2026-06-23
> **实现状态**: 未开始
>
> 阐述 AgentForge 中两种 Agent 形态的分野、共享接口、差异能力与适用场景。

---

## 8.1 两种形态概述

AgentForge 支持两种 Agent 形态，它们共享 `IAgent` 统一接口（详见 [01-核心设计.md §1.1](./01-核心设计.md#11-iagent-统一接口)），但生命周期、部署方式、状态管理和使用场景不同。

| 维度 | ClientAgent | StatelessAgent |
|---|---|---|
| **运行位置** | 用户机器（本地守护进程） | SDK 进程内 |
| **生命周期** | 长期运行，可被启动/停止 | 随任务创建和销毁 |
| **状态** | 有状态，维护本地缓存和配置 | 无状态，不持久化 |
| **与 Hub 关系** | 通过 WebSocket 连接 Capability Hub | 不直接连接 Hub，由编排器注入能力 |
| **核心能力** | 本地命令执行、LLM 调用、能力缓存、远程控制 | 被 LLM 编排、调用工具/能力、进程内执行 |
| **典型用户** | 终端用户、团队管理员 | 开发者、系统架构师 |

---

## 8.2 共享接口

两种 Agent 都实现 `IAgent`。`IAgent` 接口定义见 [01-核心设计.md §1.1](./01-核心设计.md#11-iagent-统一接口)。

共享接口保证：

- 同一套测试、调试、监控机制可作用于两种 Agent。
- StatelessAgent 可以代理调用 ClientAgent，ClientAgent 也可以被编排进无状态工作流。
- Provider 适配、工具调用、Prompt 生成逻辑可复用。

---

## 8.3 ClientAgent

### 定位

ClientAgent 是运行在用户机器上的**客户端应用**，以后台守护进程形式长期运行。它是用户与 AgentForge 平台交互的主要终端。

### 核心能力

1. **本地命令执行**（需授权）
   - 可调用终端、PowerShell、执行命令。
   - 默认禁用，需用户显式授权并选择授权级别。
2. **LLM 调用**
   - 本地配置 ModelConfig，直接调用 OpenAI / Anthropic / Ollama / Custom API。
   - 断网时可使用本地缓存能力，但 LLM 调用需要网络（本地模型除外）。
3. **连接 Capability Hub**
   - 通过 WebSocket 注册为节点。
   - 接收远程任务、能力下发、配置更新。
   - 上报状态、指标、事件和结果。
4. **能力缓存**
   - 从 Capability Hub 下发的 Tool / Skill / Plugin 静默下载到本地。
   - 本地缓存目录为 `.agentforge/capabilities/`。
   - 断网时可继续使用已缓存能力。
5. **守护进程生命周期**
   - 启动：`agentforge run ./client-agents/my-agent`
   - 停止：命令行 `Ctrl+C`、Capability Hub 远程停止、系统托盘退出。

### 配置

`ClientAgentConfig` 类型定义见 [01-核心设计.md §1.2](./01-核心设计.md#12-clientagent-与-statelessagent-扩展接口)。本节仅说明其行为与使用方式，不重复声明类型。

### 典型使用流程

```bash
# 1. 生成 ClientAgent
agentforge create "一个能在本地执行 Git 命令的编程助手"

# 2. 启动守护进程
agentforge run ./client-agents/my-agent \
  --connect wss://hub.example.com \
  --token $AGENTFORGE_NODE_TOKEN

# 3. 在 Capability Hub 中向该 Agent 下发 git 相关能力

# 4. 用户通过 Hub 或本地接口与 Agent 对话
```

---

## 8.4 StatelessAgent

### 定位

StatelessAgent 是由 SDK 在运行时实例化的**无状态 Agent**。它不长期运行，所有行为由 LLM 根据当前上下文中的能力清单编排。

### 核心能力

1. **进程内执行**
   - 由 `AgentFramework` 在内存中创建和销毁。
   - 适合作为编排工作流中的一个步骤。
2. **LLM 驱动规划**
   - PlannerAgent 根据任务描述和可用能力生成执行计划。
   - StatelessAgent 按计划调用工具、Skill 或其他 Agent。
3. **可被编排**
   - 通过 `framework.orchestrate(task)` 触发模型驱动编排。
   - 通过 `framework.pipeline('workflow')` 构建固定流程。
4. **与 ClientAgent 通信**
   - 可以通过 Capability Hub 路由调用 ClientAgent 的能力。
   - 也可以直接通过本地 HTTP/WSS 调用 ClientAgent。

### 配置

`StatelessAgentConfig` 类型定义见 [01-核心设计.md §1.2](./01-核心设计.md#12-clientagent-与-statelessagent-扩展接口)。本节仅说明其行为与使用方式，不重复声明类型。

### 典型使用方式

```typescript
import { AgentFramework } from '@agentforge/sdk';
import { GitAgent, CodeReviewAgent } from './agents';

const framework = new AgentFramework();
framework.register('git', GitAgent);
framework.register('reviewer', CodeReviewAgent);

// 模型驱动编排
const result = await framework.orchestrate({
  type: 'chat',
  input: { message: '帮我 review 这个 PR 并生成 commit message' },
});
```

---

## 8.5 选择决策树

```
是否需要长期运行在用户机器上？
├── 是 → ClientAgent
│     └── 是否需要远程管理和能力下发？
│           ├── 是 → 必须连接 Capability Hub
│           └── 否 → 可以离线运行，手动管理配置
└── 否 → StatelessAgent
      └── 是否需要 LLM 自动规划？
            ├── 是 → 使用 framework.orchestrate()
            └── 否 → 使用 framework.pipeline()
```

---

## 8.6 两种 Agent 的协作关系

```text
┌─────────────────────────────────────────┐
│           Capability Hub                │
│  · 能力管理 / 能力市场 / 能力下发        │
│  · ClientAgent 节点注册表                │
└─────────────────────────────────────────┘
              ↑↓ WebSocket
┌─────────────────────────────────────────┐
│         ClientAgent（用户机器）          │
│  · 守护进程                              │
│  · 本地命令执行（授权后）                 │
│  · 能力缓存                              │
│  · LLM 调用                              │
└─────────────────────────────────────────┘
              ↑↓ 本地 HTTP/WSS 或 Hub 路由
┌─────────────────────────────────────────┐
│  SDK 进程内的 StatelessAgent 编排        │
│  · PlannerAgent 生成计划                 │
│  · PlanExecutor 调度执行                 │
│  · 可调用 ClientAgent 的远程能力          │
└─────────────────────────────────────────┘
```

### 协作示例

用户请求："帮我 review 这段代码，如果有问题就生成修复补丁并提交。"

1. `AgentFramework.orchestrate()` 被调用。
2. `PlannerAgent` 读取 `CapabilityRegistry`：
   - 本地有 `code-reviewer`（StatelessAgent）
   - 远程有 `client-dev-machine-a1b2c3d`（ClientAgent，具备 `git-commit` 能力）
3. 生成计划：
   - Step 1: 调用 `code-reviewer` review 代码
   - Step 2: 调用 `client-dev-machine-a1b2c3d` 的 `git-commit` 能力提交补丁
4. `PlanExecutor` 执行计划。
5. ClientAgent 在执行 `git-commit` 前，根据安全策略进行本地确认。

---

## 8.7 安全边界差异

| 安全项 | ClientAgent | StatelessAgent |
|---|---|---|
| 本地命令执行 | 默认禁止，需用户授权 | 不执行本地命令 |
| 能力来源 | Capability Hub 下发 + 本地缓存 | 编排器注入 |
| 敏感操作 | 需本地二次确认 | 依赖 ApprovalHandler（如配置） |
| 数据持久化 | 本地配置和能力缓存 | 无持久化 |
| 网络暴露 | 连接 Hub，不主动暴露服务 | 进程内，不直接暴露网络 |

---

## 8.8 命名约定

- ClientAgent 项目目录：`./client-agents/<name>/`
- ClientAgent 节点 ID：`client-<name>-<hash>`
- StatelessAgent 类名：`<Role>Agent`
- 能力 ID：`tool-<name>`、`skill-<name>`、`plugin-<name>`
