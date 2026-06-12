# AgentForge 开发进度

> 最后更新: 2026-06-12
> 当前阶段: M-7 集成+CI+发布
> 下一步: E2E测试 + GitHub Actions + Docker

---

## 进度总览

| 阶段 | 状态 | 开始日期 | 完成日期 | 备注 |
|---|---|---|---|---|
| D-1 ~ D-8 文档整改 | ✅ 完成 | 2026-06-12 | 2026-06-12 | 60个问题全部修复 |
| M-0 项目初始化 | ✅ 完成 | 2026-06-12 | 2026-06-12 | git+pnpm+6包骨架+CLAUDE.md |
| M-1 types 包 | ✅ 完成 | 2026-06-12 | 2026-06-12 | 10个类型文件, 53个定义, 17.5KB d.ts |
| M-2 core 包 | ✅ 完成 | 2026-06-12 | 2026-06-12 | BaseAgent+3Providers+Plugin+Generator, 44测试 |
| M-3 sdk 包 | ✅ 完成 | 2026-06-12 | 2026-06-12 | Framework+Pipeline+EventBus, 31测试 |
| M-4 cli 包 | ✅ 完成 | 2026-06-12 | 2026-06-12 | 6个CLI命令 |
| M-5 http-server 包 | ✅ 完成 | 2026-06-12 | 2026-06-12 | Express+WebSocket, Dashboard API |
| M-6 dashboard 包 | ✅ 完成 | 2026-06-12 | 2026-06-12 | React 5页面, AntD5+TW4 |
| M-7 集成+CI+发布 | 🔵 进行中 | 2026-06-12 | - | E2E+CI+Docker done; npm publish + MCP 待定 |

图例: ⬜未开始 🔵进行中 ✅完成 ❌阻塞

---

## D-1 补全 01-核心设计.md 类型定义

**状态**: ✅ 完成

### 检查清单

- [x] 权威声明(已加在文档顶部)
- [x] AgentEvent 类型定义
- [x] EventHandler 类型定义
- [x] AgentStreamChunk 类型定义
- [x] §1.10 IProvider + ChatParams/ChatResponse/ChatChunk/ToolCallRequest
- [x] §1.11 FrameworkConfig/StepOptions/ParallelStep/InterceptorHandler/ForkBranch
- [x] §1.2 补 ToolDefinition
- [x] §1.2 补 MiddlewareConfig
- [x] §1.3 补 Message
- [x] §1.5 补 Artifact
- [x] §1.5 补 ToolCallRecord
- [x] §1.5 补 AgentMetrics
- [x] §1.6 补 Logger
- [x] §1.9 JSONSchema 拼写统一
- [x] §1.10 补 Provider Tool Call 格式适配说明

### 验证
- [x] 01-核心设计.md 中所有列在权威声明中的类型都有 interface/type 定义
- [x] `grep -c "interface\|type " 01-核心设计.md` = 53 (≥ 40 ✅)
- [x] JSONSchema 拼写统一(无旧拼写 JsonSchema 残留)

---

## D-2 修复 04-集成与编排.md
**状态**: ✅ 完成
- [x] 5.7 → 5.8 重编号
- [x] 删除草稿注释
- [x] 加导航提示

## D-3 同步去重
**状态**: ✅ 完成
- [x] 04 Pipeline 类型改为引用 01
- [x] TECH-DESIGN Pipeline 类型改为引用 01
- [x] 06 Debug API 合并到 05
- [x] TECH-DESIGN §7.2 加交叉引用

## D-4 统一跨文档数值与命名
**状态**: ✅ 完成
- [x] 端口统一(3001/8080) — 05-CLI 4 处修改
- [x] API 路径统一(/api 前缀) — 待 D-8 最终验证
- [x] CLI 命令统一(5+1) — 05-CLI 加包名说明
- [x] 依赖数统一(≤2/≤5 双轨) — README/07/PRD/TECH-DESIGN 对齐
- [x] 工具名 kebab-case — 02/06/附录/03 全部修正
- [x] 包名 agent-<role> — 06 修正
- [x] UI 库 AntD5+TW4 — 06/TECH-DESIGN 对齐
- [x] 版本号 v1.5 — PRD/TECH-DESIGN 对齐
- [x] Anthropic 模型名注释 — 01 加环境变量说明

## D-5 合并 PRD 与 08
**状态**: ✅ 完成
- [x] PRD 瘦身(370→118行,保留 §1/§2/§3/开放问题/附录)
- [x] 08 充实到 US1-US17 + R1-R21 + 完整指标 + 路线图(含工时)
- [x] 删除过期开放问题 Q1/Q2
- [x] README 非目标补全到 7 项
- [x] README 08 索引描述更新

## D-6 TECH-DESIGN 新增 6 章
**状态**: ✅ 完成
- [x] §15 部署与运维(Docker/CI/健康检查/灾备/容量)
- [x] §16 可观测性(pino/OTel/Prometheus/成本控制)
- [x] §17 AI 安全(提示注入/PII/幻觉/沙箱/红队)
- [x] §18 评估与质量(测试集/回归/A-B/性能/限流/错误处理/i18n-a11y)
- [x] §19 长期记忆(跨会话/向量库接口/生命周期/回滚)
- [x] §20 版本与兼容性(semver/API版本/模板版本/CHANGELOG)
- [x] 附录 B 更新(新增 §15-§20 条目)

