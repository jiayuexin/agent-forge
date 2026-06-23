# AgentForge 部署文档

> ⚠️ **目标行为文档**：本文描述预期用法，当前项目处于设计阶段，命令与 API 尚未实现。权威规格见 [05-CLI与API.md](../design/05-CLI与API.md)。
>
> **文档层级**: 第三层 · 操作手册
> **文档类型**: 部署手册
> **文档状态**: 草案
> **文档版本**: docs-v0.4
> **最后更新**: 2026-06-23
> **实现状态**: 未开始

## 部署模式总览

| 模式 | 适用场景 | 复杂度 | 说明 |
|---|---|---|---|
| ClientAgent 本地安装包 | 终端用户 | 低 | 生成后打包为可执行文件/安装包 |
| Capability Hub Docker | 生产环境 | 中 | 独立容器部署 Hub 后端 + 前端 |
| Capability Hub Kubernetes | 大规模生产 | 高 | 多副本 + HPA + 滚动更新 |
| SDK 嵌入 | 开发者 | 最低 | `npm install @agentforge/sdk` 后编排 |

---

## 前置条件

### 必需

- Node.js ≥ 18.0.0
- 至少一个 LLM Provider 的 API Key

### 可选

- pnpm ≥ 8.0.0（从源码构建时需要）
- Docker ≥ 20.0（容器部署时需要）
- Docker Compose ≥ 2.0（多服务部署时需要）

---

## 模式一：ClientAgent 本地安装包

### 生成 ClientAgent

```bash
agentforge create "一个能执行 Git 命令的本地编程助手"
```

### 打包为可执行文件

```bash
cd ./client-agents/my-agent
npm install
npm run build
npm run package
```

### 分发与运行

用户下载安装包后：

```bash
# 启动守护进程并连接 Hub
./my-agent run --connect wss://hub.example.com --token $AGENTFORGE_NODE_TOKEN
```

---

## 模式二：Capability Hub Docker 部署

### 构建镜像

```bash
docker build -t agentforge-hub:0.1.0 .
```

### 运行 Hub

```bash
docker run -d \
  --name agentforge-hub \
  -p 8080:8080 \
  -e OPENAI_API_KEY=$OPENAI_API_KEY \
  agentforge-hub:0.1.0
```

### Docker Compose

```yaml
version: '3.8'
services:
  hub:
    build: .
    command: dashboard --port 8080 --host 0.0.0.0
    ports:
      - "8080:8080"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - LOG_LEVEL=info
```

---

## 模式三：Capability Hub Kubernetes 部署

### 基本资源

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: agentforge-hub
spec:
  replicas: 2
  selector:
    matchLabels:
      app: agentforge-hub
  template:
    metadata:
      labels:
        app: agentforge-hub
    spec:
      containers:
        - name: hub
          image: agentforge-hub:0.1.0
          ports:
            - containerPort: 8080
          env:
            - name: OPENAI_API_KEY
              valueFrom:
                secretKeyRef:
                  name: agentforge-secrets
                  key: openai-api-key
---
apiVersion: v1
kind: Service
metadata:
  name: agentforge-hub
spec:
  selector:
    app: agentforge-hub
  ports:
    - port: 80
      targetPort: 8080
```

---

## 模式四：SDK 嵌入宿主应用

```bash
npm install @agentforge/sdk
```

```typescript
import { AgentFramework } from '@agentforge/sdk';
import { GitAgent, ReviewerAgent } from './agents';

const framework = new AgentFramework();
framework.register('git', GitAgent);
framework.register('reviewer', ReviewerAgent);

const result = await framework.orchestrate({
  type: 'chat',
  input: { message: 'review 这段代码' },
});
```

---

## 配置管理

### 环境变量

| 变量 | 作用域 | 必填 | 说明 | 默认值 |
|---|---|---|---|---|
| `OPENAI_API_KEY` | 全局 | 使用 OpenAI 时 | OpenAI API 密钥 | — |
| `ANTHROPIC_API_KEY` | 全局 | 使用 Anthropic 时 | Anthropic API 密钥 | — |
| `AGENTFORGE_HUB_URL` | ClientAgent | 连接 Hub 时 | Capability Hub 端点 | — |
| `AGENTFORGE_NODE_TOKEN` | ClientAgent | 连接 Hub 时 | 节点认证令牌 | — |
| `AGENTFORGE_PORT` | serve 命令 | ❌ | 调试服务端口 | `3001` |
| `LOG_LEVEL` | 全局 | ❌ | `debug` / `info` / `warn` / `error` | `info` |

### ClientAgent 安全配置

`.agentforge/security.json`：

```json
{
  "localCommandAuth": {
    "level": "whitelist",
    "whitelist": ["git status", "git log"],
    "requireConfirmationFor": ["git push", "rm"]
  },
  "allowRemoteExecution": true,
  "requireLocalConfirmation": ["refund", "contract-sign"]
}
```

---

## 健康检查

### Capability Hub

```bash
curl http://localhost:8080/api/health
# → {"status":"ok","timestamp":...}
```

### ClientAgent 调试服务

```bash
curl http://localhost:3001/api/health
# → {"status":"ok"}
```

---

## 可观测性

### 日志

生产环境使用 pino 输出 JSON 结构化日志：

```json
{"level":"info","msg":"ClientAgent connected to Hub","nodeId":"client-dev-01","hubUrl":"wss://hub.example.com"}
```

### 指标

`GET /api/metrics` 返回 Prometheus exposition 格式指标。

---

## 灾备与回滚

### ClientAgent 备份

```bash
tar czf client-agent-backup-$(date +%Y%m%d).tar.gz ./client-agents/my-agent/.agentforge/
```

### Capability Hub 回滚

```bash
docker compose down
docker tag agentforge-hub:0.1.0 agentforge-hub:0.0.9
docker compose up -d
```
