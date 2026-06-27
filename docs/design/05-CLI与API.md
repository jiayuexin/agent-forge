# 5. CLI 命令与 API 设计

> **文档层级**: 第二层 · 设计规格
> **文档类型**: 设计规格
> **文档状态**: 已定稿
> **文档版本**: docs-v0.4
> **最后更新**: 2026-06-23
> **实现状态**: 已完成
>
> AgentForge 的对外接口：CLI 命令行工具 + Capability Hub HTTP/WebSocket API。

> 命令行工具包名: `@agentforge/cli`。用户可通过 `npx agentforge` 或 `npx @agentforge/cli` 调用。

---

## 5.1 CLI 命令

### `agentforge create`

从岗位描述生成一个可本地运行的 ClientAgent 客户端应用。

```bash
agentforge create <description> [options]
  -n, --name [name]         # ClientAgent 名称
  -o, --output [path]       # 输出目录 (默认 ./client-agents/<name>)
  -t, --template [template] # 使用指定模板
  -m, --model [model]       # 指定默认模型
  --run                     # 生成并通过安全确认后直接启动 ClientAgent
  --confirm-high-risk       # 使用 high 风险等级模板时的额外确认
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
  --connect [hub-url]       # Capability Hub WebSocket 端点（默认 ws://localhost:8080）
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

agentforge dashboard token create [options]   # 为指定节点创建认证令牌
  --node-name [name]        # 节点名称（生成 nodeId 与令牌）
  --expires-in [hours]      # 令牌有效期，默认 720（30 天）

agentforge dashboard token revoke <token-id>  # 吊销节点认证令牌
```

**对应 API：**

- `POST /api/admin/tokens` — 创建节点 Token，返回 `{ token, nodeId, expiresAt }`
- `DELETE /api/admin/tokens/:tokenId` — 吊销 Token

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

### `agentforge list`

列出已生成的 ClientAgent（默认扫描 `./client-agents/` 目录）。

```bash
agentforge list [options]
  --path [dir]              # 指定扫描目录 (默认 ./client-agents)
  --output [format]         # 输出格式：table / json / yaml (默认 table)
```

**示例：**

```bash
agentforge list
agentforge list --path ./my-agents --output json
```

---

## 5.2 批量配置文件格式

```yaml
# client-agents.yaml — 批量生成配置
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

## 5.3 Capability Hub HTTP API

### 基础路径

```
http://localhost:8080/api
```

### 节点管理

```
GET    /api/nodes                     # 列出所有已注册 ClientAgent 节点
GET    /api/nodes/:id                 # 获取节点详情
POST   /api/nodes/:id/execute         # 向指定节点下发执行任务
POST   /api/nodes/:id/stream          # 向指定节点下发流式任务
POST   /api/nodes/:id/config          # 更新节点运行时配置
DELETE /api/nodes/:id                 # 注销节点

### 配置与敏感信息

```
GET /api/config                      # 返回运行时配置，自动脱敏 apiKey 等敏感字段
```

### 能力管理

```
GET    /api/capabilities              # 列出所有能力
POST   /api/capabilities              # 创建/发布能力
GET    /api/capabilities/:id          # 获取能力详情
PUT    /api/capabilities/:id          # 更新能力
DELETE /api/capabilities/:id          # 删除能力
GET    /api/capabilities/:id/versions # 获取能力版本历史
POST   /api/capabilities/:id/distribute # 下发能力到指定节点
```

### ClientAgent 模板管理

```
GET    /api/client-agent-templates    # 列出所有生成模板
GET    /api/client-agent-templates/:id # 获取模板详情
```

### 5.3.1 健康检查

```
GET    /api/health                    # Capability Hub 服务探活
GET    /api/metrics                   # Prometheus 指标
```

### 5.3.2 能力下发请求示例

```bash
curl -X POST http://localhost:8080/api/capabilities/tool-git-status/distribute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "nodeIds": ["client-dev-machine-a1b2c3d"],
    "action": "add"
  }'
```

### 5.3.3 向节点下发任务请求示例

```bash
curl -X POST http://localhost:8080/api/nodes/client-dev-machine-a1b2c3d/execute \
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
GET  /api/metrics      # Prometheus 格式指标
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
ws://localhost:8080/ws/nodes/client-dev-assistant-a1b2c3d?token=AUTH_TOKEN
```

### Capability Hub → ClientAgent（控制消息）

`ControlMessage`、`CapabilityDistributePayload` 类型定义见 [01-核心设计.md §1.15](./01-核心设计.md#115-远程控制与客户端运行时类型)。

### ClientAgent → Capability Hub（上报消息）

`AgentMessage`、`CapabilityAckPayload`、`LocalApprovalRequest` 类型定义见 [01-核心设计.md §1.15](./01-核心设计.md#115-远程控制与客户端运行时类型)。

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

敏感操作（如本地命令执行、涉及 `sensitiveOperations` 的任务、Plugin 安装）默认需要客户端本地用户确认。本地确认辅助函数签名见 [10-安全模型.md §10.4](./10-安全模型.md#104-敏感操作本地确认)。

```typescript
if (message.type === 'execute' && message.payload && 'task' in message.payload) {
  const task = (message.payload as RemoteTask).task;
  if (isSensitiveTask(task)) {
    // 1. 先弹窗/命令行询问本地用户
    const localConfirmed = await askLocalUserConfirmation(task);
    if (!localConfirmed) {
      this.send({ type: 'error', messageId: message.messageId, nodeId: this.node.id, timestamp: Date.now(), payload: { code: 'USER_REJECTED', message: '用户拒绝执行' } });
      return;
    }

    // 2. 向 Capability Hub 上报 local-approval-request，等待 Hub 侧最终确认
    const request: LocalApprovalRequest = {
      requestId: generateId(),
      type: 'sensitive-operation',
      description: '该任务涉及敏感操作，是否继续？',
      summary: { task },
    };
    this.send({ type: 'local-approval-request', nodeId: this.node.id, timestamp: Date.now(), payload: request });

    const hubConfirmed = await waitForLocalApproval(request.requestId, { timeout: 60000 });
    if (!hubConfirmed) {
      this.send({ type: 'error', messageId: message.messageId, nodeId: this.node.id, timestamp: Date.now(), payload: { code: 'USER_REJECTED', message: 'Hub 拒绝执行' } });
      return;
    }
  }
}
```

### 命令白名单

WebSocket 控制消息类型限定为 `execute`、`stream`、`config-update`、`capability-distribute`、`ping`、`stop`。禁止远程加载代码、安装依赖或执行 shell 命令。
