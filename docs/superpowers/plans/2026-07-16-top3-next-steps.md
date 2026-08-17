# AgentForge Top 3 下一步 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在能力执行闭环已落地的基础上，交付可演示黄金路径、稳定 CI（含 `dev` + Playwright + 能力回归），并完成 npm 独立包发布就绪（dry-run 即可）。

**Architecture:** 不重做五类 Capability 执行内核；以仓库内 `examples/golden-path/` 演示「安装 → 执行」最小闭环，文档指向 create → Hub → 下发完整路径。CI 扩展触发分支并补回归门禁。发布侧统一去 `private: true` 策略、版本与 publish workflow。

**Tech Stack:** TypeScript 5.4、Node.js 20、pnpm workspace、Vitest 2、Playwright、GitHub Actions、现有 `@agentforge/runtime-client`（CapabilityCache / CachedCapabilitySource）

---

## Top 3 一览与顺序依赖

| 序号 | 目标                                                      | 依赖                                  | 本轮状态                          |
| ---- | --------------------------------------------------------- | ------------------------------------- | --------------------------------- |
| 1    | 黄金路径可演示包（`examples/` + README/GUIDE 5 分钟入口） | 能力执行闭环 `3f8383e` 已完成         | **已完成（已合入 `dev`，PR #3）** |
| 2    | CI 覆盖 `dev` + Playwright 稳定 + 能力执行回归            | 第 1 项提供可回归的 example 测试更佳  | **已完成（已合入 `dev`，PR #3）** |
| 3    | npm 独立包发布就绪（去 private、版本、publish dry-run）   | 与 1/2 弱依赖；可并行但建议 CI 稳定后 | **已完成（已合入 `dev`，PR #3）** |

## 不做清单（全 Top 3 共用）

- 不重复实现 Tool / Skill / Plugin / Agent / Remote-Agent 执行内核。
- 不主动加降级、容错、重试、熔断或备用 Provider。
- 不强制本轮真实发布到 npm（就绪 / dry-run 即可）。
- 不修改 `client-agents/smoke-test-agent`。
- 不 push 远程、不主动 commit（除非用户另行要求）。
- 不把 OpenAI 真实调用作为 5 分钟演示的硬依赖（Tool / Plugin 本地可证即可；Skill / create→Hub 路径用文档 + 可选步骤说明）。

## 验收标准（总）

1. **黄金路径**：新人按 README/GUIDE 入口，≤ 5 分钟在仓库内跑通「安装能力 → 执行 Tool（至少）」；可选覆盖 Plugin 或文档说明 Skill/Hub。
2. **CI**：`dev` 与 `main` 的 PR/push 触发 lint/typecheck/test/build；Playwright E2E 稳定可跑；能力执行相关回归进入门禁，避免闭环静默回退。
3. **发布就绪**：各可发布包有明确版本策略与 publish workflow（至少 dry-run）；根包可保持 private。

---

## 文件清单（第 1 项）

### 新增

- `examples/golden-path/README.md`：5 分钟本地演示 + create→Hub→下发扩展路径
- `examples/golden-path/fixtures/tool-echo.json`：`local-command` Tool（`echo`）
- `examples/golden-path/run-local.mjs`：安装 fixture → `CachedCapabilitySource.executeCapability` → 打印结果并 exit 0/1
- `examples/golden-path/golden-path.test.ts`：TDD 回归（子进程跑 `run-local.mjs`，断言成功输出）

### 修改

- `README.md`：增加「5 分钟黄金路径」入口链接
- `docs/ops/GUIDE.md`：快速开始增加指向 `examples/golden-path`
- `package.json`：增加 `demo:golden-path` 脚本（可选，便于发现）

---

## Task 1: 黄金路径 — 失败测试先行

**Files:**

- Create: `examples/golden-path/golden-path.test.ts`

- [x] **Step 1: 写失败测试**

测试以子进程执行 `node examples/golden-path/run-local.mjs`，期望：

