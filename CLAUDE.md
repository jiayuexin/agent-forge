# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

```bash
pnpm build          # Build all packages (tsup for backend, vite for dashboard)
pnpm test           # Run tests (vitest)
pnpm test:watch     # Watch mode
pnpm typecheck      # Type-check all packages (tsc --noEmit)
pnpm lint           # ESLint across packages/*/src
pnpm clean          # Remove all dist/ directories

# Single package
pnpm --filter @agentforge/core build
pnpm --filter @agentforge/types typecheck

# Run a single test file
pnpm vitest run packages/core/src/agent/__tests__/BaseAgent.test.ts
```

Engine: Node >= 18, pnpm >= 8 (pinned to 8.6.12).

## Architecture

AgentForge is an AI Agent framework that generates runnable Agent npm packages from natural language descriptions. It's a pnpm monorepo with this dependency graph:

```
types (leaf) → core → sdk → http-server → cli
                                     ↑       |
                                     +-------+
dashboard (standalone React app)
```

**Build order matters**: types must build before core, core before sdk, etc.

| Package | Purpose |
|---|---|
| `@agentforge/types` | Pure type definitions, zero runtime deps. Authority for all shared interfaces. |
| `@agentforge/core` | BaseAgent, state machine, Provider adapters (OpenAI/Anthropic/Ollama), Plugin system, code generation engine |
| `@agentforge/sdk` | AgentFramework orchestrator, Pipeline (serial/parallel/branch/backtrack/fork), EventBus, ModelRegistry |
| `@agentforge/http-server` | Express + WebSocket server: Agent HTTP self-service, Dashboard backend API, node registration/heartbeat |
| `@agentforge/cli` | Commander-based CLI: create, batch, serve, list, run, dashboard |
| `@agentforge/dashboard` | React 18 + Ant Design 5 + TailwindCSS 4 + Zustand + Monaco Editor + ECharts |

Generated agents are standalone npm packages (`agent-<role>` pattern) depending only on `@agentforge/core` + one Provider SDK.

## Key Conventions

- **Tool names**: kebab-case (`query-order`, `create-refund`, `send-notification`)
- **Agent package names**: `agent-<role>` (e.g., `agent-customer-service`)
- **CLI binary**: `agentforge` (= `npx @agentforge/cli`)
- **API paths**: All start with `/api/` prefix
- **Agent events**: Colon-separated (`agent:init`, `agent:tool:call`, `agent:llm:chunk`)
- **JSONSchema**: Spelled `JSONSchema` (not `JsonSchema`)
- **`Agent`** (capital) = class/interface/type; **`agent`** (lowercase) = instance
- **`API Key`** in prose, **`apiKey`** in code

## Type Authority

`docs/01-核心设计.md` is the **sole authoritative source** for all core type definitions (§1.1–§1.11). Other docs reference it; they never redeclare types. When implementing `@agentforge/types`, transcribe definitions directly from this document with `@see docs/01-核心设计.md §1.x` JSDoc comments.

## Key Design Decisions

- **No database in v1**: All storage is file-based (`.agentforge.json`) or in-memory. No SQLite/Redis.
- **IProvider adapter pattern**: Each LLM provider implements `IProvider` with bidirectional tool call format mapping (OpenAI function calling ↔ Anthropic tool_use ↔ Ollama passthrough).
- **Pipeline control signals**: Agents can emit `back`/`jump`/`fork`/`pause`/`stop`/`replace` signals. Backtracking uses `ISnapshotable` snapshot/restore. Max backtracks configurable (default 5).
- **ModelRegistry**: Agents reference models by name; the registry auto-routes to registered endpoints.
- **Generated agent constraint**: Core deps ≤ 2 (`@agentforge/core` + one Provider SDK as peerDep).

## Progress Tracking

`PROGRESS.md` at repo root is the single source of truth for development progress. Each session must:
1. Read `PROGRESS.md` to find current task
2. Work from the first unchecked `- [ ]` item
3. Check off items as completed
4. Update the overview table, "最后更新", "下一步", and development log before ending

Git tags per milestone: `m0-init`, `m1-types`, `m2-core`, `m3-sdk`, etc.

## Docs Structure

```
docs/
├── README.md           # Project overview + doc index
├── PRD.md              # Problem statement, goals, non-goals (slim)
├── TECH-DESIGN.md      # Full technical spec (20 chapters)
├── 01-核心设计.md       # TYPE AUTHORITY — all interfaces
├── 02-单个Agent功能.md  # 10 capabilities of a single agent
├── 03-生成引擎.md       # 8-stage generation pipeline
├── 04-集成与编排.md     # Integration modes + Pipeline/EventBus/DirectCall
├── 05-CLI与API.md      # CLI commands + HTTP/WebSocket API spec
├── 06-可视化面板.md     # Dashboard pages, debug playground, monitoring
├── 07-技术选型与架构.md # Dep table, monorepo layout, naming conventions
├── 08-需求与路线图.md   # US1-US17, R1-R21, success metrics, 5-phase roadmap
└── 附录-生成示例.md     # Generated agent code example
```
