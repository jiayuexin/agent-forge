# AgentForge 部署文档

> **文档层级**: 第三层 · 操作手册
> **文档类型**: 部署手册
> **文档状态**: 已定稿
> **文档版本**: docs-v0.8
> **最后更新**: 2026-08-13
> **实现状态**: 已实现（单实例自托管）

**v1 发布形态**：单团队、单 Hub 实例、SQLite 持久化。推荐路径是本地 CLI 或 `docker compose up`。多副本 Kubernetes / HPA / Redis / NATS **不是** v1 范围，下文 K8s 章节仅作远期参考，不要按生产指南执行。

首版 SLO（单实例）：Hub 可用性 99.5%；远程任务成功率 ≥99%；非 LLM 控制面 p95 <200ms；审计写入成功率 100%。应对权限拒绝、任务堆积、数据库错误和节点反复重连配置告警（Prometheus 指标：`hub_auth_failures_total`、`hub_tasks_unknown_total`、`hub_db_errors_total`、`hub_node_reconnects_total`）。

## 目录

- [部署模式总览](#部署模式总览)
- [前置条件](#前置条件)
- [模式一：ClientAgent 本地安装包](#模式一clientagent-本地安装包)
- [模式二：Capability Hub Docker 部署](#模式二capability-hub-docker-部署)
- [模式三：Capability Hub Kubernetes 部署](#模式三capability-hub-kubernetes-部署)
- [模式四：SDK 嵌入宿主应用](#模式四sdk-嵌入宿主应用)
- [安全配置](#安全配置)
- [配置管理](#配置管理)
- [健康检查](#健康检查)
- [可观测性](#可观测性)
- [备份与恢复](#备份与恢复)
- [npm 包发布](#npm-包发布)
- [升级与回滚](#升级与回滚)
- [灾难恢复](#灾难恢复)

---

## 部署模式总览

| 模式                      | 适用场景   | 复杂度 | 说明                                 |
| ------------------------- | ---------- | ------ | ------------------------------------ |
| ClientAgent 本地安装包    | 终端用户   | 低     | 生成后打包为可执行文件/安装包        |
| Capability Hub Docker     | 生产环境   | 中     | 独立容器部署 Hub 后端 + 前端         |
| Capability Hub Kubernetes | 大规模生产 | 高     | 多副本 + HPA + 滚动更新              |
| SDK 嵌入                  | 开发者     | 最低   | `npm install @agentforge/sdk` 后编排 |

---

## 前置条件

### 必需

- Node.js ≥ 22.0.0（Hub 使用内置 `node:sqlite`）
- 至少一个 LLM Provider 的 API Key

### 可选

- pnpm ≥ 8.0.0（从源码构建时需要）
- Docker ≥ 20.0（容器部署时需要）
- Docker Compose ≥ 2.0（多服务部署时需要）
- Kubernetes ≥ 1.25（K8s 部署时需要）
- kubectl / helm（K8s 部署时需要）

---

## 模式一：ClientAgent 本地安装包

### 生成 ClientAgent

```bash
agentforge create "一个能执行 Git 命令的本地编程助手"
```

### 构建与打包

生成后进入 ClientAgent 目录，安装依赖并构建：

```bash
cd ./client-agents/my-agent
npm install
npm run build
```

推荐使用以下工具打包为可执行文件/安装包：

| 工具                                            | 输出格式                      | 适用平台                |
| ----------------------------------------------- | ----------------------------- | ----------------------- |
| [pkg](https://github.com/vercel/pkg)            | 单文件可执行文件              | Linux / macOS / Windows |
| [electron-forge](https://www.electronforge.io/) | `.dmg` / `.exe` / `.AppImage` | 带 GUI 的桌面应用       |
| [nexe](https://github.com/nexe/nexe)            | 单文件可执行文件              | Linux / macOS / Windows |

**使用 `pkg` 打包示例：**

```bash
npm install --save-dev pkg
npx pkg ./dist/main.js --targets node18-linux-x64,node18-macos-x64,node18-win-x64 --output ./dist/my-agent
```

### 签名（推荐）

- **macOS**：使用 Apple Developer ID 签名 `.app` 或 `.pkg`
- **Windows**：使用代码签名证书签名 `.exe`
- **Linux**：使用 GPG 签名分发包

### 分发与运行

用户下载安装包后：

```bash
# 启动守护进程并连接 Hub
./my-agent run --connect wss://hub.example.com --token $AGENTFORGE_NODE_TOKEN
```

---

## 模式二：Capability Hub Docker 部署

仓库根目录已提供 `Dockerfile` 与 `docker-compose.yml`。镜像以非 root 用户运行，持久化目录为 `/data`（`VOLUME`），健康检查为 `GET /api/v1/health`。

```bash
export AGENTFORGE_ADMIN_TOKEN=replace-me
docker compose up --build -d
curl -fsS http://127.0.0.1:8080/api/v1/health
```

单独构建：

```bash
docker build -t agentforge-hub:0.1.0 .
docker run -d --name agentforge-hub -p 8080:8080 \
  -e AGENTFORGE_ADMIN_TOKEN=replace-me \
  -e AGENTFORGE_DATA_DIR=/data \
  -v hub-data:/data \
  agentforge-hub:0.1.0
```

备份与恢复：

```bash
agentforge dashboard backup --out ./hub-backup.sqlite --data-dir .agentforge/hub
agentforge dashboard restore --from ./hub-backup.sqlite --data-dir .agentforge/hub
```

升级时先备份 SQLite，再换镜像；回滚则恢复备份文件后启动旧镜像。

启动：

```bash
docker compose up -d
```

### TLS 终止

生产环境建议在反向代理（如 Nginx、Traefik）后终止 TLS：

```nginx
# nginx.conf
server {
  listen 443 ssl http2;
  server_name hub.example.com;

  ssl_certificate /etc/nginx/ssl/hub.example.com.crt;
  ssl_certificate_key /etc/nginx/ssl/hub.example.com.key;

  location / {
    proxy_pass http://agentforge-hub:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

---

## 模式三：Capability Hub Kubernetes 部署

### 命名空间与 RBAC

```yaml
# namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: agentforge
```

```yaml
# rbac.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: agentforge-hub
  namespace: agentforge
```

### Secret 与 ConfigMap

```yaml
# secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: agentforge-secrets
  namespace: agentforge
type: Opaque
stringData:
  openai-api-key: 'sk-xxx'
  anthropic-api-key: 'sk-ant-xxx'
  node-token-secret: 'hub-node-token-secret'
```

```yaml
# configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: agentforge-config
  namespace: agentforge
data:
  LOG_LEVEL: 'info'
  NODE_ENV: 'production'
  AGENTFORGE_PORT: '8080'
```

### Deployment

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: agentforge-hub
  namespace: agentforge
spec:
  replicas: 2
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: agentforge-hub
  template:
    metadata:
      labels:
        app: agentforge-hub
    spec:
      serviceAccountName: agentforge-hub
      containers:
        - name: hub
          image: agentforge-hub:0.1.0
          ports:
            - containerPort: 8080
          envFrom:
            - configMapRef:
                name: agentforge-config
          env:
            - name: OPENAI_API_KEY
              valueFrom:
                secretKeyRef:
                  name: agentforge-secrets
                  key: openai-api-key
            - name: ANTHROPIC_API_KEY
              valueFrom:
                secretKeyRef:
                  name: agentforge-secrets
                  key: anthropic-api-key
            - name: AGENTFORGE_NODE_TOKEN_SECRET
              valueFrom:
                secretKeyRef:
                  name: agentforge-secrets
                  key: node-token-secret
          volumeMounts:
            - name: data
              mountPath: /app/data
            - name: logs
              mountPath: /app/logs
          resources:
            requests:
              memory: '512Mi'
              cpu: '500m'
            limits:
              memory: '2Gi'
              cpu: '2000m'
          livenessProbe:
            httpGet:
              path: /api/health
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /api/health
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 10
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: agentforge-data
        - name: logs
          emptyDir: {}
```

### Service 与 Ingress

```yaml
# service.yaml
apiVersion: v1
kind: Service
metadata:
  name: agentforge-hub
  namespace: agentforge
spec:
  selector:
    app: agentforge-hub
  ports:
    - port: 80
      targetPort: 8080
  type: ClusterIP
```

```yaml
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: agentforge-hub
  namespace: agentforge
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: 'true'
    nginx.ingress.kubernetes.io/proxy-read-timeout: '3600'
    nginx.ingress.kubernetes.io/proxy-send-timeout: '3600'
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - hub.example.com
      secretName: hub-tls
  rules:
    - host: hub.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: agentforge-hub
                port:
                  number: 80
```

### PersistentVolumeClaim

```yaml
# pvc.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: agentforge-data
  namespace: agentforge
spec:
  accessModes:
    - ReadWriteMany
  resources:
    requests:
      storage: 10Gi
```

### HPA

```yaml
# hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: agentforge-hub
  namespace: agentforge
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: agentforge-hub
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
```

### 部署命令

```bash
kubectl apply -f namespace.yaml
kubectl apply -f rbac.yaml
kubectl apply -f secret.yaml
kubectl apply -f configmap.yaml
kubectl apply -f pvc.yaml
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
kubectl apply -f ingress.yaml
kubectl apply -f hpa.yaml
```

---

## 模式四：SDK 嵌入宿主应用

### 安装

```bash
npm install @agentforge/sdk
```

### package.json 示例

```json
{
  "name": "my-agent-app",
  "version": "1.0.0",
  "dependencies": {
    "@agentforge/sdk": "^0.1.0"
  },
  "peerDependencies": {
    "openai": "^4.0.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

### 基础用法

```typescript
import { AgentFramework } from '@agentforge/sdk';
import { GitAgent, ReviewerAgent } from './agents';

const framework = new AgentFramework({
  modelRegistry: {
    endpoints: [
      {
        id: 'openai-official',
        provider: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: process.env.OPENAI_API_KEY,
        models: ['gpt-4o', 'gpt-4o-mini'],
      },
    ],
    defaultEndpoint: 'openai-official',
    defaultModel: 'gpt-4o',
  },
});

framework.register('git', GitAgent);
framework.register('reviewer', ReviewerAgent);

const result = await framework.orchestrate({
  type: 'chat',
  input: { message: 'review 这段代码' },
});
```

### 运行时依赖

- `@agentforge/sdk` 自身零 LLM Provider 依赖
- 实际使用的 Provider SDK（如 `openai`、`@anthropic-ai/sdk`）作为 `peerDependencies` 由宿主应用安装

---

## 安全配置

### 节点 Token 生成与轮换

Capability Hub 管理员使用以下命令生成节点 Token：

```bash
export AGENTFORGE_ADMIN_TOKEN=replace-me
agentforge dashboard token create --node-name "dev-machine-a"
# 输出一次性明文 token，Hub 只保存哈希
```

Hub 未运行时只能用离线初始化，且禁止与在线管理混用：

```bash
agentforge dashboard token create --offline --data-dir .agentforge/hub --node-name "dev-machine-a"
```

Token 轮换：

```bash
# 吊销旧 Token
agentforge dashboard token revoke node-token-xxx

# 生成新 Token
agentforge dashboard token create --node-name "dev-machine-a"
```

Token 权限：

| Token 类型   | 权限                                                    |
| ------------ | ------------------------------------------------------- |
| 节点 Token   | 只能操作自身 `nodeId`：上报状态、接收任务、确认能力下发 |
| 管理员 Token | 管理全部节点、发布能力、查看审计日志                    |

### TLS / mTLS

- **ClientAgent → Hub**：使用 WSS（WebSocket over TLS），生产环境必须启用
- **Hub 内部通信**：K8s 集群内使用 Service mesh（如 Istio）启用 mTLS
- **Dashboard → Hub 后端**：通过 Ingress 终止 TLS，内部使用 ClusterIP

### Hub 控制命令授权

Capability Hub 对每条 `ControlMessage` 进行授权校验：

```typescript
// 伪代码
function authorizeControlMessage(token: string, message: ControlMessage): boolean {
  if (isAdminToken(token)) return true;
  if (isNodeToken(token)) {
    // 节点 Token 只能向自身 nodeId 发送 execute/stream/config-update 消息
    return token.nodeId === message.nodeId;
  }
  return false;
}
```

### 敏感操作本地确认

涉及以下标签的操作需 ClientAgent 本地用户确认：

- `local-command`：本地命令执行
- `refund`：退款
- `contract-sign`：合同签署
- `data-delete`：数据删除
- `capability-install`：高风险 Plugin 安装

### 审计日志

审计日志字段：

```json
{
  "timestamp": "2026-06-24T10:00:00Z",
  "nodeId": "client-dev-machine-a1b2c3d",
  "action": "local-command",
  "detail": {
    "command": "git push",
    "level": "whitelist",
    "confirmed": true
  },
  "user": "user@example.com"
}
```

保留策略：本地 90 天，Hub 端可选持久化到对象存储。

---

## 配置管理

### 环境变量

| 变量                           | 作用域                | 必填              | 说明                                | 默认值                               |
| ------------------------------ | --------------------- | ----------------- | ----------------------------------- | ------------------------------------ |
| `OPENAI_API_KEY`               | 全局                  | 使用 OpenAI 时    | OpenAI API 密钥                     | —                                    |
| `ANTHROPIC_API_KEY`            | 全局                  | 使用 Anthropic 时 | Anthropic API 密钥                  | —                                    |
| `OLLAMA_BASE_URL`              | 全局                  | 使用 Ollama 时    | Ollama 服务地址                     | `http://localhost:11434`             |
| `AGENTFORGE_HUB_URL`           | ClientAgent           | 连接 Hub 时       | Capability Hub 端点                 | —                                    |
| `AGENTFORGE_NODE_TOKEN`        | ClientAgent           | 连接 Hub 时       | 节点认证令牌                        | —                                    |
| `AGENTFORGE_NODE_TOKEN_SECRET` | Hub                   | 签发 Token 时     | Hub 签发节点 Token 的密钥           | —                                    |
| `AGENTFORGE_PORT`              | `serve` / `dashboard` | ❌                | 服务端口                            | `3001`（serve）/ `8080`（dashboard） |
| `LOG_LEVEL`                    | 全局                  | ❌                | `debug` / `info` / `warn` / `error` | `info`                               |
| `MONTHLY_COST_LIMIT`           | Framework             | ❌                | 月度成本守护阈值（USD）             | —                                    |
| `NODE_ENV`                     | Hub                   | ❌                | `development` / `production`        | `development`                        |

### ClientAgent 安全配置

`.agentforge/security.json`：

```json
{
  "localCommandAuth": {
    "level": "whitelist",
    "whitelist": ["git status", "git log", "ls"],
    "requireConfirmationFor": ["git push", "rm"]
  },
  "allowRemoteExecution": true,
  "requireLocalConfirmation": ["refund", "contract-sign", "data-delete"]
}
```

---

## 健康检查

### Capability Hub

```bash
curl http://localhost:8080/api/v1/health
# → {"status":"ok","timestamp":...}
```

### ClientAgent 调试服务

```bash
curl http://localhost:3001/api/status
# → {"status":"ready","uptime":3600,"timestamp":...}

curl http://localhost:3001/api/health
# → {"status":"ok"}
```

---

## 可观测性

### 日志

生产环境使用 pino 输出 JSON 结构化日志：

```json
{
  "level": "info",
  "msg": "ClientAgent connected to Hub",
  "nodeId": "client-dev-machine-a1b2c3d",
  "hubUrl": "wss://hub.example.com"
}
```

开发环境使用 `pino-pretty` 格式化输出：

```bash
LOG_LEVEL=debug pnpm run dev
```

### 指标

`GET /api/metrics` 返回 Prometheus exposition 格式指标：

```
agentforge_executions_total{agent="customer-service",status="success"} 42
agentforge_executions_duration_seconds{agent="customer-service",quantile="0.99"} 1.23
agentforge_tokens_total{agent="customer-service",type="input"} 1024
```

### 链路追踪

通过 OpenTelemetry SDK 采集 trace，使用 W3C Trace Context 在 ClientAgent、Capability Hub、StatelessAgent 之间传递。

### Grafana Dashboard

推荐使用以下面板：

- 节点在线率
- 任务执行成功率/延迟
- Token 消耗趋势
- 能力下发成功率
- 本地命令执行审计事件

---

## 备份与恢复

### ClientAgent 备份

备份 `.agentforge/` 目录即可保留元数据、安全配置和能力缓存：

```bash
tar czf client-agent-backup-$(date +%Y%m%d).tar.gz \
  ./client-agents/my-agent/.agentforge/
```

### Capability Hub 备份

Docker 模式：

```bash
docker exec agentforge-hub tar czf /tmp/hub-backup.tar.gz /app/data
docker cp agentforge-hub:/tmp/hub-backup.tar.gz ./hub-backup-$(date +%Y%m%d).tar.gz
```

K8s 模式：

```bash
kubectl -n agentforge exec deploy/agentforge-hub -- \
  tar czf /tmp/hub-backup.tar.gz /app/data
kubectl -n agentforge cp \
  deploy/agentforge-hub:/tmp/hub-backup.tar.gz \
  ./hub-backup-$(date +%Y%m%d).tar.gz
```

### 恢复

```bash
# Docker
docker cp ./hub-backup-20260624.tar.gz agentforge-hub:/tmp/
docker exec agentforge-hub tar xzf /tmp/hub-backup-20260624.tar.gz -C /

# K8s
kubectl -n agentforge cp ./hub-backup-20260624.tar.gz \
  deploy/agentforge-hub:/tmp/hub-backup.tar.gz
kubectl -n agentforge exec deploy/agentforge-hub -- \
  tar xzf /tmp/hub-backup.tar.gz -C /
```

---

## npm 包发布

根包 `@agentforge/root` 保持 `private: true`，不发布。以下七个 workspace 包统一版本 **0.1.0**，以 `publishConfig.access: public` 发布到 npm scoped 作用域：

| 顺序 | 包名                                             | 说明                                      |
| ---- | ------------------------------------------------ | ----------------------------------------- |
| 1    | `@agentforge/types`                              | 零运行时依赖的类型定义                    |
| 2    | `@agentforge/core`                               | 核心运行时                                |
| 3    | `@agentforge/sdk` / `@agentforge/runtime-client` | SDK 与客户端运行时（可并行，均依赖 core） |
| 4    | `@agentforge/http-server`                        | HTTP/WebSocket 服务                       |
| 5    | `@agentforge/dashboard`                          | Hub 面板 + 后端                           |
| 6    | `@agentforge/cli`                                | CLI（依赖上述包）                         |

`pnpm -r publish` 会按依赖拓扑自动排序；本表仅作人工核对参考。

### 版本策略

- 七个可发布包保持 **同一 workspace 版本号**（当前 `0.1.0`）。
- 发版时一并 bump，避免跨包 `workspace:*` 解析不一致。
- 包产物仅包含 `files: ["dist"]`；发布前必须先 `pnpm build`。

### 本地 dry-run

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm publish:dry-run
# 全量 pack：pnpm publish:pack
# 五包 publish dry-run（排除 npmjs 已占用的 core/cli）
```

### GitHub Actions

使用 `.github/workflows/publish.yml`（`workflow_dispatch`）：

1. 默认 `dry_run=true`：只跑 dry-run，不需要 `NPM_TOKEN`。
2. `dry_run=false`：真实发布，需仓库 Secret `NPM_TOKEN`。

本轮验收以 dry-run 通过为准，不强制真实发布到 npm。

### 已知阻塞：包名冲突

npmjs 上已存在第三方包（与本仓库无关）：

- `@agentforge/core`（当前约 `0.16.74`，LangGraph agent framework）
- `@agentforge/cli`（同上作者线）

因此：

1. 本仓库仍以 workspace 统一版本 `0.1.0` 做发布就绪配置。
2. `pnpm publish:dry-run`：对全部七包执行 `npm pack --dry-run`；并对 **未占用** 的五包执行 `pnpm publish --dry-run`（排除 core/cli）。
3. **真实发布** `@agentforge/core` / `@agentforge/cli` 前必须先解决命名：更换 scope/包名，或取得 npm 包所有权。其余五包在具备 `NPM_TOKEN` 与 scope 权限后可发布。

## 升级与回滚

### 升级流程

1. 阅读 CHANGELOG.md 确认破坏性变更
2. 备份当前配置与数据
3. 拉取新版本镜像/源码
4. 更新环境变量与 ConfigMap
5. 滚动更新 Deployment
6. 验证 `/api/health` 与核心流程

### Docker Compose 升级

```bash
docker compose pull
docker compose up -d
```

### Kubernetes 滚动更新

```bash
kubectl -n agentforge set image deployment/agentforge-hub \
  hub=agentforge-hub:0.2.0
kubectl -n agentforge rollout status deployment/agentforge-hub
```

### 回滚

Docker Compose：

```bash
docker compose down
docker compose up -d --build
# 或指定旧镜像
docker compose -f docker-compose.yml -f docker-compose.rollback.yml up -d
```

Kubernetes：

```bash
kubectl -n agentforge rollout undo deployment/agentforge-hub
kubectl -n agentforge rollout status deployment/agentforge-hub
```

---

## 灾难恢复

### RPO / RTO 建议

| 组件                | RPO | RTO   | 说明                         |
| ------------------- | --- | ----- | ---------------------------- |
| ClientAgent 配置    | 24h | 30min | 备份 `.agentforge/` 目录     |
| Capability Hub 数据 | 1h  | 1h    | 持久化卷 + 定期快照          |
| 能力市场包          | 0   | 2h    | 能力包存储在对象存储，多副本 |

### 故障场景

#### ClientAgent 节点离线

- Hub 标记节点为 `offline`
- 节点恢复后自动重连并同步能力缓存
- 离线期间任务进入队列，超时后返回错误

#### Hub 单点故障

- K8s 多副本部署保证可用性
- 使用外部负载均衡器分发流量
- 数据持久化到共享存储

#### 全部数据丢失

1. 重建 Hub 实例
2. 从备份恢复 `/app/data`
3. 重新生成节点 Token
4. ClientAgent 使用新 Token 重新注册