- exit code `0`
- stdout 含 `GOLDEN_PATH_OK`
- stdout 含 Tool 执行结果片段（如 `hello-agentforge`）

- [x] **Step 2: 跑测试确认失败**

```bash
pnpm vitest run examples/golden-path/golden-path.test.ts
```

Expected: FAIL（`run-local.mjs` 尚不存在或 exit ≠ 0）— 已验证 RED

- [x] **Step 3: 实现 fixture + runner（最小正常路径）**

`fixtures/tool-echo.json`：`type: tool`，`endpointType: local-command`，`endpoint.target: echo hello-agentforge`。

`run-local.mjs`：已实现。

- [x] **Step 4: 跑测试确认通过** — PASS

- [x] **Step 5: 更新文档入口** — README + GUIDE + example README 已更新

**第 1 项验收：**

- [x] 仓库内可跑通 Tool 安装与执行
- [x] README/GUIDE 有 5 分钟入口
- [x] 相关 vitest 通过
- [x] `pnpm demo:golden-path` / `node examples/golden-path/run-local.mjs` 可用

---

## Task 2: CI 覆盖 `dev` + Playwright + 能力回归

**Files:**

- Modify: `.github/workflows/ci.yml`
- Possibly: `packages/dashboard` Playwright 配置 / flaky specs
- Modify: 根或包级 test 脚本，确保 `examples/golden-path` 与 `CapabilityExecution` 在 `pnpm test` 或显式 CI 步骤中执行

**拆分：**

1. [x] `on.pull_request` / `on.push` 增加 `dev`（保留 `main`）
2. [x] E2E job：对 `main`/`dev` 的 PR 与 push 均跑；修 Dashboard Playwright（端口一致、teardown 误杀、UI 断言、letter-spacing 按钮名、能力表单必填字段、隔离 data dir）
3. [x] 门禁：`CapabilityExecution.test.ts` + `examples/golden-path/golden-path.test.ts` 已在 `vitest.workspace` / `pnpm test` 路径内

**验收：**

- [x] `dev` 上 PR/push 触发 CI
- [x] Playwright 本地 Node 20：`12 passed`
- [x] 能力执行 / golden-path 失败会导致 `pnpm test` / CI 红

**不做：** 把真实 OpenAI golden-path 强制进每 PR（可保留 workflow_dispatch）

---

## Task 3: npm 独立包发布就绪

**Files:**

- Modify: 各 `packages/*/package.json`（`private`、`version`、`files`、`publishConfig`）
- Create: `.github/workflows/publish.yml`（`workflow_dispatch` + dry-run / npm publish）
- Possibly: `docs/ops/DEPLOY.md` 或简短发布说明

**拆分：**

1. [x] 根 `@agentforge/root` 保持 `private: true`；可发布包去掉 `private`，加 `publishConfig.access: public`
2. [x] 统一 `0.1.0` 与 `files: ["dist"]`
3. [x] `pnpm publish:dry-run` / workflow dry-run
4. [x] 真实 publish 需 `NPM_TOKEN`；无 token 时仅 dry-run

**验收：**

- [x] dry-run 通过（本地 `pnpm publish:dry-run`）
- [x] 文档说明发布顺序（types → core → …）见 `docs/ops/DEPLOY.md`

**阻塞（真实发布）：** npmjs 上 `@agentforge/core` / `@agentforge/cli` 已被第三方占用；本轮 dry-run 对这两包以 `npm pack --dry-run` 验收，publish dry-run 排除之。

**不做：** 本轮必须真发到 npm

---

## 实施顺序（本会话）

1. Task 1 全部步骤（TDD）← 已完成
2. Task 2 ← **已完成**
3. Task 3 ← **已完成**

## 验证命令（本轮第 1 项）

```bash
pnpm build
pnpm vitest run examples/golden-path/golden-path.test.ts
node examples/golden-path/run-local.mjs
```

Expected: build 成功；测试 PASS；脚本打印 `GOLDEN_PATH_OK` 且 exit 0
