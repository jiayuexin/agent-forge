# P0 交付闭环 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立从已构建 CLI、真实 Capability Hub、CLI 签发 Token、生成并编译 ClientAgent，到 OpenAI `gpt-4o-mini` 远程执行结果返回 Hub 的可审计交付闭环。

**Architecture:** PR 门禁使用 Vitest 子进程驱动 `packages/cli/dist/index.js`，验证真实构建产物和本地确定性正常路径；发布及人工触发入口使用同一套进程工具，在系统临时目录构造隔离工作区并执行真实 Provider golden path。生成模板在运行时读取 `OPENAI_API_KEY`，节点凭据统一使用 `AGENTFORGE_HUB_TOKEN`；任一步骤失败立即失败，不加入重试、降级、熔断或备用 Provider。

**Tech Stack:** TypeScript 5.4、Node.js 20、pnpm workspace、tsup、Vitest 2、Commander、H3、WebSocket、GitHub Actions、OpenAI `gpt-4o-mini`

---

## 实施边界

- 只覆盖已批准设计中的 P0 正常业务流程。
- 不修改 `client-agents/smoke-test-agent`。
- 所有测试生成物、Hub 数据、能力缓存均放入 `mkdtemp()` 创建的系统临时目录。
- 不执行 `stash`、`reset`、`checkout` 或覆盖当前工作区改动。
- 本计划不包含任何提交步骤；只有用户另行明确要求时才创建 Git commit。
- 不加入重试、降级、熔断、备用 Provider 或离线替代路径。测试只等待进程已经定义的明确启动输出；业务命令失败立即终止。

## 文件清单与单一职责

### 新增文件

- `packages/cli/scripts/copy-templates.mjs`：在 CLI 构建后把 `templates/base` 与 `templates/roles` 复制到 `packages/cli/dist/templates`，使构建产物不依赖当前工作目录寻找模板。
- `packages/cli/vitest.e2e.config.ts`：只收集 `e2e/**/*.e2e.ts`，隔离构建产物测试和凭据化验收，避免被根 `pnpm test` 提前执行。
- `packages/cli/e2e/process-driver.ts`：提供 CLI 子进程、长运行进程、启动输出等待、正常信号关闭和临时工作区构造能力。
- `packages/cli/e2e/cli-artifact.e2e.ts`：从 `dist/index.js` 覆盖 `--help`、`--version`、`create`、`batch`、`list`、`serve`、`dashboard token`、`capability`、`run` 的确定性正常路径。
- `packages/cli/e2e/golden-path.e2e.ts`：编排真实 Hub、Token、生成、安装、构建、加载、WebSocket 接入、OpenAI 调用和 Hub 结果断言。
- `.github/workflows/golden-path.yml`：在 `workflow_dispatch` 与 release 发布时运行受保护的真实 Provider 验收。

### 修改文件

- `packages/core/src/generator/types.ts`：为生成请求增加显式 `id`，让 CLI Token 返回的 `nodeId` 成为生成 Agent 的身份。
- `packages/core/src/generator/AgentGenerator.ts`：使用输入 `id`，并把默认模型统一为 OpenAI `gpt-4o-mini`。
- `packages/core/src/generator/TemplateEngine.ts`：接收明确的模板根目录，并使文件模板与内联模板都生成运行时 Provider 环境变量读取代码。
- `packages/core/src/generator/__tests__/AgentGenerator.test.ts`：锁定显式身份、模型及无密钥落盘契约。
- `packages/core/src/generator/__tests__/TemplateEngine.test.ts`：锁定 `OPENAI_API_KEY` 运行时注入和模板根目录行为。
- `templates/base/src/config.ts.ejs`：生成 `process.env.OPENAI_API_KEY ?? ''`，不序列化密钥或占位值。
- `templates/base/src/main.ts.ejs`：只由一个所有者启动 daemon，避免 CLI/runtime 双重生命周期转换。
- `packages/cli/src/lib/generator.ts`：把 CLI 构建目录内的模板根显式传给 `TemplateEngine`。
- `packages/cli/src/lib/hub-client.ts`：增加节点 Token 创建、列表、撤销 HTTP 调用。
- `packages/cli/src/commands/create.ts`：增加 `--id`，移除占位 API Key，并传递 `gpt-4o-mini` 默认模型。
- `packages/cli/src/commands/batch.ts`：支持配置项 `id`，移除占位 API Key。
- `packages/cli/src/commands/dashboard.ts`：让 `dashboard token` 通过运行中的 Hub 管理 API 操作，而不是直接改写 Hub 已加载的数据文件。
- `packages/cli/src/commands/run.ts`：让 `AgentRuntimeClient` 成为 daemon 生命周期唯一启动者。
- `packages/cli/package.json`：构建后复制模板，并增加 `test:artifact`、`test:golden` 脚本。
- `pnpm-workspace.yaml`：把标准输出目录 `client-agents/*` 纳入 workspace，使文档中的生成项目可安装和按名称构建。
- `pnpm-lock.yaml`：记录新增 workspace importer，不改变现有依赖版本。
- `packages/core/src/agent/BaseAgent.ts`：执行远程任务后恢复进入执行前的 `READY` 或 `DAEMON_RUNNING` 状态。
- `packages/core/src/agent/__tests__/ClientAgent.test.ts`：验证 daemon 状态下真实执行及状态恢复。
- `packages/dashboard/server/services/GeneratedClientAgentStore.ts`：移除 Dashboard 生成入口中的占位 API Key。
- `packages/dashboard/__tests__/services/GeneratedClientAgentStore.test.ts`：验证 Dashboard 生成文件不包含密钥占位值。
- `README.md`：提供从构建到真实远程执行的最短成功路径。
- `docs/ops/GUIDE.md`：修正实际 CLI 参数、Token 签发顺序和 `AGENTFORGE_HUB_TOKEN` 名称。
- `docs/ops/TEST.md`：区分 Mock UI E2E、CLI 构建产物测试和真实凭据化验收。
- `package.json`：暴露根级 `test:cli` 与 `test:golden` 双层入口。
- `.github/workflows/ci.yml`：在构建完成后执行无外部 Provider 的 CLI 构建产物门禁。

