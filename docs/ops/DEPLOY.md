# AgentForge 部署文档

> ⚠️ **目标行为文档**：本文描述预期用法，当前项目处于设计阶段，命令与 API 尚未实现。权威规格见 [05-CLI与API.md](../design/05-CLI与API.md)。
>
> **文档层级**: 第三层 · 操作手册
> **文档类型**: 部署手册
> **文档状态**: 已定稿
> **文档版本**: docs-v0.3
> **最后更新**: 2026-06-23
> **实现状态**: 未开始

## 部署模式总览

| 模式 | 适用场景 | 复杂度 | 说明 |
|---|---|---|---|
| npm 嵌入 | Node.js 项目内部 | 最低 | `npm install` 后直接调用 |
| HTTP 服务 | 非 Node.js 项目 | 低 | `agentforge serve` 启动 REST+SSE |
| Docker 容器 | 生产环境 | 中 | Dockerfile 多阶段构建 |
| Docker Compose | 多 Agent + Dashboard | 中 | Dashboard + 多个 Agent 节点 |
| Kubernetes | 大规模生产 | 高 | Helm + 自动扩缩容 |

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

## 模式一: npm 嵌入

最简单的集成方式，适合 Node.js 项目。

### 安装

```bash
# 安装 Agent 包
npm install agent-customer-service

# 安装 SDK（多 Agent 编排时）
npm install @agentforge/sdk
```

### 使用

```typescript
import { CustomerServiceAgent } from 'agent-customer-service';

const agent = new CustomerServiceAgent();
await agent.init({
  model: {
    provider: 'openai',
    modelName: 'gpt-4o',
    apiKey: process.env.OPENAI_API_KEY,
  },
  systemPrompt: '你是一个电商客服助手。',
});

const result = await agent.execute({
  type: 'chat',
  input: { message: '我的订单到哪了？' },
});

console.log(result.output.content);
await agent.destroy();
```

### 环境变量配置

```bash
# .env
OPENAI_API_KEY=sk-xxx
ANTHROPIC_API_KEY=sk-ant-xxx   # 使用 Anthropic 时
```

---

## 模式二: HTTP 服务

适合 Python、Go、Java 等非 Node.js 项目。

### 启动

```bash
# 全局安装
npm install -g @agentforge/cli

# 启动单 Agent 服务
agentforge serve ./agents/agent-customer-service --port 3001

# 后台运行（生产环境）
nohup agentforge serve ./agents/agent-customer-service --port 3001 > agent.log 2>&1 &
```

### Systemd 服务（Linux 生产环境）

创建 `/etc/systemd/system/agentforge-customer.service`:

```ini
[Unit]
Description=AgentForge Customer Service Agent
After=network.target

[Service]
Type=simple
User=agentforge
WorkingDirectory=/opt/agentforge
ExecStart=/usr/local/bin/agentforge serve ./agents/agent-customer-service --port 3001 --host 0.0.0.0
Restart=on-failure
RestartSec=5
Environment=OPENAI_API_KEY=sk-xxx
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable agentforge-customer
sudo systemctl start agentforge-customer
sudo systemctl status agentforge-customer
```

### Nginx 反向代理

```nginx
upstream agentforge_customer {
    server 127.0.0.1:3001;
}

server {
    listen 80;
    server_name agent.example.com;

    location / {
        proxy_pass http://agentforge_customer;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # SSE 流式端点需要关闭缓冲
    location /api/stream {
        proxy_pass http://agentforge_customer;
        proxy_set_header Connection '';
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
    }

    # Dashboard 与客户端节点的 WebSocket 控制通道
    location ~ ^/ws/nodes/ {
        proxy_pass http://agentforge_customer;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}
```

---

## 模式三: Docker 容器

### 构建镜像

```bash
# 从项目根目录构建
docker build -t agentforge:0.1.0 .

# 验证
docker run --rm agentforge:0.1.0 --help
```

### 运行单个 Agent

```bash
docker run -d \
  --name agent-customer \
  -p 3001:3001 \
  -e OPENAI_API_KEY=sk-xxx \
  -v $(pwd)/agents:/app/agents \
  agentforge:0.1.0 \
  serve ./agents/agent-customer-service --port 3001 --host 0.0.0.0
```

