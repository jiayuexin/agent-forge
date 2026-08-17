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

## US8 离线能力验收（断 Hub）

证明：Hub 不可达且 runtime **未连接**时，已缓存 Tool 仍可通过 `AgentRuntimeClient.executeCapability`（内部 `CachedCapabilitySource`）执行。

```bash
node examples/golden-path/run-offline.mjs
# 或随 golden-path Vitest 一并回归
pnpm vitest run examples/golden-path/golden-path.test.ts
```

成功时 stdout 含：

```text
HUB_UNREACHABLE 127.0.0.1:1
RUNTIME_NOT_CONNECTED status=disconnected
tool result: {"result":{"stdout":"hello-agentforge\n","stderr":""}}
OFFLINE_CAPABILITY_OK
```

脚本做了什么：

1. TCP 探测确认 Hub 端口不可达（无降级、无重试）
2. 将 `tool-echo` 写入本地缓存（模拟此前已从 Hub 下发）
3. `AgentRuntimeClient.start()` 因 Hub 不可达失败；`status !== connected`
4. 在未连接状态下执行缓存 Tool，打印 `OFFLINE_CAPABILITY_OK`

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
