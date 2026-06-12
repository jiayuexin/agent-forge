import { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';
import fs from 'node:fs';

export function dashboardCommand(): Command {
  return new Command('dashboard')
    .description('Start the AgentForge web dashboard')
    .option('-p, --port <port>', 'Port to listen on', '8080')
    .action(async (options: { port: string }) => {
      const port = parseInt(options.port, 10);

      try {
        console.log(chalk.yellow('HTTP server module loading...'));
        console.log(chalk.gray('Starting dashboard server...'));

        const express = await import('express');
        const corsModule = await import('cors');

        const app = express.default();
        app.use(corsModule.default());
        app.use(express.default());

        // Dashboard API endpoints
        app.get('/api/status', (_req, res) => {
          res.json({
            status: 'running',
            version: '0.1.0',
            uptime: process.uptime(),
          });
        });

        app.get('/api/agents', (_req, res) => {
          res.json({ agents: [] });
        });

        app.get('/api/agents/:id', (req, res) => {
          res.json({
            id: req.params.id,
            status: 'not_found',
          });
        });

        // Serve static frontend files if available
        const staticDir = path.resolve(
          path.join(__dirname, '..', '..', '..', '..', 'packages', 'dashboard', 'dist'),
        );

        if (fs.existsSync(staticDir)) {
          app.use(express.default.static(staticDir));
        } else {
          // Serve a minimal placeholder page
          app.get('/', (_req, res) => {
            res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AgentForge Dashboard</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0f172a; color: #e2e8f0; }
    .container { text-align: center; }
    h1 { font-size: 2rem; margin-bottom: 0.5rem; }
    p { color: #94a3b8; }
    code { background: #1e293b; padding: 2px 8px; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>AgentForge Dashboard</h1>
    <p>Dashboard frontend is not built yet.</p>
    <p>API available at <code>/api/status</code> and <code>/api/agents</code></p>
  </div>
</body>
</html>`);
          });
        }

        app.listen(port, () => {
          console.log(
            chalk.green(`Dashboard available at http://localhost:${port}`),
          );
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`Failed to start dashboard: ${message}`));
        process.exit(1);
      }
    });
}
