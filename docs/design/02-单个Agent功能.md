# 2. 单个 Agent 功能详解

> **文档层级**: 第二层 · 设计规格
> **文档类型**: 设计规格
> **文档状态**: 已定稿
> **文档版本**: docs-v0.4
> **最后更新**: 2026-06-23
> **实现状态**: 已完成
>
> AgentForge 中的 Agent 分为两种形态：ClientAgent 与 StatelessAgent。两者共享 `IAgent` 接口，但功能侧重不同。

---

## 两种形态概览

| 功能 | ClientAgent | StatelessAgent |
|---|---|---|
| 运行位置 | 用户机器（守护进程） | SDK 进程内 |
| 生命周期 | 长期运行 | 随任务创建销毁 |
| 本地命令执行 | 支持（需授权） | 不支持 |
| Capability Hub 连接 | 支持 | 不直接连接 |
| 能力缓存 | 支持 | 不支持 |
| LLM 调用 | 本地配置 | 由编排器注入配置 |
| 典型使用 | 终端用户本地助手 | 开发者编排工作流 |

---

## ClientAgent 功能

### 2.1 核心生命周期

ClientAgent 作为本地守护进程运行，生命周期比 StatelessAgent 更长：

| 方法 | 说明 | 示例 |
|---|---|---|
| `init()` | 初始化 Agent，加载配置、连接模型、注册工具 | `await agent.init({ identity: {...}, model: {...}, systemPrompt: '...' })` |
| `startDaemon()` | 启动本地守护进程 | `await agent.startDaemon()` |
| `execute()` | 执行任务 | `await agent.execute(task)` |
| `stream()` | 流式执行任务 | `for await (const chunk of agent.stream(task))` |
| `stopDaemon()` | 停止守护进程 | `await agent.stopDaemon()` |
| `destroy()` | 销毁 Agent，释放资源 | `await agent.destroy()` |

### 2.2 智能对话

- 多轮对话上下文维护
- 流式输出
- 上下文注入（用户ID、会话ID、历史消息）

```typescript
const result = await agent.execute({
  type: 'chat',
  input: { message: '帮我查一下订单 ORD-001' },
  context: { conversationId: 'conv-001', userId: 'U123' }
});
```

### 2.3 工具调用

ClientAgent 可调用两类工具：

1. **预置工具**：生成时根据模板确定，如文件读取、Git 操作。
2. **动态能力**：从 Capability Hub 下发后静默安装到本地缓存。

```typescript
// 用户说："帮我 commit 当前改动"
// Agent 自动：
// 1. 识别意图 → git commit
// 2. 调用 git-status、git-add、git-commit 工具
// 3. 生成回复
```

### 2.4 本地命令执行

ClientAgent 可在授权后调用本地终端/PowerShell 执行命令。

**授权级别**：

| 级别 | 说明 |
|---|---|
| `disabled` | 默认状态，禁止执行任何命令 |
| `readonly` | 只允许只读命令（如 `ls`、`ps`、`git status`） |
| `whitelist` | 只允许白名单内的命令 |
| `full` | 开放命令执行，敏感命令需二次确认 |

### 2.5 连接 Capability Hub

```typescript
await agent.connectToHub('wss://hub.example.com', authToken);
```

连接后 ClientAgent：
- 注册为节点
- 上报状态、指标、事件
- 接收远程任务
- 接收能力下发

### 2.6 能力缓存

从 Capability Hub 下发的 Tool / Skill / Plugin 会下载到本地缓存：

```
./client-agents/my-agent/.agentforge/capabilities/
├── manifest.json
├── tool-query-order/
│   ├── definition.json
│   └── executor.js
└── skill-refund/
    └── definition.json
```

断网时，ClientAgent 仍可调用已缓存能力。

### 2.7 事件系统

