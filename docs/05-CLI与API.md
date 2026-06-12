# 5. CLI 命令与 API 设计

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

# 启动 HTTP 服务
npx @agentforge/cli serve [agent-path] [options]
  --port [port]             # 端口 (默认 3001)
  --host [host]             # 主机 (默认 localhost)

# 启动 Web 管理面板
npx @agentforge/cli dashboard [options]
  --port [port]             # 端口 (默认 8080)

# 列出已安装的 Agent
npx @agentforge/cli list

# 运行单个 Agent 任务（快速测试）
npx @agentforge/cli run <agent-path> --input <json>
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

```
基础路径: http://localhost:3001/api

Agent 管理
───────────────────────────────────────────
GET    /agents                    # 列出所有 Agent
GET    /agents/:id                # 获取 Agent 详情
POST   /agents/:id/init           # 初始化 Agent
DELETE /agents/:id                # 销毁 Agent

任务执行
───────────────────────────────────────────
POST   /agents/:id/execute        # 执行任务（同步）
POST   /agents/:id/stream         # 执行任务（流式 SSE）

健康检查
───────────────────────────────────────────
GET    /health                    # 服务健康状态
GET    /agents/:id/status         # Agent 状态
```

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

## 5.4 WebSocket 接口

```
连接: ws://localhost:3001/ws

发送消息格式:
{
  "type": "execute" | "subscribe",
  "agentId": "customer-service",
  "payload": { ... }
}

接收消息格式:
{
  "type": "chunk" | "result" | "event" | "error",
  "agentId": "customer-service",
  "data": { ... }
}
```

## 5.5 Agent 监控接口（分离部署时）

> 参见 [06-可视化面板.md](06-可视化面板.md) 第 7 节。

Agent 独立部署时，除了业务 API 外还需暴露以下监控接口：

| 端点 | 方法 | 说明 |
|---|---|---|
| `/api/status` | GET | 当前状态、版本、运行时长 |
| `/api/metrics` | GET | 调用统计、Token 消耗、错误率 |
| `/api/health` | GET | 轻量健康检查（用于心跳验证） |
| `/api/capabilities` | GET | 能力声明、工具列表 |
| `/api/config` | GET | 当前配置（API Key 等敏感字段脱敏） |
| `/ws` | WebSocket | 推送实时执行事件 |
