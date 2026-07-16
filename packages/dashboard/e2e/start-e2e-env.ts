import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dashboardDir = join(fileURLToPath(import.meta.url), '..', '..');
/** Must match packages/dashboard/playwright.config.ts default. */
const e2ePort = process.env.AGENTFORGE_E2E_PORT ?? '8091';

process.env.AGENTFORGE_HOST = process.env.AGENTFORGE_HOST ?? '127.0.0.1';
process.env.AGENTFORGE_PORT = process.env.AGENTFORGE_PORT ?? e2ePort;

const hubProcess: ChildProcess = spawn(
  process.execPath,
  [join(dashboardDir, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'server/start.ts'],
  {
    cwd: dashboardDir,
    stdio: 'inherit',
    env: process.env,
  }
);

hubProcess.on('exit', (code) => {
  process.exit(code ?? 1);
});

function shutdown(): void {
  if (hubProcess.pid) {
    hubProcess.kill('SIGTERM');
  }
}

process.on('SIGINT', () => {
  shutdown();
  process.exit(0);
});
process.on('SIGTERM', () => {
  shutdown();
  process.exit(0);
});