## 已确认的实现约束

1. `dashboard token create` 当前直接写 `tokens.json`，已运行 Hub 的内存 `TokenStore` 不会重新加载；必须改为调用 `/api/admin/tokens`。
2. Token 当前绑定签发得到的 `nodeId`，而生成器随机创建 Agent ID；必须把 Token 响应的 `nodeId` 通过 `agentforge create --id` 传入生成器。
3. `agentforge run` 与 `AgentRuntimeClient.start()` 当前都会调用 `startDaemon()`；必须由 runtime-client 单独负责启动。
4. `BaseAgent.execute()` 当前只接受 `READY`，真实远程任务发生在 `DAEMON_RUNNING`；必须允许该状态进入执行并在完成后恢复。
5. 生成项目使用 `workspace:*` 且 `tsconfig` 继承 `../../tsconfig.base.json`，不能作为独立 npm 发布包安装；由于 npm 正式发布明确不在本期范围，验收在系统临时目录构造最小临时 workspace，复制已构建的 `types/core/runtime-client` 包产物后安装生成项目。
6. CLI 打包后 `TemplateEngine` 通过自身 `import.meta.url` 推导仓库根会偏移；CLI 构建必须携带模板，并显式传入模板根。

### Task 1: 锁定生成身份与运行时密钥契约

**Files:**

- Modify: `packages/core/src/generator/types.ts`
- Modify: `packages/core/src/generator/AgentGenerator.ts`
- Modify: `packages/core/src/generator/__tests__/AgentGenerator.test.ts`
- Modify: `packages/core/src/generator/__tests__/TemplateEngine.test.ts`
- Modify: `templates/base/src/config.ts.ejs`
- Modify: `packages/core/src/generator/TemplateEngine.ts`
- Modify: `packages/cli/src/commands/create.ts`
- Modify: `packages/cli/src/commands/batch.ts`
- Modify: `packages/dashboard/server/services/GeneratedClientAgentStore.ts`
- Modify: `packages/dashboard/__tests__/services/GeneratedClientAgentStore.test.ts`

- [ ] **Step 1: 先写显式 ID 与密钥不落盘测试**

在 `AgentGenerator.test.ts` 增加：

```typescript
it('uses the issued node id and injects OpenAI credentials at runtime', async () => {
  const generator = new AgentGenerator(
    new PromptBuilder(),
    new SkillMatcher(),
    new TemplateEngine(),
    new CodeEmitter()
  );

  const result = await generator.generate({
    id: 'golden-node-1234',
    description: 'A general assistant for the delivery golden path',
    name: 'golden-agent',
    templateId: 'general',
    config: {
      model: { provider: 'openai', modelName: 'gpt-4o-mini', apiKey: '' },
    },
  });

  expect(result.files['src/config.ts']).toContain("id: 'golden-node-1234'");
  expect(result.files['src/config.ts']).toContain("modelName: 'gpt-4o-mini'");
  expect(result.files['src/config.ts']).toContain('process.env.OPENAI_API_KEY');
  expect(result.files['src/config.ts']).not.toContain('REPLACE_WITH_OPENAI_API_KEY');
  expect(result.files['src/config.ts']).not.toContain('sk-');
});
```

在 `TemplateEngine.test.ts` 的渲染测试中追加：

```typescript
expect(rendered['src/config.ts']).toContain("apiKey: process.env.OPENAI_API_KEY ?? ''");
expect(rendered['src/config.ts']).not.toContain('REPLACE_WITH_OPENAI_API_KEY');
```

- [ ] **Step 2: 运行测试确认先失败**

Run: `pnpm exec vitest run packages/core/src/generator/__tests__/AgentGenerator.test.ts packages/core/src/generator/__tests__/TemplateEngine.test.ts`

Expected: FAIL；显式 `id` 尚未进入 `GenerateInput`，且生成的 `src/config.ts` 仍包含 `REPLACE_WITH_OPENAI_API_KEY`。

- [ ] **Step 3: 实现最小生成契约**

在 `GenerateInput` 增加 `id?: string`，在 `AgentGenerator.generate()` 中使用：

```typescript
const identity: AgentIdentity = {
  id: input.id ?? randomUUID(),
  name: parsed.name,
  role: parsed.role,
  version: '0.0.1',
};
```

把文件模板和 `TemplateEngine.fallbackTemplates['src/config.ts']` 的模型代码统一为：

```typescript
model: {
  provider: '<%= config.model?.provider ?? "openai" %>',
  modelName: '<%= config.model?.modelName ?? "gpt-4o-mini" %>',
  apiKey: process.env.OPENAI_API_KEY ?? '',
},
```

