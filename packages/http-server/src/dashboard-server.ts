import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import type {
  IAgent,
  AgentConfig,
  AgentTask,
  AgentNode,
  AgentMeta,
  AgentCapability,
  CallTrace,
  JSONSchema,
} from '@agentforge/types';
import { setupWebSocket, broadcastEvent, type AgentEventPayload } from './ws-events';
import type { Server } from 'http';
import type { WebSocketServer } from 'ws';

export interface DashboardOptions {
  port?: number;
  /** Directories to scan for agent definitions */
  agentDirs?: string[];
}

/** In-memory stores for the dashboard */
const agentStore = new Map<string, { meta: AgentMeta; agent?: IAgent }>();
const nodeStore = new Map<string, AgentNode>();
const traceStore = new Map<string, CallTrace[]>();
const injectedTools = new Map<string, { name: string; description: string; parameters: JSONSchema; handler: string }[]>();

export function createDashboardServer(options: DashboardOptions = {}): express.Express {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(morgan('combined'));

  let wss: WebSocketServer | undefined;

  // ── Agent Management ───────────────────────────────────────────────

  // GET /api/agents — list all agents
  app.get('/api/agents', async (_req, res) => {
    const agents = [...agentStore.values()].map((entry) => entry.meta);
    res.json({ agents });
  });

  // POST /api/agents — create / register agent
  app.post('/api/agents', async (req, res) => {
    const meta = req.body as AgentMeta;
    if (!meta?.id || !meta?.name) {
      res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Agent meta must include "id" and "name".' } });
      return;
    }
    agentStore.set(meta.id, { meta });
    broadcastIfReady(wss, 'agent:created', { id: meta.id, name: meta.name });
    res.status(201).json({ success: true, agent: meta });
  });

  // GET /api/agents/:id — agent details
  app.get('/api/agents/:id', async (req, res) => {
    const entry = agentStore.get(req.params.id);
    if (!entry) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: `Agent "${req.params.id}" not found.` } });
      return;
    }
    res.json({ agent: entry.meta });
  });

  // POST /api/agents/:id/init — initialize agent
  app.post('/api/agents/:id/init', async (req, res) => {
    const entry = agentStore.get(req.params.id);
    if (!entry) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: `Agent "${req.params.id}" not found.` } });
      return;
    }
    if (!entry.agent) {
      res.status(400).json({ error: { code: 'NO_AGENT_INSTANCE', message: 'No runtime agent instance available for initialization.' } });
      return;
    }
    const config = req.body as AgentConfig;
    try {
      await entry.agent.init(config);
      res.json({ success: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, error: { code: 'INIT_ERROR', message } });
    }
  });

  // DELETE /api/agents/:id — destroy agent
  app.delete('/api/agents/:id', async (req, res) => {
    const entry = agentStore.get(req.params.id);
    if (!entry) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: `Agent "${req.params.id}" not found.` } });
      return;
    }
    if (entry.agent) {
      try {
        await entry.agent.destroy();
      } catch {
        // best-effort destroy
      }
    }
    agentStore.delete(req.params.id);
    broadcastIfReady(wss, 'agent:destroyed', { id: req.params.id });
    res.json({ success: true });
  });

  // ── Task Execution (dashboard-driven) ──────────────────────────────

  // POST /api/agents/:id/execute — synchronous execution
  app.post('/api/agents/:id/execute', async (req, res) => {
    const entry = agentStore.get(req.params.id);
    if (!entry?.agent) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: `Agent "${req.params.id}" not found or not initialized.` } });
      return;
    }
    const { type, input, context, meta: taskMeta } = req.body as Partial<AgentTask>;
    if (!type || !input) {
      res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Request body must include "type" and "input" fields.' } });
      return;
    }
    const task: AgentTask = { type, input, context, meta: taskMeta };
    try {
      const result = await entry.agent.execute(task);
      res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, error: { code: 'EXECUTE_ERROR', message } });
    }
  });

  // POST /api/agents/:id/stream — SSE streaming execution
  app.post('/api/agents/:id/stream', async (req, res) => {
    const entry = agentStore.get(req.params.id);
    if (!entry?.agent) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: `Agent "${req.params.id}" not found or not initialized.` } });
      return;
    }

    const { type, input, context, meta: taskMeta } = req.body as Partial<AgentTask>;
    if (!type || !input) {
      res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Request body must include "type" and "input" fields.' } });
      return;
    }

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const task: AgentTask = { type, input, context, meta: taskMeta };
    const sendSSE = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const stream = entry.agent.stream(task);
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

  // GET /api/agents/:id/status — agent status
  app.get('/api/agents/:id/status', async (req, res) => {
    const entry = agentStore.get(req.params.id);
    if (!entry) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: `Agent "${req.params.id}" not found.` } });
      return;
    }
    res.json({
      id: req.params.id,
      status: entry.agent?.status ?? 'unknown',
    });
  });

  // ── Debug Endpoints ────────────────────────────────────────────────

  // POST /api/debug/:id/chat — debug chat (SSE)
  app.post('/api/debug/:id/chat', async (req, res) => {
    const entry = agentStore.get(req.params.id);
    if (!entry?.agent) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: `Agent "${req.params.id}" not found or not initialized.` } });
      return;
    }

    const { message, sessionId } = req.body as { message?: string; sessionId?: string };
    if (!message) {
      res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Request body must include "message" field.' } });
      return;
    }

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const sendSSE = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const task: AgentTask = {
      type: 'chat',
      input: { message },
      context: { metadata: { sessionId } },
    };

    try {
      const stream = entry.agent.stream(task);
      const traceId = sessionId ?? `trace-${Date.now()}`;
      const traces: CallTrace[] = [];

      for await (const chunk of stream) {
        sendSSE('chunk', chunk);

        // Record trace entries from streaming chunks
        if (chunk.type === 'tool_call' && chunk.toolCall) {
          traces.push({
            id: `trace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            timestamp: Date.now(),
            type: 'tool_call',
            input: chunk.toolCall.args,
            output: undefined,
            duration: 0,
            status: 'success',
          });
        }
        if (chunk.type === 'tool_result' && chunk.toolResult) {
          traces.push({
            id: `trace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            timestamp: Date.now(),
            type: 'tool_call',
            input: undefined,
            output: chunk.toolResult.output,
            duration: 0,
            status: 'success',
          });
        }

        if (chunk.type === 'done' || chunk.type === 'error') {
          break;
        }
      }

      // Store traces for later retrieval
      if (traces.length > 0) {
        const existing = traceStore.get(traceId) ?? [];
        traceStore.set(traceId, [...existing, ...traces]);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      sendSSE('error', { type: 'error', error: { code: 'DEBUG_ERROR', message: errMsg } });
    } finally {
      res.end();
    }
  });

  // GET /api/debug/:id/trace/:sessionId — call trace
  app.get('/api/debug/:id/trace/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    const traces = traceStore.get(sessionId) ?? [];
    res.json({ sessionId, traces });
  });

  // GET /api/debug/:id/tools — list loaded tools
  app.get('/api/debug/:id/tools', async (req, res) => {
    const entry = agentStore.get(req.params.id);
    if (!entry) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: `Agent "${req.params.id}" not found.` } });
      return;
    }
    const capabilities: AgentCapability[] = entry.agent?.capabilities ?? [];
    const extraTools = injectedTools.get(req.params.id) ?? [];
    res.json({
      tools: [
        ...capabilities.map((c) => ({ name: c.name, description: c.description, inputSchema: c.inputSchema })),
        ...extraTools,
      ],
    });
  });

  // POST /api/debug/:id/tools/inject — inject temporary tool
  app.post('/api/debug/:id/tools/inject', async (req, res) => {
    const { name, description, parameters, handler } = req.body as {
      name?: string;
      description?: string;
      parameters?: JSONSchema;
      handler?: string;
    };
    if (!name || !description || !parameters) {
      res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Must include "name", "description", and "parameters" fields.' } });
      return;
    }
    const tool = { name, description, parameters, handler: handler ?? '' };
    const existing = injectedTools.get(req.params.id) ?? [];
    injectedTools.set(req.params.id, [...existing, tool]);
    broadcastIfReady(wss, 'tool:injected', { agentId: req.params.id, tool: name });
    res.status(201).json({ success: true, tool });
  });

  // ── Node Registration (separated deployment) ───────────────────────

  // GET /api/nodes — list registered agent nodes
  app.get('/api/nodes', async (_req, res) => {
    const nodes = [...nodeStore.values()];
    res.json({ nodes });
  });

  // POST /api/nodes/register — agent node registration
  app.post('/api/nodes/register', async (req, res) => {
    const node = req.body as Partial<AgentNode>;
    if (!node?.name || !node?.url) {
      res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Node must include "name" and "url" fields.' } });
      return;
    }
    const entry: AgentNode = {
      name: node.name,
      url: node.url,
      tags: node.tags ?? [],
      capabilities: node.capabilities ?? [],
      registeredAt: Date.now(),
      lastHeartbeat: Date.now(),
      status: 'alive',
      metrics: node.metrics ?? null,
      hostInfo: node.hostInfo,
    };
    nodeStore.set(node.name, entry);
    broadcastIfReady(wss, 'node:registered', { name: node.name, url: node.url });
    res.status(201).json({ success: true, node: entry });
  });

  // POST /api/nodes/:name/heartbeat — heartbeat
  app.post('/api/nodes/:name/heartbeat', async (req, res) => {
    const node = nodeStore.get(req.params.name);
    if (!node) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: `Node "${req.params.name}" not found.` } });
      return;
    }
    node.lastHeartbeat = Date.now();
    node.status = 'alive';
    if (req.body?.metrics) {
      node.metrics = req.body.metrics;
    }
    res.json({ success: true });
  });

  // ── Health ──────────────────────────────────────────────────────────

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  // ── Static dashboard files ─────────────────────────────────────────

  const distPath = path.resolve(__dirname, '../../dashboard/dist');
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Expose WSS setter so startDashboardServer can attach it after listen()
  (app as any)._setWss = (w: WebSocketServer) => { wss = w; };

  return app;
}

/** Helper: broadcast event if WSS is available */
function broadcastIfReady(wss: WebSocketServer | undefined, event: string, data: unknown): void {
  if (!wss) return;
  broadcastEvent(wss, event, data);
}

export function startDashboardServer(options: DashboardOptions = {}): Promise<import('http').Server> {
  const app = createDashboardServer(options);
  const port = options.port ?? 8080;
  return new Promise((resolve) => {
    const server: Server = app.listen(port, () => {
      console.log(`Dashboard available at http://localhost:${port}`);
      // Attach WebSocket server
      const wss = setupWebSocket(server);
      (app as any)._setWss(wss);
      resolve(server);
    });
  });
}

// Expose stores for programmatic access (used by DashboardPlugin)
export { agentStore, nodeStore, traceStore, injectedTools };
