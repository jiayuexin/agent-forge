# AgentForge 测试文档

> **文档层级**: 第三层 · 操作手册
> **文档类型**: 测试策略
> **文档状态**: 已定稿
> **文档版本**: docs-v0.7
> **最后更新**: 2026-08-13
> **实现状态**: 已实现

## 测试总览

AgentForge 使用 **Vitest** 作为单元/集成测试框架，**Playwright** 作为 Dashboard E2E 框架。

| 统计项            | 数值                                                          |
| ----------------- | ------------------------------------------------------------- |
| 单元/集成测试框架 | Vitest ^2.0                                                   |
| E2E 测试框架      | Playwright                                                    |
| 覆盖率目标        | 全局 statements/branches/functions/lines ≥ 80%                |
| 覆盖包            | core、sdk、runtime-client、http-server、dashboard/server、cli |
| 不计入全局分母    | `packages/dashboard/src/**`、`examples/**`                    |

### 测试分层

| 层级     | 覆盖范围                                                            | 工具       | 门禁              |
| -------- | ------------------------------------------------------------------- | ---------- | ----------------- |
| 单元测试 | core/sdk/runtime/http-server/Hub 服务端                             | Vitest     | `pnpm test`       |
| 集成测试 | Hub 协议、RBAC、SQLite、CLI create/run                              | Vitest     | `pnpm test`       |
| E2E 测试 | Dashboard 页面、真实 ClientAgent、Token、能力、远程执行、审计、重连 | Playwright | `pnpm test:e2e`   |
| Live API | OpenAI/Anthropic 合同测试                                           | Vitest     | 仅当 API Key 存在 |

## 快速开始

```bash
pnpm test
pnpm test:coverage
pnpm test:e2e
```

### 关键测试路径（实际存在）

```bash
pnpm vitest run packages/dashboard/__tests__/server/auth-rbac.test.ts
pnpm vitest run packages/dashboard/__tests__/server/protocol.test.ts
pnpm vitest run packages/dashboard/__tests__/server/sqlite.test.ts
pnpm vitest run packages/dashboard/__tests__/server/openapi.test.ts
pnpm vitest run packages/dashboard/__tests__/server/websocket.test.ts
pnpm vitest run packages/cli/__tests__/create-run.integration.test.ts
pnpm vitest run packages/core/src/security/__tests__/security.test.ts
pnpm vitest run packages/core/src/provider/__tests__/live-contract.test.ts
```

仓库中**没有** `tests/integration/` 目录。

### Provider live contract

设置 `OPENAI_API_KEY` 或 `ANTHROPIC_API_KEY` 后，`live-contract.test.ts` 会调用真实 API。未设置时自动 skip，不阻塞 PR。
