# P0 交付闭环设计

> **文档层级**: 第二层 · 设计规格
> **文档类型**: 设计规格
> **文档状态**: 已定稿
> **文档版本**: docs-v0.4
> **最后更新**: 2026-07-10
> **实现状态**: 未开始

## 1. 目标

证明 AgentForge 的主流程可以在不使用 Mock Runtime 的情况下真实运行：

1. 构建 Monorepo 与 CLI。
2. 启动真实 Capability Hub。
3. 通过 CLI 签发节点 Token。
4. 通过 CLI 生成 ClientAgent。
5. 安装并编译生成产物。
6. 通过 CLI 将 ClientAgent 接入 Hub。
7. Hub 向 ClientAgent 下发任务。
8. ClientAgent 调用真实 Provider 并将结果返回 Hub。

交付物同时包括构建产物级 CLI 测试、可复制示例和与实现一致的操作文档。

## 2. 方案选择

### 方案 A：全部真实链路进入 PR CI

每次 PR 都调用真实 Provider。反馈直接，但需要向 PR 环境提供密钥，并引入外部成本和模型波动，不适合作为常规门禁。

### 方案 B：双层验收（采用）

- PR CI 执行确定性的 CLI 命令级测试，不调用外部 Provider。
- 发布或人工触发时执行完整真实 golden path，使用真实 Hub、生成产物、CLI 子进程和真实 Provider。

该方案兼顾日常测试的稳定性和发布前真实交付证明。

### 方案 C：仅提供本地 Smoke 脚本

改动最少，但执行不可审计、容易遗漏，无法形成可靠发布门禁，因此不采用。

## 3. 范围

### 3.1 包含

- 从 `packages/cli/dist/index.js` 启动真实 CLI 进程。
- 使用独立临时目录、数据目录和端口运行测试。
- 覆盖 CLI 正常业务路径。
- 从新生成的 ClientAgent 产物完成安装、构建和加载。
- 使用 OpenAI Provider 和 `gpt-4o-mini` 完成真实调用。
- 验证响应内容、模型元数据和 Token 用量。
- 更新根 `README.md`、`docs/ops/GUIDE.md` 和 `docs/ops/TEST.md`。
- 将确定性测试与凭据化真实验收设置为不同入口。

### 3.2 不包含

- 多 Provider 测试矩阵。
- 模型回答业务质量评估。
- 重试、降级、熔断、备用模型或离线替代路径。
- 负载、长稳、跨平台及网络故障测试。
- Docker、Kubernetes 和 npm 正式发布。
- 无关的 Core、SDK 或 Dashboard UI 重构。

## 4. 组件设计

### 4.1 CLI 命令测试驱动器

测试驱动器以子进程执行已构建 CLI，不直接调用命令内部函数。每个测试使用独立临时目录和环境变量，断言退出码、标准输出及实际文件产物。

长运行命令在出现明确的启动成功信号后，通过正常终止信号关闭。测试之间不共享 Hub 数据、生成目录或端口。

### 4.2 真实验收编排器

编排器按正常生命周期启动并关闭 Hub 和 ClientAgent，依次完成 Token 创建、Agent 生成、依赖安装、构建、连接、任务下发和结果验证。

任何步骤失败都立即判定验收失败，不自动重跑或切换执行路径。

### 4.3 生成模板配置

`templates/base/src/config.ts.ejs` 不再写入占位 API Key，生成产物在运行时读取 Provider 环境变量。真实密钥不得写入生成文件、日志、测试快照或 artifact。

### 4.4 凭据契约

节点 Token 环境变量统一为当前 CLI 和生成模板实际使用的 `AGENTFORGE_HUB_TOKEN`，并同步修正文档。Provider 验收使用：

- `OPENAI_API_KEY`
- `AGENTFORGE_ADMIN_TOKEN`
- `AGENTFORGE_HUB_TOKEN`
- `gpt-4o-mini`

真实 Provider 密钥只进入受保护的人工触发或发布环境。

## 5. 数据流

1. 构建工作区及 Dashboard 静态资源。
2. 使用临时数据目录启动 Hub。
3. CLI 请求 Hub 创建节点 Token。
4. CLI 在临时目录生成 ClientAgent。
5. 安装并构建该生成项目。
6. CLI 使用 Token 将生成 Agent 接入 Hub。
7. Hub 经 WebSocket 下发任务。
8. ClientAgent 经 `OpenAIProvider` 调用真实模型。
9. 响应沿 Provider、ClientAgent、runtime-client 返回 Hub。
10. 验证成功状态、非空文本、实际模型名称和大于零的 Token 总数。
11. 按正常关闭流程终止各进程。

现有 `packages/dashboard/e2e/business-flow.spec.ts` 保留为确定性的 Mock Dashboard 行为测试，但不计入真实 golden path。

## 6. 测试与验收

### 6.1 CLI 命令级测试

- 从真实构建产物启动 CLI。
- 覆盖 `--help`、`--version`、`create`、`batch`、`list`、`serve`、`dashboard token`、`capability` 和 `run` 的正常路径。
- 文件型命令验证退出码、输出和磁盘产物。
- 长运行命令验证启动成功并正常终止。

### 6.2 真实系统验收

- 新生成项目可安装、可编译、可加载。
- Hub 能签发 Token。
- 生成 Agent 能通过 CLI 接入 Hub 并显示在线。
- Hub 下发任务后能收到真实 Provider 响应。
- 返回结果包含非空文本、真实模型标识和正数 Token 用量。
- 任一步骤失败即整体失败。

### 6.3 文档验收

- 根 `README.md` 提供最短成功路径。
- `docs/ops/GUIDE.md` 的命令、参数和 Token 名称与实际 CLI 一致。
- `docs/ops/TEST.md` 明确区分 Mock UI E2E、CLI 命令测试和真实凭据化验收。
- 文档示例与自动验收使用同一流程。

## 7. 实施阶段

1. 定稿 Provider、模型、环境变量、触发规则和结果断言。
2. 建立构建产物级 CLI 命令测试。
3. 串联 Hub、Token、生成、构建、连接、远程执行和真实 Provider。
4. 基于已验证流程补齐示例与文档。
5. 配置 PR 确定性门禁和发布前凭据化验收。

## 8. 工作区隔离

当前工作区已有未提交修改，且涉及 CI、Dashboard E2E 和运维文档。实施期间：

- 不执行 stash、reset、checkout 覆盖或清理现有改动。
- 不修改 `client-agents/smoke-test-agent`，所有测试生成物写入系统临时目录。
- 编辑前读取文件最新内容，只做本设计范围内的增量修改。
- 对已有改动重叠的文件单独核对差异。
- 未经用户明确要求不创建提交。
