# AgentForge

AgentForge 是一个**客户端 Agent 应用平台**：从岗位描述生成可本地运行的 **ClientAgent**，并通过 **Capability Hub** 集中管理其能力、远程下发任务与监控运行状态。也支持开发者通过 SDK 编排 **StatelessAgent** 并与 ClientAgent 协同。

**当前阶段**：单实例自托管产品化整改中。核心平台（Phase 0–12）已实现；Hub 使用 SQLite 持久化，HTTP API 以 `/api/v1` 为正式契约。完整文档见 [docs/README.md](docs/README.md)，实现与验证状态见 [docs/STATUS.md](docs/STATUS.md)。

**发布边界**

- 目标形态：单团队、单 Hub 实例、可自托管。
- 暂不提供：多租户 SaaS、多实例 Hub、微服务拆分、Kubernetes HPA。
- npm 范围：工作区包名为 `@agentforge/*`。`@agentforge/core` 与 `@agentforge/cli` 在 npmjs 上可能已被占用，公开发布前需确认 scope 或使用 `publishConfig`。

## 5 分钟黄金路径

本地安装并执行 Tool（无需 Hub / API Key）：

```bash
pnpm install && pnpm build
node examples/golden-path/run-local.mjs
# 成功输出含 GOLDEN_PATH_OK
```

说明与 create → Hub → 下发扩展路径见 [examples/golden-path/README.md](examples/golden-path/README.md)。

离线能力（US8）：`node examples/golden-path/run-offline.mjs`（Hub 不可达时仍执行已缓存 Tool，成功输出含 `OFFLINE_CAPABILITY_OK`）。

## 自托管 Hub

```bash
export AGENTFORGE_ADMIN_TOKEN=replace-me
pnpm --filter @agentforge/cli exec node dist/index.js dashboard --port 8080 --host 127.0.0.1
```

或使用 Docker Compose：

```bash
export AGENTFORGE_ADMIN_TOKEN=replace-me
docker compose up --build
curl -fsS http://127.0.0.1:8080/api/v1/health
```

数据目录默认为 `AGENTFORGE_DATA_DIR`（Compose 中为 `/data`）。备份：

```bash
agentforge dashboard backup --out ./hub-backup.sqlite --data-dir .agentforge/hub
agentforge dashboard restore --from ./hub-backup.sqlite --data-dir .agentforge/hub
```

## 文档三层结构

| 层级              | 目录                           | 回答的问题                         |
| ----------------- | ------------------------------ | ---------------------------------- |
| 第一层 · 产品需求 | [docs/product/](docs/product/) | 做什么、为什么、优先级与路线图     |
| 第二层 · 设计规格 | [docs/design/](docs/design/)   | 怎么设计、接口是什么、模块如何协作 |
| 第三层 · 操作手册 | [docs/ops/](docs/ops/)         | 怎么用、怎么部署、怎么测           |

## 快速入口

- [文档导航](docs/README.md)
- [文档状态总表](docs/STATUS.md)
- [产品需求（PRD）](docs/product/PRD.md)
- [技术设计总览](docs/design/TECH-DESIGN.md)
- [部署手册](docs/ops/DEPLOY.md)
- [测试手册](docs/ops/TEST.md)

## 技术栈

Node.js ≥ 22 · TypeScript · pnpm Monorepo · React Dashboard · SQLite（`node:sqlite`）
