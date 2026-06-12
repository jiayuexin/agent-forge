import { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';

export function serveCommand(): Command {
  return new Command('serve')
    .description('Start an HTTP server to serve an agent')
    .argument('[agent-path]', 'Path to the agent directory', './agents')
    .option('-p, --port <port>', 'Port to listen on', '3001')
    .option('--host <host>', 'Host to bind to', 'localhost')
    .action(async (agentPath: string, options: { port: string; host: string }) => {
      const port = parseInt(options.port, 10);
      const host = options.host;
      const resolvedAgentPath = path.resolve(agentPath);

      try {
        // Try to use @agentforge/http-server
        let serverStarted = false;

        try {
          const httpServer = await import('@agentforge/http-server');
          if (httpServer && typeof httpServer.createServer === 'function') {
            const server = httpServer.createServer();
            await server.listen(port, host);
            serverStarted = true;
          }
        } catch {
          // http-server module not fully implemented, fall back to basic express server
        }

        if (!serverStarted) {
          console.log(chalk.yellow('HTTP server module loading...'));
          console.log(chalk.gray('Using built-in fallback server.'));

          const express = await import('express');
          const corsModule = await import('cors');

          const app = express.default();
          app.use(corsModule.default());
          app.use(express.default());

          // Health check endpoint
          app.get('/api/health', (_req, res) => {
            res.json({ status: 'ok', timestamp: new Date().toISOString() });
          });

          // List agents endpoint
          app.get('/api/agents', (_req, res) => {
            res.json({ agents: [], agentDir: resolvedAgentPath });
          });

          // Agent status endpoint
          app.get('/api/agents/:id/status', (req, res) => {
            res.json({
              agentId: req.params.id,
              status: 'ready',
              agentDir: resolvedAgentPath,
            });
          });

          // Execute endpoint
          app.post('/api/agents/:id/execute', (_req, res) => {
            res.json({
              success: false,
              error: {
                code: 'NOT_IMPLEMENTED',
                message: 'Agent execution requires a fully loaded agent. Use the SDK directly.',
              },
            });
          });

          app.listen(port, host, () => {
            console.log(
              chalk.green(`Agent serving at http://${host}:${port}`),
            );
            console.log(
              chalk.gray(`Agent directory: ${resolvedAgentPath}`),
            );
          });
        } else {
          console.log(
            chalk.green(`Agent serving at http://${host}:${port}`),
          );
          console.log(
            chalk.gray(`Agent directory: ${resolvedAgentPath}`),
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`Failed to start server: ${message}`));
        process.exit(1);
      }
    });
}
