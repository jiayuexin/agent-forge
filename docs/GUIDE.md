# AgentForge 使用文档

> 版本: 0.1.0 · 最后更新: 2026-06-12

## 快速开始

### 安装

```bash
# 全局安装 CLI
npm install -g @agentforge/cli

# 或通过 npx 直接使用（无需安装）
npx agentforge --help
```

### 环境要求

- Node.js ≥ 18.0.0
- pnpm ≥ 8.0.0（开发时需要）
- 至少一个 LLM Provider 的 API Key

### 30 秒创建你的第一个 Agent

```bash
# 设置 API Key
export OPENAI_API_KEY="sk-xxx"

# 从描述生成 Agent
agentforge create "一个电商客服助手，帮助用户查询订单状态、处理退换货申请"

# 启动 HTTP 服务
agentforge serve ./agents/agent-customer-service

# 在另一个终端测试
curl -X POST http://localhost:3001/api/execute \
  -H "Content-Type: application/json" \
  -d '{"type":"chat","input":{"message":"我的订单 ORD-001 到哪了？"}}'
```

---

## CLI 命令详解

### `agentforge create`

从自然语言描述生成一个完整的 Agent 项目。

```bash
agentforge create <description> [options]
```

| 参数 | 说明 | 默认值 |
|---|---|---|
| `<description>` | Agent 的自然语言描述（必填） | — |
| `-t, --template <template>` | 指定模板 ID | 自动匹配 |
| `-p, --provider <provider>` | LLM Provider | `openai` |
| `-m, --model <model>` | 模型名称 | `gpt-4o` |
| `-o, --output <path>` | 输出目录 | `./agents` |

**可用模板:**

| 模板 ID | 说明 | 预置工具 |
|---|---|---|
| `customer-service` | 客服助手 | query-order, create-refund, send-notification |
| `sales-assistant` | 销售助手 | recommend-product, calculate-price, create-order |
| `code-reviewer` | 代码审查 | read-file, run-tests, check-style |
| `content-writer` | 内容写作 | search-web, check-grammar, generate-outline |
| `data-analyst` | 数据分析 | db-query, chart-generate, export-report |
| `general` | 通用（回退） | 无预置工具 |

**示例:**

```bash
# 最简用法 — 自动匹配模板
agentforge create "帮助用户查询物流信息的助手"

# 指定模板和模型
agentforge create "销售助手" -t sales-assistant -p anthropic -m claude-sonnet-4-6

# 指定输出目录
agentforge create "代码审查机器人" -o ./my-agents/reviewer
```

**生成结果:**

```
./agents/agent-<role>/
├── src/
│   ├── index.ts       # Agent 入口
│   ├── prompts.ts     # System Prompt
│   ├── tools.ts       # 工具定义
│   ├── types.ts       # 类型定义
│   └── config.ts      # 默认配置
├── package.json
├── tsconfig.json
└── README.md
```

---

### `agentforge batch`

从 YAML/JSON 配置文件批量生成多个 Agent。

```bash
agentforge batch <config-file>
```

**配置文件格式（YAML）:**

```yaml
agents:
  - description: "电商客服助手"
    templateId: customer-service
    provider: openai
    model: gpt-4o

  - description: "销售推荐助手"
    templateId: sales-assistant
    outputDir: ./my-agents/sales

  - description: "数据分析助手"
    templateId: data-analyst
    provider: anthropic
    model: claude-sonnet-4-6
```

**配置文件格式（JSON）:**

```json
{
  "agents": [
    {
      "description": "电商客服助手",
      "templateId": "customer-service"
    }
  ]
}
```

**批量生成参数:**

| 字段 | 必填 | 说明 | 默认值 |
|---|---|---|---|
| `description` | ✅ | Agent 描述 | — |
| `name` | ❌ | Agent 名称 | 自动生成 |
| `templateId` | ❌ | 模板 ID | 自动匹配 |
| `outputDir` | ❌ | 输出目录 | `./agents/<name>` |
| `provider` | ❌ | LLM Provider | `openai` |
| `model` | ❌ | 模型名称 | `gpt-4o` |
| `tools` | ❌ | 工具名列表 | 模板预置工具 |

**并发控制:** 固定最大并发数 3，防止单位时间内过多 API 调用。

---

### `agentforge serve`

将 Agent 以 HTTP 服务模式启动，供非 Node.js 项目调用。

```bash
agentforge serve [agent-path] [options]
```

| 参数 | 说明 | 默认值 |
|---|---|---|
| `[agent-path]` | Agent 目录路径 | `./agents` |
| `-p, --port <port>` | 服务端口 | `3001` |
| `--host <host>` | 监听地址 | `localhost` |

**示例:**

```bash
# 启动单个 Agent
agentforge serve ./agents/agent-customer-service --port 3001

# 启动默认目录下所有 Agent
agentforge serve
```

---

### `agentforge run`

交互式运行 Agent（REPL 模式），适合调试和快速体验。

```bash
agentforge run <agent-path> [options]
```

