# AgentForge 使用文档

> ⚠️ **目标行为文档**：本文描述预期用法，当前项目处于设计阶段，命令与 API 尚未实现。权威规格见 [05-CLI与API.md](../design/05-CLI与API.md)。
>
> **文档层级**: 第三层 · 操作手册
> **文档类型**: 使用指南
> **文档状态**: 草案
> **文档版本**: docs-v0.4
> **最后更新**: 2026-06-23
> **实现状态**: 未开始

## 快速开始

### 环境要求

- Node.js ≥ 18.0.0
- pnpm ≥ 8.0.0（开发时需要）
- 至少一个 LLM Provider 的 API Key

### 30 秒创建你的第一个 ClientAgent

```bash
# 设置 API Key
export OPENAI_API_KEY="sk-xxx"

# 生成 ClientAgent
agentforge create "一个能执行 Git 命令的本地编程助手"

# 启动守护进程（连接本地 Capability Hub）
agentforge run ./client-agents/my-agent --connect ws://localhost:8080

# 启动 Capability Hub（另一个终端）
agentforge dashboard
```

---

## CLI 命令详解

### `agentforge create`

从自然语言描述生成一个可本地运行的 ClientAgent 客户端应用。

```bash
agentforge create <description> [options]
```

| 参数 | 说明 | 默认值 |
|---|---|---|
| `<description>` | Agent 的自然语言描述（必填） | — |
| `-n, --name <name>` | ClientAgent 名称 | 从描述自动推导 |
| `-t, --template <template>` | 指定模板 ID | 自动匹配 |
| `-m, --model <model>` | 模型名称 | `gpt-4o` |
| `-o, --output <path>` | 输出目录 | `./client-agents/<name>` |

**示例：**

```bash
agentforge create "一个电商客服助手，帮助用户查询订单状态、处理退换货申请"
agentforge create "销售助手" -t sales-assistant -m claude-sonnet-4-6
```

**生成结果：**

```
./client-agents/my-agent/
├── src/
│   ├── main.ts       # 守护进程入口
│   ├── agent.ts      # ClientAgent 实现
│   ├── prompts.ts    # System Prompt
│   ├── tools.ts      # 预置工具定义
│   ├── types.ts      # 类型定义
│   └── runtime.ts    # AgentRuntimeClient 配置
├── package.json
├── tsconfig.json
├── README.md
└── .agentforge/
    ├── config.json   # Agent 元数据 + Hub 端点
    └── security.json # 本地命令执行授权
```

---

### `agentforge run`

启动 ClientAgent 本地守护进程，连接 Capability Hub。

```bash
agentforge run <client-agent-path> [options]
```

| 参数 | 说明 | 默认值 |
|---|---|---|
| `<client-agent-path>` | ClientAgent 目录路径（必填） | — |
| `--connect <dashboard-url>` | Capability Hub WebSocket 端点 | `ws://localhost:8080` |
| `--token <auth-token>` | 节点认证令牌 | — |
| `--node-name <name>` | 节点显示名称 | 自动生成 |
| `--heartbeat <ms>` | 心跳间隔 | `30000` |

**示例：**

```bash
agentforge run ./client-agents/my-agent \
  --connect wss://hub.example.com \
  --token $AGENTFORGE_NODE_TOKEN
```

---

### `agentforge dashboard`

启动 Capability Hub Web 面板。

```bash
agentforge dashboard [options]
```

| 参数 | 说明 | 默认值 |
|---|---|---|
| `--port <port>` | Hub 端口 | `8080` |
| `--host <host>` | 监听地址 | `localhost` |

---

### `agentforge serve`

启动 ClientAgent 本地调试 HTTP 服务（可选，非主要生产路径）。

```bash
agentforge serve [client-agent-path] [options]
```

| 参数 | 说明 | 默认值 |
|---|---|---|
| `[client-agent-path]` | ClientAgent 目录路径 | `./client-agents` |
| `--port <port>` | 服务端口 | `3001` |
| `--host <host>` | 监听地址 | `localhost` |

---

### `agentforge capability`

能力市场管理命令。

```bash
agentforge capability publish <capability-dir>    # 发布能力到 Hub
agentforge capability list                          # 列出 Hub 上的能力
agentforge capability install <capability-id>     # 安装能力到本地缓存
agentforge capability distribute <capability-id> --node <node-id>  # 下发到指定节点
```

---

### `agentforge batch`

从 YAML/JSON 配置文件批量生成多个 ClientAgent。

```bash
agentforge batch <config-file>
```

```yaml
# client-agents.yaml
agents:
  - name: dev-assistant
    description: "能执行 Git 命令和本地终端操作的编程助手"
    template: dev-assistant
    model: gpt-4o

  - name: code-reviewer
    description: "审查代码质量，检查潜在 Bug 和安全问题"
    template: code-reviewer
    model: claude-sonnet-4-6
```

---

## SDK 编程接口

### 编排 StatelessAgent

```typescript
import { AgentFramework } from '@agentforge/sdk';
import { GitAgent, ReviewerAgent } from './agents';

const framework = new AgentFramework();
framework.register('git', GitAgent);
framework.register('reviewer', ReviewerAgent);

const result = await framework.orchestrate({
  type: 'chat',
  input: { message: 'review 这段代码并生成 commit message' },
});
```

### 与 ClientAgent 通信

```typescript
const clientProxy = await framework.connectToClientAgent(
  'client-dev-machine-a1b2c3d',
  'wss://hub.example.com',
  process.env.HUB_ADMIN_TOKEN,
);

const result = await clientProxy.execute({
  type: 'chat',
  input: { message: '当前仓库状态如何？' },
});
```

`connectToClientAgent` 返回 `IClientAgentProxy`，类型定义见 [01-核心设计.md §1.15](../design/01-核心设计.md#115-远程ClientAgent代理接口)。

---

## 本地命令执行授权

ClientAgent 的本地命令执行默认禁用。授权配置存储在 `.agentforge/security.json`：

```json
{
  "localCommandAuth": {
    "level": "whitelist",
    "whitelist": ["git status", "git log", "ls"],
    "requireConfirmationFor": ["git push", "rm"]
  }
}
```

授权级别：

| 级别 | 说明 |
|---|---|
| `disabled` | 禁止执行任何命令 |
| `readonly` | 只允许只读命令 |
| `whitelist` | 只允许白名单内的命令 |
| `full` | 开放命令执行，敏感命令需二次确认 |

---

## 环境变量

| 变量 | 必填 | 说明 | 默认值 |
|---|---|---|---|
| `OPENAI_API_KEY` | 使用 OpenAI 时 | OpenAI API 密钥 | — |
| `ANTHROPIC_API_KEY` | 使用 Anthropic 时 | Anthropic API 密钥 | — |
| `AGENTFORGE_NODE_TOKEN` | ClientAgent 连接 Hub 时 | 节点认证令牌 | — |
| `AGENTFORGE_HUB_URL` | ClientAgent 连接 Hub 时 | Capability Hub 端点 | — |
| `AGENTFORGE_PORT` | serve 命令 | 调试服务端口 | `3001` |
| `LOG_LEVEL` | ❌ | `debug` / `info` / `warn` / `error` | `info` |
