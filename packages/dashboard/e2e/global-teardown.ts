import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dashboardDir = join(fileURLToPath(import.meta.url), '..', '..');
const pidFile = join(dashboardDir, '.e2e-mock-runtime.pid');

export default async function globalTeardown(): Promise<void> {
  const mockRuntime = (global as unknown as { __MOCK_RUNTIME__?: { stop: () => Promise<void> } })
    .__MOCK_RUNTIME__;
  if (mockRuntime) {
    await mockRuntime.stop();
    console.log('Mock runtime stopped');
  }

  try {
    const pid = Number(readFileSync(pidFile, 'utf-8'));
    if (pid > 0) {
      try {
        process.kill(pid);
      } catch {
        // already exited
      }
    }
  } catch {
    // already cleaned up
  }
}