CLI `create` 增加：

```typescript
.option('--id <node-id>', 'ClientAgent node id issued by Capability Hub')
```

并把生成输入改为：

```typescript
id: options.id,
config: {
  model: {
    provider: 'openai' as const,
    modelName: options.model ?? 'gpt-4o-mini',
    apiKey: '',
  },
},
```

`BatchConfig.agents` 增加 `id?: string`，映射时传入 `id: agent.id`，模型 `apiKey` 使用空字符串。Dashboard 的生成请求也只用空字符串满足类型，最终文件始终由模板读取环境变量。

- [ ] **Step 4: 更新 Dashboard 生成回归断言**

在 `GeneratedClientAgentStore.test.ts` 读取生成的 `src/config.ts`，加入：

```typescript
expect(configSource).toContain('process.env.OPENAI_API_KEY');
expect(configSource).not.toContain('REPLACE_WITH_OPENAI_API_KEY');
```

- [ ] **Step 5: 运行生成相关测试**

Run: `pnpm exec vitest run packages/core/src/generator/__tests__/AgentGenerator.test.ts packages/core/src/generator/__tests__/TemplateEngine.test.ts packages/dashboard/__tests__/services/GeneratedClientAgentStore.test.ts`

Expected: PASS；输出中不出现真实密钥或占位 API Key。

### Task 2: 修复 daemon 正常执行生命周期

**Files:**

- Modify: `packages/core/src/agent/BaseAgent.ts`
- Modify: `packages/core/src/agent/__tests__/ClientAgent.test.ts`
- Modify: `packages/cli/src/commands/run.ts`
- Modify: `templates/base/src/main.ts.ejs`
- Modify: `packages/core/src/generator/TemplateEngine.ts`

- [ ] **Step 1: 写 daemon 执行回归测试**

在 `ClientAgent.test.ts` 增加：

```typescript
it('executes a remote task while daemon-running and restores daemon state', async () => {
  const agent = new ClientAgent(clientConfig);
  await agent.init();
  await agent.startDaemon();

  const result = await agent.execute({ type: 'chat', input: { message: 'hello' } });

  expect(result.success).toBe(true);
  expect(result.output.content).toBe('mock: {"message":"hello"}');
  expect(agent.status).toBe(AgentStatus.DAEMON_RUNNING);
});
```

- [ ] **Step 2: 运行测试确认生命周期失败**

Run: `pnpm exec vitest run packages/core/src/agent/__tests__/ClientAgent.test.ts -t "executes a remote task while daemon-running"`

Expected: FAIL with `UNEXPECTED_STATUS`，实际状态为 `daemon-running`。

- [ ] **Step 3: 让执行恢复进入前状态**

在 `BaseAgent.execute()` 进入 `RUNNING` 前保存状态，并仅接受 `READY`/`DAEMON_RUNNING`：

```typescript
const previousStatus = this.lifecycle.status;
if (previousStatus !== Status.READY && previousStatus !== Status.DAEMON_RUNNING) {
  throw new CoreError(
    'UNEXPECTED_STATUS',
    `Expected status ready or daemon-running but got ${previousStatus}`
  );
}
this.lifecycle.transition(Status.RUNNING);
```

Provider 正常返回并完成 after middleware 后执行：

```typescript
this.lifecycle.transition(
  previousStatus === Status.DAEMON_RUNNING ? Status.DAEMON_RUNNING : Status.READY
);
```

- [ ] **Step 4: 移除重复 daemon 启动**

从 `run.ts` 删除 `await agent.startDaemon()`；`AgentRuntimeClient.start()` 保持唯一启动者。文件模板和内联 `src/main.ts` 改为：

```typescript
async function main() {
  await agent.init();
  const hubUrl = process.env.AGENTFORGE_HUB_URL;
  const token = process.env.AGENTFORGE_HUB_TOKEN;

  if (hubUrl && token) {
    await connectToHub(agent, hubUrl, token);
    return;
  }

  await agent.startDaemon();
}
```

- [ ] **Step 5: 运行核心与 runtime-client 测试**

Run: `pnpm exec vitest run packages/core/src/agent/__tests__/ClientAgent.test.ts packages/runtime-client/__tests__/AgentRuntimeClient.test.ts`

Expected: PASS；daemon 远程执行后仍为 `DAEMON_RUNNING`，runtime-client 仍只调用一次自己的启动路径。

### Task 3: 让 CLI Token 管理走运行中 Hub

**Files:**

- Modify: `packages/cli/src/lib/hub-client.ts`
- Modify: `packages/cli/src/commands/dashboard.ts`
- Modify: `packages/cli/__tests__/cli.test.ts`

- [ ] **Step 1: 写 HubClient 请求契约测试**

在 `cli.test.ts` 使用 `vi.stubGlobal('fetch', vi.fn())`，分别断言：

```typescript
await client.createNodeToken({
  nodeName: 'golden-agent',
  nodeIds: ['golden-agent-a1b2c3d4'],
  expiresInHours: 24,
});
expect(fetch).toHaveBeenCalledWith(
  'http://127.0.0.1:8080/api/admin/tokens',
  expect.objectContaining({
    method: 'POST',
    headers: expect.objectContaining({ Authorization: 'Bearer admin-token' }),
  })
);
```

