# 2. 单个 Agent 功能详解

> **文档层级**: 第二层 · 设计规格
> **文档类型**: 设计规格
> **文档状态**: 已定稿
> **文档版本**: docs-v0.3
> **最后更新**: 2026-06-18
> **实现状态**: 未开始
>
> 每个通过 AgentForge 生成的 Agent 都是一个独立、完整、可运行的程序单元，具备以下十大能力。

## 2.1 核心生命周期

| 功能 | 说明 | 示例 |
|---|---|---|
| `init()` | 初始化 Agent，加载配置、连接模型、注册工具 | `await agent.init({ model: {...} })` |
| `execute()` | 执行任务，返回结构化结果 | `await agent.execute({ type: 'chat', input: { message: '...' } })` |
| `stream()` | 流式执行，逐块返回（适合聊天场景） | `for await (const chunk of agent.stream(task)) { ... }` |
| `destroy()` | 销毁 Agent，释放所有资源 | `await agent.destroy()` |

> 这四个方法是 `IAgent` 接口的强制要求，每个生成的 Agent 都必须实现。

## 2.2 智能对话

| 功能 | 说明 |
|---|---|
| 多轮对话 | 自动维护对话上下文，支持连续交互 |
| 流式输出 | 逐字/逐块输出，类似 ChatGPT 打字效果 |
| 上下文注入 | 携带用户ID、会话ID、历史消息等上下文 |

```typescript
const result1 = await agent.execute({
  type: 'chat',
  input: { message: '我的订单还没发货' },
  context: { conversationId: 'conv-001', userId: 'U123' }
});

const result2 = await agent.execute({
  type: 'chat',
  input: { message: '订单号是 ORD-001' },
  context: { conversationId: 'conv-001', userId: 'U123' }
});
```

## 2.3 工具调用（Function Calling）

Agent 可以调用实际的外部工具来完成操作。

| 功能 | 说明 |
|---|---|
| 自动工具选择 | Agent 根据用户意图自动决定调用哪个工具 |
| 参数提取 | 从自然语言中自动提取工具参数 |
| 多工具串联 | 一次任务中可以调用多个工具 |
| 工具结果反馈 | 工具执行结果自动回传给 Agent，生成最终回复 |

```typescript
// 用户说："帮我查一下订单 ORD-001 的状态"
// Agent 自动：
// 1. 识别意图 → 查询订单
// 2. 调用 query-order 工具 → 拿到结果
// 3. 生成自然语言回复 → "您的订单已发货，预计明天送达"
```

**每个岗位的 Agent 会预置不同的工具集：**

| Agent 类型 | 预置工具 |
|---|---|
| 客服 Agent | 查询订单、处理退款、发送通知 |
| 销售 Agent | 搜索产品、生成报价、查询库存 |
| 代码审查 Agent | 读取文件、执行 Lint、运行测试 |
| 数据分析 Agent | 查询数据库、生成图表、导出报表 |

> 工具可以自定义：生成后可以手动添加、修改、删除工具。

## 2.4 结构化输出

Agent 可以返回结构化数据，不限于纯文本：

```typescript
const result = await agent.execute({
  type: 'chat',
  input: { message: '帮我查一下订单 ORD-001' }
});

// result.output 包含：
{
  content: "您的订单已发货，预计明天送达",
  structured: {
    orderId: "ORD-001",
    status: "shipped",
    carrier: "顺丰速运",
    trackingNumber: "SF1234567890",
    estimatedDelivery: "2026-03-28"
  }
}
```

## 2.5 事件系统

Agent 内置事件总线，宿主项目可以监听各种事件：

| 事件 | 触发时机 | 用途 |
|---|---|---|
| `initialized` | Agent 初始化完成 | 日志记录 |
| `before:execute` | 任务执行前 | 记录审计日志 |
| `after:execute` | 任务执行完成 | 结果处理、数据持久化 |
| `tool:call` | 工具被调用 | 监控工具使用情况 |
| `error` | 发生错误 | 告警通知 |
| `destroyed` | Agent 销毁 | 资源清理 |

