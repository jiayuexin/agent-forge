# 5. CLI 命令与 API 设计

> **文档层级**: 第二层 · 设计规格
> **文档类型**: 设计规格
> **文档状态**: 已定稿
> **文档版本**: docs-v0.3
> **最后更新**: 2026-06-23
> **实现状态**: 未开始
>
> 框架的对外接口：CLI 命令行工具 + HTTP/WebSocket API。

> 命令行工具包名: @agentforge/cli。用户可通过 `npx agentforge` 或 `npx @agentforge/cli` 调用。

## 5.1 CLI 命令

```bash
# 创建单个 Agent
npx @agentforge/cli create <description> [options]
  --name [name]             # Agent 名称
  --output [path]           # 输出目录 (默认 ./agents/<name>)
  --template [template]     # 使用指定模板
  --model [model]           # 指定默认模型

# 批量创建
npx @agentforge/cli batch <config-file>
  # config-file 为 YAML/JSON，格式见下方

# 启动 Agent 客户端运行时（连接到云端 Dashboard）
npx @agentforge/cli run <agent-path> [options]
  --connect [dashboard-url] # Dashboard 地址（如 wss://dashboard.example.com）
  --token [auth-token]      # 认证令牌
  --node-name [name]        # 节点显示名称
  --heartbeat [ms]          # 心跳间隔（默认 30000）

# 启动本地 HTTP 服务（可选，用于本地调试）
npx @agentforge/cli serve [agent-path] [options]
  --port [port]             # 端口 (默认 3001)
  --host [host]             # 主机 (默认 localhost)

# 启动 Web 管理面板（云端控制中心）
npx @agentforge/cli dashboard [options]
  --port [port]             # 端口 (默认 8080)

# 列出已安装的 Agent
npx @agentforge/cli list
```

## 5.2 批量配置文件格式

```yaml
# agents.yaml — 批量生成配置
agents:
  - name: customer-service
    description: "处理用户咨询、投诉和售后问题的客服Agent"
    model: gpt-4o
    tools:
      - query-order
      - create-refund
      - send-notification

  - name: sales-assistant
    description: "为潜在客户推荐产品方案，生成报价单的销售Agent"
    model: gpt-4o
    tools:
      - search-product
      - generate-quote

  - name: code-reviewer
    description: "审查代码质量，检查潜在Bug和安全问题的测试Agent"
    model: claude-3.5-sonnet
    tools:
      - read-file
      - run-linter

  - name: content-writer
    description: "撰写营销文案、社交媒体帖子和邮件的内容创作Agent"
    model: gpt-4o

  - name: data-analyst
    description: "分析数据报表，生成可视化建议的数据分析Agent"
    model: gpt-4o
    tools:
      - query-database
      - generate-chart
```

## 5.3 HTTP API 接口

### Dashboard 控制中心 API（端口默认 8080）

```
基础路径: http://localhost:8080/api

节点管理
───────────────────────────────────────────
GET    /nodes                     # 列出所有已注册客户端节点
GET    /nodes/:id                 # 获取节点详情
POST   /nodes/:id/execute         # 向指定节点下发执行任务
POST   /nodes/:id/stream          # 向指定节点下发流式任务
POST   /nodes/:id/config          # 更新节点运行时配置
DELETE /nodes/:id                 # 注销节点

Agent 模板管理
───────────────────────────────────────────
GET    /agents                    # 列出所有 Agent 模板/生成记录
GET    /agents/:id                # 获取 Agent 详情
POST   /agents                    # 创建 Agent
POST   /agents/:id/generate       # 生成/重新生成 Agent 代码

健康检查
───────────────────────────────────────────
GET    /api/health                # Dashboard 服务探活
GET    /api/metrics               # Prometheus 指标
```

### Agent Node 注册 API（客户端调用）

```
基础路径: http://localhost:8080/api

POST   /nodes/register            # 客户端注册为节点
POST   /nodes/:id/heartbeat       # 心跳上报
POST   /nodes/:id/status          # 状态上报
POST   /nodes/:id/metrics         # 指标上报
```

### 5.3.1 健康检查端点说明

