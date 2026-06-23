# AgentForge 测试文档

> ⚠️ **目标行为文档**：本文描述预期用法，当前项目处于设计阶段，命令与 API 尚未实现。权威规格见 [05-CLI与API.md](../design/05-CLI与API.md)；测试策略细节参见 [TECH-DESIGN.md §13](../design/TECH-DESIGN.md#13-测试策略)。
>
> **文档层级**: 第三层 · 操作手册
> **文档类型**: 测试策略
> **文档状态**: 已定稿
> **文档版本**: docs-v0.4
> **最后更新**: 2026-06-23
> **实现状态**: 未开始

## 测试总览

AgentForge 使用 **Vitest** 作为测试框架，采用分层测试策略覆盖核心功能。

| 统计项 | 数值 |
|---|---|
| 测试框架 | Vitest ^2.0 |
| 目标测试数 | 79 |
| 覆盖包 | `@agentforge/core`、`@agentforge/sdk`、`@agentforge/runtime-client` |

### 测试分层

| 层级 | 测试数 | 说明 |
|---|---|---|
| Unit（单元测试） | 75 | Agent 生命周期、状态机、Pipeline、EventBus、AgentFramework |
| Integration（集成测试） | 2 | 3-Agent Pipeline 协作、事件发射 |
| E2E（端到端测试） | 2 | AgentGenerator 生成引擎完整流程 |

---

## 快速开始

### 运行全部测试

```bash
pnpm test
```

### 运行单个测试文件

```bash
# BaseAgent 单元测试
pnpm vitest run packages/core/src/agent/__tests__/BaseAgent.test.ts

# Pipeline 单元测试
pnpm vitest run packages/sdk/src/__tests__/Pipeline.test.ts

# 生成引擎 E2E 测试
pnpm vitest run packages/core/src/generator/__tests__/generator.e2e.test.ts

# SDK 集成测试
pnpm vitest run packages/sdk/src/__tests__/integration.test.ts
```

### Watch 模式

```bash
pnpm test:watch
```

### 覆盖率报告

```bash
pnpm vitest run --coverage
```

覆盖率使用 `@vitest/coverage-v8`，输出到 `coverage/` 目录。

### 筛选用例

```bash
# 按测试名筛选
pnpm vitest run -t "AgentLifeCycle"

# 按文件路径筛选
pnpm vitest run packages/core/
```

---

## 测试文件索引

| 文件路径 | 包 | 层级 | 测试数 | 覆盖内容 |
|---|---|---|---|---|
| `packages/core/src/agent/__tests__/BaseAgent.test.ts` | core | Unit | 44 | AgentLifeCycle 状态机 (15) + BaseAgent 生命周期 (29) |
| `packages/sdk/src/__tests__/Pipeline.test.ts` | sdk | Unit | 31 | EventBus (12) + Pipeline (12) + AgentFramework (8) — *注：含部分重叠计数* |
| `packages/core/src/generator/__tests__/generator.e2e.test.ts` | core | E2E | 2 | AgentGenerator 单个生成 + 批量生成 |
| `packages/sdk/src/__tests__/integration.test.ts` | sdk | Integration | 2 | 3-Agent Pipeline 协作 + 事件发射 |

---

## 单元测试详解

### AgentLifeCycle 状态机（15 tests）

测试 `AgentLifeCycle` 类的 7 状态转换规则:

```
UNINITIALIZED → INITIALIZING → READY ⇄ RUNNING
                              ↓         ↓
                            ERROR ←── PAUSED
                              ↓
                           DESTROYED
```

| 测试组 | 测试内容 |
|---|---|
| 合法转换 | `UNINITIALIZED → INITIALIZING`、`INITIALIZING → READY`、`INITIALIZING → ERROR`、`READY → RUNNING`、`RUNNING → READY`、`RUNNING → PAUSED`、`RUNNING → ERROR`、`PAUSED → RUNNING`、`ERROR → READY`、任意状态 → `DESTROYED` |
| 非法转换 | 从 `UNINITIALIZED` 直接到 `READY`/`RUNNING` 抛 `AgentStatusError` |
| 边界情况 | `DESTROYED` 后不可再转换、`canTransition()` 返回值、`assertStatus()` 断言 |

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

### AgentFramework（8 tests）

| 测试内容 |
|---|
| `register()` + `init()` 注册并初始化 Agent |
| `run()` 按名称执行 Agent |
| `pipeline()` 创建 Pipeline 实例 |
| `on()`/`off()` 委托 EventBus |
| `once()` 委托 EventBus |
| 获取未注册 Agent 抛异常 |
| `destroy()` 清空 Agent 和事件 |
| ModelRegistry 配置解析 |

---

## 集成测试详解

### SDK Integration（2 tests）

| 测试 | 说明 |
|---|---|
| 3-Agent Pipeline 协作 | 注册 service/sales/data 三个 MockAgent，Pipeline 串行执行 3 步，验证 steps.length = 3 |
| Pipeline 事件发射 | 执行 Pipeline 时监听 `pipeline:step` 事件，验证事件机制可用 |

---

## E2E 测试详解

### AgentGenerator E2E（2 tests）

| 测试 | 说明 |
|---|---|
| 单个 ClientAgent 生成 | 从描述 "电商客服助手" + `customer-service` 模板生成，验证生成的 9 个文件（main.ts、agent.ts、prompts.ts、tools.ts、types.ts、runtime.ts、package.json、tsconfig.json、README.md）以及 `.agentforge/config.json`、`.agentforge/security.json` 全部存在且内容合理 |
| 批量生成 | 一次生成 2 个 ClientAgent（sales-assistant + code-reviewer），验证各自的 templateId 和文件数量 |

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
```

### 命名规则

| 规则 | 示例 |
|---|---|
| 测试文件: `*.test.ts` | `BaseAgent.test.ts`、`generator.e2e.test.ts` |
| E2E 测试: `*.e2e.test.ts` | `generator.e2e.test.ts` |
| describe 块: 类名或功能名 | `describe('AgentLifeCycle', ...)` |
| it 块: 行为描述（英文） | `it('transitions UNINITIALIZED → INITIALIZING', ...)` |

### MockAgent 模式

测试中通过继承 `BaseAgent` 创建 MockAgent，注入自定义行为:

```typescript
// 基础 MockAgent
class MockAgent extends BaseAgent<AgentConfig> {
  private executeFn: (task: AgentTask) => Promise<AgentResult>;

  constructor(name: string, executeFn?: (task: AgentTask) => Promise<AgentResult>) {
    super({ name, role: 'mock' });
    this.executeFn = executeFn ?? (async (task) => ({
      success: true,
      output: { content: `${name}: ${task.input.message ?? 'no-input'}` },
      meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
    }));
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

`.github/workflows/ci.yml` 定义了 CI 流水线:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20]

    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 8
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: pnpm

      - run: pnpm install --frozen-lockfile
      - run: pnpm run lint
      - run: pnpm run type-check
      - run: pnpm run build
      - run: pnpm test
```

### CI 执行顺序

```
install → lint → type-check → build → test
```

| 步骤 | 命令 | 说明 |
|---|---|---|
| 1 | `pnpm install --frozen-lockfile` | 严格按 lockfile 安装依赖 |
| 2 | `pnpm run lint` | ESLint 全仓代码检查 |
| 3 | `pnpm run type-check` | 全包 TypeScript 类型检查（`tsc --noEmit`） |
| 4 | `pnpm run build` | 全包构建（tsup 后端 + vite 前端） |
| 5 | `pnpm test` | 运行 Vitest 全部测试 |

> **注意:** 测试在 build 之后运行，因为部分测试依赖编译产物。

### Node.js 版本矩阵

CI 同时测试 Node.js 18 和 20 两个版本，确保兼容性。

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
  constructor() { super({ name: 'test', role: 'mock' }); }
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

测试依赖编译产物。先构建再测试:

```bash
pnpm build
pnpm test
```

### Q: E2E 测试需要 API Key 吗?

不需要。`AgentGenerator` 的 E2E 测试只验证模板渲染和文件生成，不调用 LLM API。

### Q: 如何只运行某一类测试?

```bash
# 只运行单元测试（排除 .e2e. 和 integration.）
pnpm vitest run --exclude '**/*.e2e.test.ts' --exclude '**/integration.test.ts'

# 只运行 E2E 测试
pnpm vitest run packages/core/src/generator/__tests__/
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
