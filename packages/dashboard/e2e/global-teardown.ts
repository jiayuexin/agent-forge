import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export default async function globalTeardown(): Promise<void> {
  const dashboardDir = join(fileURLToPath(import.meta.url), '..', '..');
  const pidFile = join(dashboardDir, '.e2e-mock-runtime.pid');

  try {
    const pid = Number(readFileSync(pidFile, 'utf-8'));
    if (pid > 0) {
      process.kill(pid);
    }
  } catch {
    // already stopped
  }
}