## D-7 杂项清理(M1-M57)
**状态**: ✅ 完成
- [x] M1 README 快速导航补 01-08 + 附录链接
- [x] M5 README 目标表补类型列
- [x] M22/M24 HTML架构图→Mermaid草案
- [x] M28 CLI 选项标注统一
- [x] M30 TECH-DESIGN 新增 3 个 ADR
- [x] M33/M34 framework.loadAll→init 统一
- [x] M39 Phase 1 增补 AnthropicProvider 1天
- [x] M43 Pipeline 名英文
- [x] M55 术语风格指南

## D-8 验证
**状态**: ✅ 完成
- [x] 端口: 3000 残留 0 处 ✅
- [x] 重复节号: 5.7 仅 1 次 ✅
- [x] 草稿注释: 0 处 ✅
- [x] 版本号: 全部 v1.5 ✅
- [x] 双源真相: PRD 中 US/R 行 0 ✅
- [x] TECH-DESIGN 章节数: 20 ✅
- [x] snake_case 残留: 0 处 ✅

---

## M-0 项目初始化
**状态**: ✅ 完成
- [x] git init + 首次 commit
- [x] pnpm-workspace.yaml
- [x] 根 package.json + tsconfig.base.json
- [x] 6 个包骨架目录
- [x] templates/ 和 examples/ 目录
- [x] 安装共享依赖
- [x] pnpm -r build 通过
- [x] /init 生成 CLAUDE.md

## M-1 @agentforge/types
**状态**: ✅ 完成
- [x] agent.ts (IAgent, AgentStatus, AgentEvent, EventHandler, AgentStreamChunk)
- [x] config.ts (AgentConfig, ModelConfig 4变体, ToolDefinition, MiddlewareConfig)
- [x] task.ts (AgentTask, Message)
- [x] result.ts (AgentResult, Artifact, ToolCallRecord, AgentMetrics)
- [x] provider.ts (IProvider, ChatParams/Response/Chunk, ModelRegistry, ToolCallRequest)
- [x] plugin.ts (IPlugin, PluginContext, Middleware, Logger)
- [x] pipeline.ts (PipelineControlSignal, StepSnapshot, BacktrackEvent, PipelineResult, etc.)
- [x] framework.ts (FrameworkConfig, AgentFramework)
- [x] debug.ts (DebugConfig, JSONSchema, CallTrace)
- [x] data-model.ts (AgentMeta, AgentTemplate, ExecutionRecord, AgentNode)
- [x] index.ts (统一 re-export)
- [x] build 通过 (17.5KB d.ts)

## M-2 @agentforge/core
**状态**: ⬜ 未开始
- [ ] M-2a: BaseAgent + AgentLifeCycle
- [ ] M-2b: IProvider + 3 个 Provider + ProviderFactory
- [ ] M-2c: PluginManager + PluginContext + MiddlewareChain
- [ ] M-2d: Generator + PromptBuilder + TemplateEngine + SkillMatcher + CodeEmitter + EJS模板
- [ ] M-2e: AgentRegistry + AgentExecutor
- [ ] 单元测试 + 集成测试

## M-3 @agentforge/sdk
**状态**: ⬜ 未开始
- [ ] AgentFramework.ts
- [ ] Pipeline.ts (含回退/分叉)
- [ ] EventBus.ts
- [ ] ModelRegistry 实现
- [ ] 测试

## M-4 @agentforge/cli
**状态**: ⬜ 未开始
- [ ] create / batch / serve / list / run / dashboard 6 个命令
- [ ] 验证: create → serve → curl

## M-5 @agentforge/http-server
**状态**: ⬜ 未开始
- [ ] Agent HTTP 自服务 (4 端点)
- [ ] Dashboard 后端 API
- [ ] WebSocket /ws/events
- [ ] DashboardPlugin
- [ ] curl 验证

## M-6 @agentforge/dashboard
**状态**: ⬜ 未开始
- [ ] 首页 + Agent 列表
- [ ] Agent 创建页
- [ ] 调试台 Playground
- [ ] 监控页
- [ ] 嵌入/分离部署
- [ ] E2E 测试

## M-7 集成+CI+发布
**状态**: 🔵 进行中
- [x] E2E 测试套件
- [x] GitHub Actions CI
- [x] Docker 镜像
- [ ] npm 发布
- [ ] MCP 插件安装

---

## 开发日志

### 2026-06-12
- 开始文档审查,发现 60 个问题(7 关键 + 20 重要 + 33 轻微)
- 部分完成 D-1: 01-核心设计.md 加了权威声明 + AgentEvent/EventHandler/AgentStreamChunk
- 创建 PROGRESS.md 进度跟踪文件
- 下一步: 继续补全 01-核心设计.md 剩余类型(IProvider, FrameworkConfig, ToolDefinition 等)
