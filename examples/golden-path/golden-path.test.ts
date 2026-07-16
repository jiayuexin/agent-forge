import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const exampleDir = dirname(fileURLToPath(import.meta.url));
const runnerPath = join(exampleDir, 'run-local.mjs');
const offlineRunnerPath = join(exampleDir, 'run-offline.mjs');
const repoRoot = join(exampleDir, '../..');

describe('golden-path example', () => {
  it('installs a Tool fixture and executes it via CachedCapabilitySource', () => {
    expect(existsSync(runnerPath)).toBe(true);

    const result = spawnSync(process.execPath, [runnerPath], {
      cwd: repoRoot,
      encoding: 'utf-8',
      env: process.env,
    });

    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(result.stdout).toContain('hello-agentforge');
    expect(result.stdout).toContain('GOLDEN_PATH_OK');
  });

  it('executes a cached Tool with Hub unreachable (US8 offline)', () => {
    expect(existsSync(offlineRunnerPath)).toBe(true);

    const result = spawnSync(process.execPath, [offlineRunnerPath], {
      cwd: repoRoot,
      encoding: 'utf-8',
      env: process.env,
    });

    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(result.stdout).toContain('hello-agentforge');
    expect(result.stdout).toContain('HUB_UNREACHABLE');
    expect(result.stdout).toContain('RUNTIME_NOT_CONNECTED');
    expect(result.stdout).toContain('OFFLINE_CAPABILITY_OK');
  });
});
