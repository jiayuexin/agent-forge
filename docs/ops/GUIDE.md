# AgentForge 使用文档

> ⚠️ **目标行为文档**：本文描述预期用法，当前项目处于设计阶段，命令与 API 尚未实现。权威规格见 [05-CLI与API.md](../design/05-CLI与API.md)。
>
> **文档层级**: 第三层 · 操作手册
> **文档类型**: 使用指南
> **文档状态**: 已定稿
> **文档版本**: docs-v0.4
> **最后更新**: 2026-06-24
> **实现状态**: 已完成

## 目录

- [快速开始](#快速开始)
- [CLI 命令详解](#cli-命令详解)
  - [`agentforge create`](#agentforge-create)
  - [`agentforge run`](#agentforge-run)
  - [`agentforge dashboard`](#agentforge-dashboard)
  - [`agentforge serve`](#agentforge-serve)
  - [`agentforge capability`](#agentforge-capability)
  - [`agentforge batch`](#agentforge-batch)
  - [`agentforge list`](#agentforge-list)
- [SDK 编程接口](#sdk-编程接口)
- [本地命令执行授权](#本地命令执行授权)
- [环境变量](#环境变量)
- [常见错误排查](#常见错误排查)

---

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
| `-n, --name [name]` | ClientAgent 名称 | 从描述自动推导 |
| `-t, --template [template]` | 指定模板 ID | 自动匹配 |
| `-m, --model [model]` | 模型名称 | `gpt-4o` |
| `-o, --output [path]` | 输出目录 | `./client-agents/<name>` |
| `--run` | 生成后直接启动守护进程 | `false` |
| `--confirm-high-risk` | 跳过高风险模板确认提示 | `false` |

**示例：**

```bash
agentforge create "一个电商客服助手，帮助用户查询订单状态、处理退换货申请"
agentforge create "销售助手" -t sales-assistant -m claude-sonnet-4-6
agentforge create "本地编程助手" --run --connect ws://localhost:8080
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
| `--connect [hub-url]` | Capability Hub WebSocket 端点 | `ws://localhost:8080` |
| `--token [auth-token]` | 节点认证令牌 | — |
| `--node-name [name]` | 节点显示名称 | 自动生成 |
| `--heartbeat [ms]` | 心跳间隔 | `30000` |

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
| `--port [port]` | Hub 端口 | `8080` |
| `--host [host]` | 监听地址 | `localhost` |

---

### `agentforge serve`

启动 ClientAgent 本地调试 HTTP 服务（可选，非主要生产路径）。

```bash
agentforge serve [client-agent-path] [options]
```

| 参数 | 说明 | 默认值 |
|---|---|---|
| `[client-agent-path]` | ClientAgent 目录路径 | `./client-agents` |
| `--port [port]` | 服务端口 | `3001` |
| `--host [host]` | 监听地址 | `localhost` |

---

### `agentforge capability`

能力市场管理命令。

```bash
agentforge capability publish <capability-dir>    # 发布能力到 Hub
agentforge capability list                          # 列出 Hub 上的能力
agentforge capability install <capability-id>     # 安装能力到本地缓存
agentforge capability distribute <capability-id> --node [node-id]  # 下发到指定节点
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
    templateId: dev-assistant
    model: gpt-4o

  - name: code-reviewer
    description: "审查代码质量，检查潜在 Bug 和安全问题"
    templateId: code-reviewer
    model: claude-sonnet-4-6
```

---

### `agentforge list`

列出当前工作目录下已生成的 ClientAgent。

```bash
agentforge list [options]
```

| 参数 | 说明 | 默认值 |
|---|---|---|
| `--output [format]` | 输出格式：`table` / `json` / `yaml` | `table` |
| `--path [dir]` | 扫描目录 | `./client-agents` |

**示例：**

```bash
agentforge list
agentforge list --output json
agentforge list --path ./my-agents
```

输出示例：

```
NAME              ROLE           VERSION   STATUS
my-agent          客服专员        1.0.0     generated
sales-assistant   销售助手        1.0.0     generated
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

### 使用固定 Pipeline

```typescript
const result = await framework
  .pipeline('review-and-commit')
  .config({ defaultModel: 'gpt-4o' })
  .add('review', { task: 'review 代码', agent: 'reviewer' })
  .add('commit', { task: '生成 commit message', agent: 'git' })
  .run();
```

### 与 ClientAgent 通信

```typescript
const clientProxy = await framework.connectToClientAgent(
  'client-dev-machine-a1b2c3d',
  {
    hubUrl: 'wss://hub.example.com',
    token: process.env.HUB_ADMIN_TOKEN,
  },
);

const result = await clientProxy.execute({
  type: 'chat',
  input: { message: '当前仓库状态如何？' },
});
```

`connectToClientAgent` 返回 `IClientAgentProxy`，类型定义见 [01-核心设计.md §1.3](../design/01-核心设计.md#13-远程-clientagent-代理接口)。

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

| 变量 | 必填 | 作用域 | 说明 | 默认值 |
|---|---|---|---|---|
| `OPENAI_API_KEY` | 使用 OpenAI 时 | Provider | OpenAI API 密钥 | — |
| `ANTHROPIC_API_KEY` | 使用 Anthropic 时 | Provider | Anthropic API 密钥 | — |
| `OLLAMA_BASE_URL` | 使用 Ollama 时 | Provider | Ollama 服务地址 | `http://localhost:11434` |
| `AGENTFORGE_NODE_TOKEN` | ClientAgent 连接 Hub 时 | runtime-client | 节点认证令牌 | — |
| `AGENTFORGE_HUB_URL` | ClientAgent 连接 Hub 时 | runtime-client | Capability Hub 端点 | — |
| `AGENTFORGE_PORT` | `serve` / `dashboard` | CLI / http-server | 服务端口 | `3001`（serve）/ `8080`（dashboard） |
| `AGENTFORGE_NODE_TOKEN_SECRET` | Capability Hub 签发节点 Token 时 | dashboard | 用于签名/校验节点 Token 的密钥 | — |
| `LOG_LEVEL` | ❌ | 全局 | `debug` / `info` / `warn` / `error` | `info` |
| `MONTHLY_COST_LIMIT` | ❌ | Framework | 月度成本守护阈值（USD） | — |

---

## 常见错误排查

### 1. ClientAgent 无法连接到 Capability Hub

**现象：** `agentforge run` 后日志显示 `WebSocket connection failed`。

**排查：**
- 检查 Hub 是否已启动：`agentforge dashboard`
- 检查 `--connect` 地址是否正确（默认 `ws://localhost:8080`）
- 检查防火墙/网络是否允许 WebSocket 连接
- 检查 `AGENTFORGE_HUB_URL` 环境变量是否覆盖默认值

### 2. 节点 Token 无效

**现象：** 连接成功后立即断开，日志显示 `Authentication failed`。

**排查：**
- 确认 `--token` 或 `AGENTFORGE_NODE_TOKEN` 与 Hub 配置的 Token 一致
- 确认 Token 未过期
- 确认 Token 只能用于当前 `nodeId`，不能复用到其他节点

### 3. 本地命令被拒绝

**现象：** Agent 返回 `Local command execution is disabled`。

**排查：**
- 检查 `.agentforge/security.json` 中 `localCommandAuth.level` 是否为 `disabled`
- 将级别调整为 `readonly` / `whitelist` / `full`
- 敏感命令需确认 `requireConfirmationFor` 标签

### 4. 模板生成失败

**现象：** `agentforge create` 报错或生成的项目无法编译。

**排查：**
- 检查 API Key 是否设置：`echo $OPENAI_API_KEY`
- 检查描述是否过短（要求 ≥ 10 字）
- 检查输出目录是否已存在同名 Agent
- 进入生成目录运行 `npm install && npm run build` 查看具体编译错误

### 5. 端口占用

**现象：** `agentforge serve` 或 `agentforge dashboard` 报错 `EADDRINUSE`。

**排查：**
- 查找占用进程：`lsof -i :3001` 或 `lsof -i :8080`
- 使用 `--port` 指定其他端口

### 6. Provider 调用失败

**现象：** Agent 执行时返回 `Provider error`。

**排查：**
- 检查对应 Provider 的 API Key 环境变量
- 检查网络是否能访问 Provider 端点
- 检查 `baseUrl` 配置（代理、Ollama 地址等）
- 查看 `LOG_LEVEL=debug` 下的详细错误信息