### 运行 Dashboard

```bash
docker run -d \
  --name agentforge-dashboard \
  -p 8080:8080 \
  -e OPENAI_API_KEY=sk-xxx \
  agentforge:0.1.0 \
  dashboard --port 8080
```

### 运行交互式命令

```bash
# 生成 Agent
docker run --rm \
  -v $(pwd)/agents:/app/agents \
  -e OPENAI_API_KEY=sk-xxx \
  agentforge:0.1.0 \
  create "客服助手" -t customer-service

# 列出 Agent
docker run --rm \
  -v $(pwd)/agents:/app/agents \
  agentforge:0.1.0 \
  list
```

---

## 模式四: Docker Compose（推荐生产部署）

### 配置文件

项目已包含 `docker-compose.yml`，可直接使用:

```bash
# 设置环境变量
export OPENAI_API_KEY=sk-xxx

# 启动所有服务
docker compose up -d

# 查看日志
docker compose logs -f

# 停止
docker compose down
```

### 自定义配置

如需添加更多 Agent 节点，编辑 `docker-compose.yml`:

```yaml
version: '3.8'
services:
  dashboard:
    build: .
    command: dashboard --port 8080
    ports:
      - "8080:8080"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}

  agent-customer:
    build: .
    command: run ./agents/agent-customer-service --connect ws://dashboard:8080 --node-name agent-customer
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - AGENTFORGE_NODE_TOKEN=${AGENTFORGE_NODE_TOKEN}

  agent-sales:
    build: .
    command: run ./agents/agent-sales-assistant --connect ws://dashboard:8080 --node-name agent-sales
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - AGENTFORGE_NODE_TOKEN=${AGENTFORGE_NODE_TOKEN}

  # 新增数据分析 Agent
  agent-data:
    build: .
    command: run ./agents/agent-data-analyst --connect ws://dashboard:8080 --node-name agent-data
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - AGENTFORGE_NODE_TOKEN=${AGENTFORGE_NODE_TOKEN}
```

### Agent 节点注册到 Dashboard

各 Agent 通过 `agentforge run` 启动时会自动向 Dashboard 注册为节点，并通过 WebSocket 控制通道维持心跳。Dashboard 每 30 秒检查心跳，90 秒无心跳标记为 `dead`。

---

## 从源码构建

### 开发环境

```bash
# 克隆仓库
git clone <repo-url> agentforge && cd agentforge

# 安装依赖
pnpm install

# 构建
pnpm build

# 运行测试
pnpm test

# 开发模式（Dashboard 热重载）
pnpm --filter @agentforge/dashboard dev
```

### 生产构建

```bash
# 完整构建 + 类型检查
pnpm run lint
pnpm run type-check
pnpm run build

# 验证
pnpm test
```

---

## 配置管理

### 环境变量

| 变量 | 作用域 | 必填 | 说明 |
|---|---|---|---|
| `OPENAI_API_KEY` | 全局 | 使用 OpenAI 时 | OpenAI API 密钥 |
| `ANTHROPIC_API_KEY` | 全局 | 使用 Anthropic 时 | Anthropic API 密钥 |
| `NODE_ENV` | 全局 | ❌ | `production` / `development` |
| `AGENTFORGE_PORT` | serve 命令 | ❌ | 默认 `3001` |
| `LOG_LEVEL` | 全局 | ❌ | `debug` / `info` / `warn` / `error` |

### 配置文件

Agent 的 `.agentforge.json` 存储元数据:

```json
{
  "id": "agent-customer-service-1718000000",
  "name": "agent-customer-service",
  "description": "电商客服助手",
  "role": "customer-service",
  "version": "1.0.0",
  "template": "customer-service",
  "status": "ready"
}
```

### 敏感信息处理

- API Key 不落盘：通过环境变量注入，不写入 `.agentforge.json` 或配置文件
- Dashboard 的 `/api/config` 端点自动脱敏：`apiKey` 字段替换为 `***`
- 生产环境推荐使用 Docker Secrets 或 Vault 管理密钥

