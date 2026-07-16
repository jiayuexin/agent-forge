# 黄金路径演示（5 分钟）

证明：本地安装能力后，可通过 `CapabilityCache` + `CachedCapabilitySource` **真实执行 Tool**。

本路径**不需要** Capability Hub、OpenAI API Key。完整 create → Hub → 下发见下方「扩展路径」。

## 前置

```bash
# 在仓库根目录
pnpm install
pnpm build
```

## 5 分钟本地演示

```bash
# 方式 A：直接跑脚本
node examples/golden-path/run-local.mjs

# 方式 B：回归测试（CI 也会跑）
pnpm demo:golden-path
# 或
pnpm vitest run examples/golden-path/golden-path.test.ts
```

成功时 stdout 含：

```text
tool result: {"result":{"stdout":"hello-agentforge\n","stderr":""}}
GOLDEN_PATH_OK
```

脚本做了什么：

1. 读取 `fixtures/tool-echo.json`（`local-command` → `echo hello-agentforge`）
2. `CapabilityCache.install` 写入临时缓存
3. 重启加载缓存后，用 `createRuntimeToolAdapters` + `CachedCapabilitySource.executeCapability` 执行
4. 断言结果后打印 `GOLDEN_PATH_OK`（失败立即 exit 1，无重试）

## Skill / Plugin

| 能力   | 本示例                           | 如何验证                                                                                                    |
| ------ | -------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Tool   | ✅ `tool-echo`                   | 上方命令                                                                                                    |
| Skill  | 需模型驱动的 `executeScopedTask` | 见 `packages/runtime-client/__tests__/CapabilityExecution.test.ts`（mock agent）或 Hub Playground + API Key |
| Plugin | 需签名 WASM + trust key          | 同上测试文件中的 `count-vowels` WASI 用例；生产路径经 Hub 下发                                              |

## 扩展路径：create → Hub → 下发

需两个终端，且已 `pnpm build` 后可用 `pnpm --filter @agentforge/cli exec agentforge …`（或全局 link CLI）。

```bash
# 终端 1 — Capability Hub
export AGENTFORGE_ADMIN_TOKEN=admin-demo
pnpm --filter @agentforge/cli exec agentforge dashboard --port 8080

# 终端 2 — 生成并连接 ClientAgent（需节点 Token；按 GUIDE 用 dashboard token 签发）
export OPENAI_API_KEY=sk-...
export AGENTFORGE_HUB_TOKEN=<node-token>
pnpm --filter @agentforge/cli exec agentforge create "本地演示助手" -n golden-demo
pnpm --filter @agentforge/cli exec agentforge capability publish \
  examples/golden-path/fixtures/tool-echo.json \
  --admin-token "$AGENTFORGE_ADMIN_TOKEN"
pnpm --filter @agentforge/cli exec agentforge run ./client-agents/golden-demo \
  --connect ws://localhost:8080 \
  --token "$AGENTFORGE_HUB_TOKEN"
# 另开终端：按节点 id 下发
pnpm --filter @agentforge/cli exec agentforge capability distribute tool:echo \
  --node <node-id> \
  --admin-token "$AGENTFORGE_ADMIN_TOKEN"
```

细节（Token、安全配置）见 [docs/ops/GUIDE.md](../../docs/ops/GUIDE.md)。
