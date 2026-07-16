import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const e2ePort = process.env.AGENTFORGE_E2E_PORT ?? '8091';
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;
const e2eDataDir =
  process.env.AGENTFORGE_DATA_DIR ?? join(repoRoot, '.agentforge', `e2e-hub-${process.pid}`);

// Align globalSetup / helpers with webServer when AGENTFORGE_E2E_PORT is unset.
process.env.AGENTFORGE_E2E_PORT = e2ePort;
process.env.AGENTFORGE_PORT = e2ePort;
process.env.AGENTFORGE_DATA_DIR = e2eDataDir;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL: e2eBaseUrl,
    trace: 'on-first-retry',
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // build:web runs in package.json test:e2e / CI `pnpm build` before Playwright.
    command: 'pnpm exec tsx e2e/start-e2e-env.ts',
    url: `${e2eBaseUrl}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      AGENTFORGE_ADMIN_TOKEN: process.env.AGENTFORGE_ADMIN_TOKEN ?? 'admin-token',
      AGENTFORGE_E2E_PORT: e2ePort,
      AGENTFORGE_PORT: e2ePort,
      AGENTFORGE_TEMPLATES_DIR:
        process.env.AGENTFORGE_TEMPLATES_DIR ?? join(repoRoot, 'templates', 'roles'),
      AGENTFORGE_DATA_DIR: e2eDataDir,
    },
  },
});