同时覆盖 `listNodeTokens()` 的 GET 和 `revokeNodeToken(tokenId)` 的 DELETE。

- [ ] **Step 2: 运行测试确认方法不存在**

Run: `pnpm exec vitest run packages/cli/__tests__/cli.test.ts`

Expected: FAIL；`HubClient` 尚无 Token 管理方法。

- [ ] **Step 3: 实现 Token HTTP 方法**

在 `HubClient` 增加精确签名：

```typescript
import type { CreateHubTokenResponse, HubToken } from '@agentforge/types';

async createNodeToken(body: {
  nodeName?: string;
  nodeIds?: string[];
  expiresInHours?: number;
}): Promise<CreateHubTokenResponse>

async listNodeTokens(): Promise<HubToken[]>

async revokeNodeToken(tokenId: string): Promise<{ success: boolean }>
```

三者分别调用 `/api/admin/tokens` 的 POST、GET、DELETE，并沿用现有 `headers()` 和非 2xx 立即抛错规则。

- [ ] **Step 4: 改造 dashboard token 命令参数**

三个子命令统一增加：

```typescript
.option('--hub <url>', 'Hub base URL', 'http://localhost:8080')
.option('--admin-token <token>', 'Hub admin token', process.env.AGENTFORGE_ADMIN_TOKEN)
```

`create` 再增加：

```typescript
.option('--node-id <id>', 'Restrict token to the generated ClientAgent id')
```

其 action 构造 `HubClient` 并调用：

```typescript
const response = await client.createNodeToken({
  nodeName: options.nodeName,
  nodeIds: options.nodeId ? [options.nodeId] : undefined,
  expiresInHours: Number(options.expiresIn),
});
console.log(JSON.stringify(response, null, 2));
```

移除三个子命令的 `--data-dir` 与直接 `TokenStore` 使用。

- [ ] **Step 5: 运行 CLI 单元测试与类型检查**

Run: `pnpm exec vitest run packages/cli/__tests__/cli.test.ts && pnpm --filter @agentforge/cli type-check`

Expected: 两条命令均以 0 退出；Token API URL、方法和管理员 Authorization 断言全部通过。

### Task 4: 让 CLI 构建产物携带真实模板

**Files:**

- Create: `packages/cli/scripts/copy-templates.mjs`
- Modify: `packages/core/src/generator/TemplateEngine.ts`
- Modify: `packages/core/src/generator/__tests__/TemplateEngine.test.ts`
- Modify: `packages/cli/src/lib/generator.ts`
- Modify: `packages/cli/package.json`
- Modify: `pnpm-workspace.yaml`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: 写显式模板根测试**

在 `TemplateEngine.test.ts` 用 `cp(join(repoRoot, 'templates'), tempTemplatesRoot, { recursive: true })` 把仓库模板复制到临时目录，然后：

```typescript
const engine = new TemplateEngine({ templatesRoot: tempTemplatesRoot });
const template = await engine.load('general');
expect(template.files['src/config.ts']).toContain('process.env.OPENAI_API_KEY');
expect(template.meta.id).toBe('general');
```

- [ ] **Step 2: 运行测试确认构造参数不支持**

Run: `pnpm exec vitest run packages/core/src/generator/__tests__/TemplateEngine.test.ts -t "explicit template root"`

Expected: FAIL；`TemplateEngine` 构造函数尚不接受 `templatesRoot`。

- [ ] **Step 3: 实现模板根注入**

增加：

```typescript
export interface TemplateEngineOptions {
  templatesRoot?: string;
}

export class TemplateEngine {
  private readonly baseTemplateDir: string;
  private readonly rolesTemplateDir: string;

  constructor(options: TemplateEngineOptions = {}) {
    const root = options.templatesRoot ?? join(resolveRepoRoot(), 'templates');
    this.baseTemplateDir = join(root, 'base');
    this.rolesTemplateDir = join(root, 'roles');
  }
}
```

默认根必须指向仓库 `templates` 目录；`load()` 和 `loadRoleMeta()` 只使用这两个实例字段。

- [ ] **Step 4: 编写构建后复制脚本**

`copy-templates.mjs` 只做一次确定性复制：

```javascript
import { cp, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cliDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(cliDir, '..', '..');
const source = join(repoRoot, 'templates');
const destination = join(cliDir, 'dist', 'templates');

await rm(destination, { recursive: true, force: true });
await cp(source, destination, { recursive: true });
```

CLI `createGenerator()` 使用：

```typescript
const templatesRoot = join(dirname(fileURLToPath(import.meta.url)), 'templates');
new TemplateEngine({ templatesRoot });
```

将 CLI build 脚本改为 `tsup && node scripts/copy-templates.mjs`。

- [ ] **Step 5: 纳入标准生成目录**

把 workspace 配置改为：

```yaml
packages:
  - 'packages/*'
  - 'client-agents/*'
```

Run: `pnpm install --lockfile-only`

Expected: PASS；`pnpm-lock.yaml` 出现 `client-agents/smoke-test-agent` importer，但不修改该 Agent 的任何源码或配置。

- [ ] **Step 6: 构建并检查产物**

Run: `pnpm --filter @agentforge/core build && pnpm --filter @agentforge/cli build && test -f packages/cli/dist/templates/base/src/config.ts.ejs && node packages/cli/dist/index.js create "A delivery test assistant" --name artifact-template-check --output "$(mktemp -d)/artifact-template-check"`

