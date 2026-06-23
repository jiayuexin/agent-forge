# 5. CLI 命令与 API 设计

> **文档层级**: 第二层 · 设计规格
> **文档类型**: 设计规格
> **文档状态**: 已定稿
> **文档版本**: docs-v0.4
> **最后更新**: 2026-06-23
> **实现状态**: 未开始
>
> AgentForge 的对外接口：CLI 命令行工具 + Capability Hub HTTP/WebSocket API。

> 命令行工具包名: `@agentforge/cli`。用户可通过 `npx agentforge` 或 `npx @agentforge/cli` 调用。

---

## 5.1 CLI 命令

### `agentforge create`

从岗位描述生成一个可本地运行的 ClientAgent 客户端应用。

```bash
agentforge create <description> [options]
  --name [name]             # ClientAgent 名称
  --output [path]           # 输出目录 (默认 ./client-agents/<name>)
  --template [template]     # 使用指定模板
  --model [model]           # 指定默认模型
```

**示例：**

```bash
agentforge create "一个能执行 Git 命令的本地编程助手"
agentforge create "客服助手" --name customer-service --template customer-service
```

### `agentforge run`

启动 ClientAgent 本地守护进程，连接 Capability Hub。

```bash
agentforge run <client-agent-path> [options]
  --connect [hub-url]       # Capability Hub WebSocket 端点
  --token [auth-token]      # 节点认证令牌
  --node-name [name]        # 节点显示名称
  --heartbeat [ms]          # 心跳间隔（默认 30000）
```

**示例：**

```bash
agentforge run ./client-agents/my-agent \
  --connect wss://hub.example.com \
  --token $AGENTFORGE_NODE_TOKEN
```

### `agentforge dashboard`

启动 Capability Hub Web 面板。

```bash
agentforge dashboard [options]
  --port [port]             # 端口 (默认 8080)
  --host [host]             # 主机 (默认 localhost)
```

### `agentforge serve`

启动 ClientAgent 本地调试 HTTP 服务（可选，非主要生产路径）。

```bash
agentforge serve [client-agent-path] [options]
  --port [port]             # 端口 (默认 3001)
  --host [host]             # 主机 (默认 localhost)
```

### `agentforge capability`

能力市场管理命令（面向 Capability Hub 管理员/发布者）。

```bash
agentforge capability publish <capability-dir>    # 发布能力到 Hub
agentforge capability list                          # 列出 Hub 上的能力
agentforge capability install <capability-id>      # 安装能力到本地缓存
agentforge capability distribute <capability-id> --node [node-id]  # 下发到指定节点
```

### `agentforge batch`

从 YAML/JSON 配置文件批量生成多个 ClientAgent。

```bash
agentforge batch <config-file>
```

---

## 5.2 批量配置文件格式

```yaml
# client-agents.yaml — 批量生成配置
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

## 5.3 Capability Hub HTTP API

### 基础路径

```
http://localhost:8080/api
```

### 节点管理

```
GET    /nodes                     # 列出所有已注册 ClientAgent 节点
GET    /nodes/:id                 # 获取节点详情
POST   /nodes/:id/execute         # 向指定节点下发执行任务
POST   /nodes/:id/stream          # 向指定节点下发流式任务
POST   /nodes/:id/config          # 更新节点运行时配置
DELETE /nodes/:id                 # 注销节点
```

### 能力管理

```
GET    /capabilities              # 列出所有能力
POST   /capabilities              # 创建/发布能力
GET    /capabilities/:id          # 获取能力详情
PUT    /capabilities/:id          # 更新能力
DELETE /capabilities/:id          # 删除能力
GET    /capabilities/:id/versions # 获取能力版本历史
POST   /capabilities/:id/distribute # 下发能力到指定节点
```

### ClientAgent 模板管理

```
GET    /client-agent-templates    # 列出所有生成模板
GET    /client-agent-templates/:id # 获取模板详情
```

### 健康检查

```
GET    /health                    # Capability Hub 服务探活
GET    /metrics                   # Prometheus 指标
```

### 5.3.1 能力下发请求示例

```bash
curl -X POST http://localhost:8080/api/capabilities/tool-git-status/distribute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "nodeIds": ["client-dev-machine-01"],
    "action": "add"
  }'
