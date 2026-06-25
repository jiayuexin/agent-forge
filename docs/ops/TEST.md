# AgentForge 测试文档

> ⚠️ **目标行为文档**：本文描述预期用法，当前项目处于设计阶段，命令与 API 尚未实现。权威规格见 [05-CLI与API.md](../design/05-CLI与API.md)；测试策略细节参见 [TECH-DESIGN.md §13](../design/TECH-DESIGN.md#13-测试策略)。
>
> **文档层级**: 第三层 · 操作手册
> **文档类型**: 测试策略
> **文档状态**: 已定稿
> **文档版本**: docs-v0.4
> **最后更新**: 2026-06-24
> **实现状态**: 未开始

## 测试总览

AgentForge 使用 **Vitest** 作为单元/集成测试框架，**Playwright** 作为 E2E 测试框架，采用分层测试策略覆盖核心功能。

| 统计项 | 数值 |
|---|---|
| 单元/集成测试框架 | Vitest ^2.0 |
| E2E 测试框架 | Playwright |
| 目标测试数 | 139（单元/集成）+ 关键路径 E2E |
| 覆盖率目标 | 单元测试 ≥ 80% |
| 覆盖包 | `@agentforge/core`、`@agentforge/sdk`、`@agentforge/runtime-client`、`@agentforge/cli`、`@agentforge/http-server` |

### 测试分层

| 层级 | 覆盖范围 | 工具 | 目标 |
|---|---|---|---|
| 单元测试 | core/types/sdk 各模块 | Vitest | 覆盖率 ≥ 80% |
| 集成测试 | Provider 连接、生成流程、HTTP API | Vitest | 3 种集成模式覆盖 |
| E2E 测试 | CLI 完整流程、Dashboard 页面 | Playwright | 关键路径覆盖 |
| 生成验证 | 每个模板生成的 Agent | 自动脚本 | 编译通过 + 可执行 |

---

## 快速开始

### 运行全部测试

```bash
pnpm test
```

### 运行单元/集成测试

```bash
# BaseAgent 单元测试
pnpm vitest run packages/core/src/agent/__tests__/BaseAgent.test.ts

# AgentLifeCycle 状态机测试
pnpm vitest run packages/core/src/agent/__tests__/AgentLifeCycle.test.ts

# ProviderFactory 测试
pnpm vitest run packages/core/src/provider/__tests__/ProviderFactory.test.ts

# MiddlewareChain 测试
pnpm vitest run packages/core/src/runtime/__tests__/MiddlewareChain.test.ts

# PluginManager 测试
pnpm vitest run packages/core/src/plugin/__tests__/PluginManager.test.ts

# Pipeline 单元测试
pnpm vitest run packages/sdk/src/__tests__/Pipeline.test.ts

# Pipeline 回退/跳转测试
pnpm vitest run packages/sdk/src/__tests__/PipelineBacktrack.test.ts

# EventBus 测试
pnpm vitest run packages/sdk/src/__tests__/EventBus.test.ts

# AgentFramework 测试
pnpm vitest run packages/sdk/src/__tests__/AgentFramework.test.ts

# SDK 集成测试
pnpm vitest run packages/sdk/src/planner/__tests__/integration.test.ts

# CLI create 测试
pnpm vitest run packages/cli/src/commands/__tests__/create.test.ts

# CLI batch 测试
pnpm vitest run packages/cli/src/commands/__tests__/batch.test.ts

# HTTP server routes 测试
pnpm vitest run packages/http-server/src/routes/__tests__/agents.test.ts
```

### 运行跨包集成测试

```bash
# ClientAgent 运行集成
pnpm vitest run tests/integration/client-agent-mode.test.ts

# SDK 编排集成
pnpm vitest run tests/integration/sdk-mode.test.ts

# Capability Hub 集成
pnpm vitest run tests/integration/hub-mode.test.ts
```

### 运行 E2E 测试

```bash
# 安装 Playwright 浏览器（首次）
pnpm exec playwright install

# 运行全部 E2E 测试
pnpm run test:e2e

# 只运行 CLI 流程 E2E
pnpm exec playwright test tests/e2e/cli-flow.test.ts

# 只运行 Capability Hub 页面 E2E
pnpm exec playwright test tests/e2e/capability-hub.test.ts
```

### Watch 模式

```bash
pnpm test:watch
```

### 覆盖率报告

```bash
pnpm vitest run --coverage
```

覆盖率使用 `@vitest/coverage-v8`，输出到 `coverage/` 目录。单元测试覆盖率阈值 ≥ 80%，在 `vitest.config.ts` 中通过 `coverage.thresholds` 强制。

### 筛选用例

```bash
# 按测试名筛选
pnpm vitest run -t "AgentLifeCycle"

# 按文件路径筛选
pnpm vitest run packages/core/
```

---

## 测试目录结构

单元测试与包内集成测试放在各包源码目录下：

```
packages/
├── core/src/
│   ├── agent/__tests__/BaseAgent.test.ts           # 生命周期 + 状态流转
│   ├── agent/__tests__/AgentLifeCycle.test.ts      # 状态机转换
│   ├── provider/__tests__/ProviderFactory.test.ts  # Provider 创建 + 自定义 Provider
│   ├── runtime/__tests__/MiddlewareChain.test.ts   # 中间件顺序 + 错误处理
│   ├── plugin/__tests__/PluginManager.test.ts      # 插件安装 + 卸载
│   └── generator/__tests__/AgentGenerator.test.ts  # 生成流程
├── sdk/src/
│   ├── __tests__/Pipeline.test.ts                  # 串行 / 并行 / 分支
│   ├── __tests__/PipelineBacktrack.test.ts         # 回退 / 跳转 / 快照
│   ├── __tests__/EventBus.test.ts                  # 发布订阅
│   ├── __tests__/AgentFramework.test.ts            # 注册 / 运行 / 模型注册表
│   └── planner/__tests__/integration.test.ts       # 3-Agent Pipeline 协作
├── cli/src/
│   └── commands/__tests__/create.test.ts           # 单个生成
│   └── commands/__tests__/batch.test.ts            # 批量生成
└── http-server/src/
    └── routes/__tests__/agents.test.ts             # HTTP 执行/流式路由
```

跨包集成测试与 E2E 测试放在仓库根目录：

```
tests/
├── integration/
│   ├── client-agent-mode.test.ts  # ClientAgent 运行集成
│   ├── sdk-mode.test.ts           # SDK 编排集成
│   └── hub-mode.test.ts           # Capability Hub 集成
└── e2e/
    ├── cli-flow.test.ts           # CLI 完整流程
    └── capability-hub.test.ts     # Capability Hub 页面交互
```

---

## 测试文件索引

| 文件路径 | 包 | 层级 | 测试数 | 覆盖内容 |
|---|---|---|---|---|
| `packages/core/src/agent/__tests__/BaseAgent.test.ts` | core | Unit | 29 | BaseAgent 生命周期、事件、插件、错误处理 |
| `packages/core/src/agent/__tests__/AgentLifeCycle.test.ts` | core | Unit | 16 | AgentLifeCycle 7 状态转换规则 |
| `packages/core/src/provider/__tests__/ProviderFactory.test.ts` | core | Unit | 8 | Provider 创建、自定义 Provider 注册 |
| `packages/core/src/runtime/__tests__/MiddlewareChain.test.ts` | core | Unit | 8 | 中间件顺序、错误处理 |
| `packages/core/src/plugin/__tests__/PluginManager.test.ts` | core | Unit | 8 | 插件安装、卸载、上下文 |
| `packages/core/src/generator/__tests__/AgentGenerator.test.ts` | core | Unit | 5 | 生成流程组件 |
| `packages/sdk/src/__tests__/Pipeline.test.ts` | sdk | Unit | 12 | EventBus + Pipeline 串行/并行/分支 |
| `packages/sdk/src/__tests__/PipelineBacktrack.test.ts` | sdk | Unit | 10 | 回退、跳转、快照、上限 |
| `packages/sdk/src/__tests__/EventBus.test.ts` | sdk | Unit | 12 | 发布订阅机制 |
| `packages/sdk/src/__tests__/AgentFramework.test.ts` | sdk | Unit | 9 | 注册、运行、ModelRegistry |
| `packages/sdk/src/planner/__tests__/integration.test.ts` | sdk | Integration | 2 | 3-Agent Pipeline 协作、事件发射 |
| `packages/cli/src/commands/__tests__/create.test.ts` | cli | Unit | 3 | create 命令参数解析、输出 |
| `packages/cli/src/commands/__tests__/batch.test.ts` | cli | Unit | 3 | batch 命令配置解析、批量生成 |
| `packages/http-server/src/routes/__tests__/agents.test.ts` | http-server | Unit | 3 | HTTP 执行/流式路由 |
| `packages/runtime-client/src/__tests__/AgentRuntimeClient.test.ts` | runtime-client | Unit | 5 | WebSocket 连接、心跳、重连 |
| `tests/integration/client-agent-mode.test.ts` | — | Integration | 2 | ClientAgent 运行集成 |
| `tests/integration/sdk-mode.test.ts` | — | Integration | 2 | SDK 编排集成 |
| `tests/integration/hub-mode.test.ts` | — | Integration | 2 | Capability Hub 集成 |
| `tests/e2e/cli-flow.test.ts` | — | E2E | — | CLI create/run/dashboard 完整流程 |
| `tests/e2e/capability-hub.test.ts` | — | E2E | — | Capability Hub 页面交互 |

---

## 单元测试详解

### AgentLifeCycle 状态机（16 tests）

测试 `AgentLifeCycle` 类的 7 状态转换规则（含 ClientAgent 专属的 `daemon-running`）：

```
UNINITIALIZED → INITIALIZING → READY → DAEMON_RUNNING ⇄ RUNNING
                              ↓         ↓
                            ERROR ←────┘
                              ↓
                           DESTROYED
```

| 测试组 | 测试内容 |
|---|---|
| 合法转换 | `UNINITIALIZED → INITIALIZING`、`INITIALIZING → READY`、`INITIALIZING → ERROR`、`READY → RUNNING`、`READY → DAEMON_RUNNING`、`DAEMON_RUNNING → RUNNING`、`RUNNING → DAEMON_RUNNING`、`RUNNING → READY`、`RUNNING → ERROR`、`ERROR → READY`、任意状态 → `DESTROYED` |
| 非法转换 | 从 `UNINITIALIZED` 直接到 `READY`/`RUNNING` 抛 `AgentError` |
| 边界情况 | `DESTROYED` 后不可再转换、`canTransition()` 返回值、`reset()` 重置为 `UNINITIALIZED` |

### BaseAgent 核心（29 tests）

| 测试组 | 测试数 | 测试内容 |
|---|---|---|
| 构造 | 4 | id/name/role/version 默认值、自定义 version、初始状态 UNINITIALIZED、空 capabilities |
| 生命周期 | 4 | `init → READY`、`execute → RUNNING → READY`、`destroy → DESTROYED`、完整生命周期串联 |
| 错误处理 | 3 | `doInit` 失败 → ERROR、`doExecute` 失败 → ERROR、未 init 直接 execute 抛异常 |
| 事件发射 | 4 | `agent:init`、`agent:execute:start/end`、`agent:error`、`agent:destroy` |
| 事件注册 | 4 | `on()` 链式调用、`off()` 移除、`off()` 链式、同事件多 handler |
| 插件系统 | 4 | `use()` 安装插件、PluginContext 属性（registerTool/registerMiddleware/config/logger）、`uninstall` 在 destroy 时调用、Middleware before/after hooks |
| Stream | 1 | `stream()` 在未实现 `doStream` 时回退到 `execute` |
| 销毁边界 | 2 | 从 UNINITIALIZED 可直接 destroy、destroy 后不可 execute |
| 工具调用 | 3 | Provider 返回 tool call 时调用 ToolDefinition.handler、handler 异常转换为 AgentResult.error |

### ProviderFactory（8 tests）

| 测试组 | 测试数 | 测试内容 |
|---|---|---|
| 内置 Provider | 3 | 创建 OpenAI / Anthropic / Ollama Provider |
| 自定义 Provider | 2 | 注册自定义 Provider、通过 modelConfig.provider 自动选择 |
| 配置校验 | 2 | 缺少 apiKey 时 validate() 返回 false、自定义 baseUrl 生效 |
| 错误处理 | 1 | 未注册 Provider 抛出 ProviderNotFoundError |

### MiddlewareChain（8 tests）

| 测试组 | 测试数 | 测试内容 |
|---|---|---|
| 顺序执行 | 3 | before 链按注册顺序执行、after 链按注册顺序执行 |
| 错误处理 | 3 | before 抛错进入 onError、onError 返回结果替代原结果、无 onError 时抛错 |
| 启用/禁用 | 2 | MiddlewareConfig.enabled=false 时跳过 |

### PluginManager（8 tests）

| 测试组 | 测试数 | 测试内容 |
|---|---|---|
| 安装/卸载 | 3 | use() 调用 install、重复安装抛错、destroy 时调用 uninstall |
| 工具注册 | 2 | registerTool 后 Agent 可调用该工具 |
| 中间件注册 | 2 | registerMiddleware 后 MiddlewareChain 包含该中间件 |
| 上下文 | 1 | PluginContext 包含 config / logger |

### EventBus（12 tests）

| 测试内容 |
|---|
| `on()` + `emit()` 基本用法 |
| 同事件多 handler 全部触发 |
| `once()` 只触发一次 |
| `off()` 移除特定 handler |
| emit 未知事件不抛错 |
| handler 异常不中断其他 handler |
| `removeAllListeners(event)` 移除指定事件全部 handler |
| `removeAllListeners()` 移除全部事件全部 handler |
| `on()`/`once()`/`off()`/`removeAllListeners()` 返回 this 支持链式调用 |

### Pipeline（12 tests）

| 特性 | 测试内容 |
|---|---|
| 顺序执行 | 3 步串行，输出逐级传递 |
| 条件分支 | `branch()` 根据上一步 output.structured 路由到不同 Agent |
| 并行执行 | `parallel()` 两步并行 + merge 步 |
| 回退 | Agent 返回 `__control: { action: 'back' }` 触发回退，记录 backtrackHistory |
| 回退上限 | 超过 `maxBacktracks` 抛异常 |
| 停止 | interceptor 返回 `{ action: 'stop' }` 终止 Pipeline |
| 跳转 | interceptor 返回 `{ action: 'jump', targetStep }` 跳回指定步骤 |
| 分叉 | interceptor 返回 `{ action: 'fork' }` + `.fork()` 定义并行分支 |
| 缺失 Agent | 注册表中找不到 Agent 抛异常 |
| Transform | 步骤级 `transform` 函数改写输入 |
| 快照 | 每步记录 StepSnapshot（stepName、stepIndex、timestamp、output） |

### PipelineBacktrack（10 tests）

| 测试组 | 测试数 | 测试内容 |
|---|---|---|
| 回退重做 | 3 | back 信号返回到指定步骤、携带 feedback message、重试次数递增 |
| 跳转 | 3 | jump 到前/后步骤、跳转原因记录 |
| 快照恢复 | 2 | ISnapshotable Agent 回退时恢复状态 |
| 上限 | 2 | 超过 maxBacktracks / maxRetries 抛异常 |

### AgentFramework（9 tests）

| 测试内容 |
|---|
| `register()` + `init()` 注册并初始化 Agent |
| `run()` 按名称执行 Agent |
| `pipeline()` 创建 Pipeline 实例 |
| `orchestrate()` 调用 PlannerAgent 生成并执行计划 |
| `on()`/`off()` 委托 EventBus |
| `once()` 委托 EventBus |
| 获取未注册 Agent 抛异常 |
| `destroy()` 清空 Agent 和事件 |
| ModelRegistry 多端点路由 |

### AgentRuntimeClient（5 tests）

| 测试组 | 测试数 | 测试内容 |
|---|---|---|
| 连接 | 2 | start() 连接 Hub、发送注册消息 |
| 心跳 | 1 | 按 heartbeatInterval 发送 ping |
| 重连 | 1 | 断开后按 reconnect 策略重连 |
| 任务处理 | 1 | 收到 execute ControlMessage 后调用 ClientAgent 并返回 AgentMessage |

---

## 集成测试详解

### SDK Integration（2 tests）

| 测试 | 说明 |
|---|---|
| 3-Agent Pipeline 协作 | 注册 service/sales/data 三个 MockAgent，Pipeline 串行执行 3 步，验证 steps.length = 3 |
| Pipeline 事件发射 | 执行 Pipeline 时监听 `pipeline:step` 事件，验证事件机制可用 |

### ClientAgent Mode Integration（2 tests）

| 测试 | 说明 |
|---|---|
| 守护进程启动 | `agentforge run` 启动后 ClientAgent 注册到模拟 Hub |
| 远程任务执行 | Hub 下发 execute 任务，ClientAgent 返回结果 |

### SDK Mode Integration（2 tests）

| 测试 | 说明 |
|---|---|
| 编排调用 ClientAgent | 通过 Capability Hub 路由，StatelessAgent 调用 ClientAgent 远程能力 |
| 离线能力缓存 | 断开 Hub 后，ClientAgent 仍可调用已缓存能力 |

### Hub Mode Integration（2 tests）

| 测试 | 说明 |
|---|---|
| 节点注册与心跳 | ClientAgent 通过 WebSocket 注册并维持心跳 |
| 能力下发与确认 | Hub 下发 ToolCapability，ClientAgent 安装后返回 capability-ack |

---

## E2E 测试详解

### CLI Flow E2E（Playwright）

| 测试 | 说明 |
|---|---|
| create 生成 ClientAgent | 执行 `agentforge create "电商客服助手"`，验证 `./client-agents/<name>/` 目录及关键文件存在 |
| batch 批量生成 | 执行 `agentforge batch client-agents.yaml`，验证多个 ClientAgent 生成成功 |
| run 启动守护进程 | 执行 `agentforge run ./client-agents/<name> --connect ws://localhost:8080`，验证进程正常注册到 Hub |
| dashboard 启动 Hub | 执行 `agentforge dashboard`，验证 Hub HTTP 端点可访问 |

### Capability Hub E2E（Playwright）

| 测试 | 说明 |
|---|---|
| 节点列表页 | 登录面板后查看 NodeList 页面，验证已连接 ClientAgent 节点展示正常 |
| 调试台对话 | 在 Playground 页面输入消息，验证流式输出、Markdown 渲染 |
| 能力下发 | 在 CapabilityDistribute 页面选择能力和节点，点击下发，验证 ClientAgent 成功安装 |

---

## E2E 环境搭建

### 安装 Playwright

```bash
pnpm exec playwright install
```

### 准备测试数据

```bash
# 创建 E2E 专用 fixtures
touch tests/e2e/fixtures/client-agents.yaml
```

`client-agents.yaml` 示例：

```yaml
agents:
  - name: sales-assistant
    description: 一个销售助手，帮助用户跟进线索、生成报价
    templateId: sales-assistant
  - name: code-reviewer
    description: 一个代码审查助手，帮助检查 Git 提交
    templateId: code-reviewer
```

### Mock Hub

E2E 测试使用内存中的 Mock Capability Hub，避免依赖外部服务：

```typescript
// tests/e2e/fixtures/mock-hub.ts
import { createServer } from 'node:http';

export function startMockHub(port: number) {
  const server = createServer();
  // WebSocket 升级处理...
  server.listen(port);
  return {
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
```

### 环境变量

E2E 测试不使用真实 LLM API Key。`AgentGenerator` 的 E2E 测试只验证模板渲染和文件生成，不调用 LLM API。Playwright 测试在 `playwright.config.ts` 中指定：

```typescript
export default defineConfig({
  testDir: 'tests/e2e',
  use: {
    baseURL: 'http://localhost:8080',
  },
});
```

---

## 测试约定

### 目录结构

```
packages/<pkg>/src/
├── <module>/
│   ├── __tests__/
│   │   └── <module>.test.ts      # 单元测试
│   └── <module>.ts
└── __tests__/
    └── integration.test.ts        # 集成测试（包级别）

tests/
├── integration/
│   └── *.test.ts                  # 跨包集成测试
└── e2e/
    └── *.test.ts                  # Playwright E2E 测试
```

### 命名规则

| 规则 | 示例 |
|---|---|
| 单元测试文件: `*.test.ts` | `BaseAgent.test.ts`、`AgentGenerator.test.ts` |
| 集成测试文件: `*.test.ts` | `integration.test.ts`、`client-agent-mode.test.ts` |
| E2E 测试文件: `*.test.ts` | `cli-flow.test.ts`、`capability-hub.test.ts` |
| describe 块: 类名或功能名 | `describe('AgentLifeCycle', ...)` |
| it 块: 行为描述（英文） | `it('transitions UNINITIALIZED → INITIALIZING', ...)` |

### MockAgent 模式

测试中通过继承 `BaseAgent` 创建 MockAgent，注入自定义行为:

```typescript
// 基础 MockAgent
class MockAgent extends BaseAgent<AgentConfig> {
  constructor(
    name: string,
    private readonly executeFn: (task: AgentTask) => Promise<AgentResult> = async (task) => ({
      success: true,
      output: { content: `${name}: ${task.input.message ?? 'no-input'}` },
      meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
    }),
  ) {
    super({
      identity: { name, role: 'mock', version: '1.0.0' },
      model: { provider: 'openai', modelName: 'gpt-4o', apiKey: 'sk-test' },
      systemPrompt: 'You are a mock agent for testing.',
    });
  }

  protected async doInit(): Promise<void> {}
  protected async doExecute(task: AgentTask): Promise<AgentResult> {
    return this.executeFn(task);
  }
}
```

### 常用 Vitest API

| API | 用途 |
|---|---|
| `vi.fn()` | 创建 spy 函数 |
| `vi.fn().toHaveBeenCalledOnce()` | 断言调用一次 |
| `vi.fn().toHaveBeenCalledWith(args)` | 断言调用参数 |
| `beforeEach` / `beforeAll` | 测试前初始化 |
| `afterAll` | 测试后清理（destroy framework 等） |
| `expect().rejects.toThrow()` | 异步异常断言 |
| `expect().toBeInstanceOf()` | 类型断言 |

---

## CI 集成

### GitHub Actions

完整 CI/CD 流水线定义参见 [`docs/design/TECH-DESIGN.md` §15.3](../design/TECH-DESIGN.md#153-cicd-pipeline)。本节仅保留与测试直接相关的阶段说明。

```yaml
# .github/workflows/ci.yml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
  release:
    types: [published]

jobs:
  lint-typecheck-test-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm run lint
      - run: pnpm run type-check
      - run: pnpm run test
      - run: pnpm run build

  e2e:
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    needs: lint-typecheck-test-build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install
      - run: pnpm run build
      - run: pnpm run test:e2e
```

### CI 执行顺序

```
install → lint → type-check → test → build
```

| 步骤 | 命令 | 说明 |
|---|---|---|
| 1 | `pnpm install --frozen-lockfile` | 严格按 lockfile 安装依赖 |
| 2 | `pnpm run lint` | ESLint 全仓代码检查 |
| 3 | `pnpm run type-check` | 全包 TypeScript 类型检查（`tsc --noEmit`） |
| 4 | `pnpm run test` | 运行 Vitest 全部单元/集成测试 |
| 5 | `pnpm run build` | 全包构建（tsup 后端 + vite 前端） |

> **注意:** 单元/集成测试在 build 之前运行；E2E 测试在 `main` 分支推送时触发。

### Node.js 版本矩阵

CI 使用 Node.js 20 运行全部检查，与 `docs/design/TECH-DESIGN.md` §15.3 保持一致。

---

## 编写新测试指南

### 单元测试模板

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { YourClass } from '../YourClass';

describe('YourClass', () => {
  let instance: YourClass;

  beforeEach(() => {
    instance = new YourClass();
  });

  it('should do something', async () => {
    const result = await instance.doSomething('input');
    expect(result.success).toBe(true);
  });

  it('should handle error case', async () => {
    await expect(instance.badMethod()).rejects.toThrow('expected error');
  });
});
```

### 集成测试模板

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AgentFramework } from '@agentforge/sdk';
import { BaseAgent } from '@agentforge/core';
import type { AgentTask, AgentResult, AgentConfig } from '@agentforge/types';

class TestAgent extends BaseAgent<AgentConfig> {
  constructor() {
    super({
      identity: { name: 'test', role: 'mock', version: '1.0.0' },
      model: { provider: 'openai', modelName: 'gpt-4o', apiKey: 'sk-test' },
      systemPrompt: 'You are a test agent.',
    });
  }
  protected async doInit(): Promise<void> {}
  protected async doExecute(task: AgentTask): Promise<AgentResult> {
    return {
      success: true,
      output: { content: 'done' },
      meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
    };
  }
}

describe('My Integration', () => {
  let framework: AgentFramework;

  beforeAll(async () => {
    framework = new AgentFramework();
    framework.register('test', TestAgent);
    await framework.init();
  });

  afterAll(async () => {
    await framework.destroy();
  });

  it('should work end-to-end', async () => {
    const result = await framework.run('test', {
      type: 'chat',
      input: { message: 'hello' },
    });
    expect(result.success).toBe(true);
  });
});
```

### E2E 测试模板（Playwright）

```typescript
import { test, expect } from '@playwright/test';

test('Capability Hub 节点列表页展示已连接节点', async ({ page }) => {
  await page.goto('/nodes');
  await expect(page.locator('[data-testid="node-list"]')).toBeVisible();
  await expect(page.locator('[data-testid="node-row"]')).toHaveCount(1);
});
```

### 最佳实践

1. **MockAgent 替代真实 LLM 调用**: 测试中不调用 OpenAI/Anthropic API，使用 MockAgent 返回固定结果
2. **beforeAll 初始化、afterAll 清理**: Framework 和 Agent 在 `beforeAll` 中 init，`afterAll` 中 destroy
3. **beforeEach 重置状态**: 纯函数/状态机测试用 `beforeEach` 创建新实例
4. **vi.fn() 监听调用**: 事件 handler、plugin hooks 用 `vi.fn()` 创建 spy
5. **异步断言**: 用 `expect().rejects.toThrow()` 而非 `try/catch`
6. **不依赖执行顺序**: 每个测试应独立可运行，不依赖其他测试的副作用

---

## 常见问题

### Q: 运行测试报 "Cannot find module '@agentforge/core'"?

测试依赖 workspace 链接。先安装依赖：

```bash
pnpm install
```

若仍报错，检查 `tsconfig.json` paths 与 `pnpm-workspace.yaml` 配置。

### Q: E2E 测试需要 API Key 吗?

不需要。E2E 测试使用 Mock Provider 和 Mock Hub，不调用真实 LLM API。

### Q: 如何只运行某一类测试?

```bash
# 只运行单元测试（排除 integration/ 和 e2e/）
pnpm vitest run packages/

# 只运行集成测试
pnpm vitest run tests/integration/

# 只运行 E2E 测试
pnpm run test:e2e
```

### Q: CI 中测试超时怎么办?

Vitest 默认超时 5000ms。在测试文件中可单独调整:

```typescript
it('long running test', async () => {
  // ...
}, 30000); // 30 秒超时
```

### Q: 如何查看详细测试输出?

```bash
# verbose 模式
pnpm vitest run --reporter=verbose

# 打印 console.log（默认被 vitest 静默）
pnpm vitest run --no-hide-console-log
```