| 场景 | 端点 | 用途 | 典型响应 |
|---|---|---|---|
| 单 Agent HTTP 服务 | `GET /api/status` | 详细状态（版本、uptime、Provider 就绪） | `{ "status": "ready" \| "degraded" \| "unhealthy", ... }` |
| 单 Agent HTTP 服务 | `GET /api/health` | 轻量探活（Docker/K8s liveness） | `{ "status": "ok" }` |
| Dashboard 后端 | `GET /api/health` | 面板服务探活 | `{ "status": "ok", "timestamp": ... }` |
| 多 Agent 网关（§5.3） | `GET /api/health` | 网关服务探活 | `{ "status": "ok" }` |

**请求示例：**

```bash
curl -X POST http://localhost:3001/api/agents/customer-service/execute \
  -H "Content-Type: application/json" \
  -d '{
    "type": "chat",
    "input": {
      "message": "我的订单还没发货，订单号 ORD-001"
    },
    "context": {
      "userId": "U123",
      "conversationId": "CONV-456"
    }
  }'
```

**响应示例：**

```json
{
  "success": true,
  "output": {
    "content": "您好，已为您查询到订单 ORD-001，当前状态为已打包待发货，预计明天上午发出。",
    "structured": {
      "orderId": "ORD-001",
      "status": "packed",
      "estimatedDelivery": "2026-03-29"
    }
  },
  "meta": {
    "duration": 1850,
    "tokensUsed": { "input": 156, "output": 89, "total": 245 },
    "model": "gpt-4o",
    "toolsCalled": [
      { "name": "query-order", "duration": 320, "success": true }
    ]
  }
}
```

## 5.4 WebSocket 控制协议

Dashboard 与客户端 Agent Node 之间通过 WebSocket 保持长连接。

### 连接地址

```
ws://localhost:8080/ws/nodes/:nodeId

wss://dashboard.example.com/ws/nodes/:nodeId  # 生产环境
```

### Dashboard → Agent Node（控制消息）

```typescript
interface ControlMessage {
  type: 'execute' | 'stream' | 'config-update' | 'ping' | 'stop';
  messageId: string;
  nodeId: string;
  timestamp: number;
  payload?: RemoteTask | Partial<AgentRuntimeConfig>;
}
```

### Agent Node → Dashboard（上报消息）

```typescript
interface AgentMessage {
  type: 'result' | 'stream-chunk' | 'status' | 'metric' | 'event' | 'pong' | 'error';
  messageId?: string;  // 对应 ControlMessage.messageId
  nodeId: string;
  timestamp: number;
  payload?: AgentResult | AgentStreamChunk | AgentNodeStatus | AgentMetrics;
}
```

### 消息时序示例

```
Dashboard          Agent Node
   │                    │
   │── execute ────────→│
   │                    │── agent.execute(task)
   │←─ stream-chunk ────│
   │←─ stream-chunk ────│
   │←─ result ──────────│
   │                    │
   │── ping ───────────→│
   │←─ pong ────────────│
```

## 5.5 安全与认证

### 客户端认证

Agent Runtime Client 连接 Dashboard 时必须携带认证令牌：

```bash
npx @agentforge/cli run ./agents/agent-customer-service \
  --connect wss://dashboard.example.com \
  --token ${AGENTFORGE_NODE_TOKEN}
```

### 控制命令授权

Dashboard 收到控制命令后，校验：
- token 是否有效
- token 是否有权操作目标 nodeId
- 目标操作是否属于该节点声明的 capabilities

### 本地确认

敏感操作（如退款、合同签署）默认需要客户端本地用户确认：

```typescript
// AgentRuntimeClient 收到 execute 消息后
if (isSensitiveTask(message.payload)) {
  const confirmed = await askLocalUserConfirmation(message.payload);
  if (!confirmed) {
    this.send({ type: 'error', messageId, nodeId, payload: { code: 'USER_REJECTED' } });
    return;
  }
}
```

### 命令白名单

WebSocket 控制消息类型限定为 `execute`、`stream`、`config-update`、`ping`、`stop`。禁止远程加载代码、安装依赖或执行 shell 命令。