Expected: 退出码 0；输出包含 `Generated ClientAgent at`，`dist/templates/base/src/config.ts.ejs` 存在且生成命令没有使用内联缺省模板。

### Task 5: 建立可复用的 CLI 子进程驱动器

**Files:**

- Create: `packages/cli/vitest.e2e.config.ts`
- Create: `packages/cli/e2e/process-driver.ts`
- Modify: `packages/cli/package.json`

- [ ] **Step 1: 写驱动器类型与短命令实现**

实现以下公开接口：

```typescript
export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface RunningCommand {
  readonly stdout: string;
  readonly stderr: string;
  waitForOutput(text: string, timeoutMs?: number): Promise<void>;
  stop(signal?: NodeJS.Signals): Promise<CommandResult>;
}

export function runCli(
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv }
): Promise<CommandResult>;

export function startCli(
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv }
): RunningCommand;
```

二者都必须执行 `process.execPath` 与仓库绝对路径 `packages/cli/dist/index.js`，使用 `shell: false`，完整捕获 stdout/stderr。`waitForOutput` 仅等待指定启动文本；超时直接 reject。`stop()` 发送一次 `SIGTERM` 并等待退出，不发送第二信号。

- [ ] **Step 2: 实现隔离临时 workspace**

增加：

```typescript
export interface TempWorkspace {
  root: string;
  agentsDir: string;
  hubDataDir: string;
  cleanup(): Promise<void>;
}

export async function createTempWorkspace(): Promise<TempWorkspace>;
```

实现必须：

1. `mkdtemp(join(tmpdir(), 'agentforge-p0-'))`。
2. 写入只含 `packages/*`、`client-agents/*` 的 `pnpm-workspace.yaml`。
3. 复制根 `tsconfig.base.json`。
4. 对 `packages/types`、`packages/core`、`packages/runtime-client` 只复制各自 `package.json` 与已构建 `dist/`。
5. 建立空 `client-agents/` 与 `hub-data/`。
6. `cleanup()` 递归删除该临时根。

- [ ] **Step 3: 配置专用 Vitest 收集规则**

`vitest.e2e.config.ts` 内容：

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['e2e/**/*.e2e.ts'],
    testTimeout: 180_000,
    hookTimeout: 180_000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
```

- [ ] **Step 4: 增加包级脚本**

```json
{
  "test:artifact": "vitest run --config vitest.e2e.config.ts e2e/cli-artifact.e2e.ts",
  "test:golden": "vitest run --config vitest.e2e.config.ts e2e/golden-path.e2e.ts"
}
```

- [ ] **Step 5: 验证驱动器类型**

Run: `pnpm --filter @agentforge/cli type-check`

Expected: PASS；无未使用导出、ChildProcess 类型或信号类型错误。

### Task 6: 覆盖 CLI 构建产物正常路径

**Files:**

- Create: `packages/cli/e2e/cli-artifact.e2e.ts`
- Test: `packages/cli/e2e/process-driver.ts`

- [ ] **Step 1: 写 help/version 构建产物测试**

测试套件使用 `beforeAll(createTempWorkspace)`、`afterAll(cleanup)`，先断言：

```typescript
const help = await runCli(['--help'], ctx);
expect(help.exitCode).toBe(0);
expect(help.stdout).toContain('create');
const version = await runCli(['--version'], ctx);
expect(version).toMatchObject({ exitCode: 0 });
expect(version.stdout.trim()).toBe('0.0.0');
```

- [ ] **Step 2: 写 create 产物与凭据断言**

执行 create 时使用该套件固定且隔离的 `nodeId = 'artifact-node-id'`：

```typescript
[
  'create',
  'A deterministic delivery assistant',
  '--id',
  nodeId,
  '--name',
  'artifact-agent',
  '--model',
  'gpt-4o-mini',
  '--output',
  join(workspace.agentsDir, 'artifact-agent'),
];
```

断言退出码 0、12 个关键生成文件、`.agentforge/config.json` 中 `identity.id === nodeId`、配置含 `OPENAI_API_KEY` 且不含 `REPLACE_WITH_OPENAI_API_KEY`。

- [ ] **Step 3: 写 batch/list 文件命令测试**

写入以下 batch JSON 到临时目录：

```json
{
  "agents": [
    {
      "id": "batch-node-id",
      "name": "batch-agent",
      "description": "A deterministic batch delivery assistant",
      "templateId": "general",
      "model": "gpt-4o-mini",
      "output": "/absolute/temp/client-agents/batch-agent"
    }
  ]
}
```

执行 `batch <config-file>` 后断言 `batch-agent/src/config.ts` 存在；执行 `list --output json --path <agentsDir>` 后解析 JSON 并断言名称恰好包含 `artifact-agent` 与 `batch-agent`。

- [ ] **Step 4: 运行文件命令测试**

Run: `pnpm --filter @agentforge/cli test:artifact -t "file commands"`

Expected: PASS；所有命令的 `process.argv[1]` 都是 `packages/cli/dist/index.js`。

- [ ] **Step 5: 安装并构建生成项目**

在同一测试的文件命令阶段执行：

```typescript
const install = await runProcess('pnpm', ['install', '--frozen-lockfile=false'], {
  cwd: workspace.root,
});
expect(install.exitCode).toBe(0);

