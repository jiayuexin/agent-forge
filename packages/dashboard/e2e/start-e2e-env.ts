import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dashboardDir = join(fileURLToPath(import.meta.url), '..', '..');
const e2ePort = process.env.AGENTFORGE_E2E_PORT ?? '8090';

process.env.AGENTFORGE_HOST = process.env.AGENTFORGE_HOST ?? '127.0.0.1';
process.env.AGENTFORGE_PORT = process.env.AGENTFORGE_PORT ?? e2ePort;

const hubProcess: ChildProcess = spawn('pnpm', ['run', 'dev:server'], {
  cwd: dashboardDir,
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

hubProcess.on('exit', (code) => {
  process.exit(code ?? 1);
});

process.on('SIGINT', () => {
  if (hubProcess?.pid) {
    hubProcess.kill();
  }
  process.exit(0);
});
process.on('SIGTERM', () => {
  if (hubProcess?.pid) {
    hubProcess.kill();
  }
  process.exit(0);
});
