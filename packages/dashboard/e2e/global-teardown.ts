import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dashboardDir = join(fileURLToPath(import.meta.url), '..', '..');

export default async function globalTeardown(): Promise<void> {
  const dataDir = process.env.AGENTFORGE_DATA_DIR ?? join(dashboardDir, '.agentforge', 'e2e-hub');
  try {
    const pid = Number(readFileSync(join(dataDir, 'e2e-runtime.pid'), 'utf8'));
    if (Number.isInteger(pid) && pid > 0) {
      process.kill(pid, 'SIGTERM');
      console.log(`E2E ClientAgent runtime stopped (${pid})`);
    }
  } catch {
    // Runtime already exited or pid file missing
  }
}
