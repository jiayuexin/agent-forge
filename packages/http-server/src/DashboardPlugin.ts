import type { IPlugin, PluginContext, IAgent, AgentConfig } from '@agentforge/types';
import { startDashboardServer, agentStore } from './dashboard-server';
import type { Server } from 'http';

export interface DashboardPluginConfig {
  /** Port for the dashboard server (default 8080) */
  port?: number;
  /** Directories to scan for agent definitions */
  agentDirs?: string[];
}

/**
 * DashboardPlugin — integrates the dashboard server into the agent lifecycle.
 *
 * When installed, it starts a dashboard HTTP + WebSocket server and
 * registers the agent in the dashboard's internal store so that it
 * can be managed and monitored through the dashboard UI.
 */
export class DashboardPlugin implements IPlugin {
  name = 'dashboard';
  version = '0.1.0';

  private server: Server | undefined;

  constructor(private readonly config: DashboardPluginConfig = {}) {}

  async install(agent: IAgent, context: PluginContext): Promise<void> {
    // Register the agent in the dashboard store
    const meta = {
      id: agent.id,
      name: agent.name,
      description: agent.role,
      role: agent.role,
      version: agent.version,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      author: '',
      tags: [],
      capabilities: agent.capabilities,
      config: context.config,
      dependencies: [],
    };

    const existing = agentStore.get(agent.id);
    agentStore.set(agent.id, { meta, agent: existing?.agent ?? agent });

    // Start the dashboard server if not already running
    if (!this.server) {
      this.server = await startDashboardServer({
        port: this.config.port,
        agentDirs: this.config.agentDirs,
      });
    }

    context.logger.info(`[DashboardPlugin] Agent "${agent.name}" registered on dashboard`);
  }

  uninstall(agent: IAgent): void {
    // Remove agent from store
    agentStore.delete(agent.id);

    // Close the dashboard server
    if (this.server) {
      this.server.close();
      this.server = undefined;
    }
  }
}