| 参数 | 说明 | 默认值 |
|---|---|---|
| `<agent-path>` | Agent 目录路径（必填） | — |
| `-p, --provider <provider>` | LLM Provider | `openai` |
| `-m, --model <model>` | 模型名称 | `gpt-4o` |

**交互:**

```
$ agentforge run ./agents/agent-customer-service

you> 我的订单 ORD-001 到哪了？
agent> 您好！我来帮您查询订单 ORD-001 的状态。
     您的订单已发货，预计明天送达。物流公司：顺丰速运，运单号：SF1234567890。

you> exit
再见！
```

输入 `exit` 或按 `Ctrl+C` 退出。

---

### `agentforge list`

列出已生成的所有 Agent。

```bash
agentforge list [options]
```

| 参数 | 说明 | 默认值 |
|---|---|---|
| `-d, --dir <path>` | Agent 目录 | `./agents` |

**输出示例:**

```
NAME                     ROLE                 VERSION   TEMPLATE             STATUS
agent-customer-service   客服助手              1.0.0     customer-service     ready
agent-sales-assistant    销售推荐              1.0.0     sales-assistant      ready
```

---

### `agentforge dashboard`

启动 Web 管理面板。

```bash
agentforge dashboard [options]
```

| 参数 | 说明 | 默认值 |
|---|---|---|
| `-p, --port <port>` | 面板端口 | `8080` |

启动后访问 `http://localhost:8080`，包含 5 个页面:

| 页面 | 路径 | 功能 |
|---|---|---|
| 首页 | `/` | 统计概览、快速操作 |
| Agent 列表 | `/agents` | 查看、管理已生成的 Agent |
| 创建 Agent | `/create` | 可视化创建表单，实时预览 Prompt |
| 调试台 | `/playground` | 三栏调试：对话 + 调用链路 + 工具面板 |
| 监控 | `/monitor` | Agent 节点状态、实时指标图表 |

---

## HTTP API 参考

### Agent 自服务端点

Agent 通过 `agentforge serve` 启动后，暴露以下端点:

#### `POST /api/execute`

同步执行任务。

```bash
curl -X POST http://localhost:3001/api/execute \
  -H "Content-Type: application/json" \
  -d '{
    "type": "chat",
    "input": { "message": "你好" },
    "context": { "userId": "U123" }
  }'
```

**响应:**

```json
{
  "success": true,
  "output": {
    "content": "您好！有什么可以帮您的？",
    "structured": null,
    "artifacts": []
  },
  "meta": {
    "duration": 1520,
    "tokensUsed": { "input": 45, "output": 32, "total": 77 },
    "model": "gpt-4o",
    "toolsCalled": []
  }
}
```

#### `POST /api/stream`

流式执行（SSE）。

```bash
curl -N http://localhost:3001/api/stream \
  -H "Content-Type: application/json" \
  -d '{"type":"chat","input":{"message":"你好"}}'
```

**SSE 事件格式:**

```
event: chunk
data: {"type":"text","content":"您好","index":0}

event: chunk
data: {"type":"text","content":"！","index":1}

event: chunk
data: {"type":"done","finishReason":"stop","usage":{"input":45,"output":32,"total":77}}
```

#### `GET /api/status`

健康检查。

```json
{ "status": "ok", "uptime": 3600, "timestamp": 1718000000000, "agents": {} }
```

#### `GET /api/capabilities`

Agent 能力声明。

```json
{ "id": "agent-customer-service", "name": "客服助手", "role": "customer-service", "version": "1.0.0", "capabilities": [...] }
```

### Dashboard 后端端点

Dashboard 通过 `agentforge dashboard` 启动后，暴露以下端点:

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/agents` | 列出所有 Agent |
| POST | `/api/agents` | 注册 Agent |
| GET | `/api/agents/:id` | Agent 详情 |
| POST | `/api/agents/:id/init` | 初始化 Agent |
| POST | `/api/agents/:id/execute` | 执行任务 |
| POST | `/api/agents/:id/stream` | 流式执行 |
| DELETE | `/api/agents/:id` | 销毁 Agent |
| POST | `/api/debug/:id/chat` | 调试对话（SSE） |
| GET | `/api/debug/:id/trace/:sessionId` | 获取调用链路 |
| GET | `/api/debug/:id/tools` | 列出已加载工具 |
| POST | `/api/debug/:id/tools/inject` | 注入临时工具 |
| GET | `/api/nodes` | 列出注册的 Agent 节点 |
| POST | `/api/nodes/register` | 注册 Agent 节点 |
| POST | `/api/nodes/:name/heartbeat` | 心跳上报 |

### WebSocket 事件

连接 `ws://localhost:8080/ws/events` 接收实时事件:

```javascript
const ws = new WebSocket('ws://localhost:8080/ws/events');
ws.onmessage = (e) => {
  const payload = JSON.parse(e.data);
  console.log(payload.type, payload.data);
};
// 事件类型: agent:created, agent:destroyed, tool:injected, node:registered
```

---