```

### 5.3.2 向节点下发任务请求示例

```bash
curl -X POST http://localhost:8080/api/nodes/client-dev-machine-01/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "type": "chat",
    "input": { "message": "当前仓库状态如何？" },
    "context": { "userId": "U123" }
  }'
```

---

## 5.4 ClientAgent 调试 HTTP API

`agentforge serve` 启动本地调试服务时暴露：

```
POST /api/execute      # 同步执行任务
POST /api/stream       # 流式执行任务（SSE）
GET  /api/status       # 详细状态
GET  /api/health       # 轻量探活
GET  /api/capabilities # 查看本地能力声明
```

> 这些端点仅用于本地开发和调试，不暴露到公网。

---

## 5.5 WebSocket 控制协议

Capability Hub 与 ClientAgent 之间通过 WebSocket 保持长连接。

### 连接地址

```
ws://localhost:8080/ws/nodes/:nodeId
wss://hub.example.com/ws/nodes/:nodeId  # 生产环境
```

连接时需携带认证令牌：

```
ws://localhost:8080/ws/nodes/node-001?token=AUTH_TOKEN
```

### Capability Hub → ClientAgent（控制消息）

```typescript
interface ControlMessage {
  type: 'execute' | 'stream' | 'config-update' | 'capability-distribute' | 'ping' | 'stop';
  messageId: string;
  nodeId: string;
  timestamp: number;
  payload?: RemoteTask | Partial<AgentRuntimeConfig> | CapabilityDistributePayload | Record<string, unknown>;
}

interface CapabilityDistributePayload {
  action: 'add' | 'update' | 'remove';
  capability: Capability;
  downloadUrl?: string;
  signature?: string;
}
```

### ClientAgent → Capability Hub（上报消息）

```typescript
interface AgentMessage {
  type: 'result' | 'stream-chunk' | 'status' | 'metric' | 'event' | 'capability-ack' | 'local-approval-request' | 'pong' | 'error';
  messageId?: string;
  nodeId: string;
  timestamp: number;
  payload?: AgentResult | AgentStreamChunk | AgentNodeStatus | AgentMetrics | CapabilityAckPayload | LocalApprovalRequest | Record<string, unknown>;
}

interface CapabilityAckPayload {
  messageId: string;
  capabilityId: string;
  status: 'downloaded' | 'installed' | 'failed';
  error?: string;
}

interface LocalApprovalRequest {
  requestId: string;
  type: 'sensitive-operation' | 'local-command' | 'capability-install';
  description: string;
  summary: Record<string, unknown>;
}
```

### 消息时序示例

```
Capability Hub        ClientAgent
      │                    │
      │── capability- ────→│
      │   distribute       │── 校验签名
      │                    │── 安装能力
      │←─ capability-ack ──│
      │                    │
      │── execute ────────→│
      │                    │── agent.execute(task)
      │←─ stream-chunk ────│
      │←─ result ──────────│
      │                    │
      │── ping ───────────→│
      │←─ pong ────────────│
```

---

## 5.6 安全与认证

### 客户端认证

ClientAgent 连接 Capability Hub 时必须携带认证令牌。

### 控制命令授权

Capability Hub 收到控制命令后，校验：

- token 是否有效
- token 是否有权操作目标 nodeId
- 目标操作是否属于该节点声明的 capabilities
- 敏感操作是否已获本地确认

### 本地确认

敏感操作（如本地命令执行、涉及 `sensitiveOperations` 的任务、Plugin 安装）默认需要客户端本地用户确认：

```typescript
if (isSensitiveTask(message.payload)) {
  const confirmed = await askLocalUserConfirmation(message.payload);
  if (!confirmed) {
    this.send({ type: 'error', messageId, nodeId, payload: { code: 'USER_REJECTED' } });
    return;
  }
}
```

### 命令白名单

WebSocket 控制消息类型限定为 `execute`、`stream`、`config-update`、`capability-distribute`、`ping`、`stop`。禁止远程加载代码、安装依赖或执行 shell 命令。