const build = await runProcess('pnpm', ['--filter', 'artifact-agent', 'build'], {
  cwd: workspace.root,
});
expect(build.exitCode).toBe(0);
expect(existsSync(join(agentDir, 'dist', 'agent.js'))).toBe(true);
```

`runProcess()` 与 `runCli()` 使用同一无 shell 子进程实现，不修改仓库 lockfile。

- [ ] **Step 6: 写 dashboard 启动与 Token 测试**

1. 以空闲端口启动 `dashboard --host 127.0.0.1 --port <port> --data-dir <hubDataDir>`，等待 `Capability Hub listening at`。
2. 使用 `dashboard token create --hub <httpUrl> --admin-token admin-token --node-name artifact-agent --node-id artifact-node-id`，解析 `token` 与 `tokenId`。
3. 对同一 Hub 执行 `dashboard token list`，断言返回记录包含 tokenId；测试末尾执行 revoke 并断言 success。

- [ ] **Step 7: 写 capability 正常路径测试**

写能力 JSON：

```json
{
  "id": "artifact-tool",
  "type": "tool",
  "name": "artifact-tool",
  "description": "Deterministic CLI artifact test capability",
  "riskLevel": "low"
}
```

执行 `capability install <file> --cache-dir <tempCache>` 并断言 `status: installed`；执行 `capability list --hub <httpUrl> --admin-token admin-token` 并断言返回空数组；对 `capability --help` 断言 publish/list/install/distribute 四个子命令均展示。

- [ ] **Step 8: 写 serve 长运行命令测试**

启动 `serve <agentDir> --host 127.0.0.1 --port <port>`，等待 `Debug server listening at`，请求一次 `/api/health` 并断言：

```typescript
expect(response.status).toBe(200);
expect(await response.json()).toEqual({ status: 'ok' });
```

随后发送 `SIGTERM` 并断言退出码 0。

- [ ] **Step 9: 写 run 与 Hub 节点测试**

以 `OPENAI_API_KEY=artifact-test-key` 启动：

```typescript
startCli(['run', agentDir, '--connect', wsUrl, '--token', token], {
  cwd: workspace.root,
  env: artifactEnv,
});
```

等待 `ClientAgent "artifact-agent" connected`，只请求一次 `/api/nodes` 并断言 `artifact-node-id` 状态为 `online`，再发送 `SIGTERM` 并断言退出码 0。不发送 execute 请求，因此不会调用外部 Provider。

- [ ] **Step 10: 运行完整构建产物测试**

Run: `pnpm run build && pnpm --filter @agentforge/cli test:artifact`

Expected: PASS；所有短命令退出码为 0，长命令各出现一次启动成功信号并经 `SIGTERM` 以 0 退出，Hub 节点列表包含在线生成 Agent。

### Task 7: 编排真实 Provider golden path

**Files:**

- Create: `packages/cli/e2e/golden-path.e2e.ts`

- [ ] **Step 1: 写凭据前置条件**

测试开头只读取、不打印：

```typescript
const openAiApiKey = process.env.OPENAI_API_KEY;
const adminToken = process.env.AGENTFORGE_ADMIN_TOKEN;
if (!openAiApiKey || !adminToken) {
  throw new Error('OPENAI_API_KEY and AGENTFORGE_ADMIN_TOKEN are required');
}
```

- [ ] **Step 2: 启动隔离 Hub**

创建临时 workspace，以 `AGENTFORGE_ADMIN_TOKEN=adminToken` 启动 CLI Dashboard：

```typescript
const workspace = await createTempWorkspace();
const hubProcess = startCli(
  [
    'dashboard',
    '--host',
    '127.0.0.1',
    '--port',
    String(hubPort),
    '--data-dir',
    workspace.hubDataDir,
  ],
  {
    cwd: workspace.root,
    env: { ...process.env, AGENTFORGE_ADMIN_TOKEN: adminToken },
  }
);
await hubProcess.waitForOutput('Capability Hub listening at');
```

- [ ] **Step 3: 通过 CLI 签发节点 Token**

执行：

```typescript
const tokenResult = await runCli(
  [
    'dashboard',
    'token',
    'create',
    '--hub',
    hubHttpUrl,
    '--admin-token',
    adminToken,
    '--node-name',
    'golden-agent',
  ],
  commandContext
);
const { token, nodeId } = JSON.parse(tokenResult.stdout) as CreateHubTokenResponse;
expect(tokenResult.exitCode).toBe(0);
expect(token).toMatch(/^aft_/);
expect(nodeId.length).toBeGreaterThan(0);
```

- [ ] **Step 4: 通过 CLI 生成绑定节点身份的 Agent**

执行 `create`：

```typescript
const createResult = await runCli(
  [
    'create',
    'A general delivery verification assistant',
    '--id',
    nodeId,
    '--name',
    'golden-agent',
    '--model',
    'gpt-4o-mini',
    '--output',
    goldenAgentDir,
  ],
  commandContext
);
expect(createResult.exitCode).toBe(0);
```

- [ ] **Step 5: 安装并构建新生成项目**

依次运行：

```typescript
expect(
  (
    await runProcess('pnpm', ['install', '--frozen-lockfile=false'], {
      cwd: workspace.root,
    })
  ).exitCode
).toBe(0);
expect(
  (
    await runProcess('pnpm', ['--filter', 'golden-agent', 'build'], {
      cwd: workspace.root,
    })
  ).exitCode
).toBe(0);
```

- [ ] **Step 6: 加载构建产物并核对身份**

```typescript
const generated = await import(pathToFileURL(join(goldenAgentDir, 'dist', 'agent.js')).href);
expect(generated.agent.id).toBe(nodeId);
expect(generated.agent.name).toBe('golden-agent');
```

- [ ] **Step 7: 通过 CLI 接入真实 Hub**

```typescript
const agentProcess = startCli(['run', goldenAgentDir, '--connect', hubWsUrl, '--token', token], {
  cwd: workspace.root,
  env: {
    ...process.env,
    OPENAI_API_KEY: openAiApiKey,
    AGENTFORGE_HUB_TOKEN: token,
  },
});
await agentProcess.waitForOutput('ClientAgent "golden-agent" connected');
```

- [ ] **Step 8: 从 Hub 下发真实任务**

用 `Authorization: Bearer <adminToken>` 向 `/api/nodes/<nodeId>/execute` POST：

```typescript
const response = await fetch(`${hubHttpUrl}/api/nodes/${encodeURIComponent(nodeId)}/execute`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${adminToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    type: 'chat',
    input: { message: 'Reply with exactly: AgentForge golden path OK' },
  }),
});
const result = (await response.json()) as AgentResult;
```

- [ ] **Step 9: 断言真实响应元数据**

解析 `AgentResult` 并断言：

```typescript
expect(response.status).toBe(200);
expect(result.success).toBe(true);
expect(result.output.content.trim().length).toBeGreaterThan(0);
expect(result.meta.model).toContain('gpt-4o-mini');
expect(result.meta.tokensUsed.total).toBeGreaterThan(0);
```

- [ ] **Step 10: 按正常生命周期关闭进程**

在 `afterAll` 中按 Agent、Hub、临时 workspace 的顺序执行：

```typescript
await agentProcess.stop('SIGTERM');
await hubProcess.stop('SIGTERM');
await workspace.cleanup();
```

- [ ] **Step 11: 确保失败路径立即终止且不泄露凭据**

所有 `expect` 失败直接使测试失败；不包裹重新执行循环。错误消息只包含阶段名、退出码和经过清理的 stderr，不拼接 `OPENAI_API_KEY`、`AGENTFORGE_HUB_TOKEN` 或 Token 创建 JSON stdout。

- [ ] **Step 12: 本地运行真实验收**

Run: `OPENAI_API_KEY="$OPENAI_API_KEY" AGENTFORGE_ADMIN_TOKEN="golden-admin-local" pnpm --filter @agentforge/cli test:golden`

Expected: PASS；测试报告显示 1 个 golden path 用例通过，Hub 返回模型名包含 `gpt-4o-mini` 且总 Token 数大于 0。

### Task 8: 增加根级双层测试入口

**Files:**

- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: 增加根脚本**

根 `package.json` 增加：

```json
{
  "test:cli": "pnpm --filter @agentforge/cli test:artifact",
  "test:golden": "pnpm --filter @agentforge/cli test:golden"
}
```

- [ ] **Step 2: 把确定性 CLI 测试放在 build 之后**

在 `lint-typecheck-test-build` job 的 `pnpm run build` 后增加：

```yaml
- run: pnpm run test:cli
  env:
    AGENTFORGE_ADMIN_TOKEN: artifact-admin-token
