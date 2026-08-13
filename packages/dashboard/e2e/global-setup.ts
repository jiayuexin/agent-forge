import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dashboardDir = join(fileURLToPath(import.meta.url), '..', '..');
const E2E_NODE_NAME = 'E2E ClientAgent';

export default async function globalSetup(): Promise<void> {
  const adminToken = process.env.AGENTFORGE_ADMIN_TOKEN ?? 'admin-token';
  const e2ePort = process.env.AGENTFORGE_E2E_PORT ?? '8091';
  const hubUrl = `http://127.0.0.1:${e2ePort}`;
  const dataDir = process.env.AGENTFORGE_DATA_DIR ?? join(dashboardDir, '.agentforge', 'e2e-hub');

  let hubReady = false;
  const started = Date.now();
  while (Date.now() - started < 120_000) {
    try {
      const response = await fetch(`${hubUrl}/api/v1/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) {
        hubReady = true;
        break;
      }
    } catch {
      // Hub not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!hubReady) {
    throw new Error(`E2E globalSetup timed out waiting for hub at ${hubUrl}`);
  }

  const runtimeProcess: ChildProcess = spawn(
    process.execPath,
    [join(dashboardDir, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'e2e/start-e2e-runtime.ts'],
    {
      cwd: dashboardDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        AGENTFORGE_ADMIN_TOKEN: adminToken,
        AGENTFORGE_E2E_PORT: e2ePort,
        AGENTFORGE_DATA_DIR: dataDir,
      },
    }
  );

  if (!runtimeProcess.pid) {
    throw new Error('Failed to spawn E2E ClientAgent runtime');
  }
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(dataDir, 'e2e-runtime.pid'), String(runtimeProcess.pid));

  const nodeWaitStarted = Date.now();
  while (Date.now() - nodeWaitStarted < 60_000) {
    try {
      const response = await fetch(`${hubUrl}/api/v1/nodes`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) {
        const nodes = (await response.json()) as Array<{ name: string }>;
        if (nodes.some((node) => node.name === E2E_NODE_NAME)) {
          console.log('E2E ClientAgent runtime connected');
          return;
        }
      }
    } catch {
      // Runtime still connecting
    }
    if (runtimeProcess.exitCode !== null) {
      throw new Error(`E2E runtime exited early with code ${runtimeProcess.exitCode}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  runtimeProcess.kill('SIGTERM');
  throw new Error('E2E ClientAgent did not appear in /api/v1/nodes');
}
