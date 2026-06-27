import { resolve } from 'node:path';
import type { Command } from 'commander';
import { loadClientAgent } from '../lib/load-agent.js';
import { AgentRuntimeClient } from '@agentforge/runtime-client';

export function registerRunCommand(program: Command): void {
  program
    .command('run')
    .description('Start a ClientAgent daemon and connect to Capability Hub')
    .argument('<client-agent-path>', 'Path to generated ClientAgent directory')
    .option('--connect <hub-url>', 'Capability Hub WebSocket endpoint', 'ws://localhost:8080')
    .option('--token <auth-token>', 'Node authentication token')
    .option('--node-name <name>', 'Node display name')
    .option('--heartbeat <ms>', 'Heartbeat interval in milliseconds', '30000')
    .action(async (clientAgentPath: string, options) => {
      const agent = await loadClientAgent(resolve(clientAgentPath));
      await agent.startDaemon();

      const token = options.token ?? process.env.AGENTFORGE_HUB_TOKEN;
      if (!token) {
        throw new Error('Node token is required via --token or AGENTFORGE_HUB_TOKEN');
      }

      const hubUrl = options.connect.includes('/ws/nodes/')
        ? options.connect
        : `${options.connect.replace(/\/$/, '')}/ws/nodes/${agent.id}`;

      const client = new AgentRuntimeClient(agent, {
        hubUrl,
        authToken: token,
        nodeName: options.nodeName ?? agent.name,
        heartbeatInterval: Number(options.heartbeat),
        allowRemoteExecution: true,
        capabilityCacheDir: resolve(clientAgentPath, '.agentforge', 'capabilities'),
      });

      await client.start();
      console.log(`ClientAgent "${agent.name}" connected to ${hubUrl}`);

      const shutdown = async () => {
        await client.stop();
        await agent.stopDaemon();
        await agent.destroy();
        process.exit(0);
      };

      process.on('SIGINT', () => {
        void shutdown();
      });
      process.on('SIGTERM', () => {
        void shutdown();
      });
    });
}