```

不得向该 job 添加 `OPENAI_API_KEY`；该 job 不执行 `test:golden`。

- [ ] **Step 3: 验证 PR 层入口**

Run: `pnpm run build && pnpm run test:cli`

Expected: PASS；无需 OpenAI 凭据，命令级测试全部来自 CLI 构建产物。

### Task 9: 增加受保护的真实验收工作流

**Files:**

- Create: `.github/workflows/golden-path.yml`

- [ ] **Step 1: 编写人工与发布触发器**

工作流使用：

```yaml
name: Golden Path

on:
  workflow_dispatch:
  release:
    types: [published]

jobs:
  golden-path:
    runs-on: ubuntu-latest
    environment: golden-path
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 8
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm run build
      - run: pnpm run test:golden
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          AGENTFORGE_ADMIN_TOKEN: golden-admin-${{ github.run_id }}
```

节点 Token 由测试通过 CLI 实时签发并仅传给 Agent 子进程，不配置为仓库 secret，也不上传测试临时目录或日志 artifact。

- [ ] **Step 2: 静态检查工作流入口**

Run: `pnpm exec prettier --check .github/workflows/ci.yml .github/workflows/golden-path.yml package.json`

Expected: PASS；`ci.yml` 只有确定性入口，`golden-path.yml` 只有人工/发布入口。

### Task 10: 让文档示例复用已验证流程

**Files:**

- Modify: `README.md`
- Modify: `docs/ops/GUIDE.md`
- Modify: `docs/ops/TEST.md`

- [ ] **Step 1: 更新 README 最短成功路径**

示例必须按自动验收顺序展示：

```bash
pnpm install --frozen-lockfile
pnpm run build

export AGENTFORGE_ADMIN_TOKEN="local-admin-token"
export OPENAI_API_KEY="sk-..."