```typescript
agent.on('tool:call', (data) => {
  console.log(`工具 ${data.toolName} 被调用，耗时 ${data.duration}ms`);
});

agent.on('error', (data) => {
  alertManager.notify(`Agent 异常: ${data.message}`);
});
```

## 2.6 插件扩展

```typescript
agent.use(new LoggerPlugin({ level: 'info' }));
agent.use(new RateLimitPlugin({ maxPerMinute: 60 }));
agent.use(new CachePlugin({ ttl: 300 }));

agent.use({
  name: 'audit-log',
  install(agent, ctx) {
    ctx.registerMiddleware({
      name: 'audit',
      before: async (task) => {
        console.log(`[审计] 任务开始: ${task.type}`);
        return task;
      },
      after: async (result, task) => {
        console.log(`[审计] 任务完成: 耗时 ${result.meta.duration}ms`);
        return result;
      }
    });
  }
});
```

## 2.7 执行元数据

```typescript
const result = await agent.execute(task);

// result.meta 包含：
{
  duration: 1850,
  tokensUsed: { input: 256, output: 128, total: 384 },
  model: "gpt-4o",
  toolsCalled: [
    { name: "query-order", duration: 320, success: true },
    { name: "send-notification", duration: 150, success: true }
  ]
}
```

## 2.8 HTTP 自服务

每个 Agent 可以自己启动为 HTTP 服务：

```bash
npx agent-customer-service serve --port 3001
```

| 端点 | 方法 | 说明 |
|---|---|---|
| `/api/execute` | POST | 同步执行任务 |
| `/api/stream` | POST | 流式执行任务（SSE） |
| `/api/status` | GET | 详细状态（版本、uptime、Provider 就绪） |
| `/api/health` | GET | 轻量探活（Docker/K8s liveness） |
| `/api/capabilities` | GET | 查看能力声明 |

## 2.9 状态管理

Agent 内置 7 种状态，自动流转：

```
                    init()
UNINITIALIZED ───────────→ INITIALIZING ─────→ READY
                                                  │
                                           execute()
                                                  │
                                                  ▼
                                              RUNNING ──→ READY (完成)
                                                  │
                                               error
                                                  │
                                                  ▼
                                              ERROR ──→ READY (恢复)
                                                  │
                                           destroy()
                                                  │
                                                  ▼
                                              DESTROYED
```

| 状态 | 说明 |
|---|---|
| `uninitialized` | 刚创建，未初始化 |
| `initializing` | 正在初始化中 |
| `ready` | 就绪，等待任务 |
| `running` | 正在执行任务 |
| `paused` | 已暂停（手动触发） |
| `error` | 出现错误（可恢复） |
| `destroyed` | 已销毁（不可逆） |

## 2.10 功能总览

```
┌──────────────────────────────────────────────────┐
│              单个生成的 Agent                      │
│                                                    │
│  🔄 生命周期     init → execute/stream → destroy  │
│                                                    │
│  💬 智能对话     多轮 + 流式 + 上下文注入          │
│                                                    │
│  🔧 工具调用     自动选择 + 参数提取 + 串联        │
│                                                    │
│  📊 结构化输出   文本 + JSON 数据双输出            │
│                                                    │
│  📡 事件系统     生命周期 + 工具 + 错误事件        │
│                                                    │
│  🔌 插件扩展     中间件 + 自定义能力运行时加载     │
│                                                    │
│  📈 执行追踪     耗时 + Token + 工具调用记录        │
│                                                    │
│  🌐 HTTP 自服务  REST API + SSE 流式，一键启动     │
│                                                    │
│  📋 状态管理     7 种状态自动流转                  │
└──────────────────────────────────────────────────┘
```

> **总结：** 生成的每个 Agent 不是一个简单的聊天机器人，而是一个具备工具调用能力、可扩展、可观测、可独立部署的完整智能体。