## SDK 编程接口

在 Node.js 项目中通过 SDK 编排多个 Agent。

### 安装

```bash
npm install @agentforge/sdk
```

### 单 Agent 使用

```typescript
import { AgentFramework } from '@agentforge/sdk';
import { CustomerServiceAgent } from 'agent-customer-service';

const framework = new AgentFramework();

framework.register('service', CustomerServiceAgent);

await framework.init();

const result = await framework.run('service', {
  type: 'chat',
  input: { message: '我的订单 ORD-001 到哪了？' },
});

console.log(result.output.content);
await framework.destroy();
```

### Pipeline 流水线

```typescript
const result = await framework
  .pipeline('智能客服')
  .add('service', { task: '分析用户意图' })
  .add('sales', { task: '推荐升级方案' })
  .run();
```

### 条件分支

```typescript
const result = await framework
  .pipeline('智能路由')
  .add('service', { task: '判断用户意图' })
  .branch((prev) => {
    const { intent } = prev.output.structured;
    if (intent === 'refund') return { agent: 'sales', task: '处理退款' };
    if (intent === 'inquiry') return { agent: 'service', task: '解答问题' };
    return null; // 无匹配时跳过
  })
  .run();
```

### 并行执行

```typescript
const result = await framework
  .pipeline('每日报告')
  .parallel([
    { agent: 'data', task: '生成销售报表' },
    { agent: 'service', task: '客服统计' },
    { agent: 'sales', task: '转化漏斗分析' },
  ])
  .add('data', { task: '整合三份报告' })
  .run();
```

### Pipeline 回退

下游 Agent 发现问题时可回退到上游步骤:

```typescript
// 在 Agent 的 doExecute 中返回控制信号
const result: AgentResult = {
  success: false,
  output: {
    content: '合同存在严重问题',
    structured: {
      __control: {
        action: 'back',
        targetStep: 'draft',
        message: '以下条款不合规，请修改',
        reason: '合规检查未通过',
      },
    },
  },
  meta: { duration: 100, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
};
```

### Pipeline 分叉

```typescript
const result = await framework
  .pipeline('审批')
  .add('draft', { task: '起草合同' })
  .fork('draft', [
    { name: 'legal', agent: 'reviewer', task: '法务审查' },
    { name: 'finance', agent: 'reviewer', task: '财务审查' },
  ])
  .run();
```

### ModelRegistry 多端点路由

```typescript
const framework = new AgentFramework({
  modelRegistry: {
    endpoints: [
      {
        id: 'openai-official',
        baseUrl: 'https://api.openai.com/v1',
        provider: 'openai',
        apiKey: process.env.OPENAI_API_KEY,
        models: ['gpt-4o', 'gpt-4o-mini'],
      },
      {
        id: 'ollama-local',
        baseUrl: 'http://localhost:11434',
        provider: 'ollama',
        models: ['qwen2.5:14b'],
      },
    ],
    defaultEndpoint: 'openai-official',
    defaultModel: 'gpt-4o',
  },
});
```

路由规则:
1. Agent 指定了 `endpoint` → 直接使用该端点
2. Agent 只指定模型名 → 查找注册了该模型的第一个端点
3. 未指定 → 使用 `defaultModel` + `defaultEndpoint`
4. 找不到 → 抛出 `ModelNotFoundError`

### EventBus 事件总线

```typescript
framework.on('agent:execute:start', (data) => {
  console.log('Agent 开始执行:', data);
});

framework.once('pipeline:complete', (data) => {
  console.log('Pipeline 完成:', data);
});
```

---

## HTTP 模式集成（非 Node.js）

### Python

```python
import httpx

resp = httpx.post("http://localhost:3001/api/execute", json={
    "type": "chat",
    "input": {"message": "你好"},
    "context": {"userId": "U123"}
})
print(resp.json()["output"]["content"])
```

### Go

```go
import (
    "bytes"
    "net/http"
)

body := []byte(`{"type":"chat","input":{"message":"你好"}}`)
resp, _ := http.Post(
    "http://localhost:3001/api/execute",
    "application/json",
    bytes.NewBuffer(body),
)
// 解析 resp.Body
```

### cURL

```bash
# 同步执行
curl -X POST http://localhost:3001/api/execute \
  -H "Content-Type: application/json" \
  -d '{"type":"chat","input":{"message":"你好"}}'

# 流式执行
curl -N http://localhost:3001/api/stream \
  -H "Content-Type: application/json" \
  -d '{"type":"chat","input":{"message":"你好"}}'
```

---

## 环境变量

| 变量 | 必填 | 说明 | 默认值 |
|---|---|---|---|
| `OPENAI_API_KEY` | 使用 OpenAI 时 | OpenAI API 密钥 | — |
| `ANTHROPIC_API_KEY` | 使用 Anthropic 时 | Anthropic API 密钥 | — |
| `AGENTFORGE_PORT` | ❌ | serve 默认端口 | `3001` |
| `NODE_ENV` | ❌ | 运行环境 | `development` |