---

## 健康检查

### Agent HTTP 服务

```bash
curl http://localhost:3001/api/status
# → {"status":"ready","uptime":3600,"timestamp":...}
```

### Dashboard

```bash
curl http://localhost:8080/api/health
# → {"status":"ok","timestamp":...}
```

### Docker 健康检查

在 `docker-compose.yml` 中添加:

```yaml
services:
  agent-customer:
    # ... 其他配置
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
```

---

## 监控与可观测性

### 日志

生产环境使用 pino 输出 JSON 结构化日志:

```json
{"level":"info","msg":"Agent executed","agentId":"agent-customer-service","duration":1520,"tokens":77}
```

### 指标

`GET /api/metrics` 返回 Prometheus exposition 格式指标，例如:

```
# HELP agentforge_agent_executions_total Total number of agent executions
# TYPE agentforge_agent_executions_total counter
agentforge_agent_executions_total{agent="agent-customer-service"} 42

# HELP agentforge_agent_execution_duration_seconds Agent execution duration
# TYPE agentforge_agent_execution_duration_seconds histogram
agentforge_agent_execution_duration_seconds_bucket{agent="agent-customer-service",le="0.5"} 12
agentforge_agent_execution_duration_seconds_bucket{agent="agent-customer-service",le="1.0"} 35
agentforge_agent_execution_duration_seconds_bucket{agent="agent-customer-service",le="+Inf"} 42
agentforge_agent_execution_duration_seconds_sum{agent="agent-customer-service"} 28.5
agentforge_agent_execution_duration_seconds_count{agent="agent-customer-service"} 42
```

> 完整指标名与标签集合参见 `docs/design/TECH-DESIGN.md §16.3`。

### WebSocket 实时事件

Dashboard 与客户端节点通过 `ws://host:8080/ws/nodes/:nodeId` 建立双向控制通道，下发命令并接收事件/结果推送。

---

## 灾备与回滚

### 数据备份

v1 版本所有数据存储为文件:

```bash
# 备份 Agent 元数据
tar czf agentforge-backup-$(date +%Y%m%d).tar.gz agents/*/.*.agentforge.json

# 备份 Dashboard 执行记录（如使用文件存储）
tar czf dashboard-backup-$(date +%Y%m%d).tar.gz .agentforge/
```

### 回滚

```bash
# 回滚到上一版本
docker compose down
docker tag agentforge:0.1.0 agentforge:0.0.9
docker compose up -d
```

### 容量参考

| 场景 | 单 Agent QPS | 建议实例数 |
|---|---|---|
| OpenAI gpt-4o | ~5 | 按需水平扩展 |
| Ollama qwen2.5:14b | ~10 | 取决于 GPU |
| Dashboard 并发连接 | — | 上限建议 100 WebSocket |

---

## 常见问题

### Q: serve 启动后 curl 无响应?

检查 `--host` 参数。默认只监听 `localhost`，Docker 内需设置为 `0.0.0.0`:

```bash
agentforge serve ./agents/xxx --host 0.0.0.0
```

### Q: 如何使用 Anthropic 模型?

```bash
# 方式一: CLI 参数
agentforge create "助手" -m claude-sonnet-4-6

# 方式二: 环境变量
export ANTHROPIC_API_KEY=sk-ant-xxx
agentforge serve ./agents/xxx -m claude-sonnet-4-6
```

### Q: 如何使用本地 Ollama 模型?

```bash
# 确保 Ollama 已启动
ollama serve

# 生成 Agent 时指定 Ollama 模型
agentforge create "数据分析助手" -m qwen2.5:14b
```

Ollama 无需 API Key，默认连接 `http://localhost:11434`。

### Q: Dashboard 无法连接 Agent 节点?

1. 确认 Agent 已通过 `agentforge run --connect <dashboard-url>` 启动
2. 确认 `--token` 有效且可访问该 nodeId
3. 检查网络：Dashboard 与 Agent 之间的 WebSocket 端口（默认 8080）是否互通
4. 检查心跳：Agent 每 30 秒发送心跳，90 秒无心跳标记为 `dead`
