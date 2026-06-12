import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import type { IAgent, AgentTask, AgentResult, AgentStreamChunk } from '@agentforge/types';

export interface ServerOptions {
  port?: number;
  /** Single default agent (used when no agentId in request) */
  agent?: IAgent;
  /** Named agent map (used when agentId provided in request body) */
  agents?: Map<string, IAgent>;
}

/** Resolve agent: prefer explicit id from body, fall back to single default agent */
function resolveAgent(options: ServerOptions, body?: Record<string, unknown>): IAgent | undefined {
  const agentId = body?.agentId as string | undefined;
  if (agentId && options.agents?.has(agentId)) {
    return options.agents.get(agentId);
  }
  return options.agent;
}

export function createServer(options: ServerOptions = {}): express.Express {
  const app = express();

  // Middleware
  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(morgan('combined'));

  // ── Agent HTTP self-service endpoints ──────────────────────────────

  // POST /api/execute — synchronous execution
  app.post('/api/execute', async (req, res) => {
    const agent = resolveAgent(options, req.body);
    if (!agent) {
      res.status(400).json({ success: false, error: { code: 'NO_AGENT', message: 'No agent available. Provide agentId or configure a default agent.' } });
      return;
    }

    const { type, input, context, meta } = req.body as Partial<AgentTask>;
    if (!type || !input) {
      res.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message: 'Request body must include "type" and "input" fields.' } });
      return;
    }

    const task: AgentTask = { type, input, context, meta };
    try {
      const result: AgentResult = await agent.execute(task);
      res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, error: { code: 'EXECUTE_ERROR', message } });
    }
  });

  // POST /api/stream — SSE streaming execution
  app.post('/api/stream', async (req, res) => {
    const agent = resolveAgent(options, req.body);
    if (!agent) {
      res.status(400).json({ success: false, error: { code: 'NO_AGENT', message: 'No agent available. Provide agentId or configure a default agent.' } });
      return;
    }

    const { type, input, context, meta } = req.body as Partial<AgentTask>;
    if (!type || !input) {
      res.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message: 'Request body must include "type" and "input" fields.' } });
      return;
    }

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const task: AgentTask = { type, input, context, meta };

    const sendSSE = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const stream: AsyncIterable<AgentStreamChunk> = agent.stream(task);
      for await (const chunk of stream) {
        sendSSE('chunk', chunk);
        if (chunk.type === 'done' || chunk.type === 'error') {
          break;
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      sendSSE('error', { type: 'error', error: { code: 'STREAM_ERROR', message } });
    } finally {
      res.end();
    }
  });

  // GET /api/status — health / status check
  app.get('/api/status', (_req, res) => {
    const agents = options.agents ?? (options.agent ? new Map([['default', options.agent]]) : new Map());
    const agentStatuses: Record<string, string> = {};
    for (const [name, agent] of agents) {
      agentStatuses[name] = agent.status;
    }
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: Date.now(),
      agents: agentStatuses,
    });
  });

  // GET /api/health — lightweight health check (for heartbeat)
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  // GET /api/capabilities — agent capabilities
  app.get('/api/capabilities', (_req, res) => {
    const agents = options.agents ?? (options.agent ? new Map([['default', options.agent]]) : new Map());
    const capabilities: Record<string, unknown> = {};
    for (const [name, agent] of agents) {
      capabilities[name] = {
        id: agent.id,
        name: agent.name,
        role: agent.role,
        version: agent.version,
        capabilities: agent.capabilities,
      };
    }
    res.json({ capabilities });
  });

  // GET /api/config — current config (sensitive fields redacted)
  app.get('/api/config', (_req, res) => {
    const agents = options.agents ?? (options.agent ? new Map([['default', options.agent]]) : new Map());
    const configs: Record<string, unknown> = {};
    for (const [name, agent] of agents) {
      // We only expose non-sensitive metadata; the agent's config is internal
      configs[name] = {
        id: agent.id,
        name: agent.name,
        role: agent.role,
        version: agent.version,
      };
    }
    res.json({ configs });
  });

  // GET /api/metrics — agent metrics
  app.get('/api/metrics', (_req, res) => {
    // Metrics are not part of IAgent interface directly; return basic info
    const agents = options.agents ?? (options.agent ? new Map([['default', options.agent]]) : new Map());
    const agentInfo: Record<string, unknown> = {};
    for (const [name, agent] of agents) {
      agentInfo[name] = {
        id: agent.id,
        name: agent.name,
        status: agent.status,
      };
    }
    res.json({ metrics: agentInfo });
  });

  return app;
}

export function startServer(options: ServerOptions = {}): Promise<import('http').Server> {
  const app = createServer(options);
  const port = options.port ?? 3001;
  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      console.log(`Agent serving at http://localhost:${port}`);
      resolve(server);
    });
  });
}