node packages/cli/dist/index.js dashboard --host 127.0.0.1 --port 8080
node packages/cli/dist/index.js dashboard token create \
  --hub http://127.0.0.1:8080 \
  --admin-token "$AGENTFORGE_ADMIN_TOKEN" \
  --node-name golden-agent

node packages/cli/dist/index.js create \
  "A general delivery verification assistant" \
  --id "<nodeId from token create>" \
  --name golden-agent \
  --model gpt-4o-mini

pnpm install
pnpm --filter golden-agent build
export AGENTFORGE_HUB_TOKEN="<token from token create>"
node packages/cli/dist/index.js run ./client-agents/golden-agent \
  --connect ws://127.0.0.1:8080
```

同时给出带管理员 Authorization 的 `/api/nodes/<nodeId>/execute` curl 请求。

- [ ] **Step 2: 修正 GUIDE 的命令和环境变量**

必须完成以下一致性修改：

- `AGENTFORGE_NODE_TOKEN` 全部改为 `AGENTFORGE_HUB_TOKEN`。
- `dashboard token create/list/revoke` 使用 `--hub` 与 `--admin-token`，`create` 解释 `--node-id`。
- `create` 文档增加 `--id`，默认模型改为 `gpt-4o-mini`。
- 快速开始先启动 Hub、签发 Token，再用返回 `nodeId` 生成 Agent。
- 环境变量表明确 `OPENAI_API_KEY` 只在生成 Agent 运行时读取，不写入生成文件。
- 删除“命令尚未实现”的过期警告，保留文档元信息。

- [ ] **Step 3: 重写 TEST 的三层测试说明**

明确列出：

```text
pnpm run test:e2e     # Dashboard + Mock Runtime UI 行为，不证明真实 Provider
pnpm run test:cli     # PR 门禁：构建产物级 CLI 正常路径，不调用外部 Provider
pnpm run test:golden  # 人工/发布：真实 Hub + 生成产物 + OpenAI
```

删除不存在的根 `tests/e2e/cli-flow.test.ts`、`tests/e2e/capability-hub.test.ts` 示例，改为实际 `packages/dashboard/e2e/business-flow.spec.ts`、`packages/cli/e2e/cli-artifact.e2e.ts`、`packages/cli/e2e/golden-path.e2e.ts`。

- [ ] **Step 4: 检查文档命名与命令**

Run: `rg -n "AGENTFORGE_NODE_TOKEN|REPLACE_WITH_OPENAI_API_KEY|tests/e2e/cli-flow|命令与 API 尚未实现" README.md docs/ops/GUIDE.md docs/ops/TEST.md`

Expected: 无输出，退出码 1（表示未找到任何过期口径）。

Run: `pnpm exec prettier --check README.md docs/ops/GUIDE.md docs/ops/TEST.md`

Expected: PASS。

### Task 11: 全量验收与交付审查

**Files:**

- Verify: `packages/core/src/**`
- Verify: `packages/cli/src/**`
- Verify: `packages/cli/e2e/**`
- Verify: `templates/base/**`
- Verify: `packages/dashboard/server/**`
- Verify: `.github/workflows/**`
- Verify: `README.md`
- Verify: `docs/ops/GUIDE.md`
- Verify: `docs/ops/TEST.md`

- [ ] **Step 1: 运行静态与单元门禁**

Run: `pnpm run lint && pnpm run type-check && pnpm run test && pnpm run test:coverage`

Expected: 四条命令全部以 0 退出，覆盖率不低于仓库配置阈值。

- [ ] **Step 2: 运行构建与确定性 CLI 门禁**

Run: `pnpm run build && pnpm run test:cli`

Expected: PASS；不需要 `OPENAI_API_KEY`，CLI 所有正常路径来自 `packages/cli/dist/index.js`。

- [ ] **Step 3: 在有受保护凭据时运行真实验收**

Run: `OPENAI_API_KEY="$OPENAI_API_KEY" AGENTFORGE_ADMIN_TOKEN="golden-admin-local" pnpm run test:golden`

Expected: PASS；响应非空、模型包含 `gpt-4o-mini`、`tokensUsed.total > 0`。

- [ ] **Step 4: 扫描凭据、占位符和禁止设计**

Run: `rg -n "REPLACE_WITH_OPENAI_API_KEY|AGENTFORGE_NODE_TOKEN|T[B]D|T[O]DO|fallback provider|backup provider|circuit breaker" packages/cli packages/core templates README.md docs/ops .github/workflows`

Expected: 与本次范围相关的新旧命名、占位密钥和备用执行设计均无匹配；若仓库既有注释出现无关匹配，只核对并报告，不做范围外清理。

- [ ] **Step 5: 核对工作区并保留用户改动**

Run: `git status --short && git diff --check`

Expected: `git diff --check` 退出码 0；状态中只新增/修改计划列出的文件，原有未提交改动保持存在，没有 stash、reset、checkout 或 commit 产生。

## 需求覆盖索引

- CLI 构建产物级测试：Tasks 4–6、8。
- 模板运行时 `OPENAI_API_KEY` 注入：Task 1。
- `AGENTFORGE_HUB_TOKEN` 统一：Tasks 1、7、10。
- 真实 golden path：Tasks 2、3、7。
- 文档可复制示例：Task 10。
- CI 双层入口：Tasks 8–9。
- 无重试、降级、熔断、备用 Provider：实施边界、Task 7。
- 未提交工作区保护与不创建提交：实施边界、Task 11。