| 事件 | 触发时机 |
|---|---|
| `agent:init` | 初始化完成 |
| `agent:ready` | 就绪 |
| `agent:execute:start` | 任务执行前 |
| `agent:execute:end` | 任务执行完成 |
| `agent:tool:call` | 工具被调用前 |
| `agent:tool:result` | 工具返回结果 |
| `agent:llm:chunk` | LLM 流式输出 chunk |
| `agent:llm:error` | LLM 调用失败 |
| `agent:capability:installed` | 能力安装完成 |
| `agent:hub:connected` | 连接 Hub 成功 |
| `agent:hub:disconnected` | 与 Hub 断开 |
| `agent:error` | 发生错误 |
| `agent:destroy` | 销毁前 |

### 2.8 状态管理

ClientAgent 扩展了标准 Agent 状态机，增加守护进程状态：

```
UNINITIALIZED → INITIALIZING → READY → DAEMON_RUNNING ⇄ RUNNING
                              ↓         ↓
                            ERROR ←────┘
                              ↓
                           DESTROYED（不可逆）
```

| 状态 | 说明 |
|---|---|
| `daemon-running` | 守护进程已启动，等待远程/本地任务 |

### 2.9 安全配置

ClientAgent 的安全配置存储在 `.agentforge/security.json`：

```json
{
  "localCommandAuth": {
    "level": "whitelist",
    "whitelist": ["git status", "git log", "ls"],
    "requireConfirmationFor": ["git push", "rm"]
  },
  "allowRemoteExecution": true,
  "requireLocalConfirmation": ["refund", "contract-sign", "data-delete"]
}
```

---

## StatelessAgent 功能

### 2.10 核心生命周期

StatelessAgent 在 SDK 进程内创建，任务完成后销毁：

| 方法 | 说明 |
|---|---|
| `init()` | 初始化，注入能力清单 |
| `execute()` | 执行单次任务 |
| `stream()` | 流式执行 |
| `destroy()` | 立即销毁，释放资源 |

### 2.11 LLM 编排执行

StatelessAgent 本身不决定如何完成任务，由编排器决定：

```typescript
const framework = new AgentFramework();
framework.register('git', GitAgent);
framework.register('reviewer', CodeReviewAgent);

// PlannerAgent 根据能力清单自动生成计划
const result = await framework.orchestrate({
  type: 'chat',
  input: { message: 'review 这段代码并生成 commit message' }
});
```

### 2.12 工具与能力调用

StatelessAgent 可调用的能力来源：

1. 注册时传入的 `capabilities` 列表
2. CapabilityRegistry 中已注册的能力
3. 通过 Capability Hub 路由调用的 ClientAgent 远程能力

### 2.13 无状态特性

- 不维护长期对话上下文
- 不持久化配置
- 不直接访问用户本地资源
- 可高频创建和销毁

---

## 2.14 功能总览

```
┌──────────────────────────────────────────────────┐
│              ClientAgent（客户端应用）            │
│                                                   │
│  🔄 生命周期      init → startDaemon → execute   │
│                   → stopDaemon → destroy         │
│  💬 智能对话      多轮 + 流式 + 上下文注入        │
│  🔧 工具调用      预置工具 + 动态下发能力         │
│  💻 本地命令      分层授权 + 二次确认             │
│  ☁️  Hub 连接     注册节点 + 接收任务/能力        │
│  📦 能力缓存      静默下载 + 断网可用             │
│  📡 事件系统      生命周期 + Hub + 能力事件       │
│  🛡️ 安全配置      本地授权 + 敏感操作确认         │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│              StatelessAgent（编排单元）           │
│                                                   │
│  🔄 生命周期      init → execute → destroy       │
│  🧠 LLM 编排      被 PlannerAgent 调度           │
│  🔧 能力调用      进程内能力 + 远程 ClientAgent   │
│  📡 事件上报      通过 EventBus 委托             │
│  🌐 无状态        不持久化、不访问本地资源        │
└──────────────────────────────────────────────────┘
```

> **总结：** ClientAgent 是用户机器上的长期运行助手，具备本地执行和远程扩展能力；StatelessAgent 是编排工作流中的临时执行单元，靠 LLM 根据能力清单调度。
