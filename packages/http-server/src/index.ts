// @agentforge/http-server — HTTP/WebSocket server for AgentForge

// Main agent server
export { createServer, startServer, type ServerOptions } from './server';

// Dashboard backend
export {
  createDashboardServer,
  startDashboardServer,
  type DashboardOptions,
} from './dashboard-server';

// WebSocket event relay
export {
  setupWebSocket,
  broadcastEvent,
  type AgentEventPayload,
} from './ws-events';

// Dashboard plugin
export { DashboardPlugin, type DashboardPluginConfig } from './DashboardPlugin';

// Re-export commonly used types for convenience
export type {
  IAgent,
  AgentTask,
  AgentResult,
  AgentStreamChunk,
  AgentStatus,
  AgentCapability,
  AgentConfig,
  AgentMeta,
  AgentNode,
  CallTrace,
  IPlugin,
  PluginContext,
  Middleware,
  ToolDefinition,
} from '@agentforge/types';
