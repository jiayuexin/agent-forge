import { resolve } from 'node:path';
import type { Command } from 'commander';
import { SimpleLogger } from '@agentforge/core';
import { startDebugServer } from '@agentforge/http-server';
import { loadClientAgent } from '../lib/load-agent.js';

export function registerServeCommand(program: Command): void {
  program
    .command('serve')
    .description('Start a local debug HTTP server for a ClientAgent')
    .argument('[client-agent-path]', 'Path to generated ClientAgent directory')
    .option('--port <port>', 'HTTP port', '3001')
    .option('--host <host>', 'HTTP host', 'localhost')
    .action(async (clientAgentPath: string | undefined, options) => {
      if (!clientAgentPath) {
        throw new Error('client-agent-path is required for agentforge serve');
      }

      const agent = await loadClientAgent(resolve(clientAgentPath));
      const logger = new SimpleLogger({ component: 'DebugServerCLI' });
      const server = await startDebugServer(agent, {
        port: Number(options.port),
        host: options.host,
        logger,
      });

      console.log(`Debug server listening at ${server.url}`);

      const shutdown = async () => {
        await server.stop();
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
