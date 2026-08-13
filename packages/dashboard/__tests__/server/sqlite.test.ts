import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openHubRepository } from '../../server/storage/sqlite.js';
import { importLegacyJson } from '../../server/storage/importLegacy.js';
import { TokenStore } from '../../server/services/TokenStore.js';
import { startTestHub } from '../helpers.js';

describe('Hub SQLite repository', () => {
  let dataDir: string;

  afterEach(async () => {
    if (dataDir) {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it('applies migrations idempotently and survives restart', async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'hub-sqlite-'));
    const dbPath = join(dataDir, 'hub.sqlite');
    const first = openHubRepository(dbPath);
    const store = new TokenStore({ repository: first });
    const created = store.create({ role: 'readonly', note: 'restart' });
    first.close();

    const second = openHubRepository(dbPath);
    second.migrate();
    const reloaded = new TokenStore({ repository: second });
    await reloaded.load();
    expect(reloaded.validate(created.token).valid).toBe(true);
    expect(reloaded.list()).toHaveLength(1);
    second.close();
  });

  it('backs up and restores token records', async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'hub-sqlite-backup-'));
    const dbPath = join(dataDir, 'hub.sqlite');
    const repository = openHubRepository(dbPath);
    const store = new TokenStore({ repository });
    const created = store.create({ role: 'admin' });
    const backupPath = join(dataDir, 'backup.sqlite');
    await repository.backup(backupPath);
    repository.close();

    const restored = openHubRepository(backupPath);
    const restoredStore = new TokenStore({ repository: restored });
    await restoredStore.load();
    expect(restoredStore.validate(created.token).valid).toBe(true);
    restored.close();
  });

  it('imports legacy plaintext token JSON once', async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'hub-sqlite-legacy-'));
    const plaintext = `aft_${'a'.repeat(32)}`;
    await writeFile(
      join(dataDir, 'tokens.json'),
      JSON.stringify({
        [plaintext]: {
          id: 'legacy-1',
          role: 'node',
          nodeIds: ['legacy-node'],
          createdAt: Date.now(),
        },
      }),
      'utf-8'
    );
    const repository = openHubRepository(join(dataDir, 'hub.sqlite'));
    await importLegacyJson(dataDir, repository);
    const store = new TokenStore({ repository });
    await store.load();
    expect(store.validate(plaintext).valid).toBe(true);
    repository.close();
  });

  it('keeps tokens after Hub process restart', async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'hub-sqlite-hub-'));
    const first = await startTestHub({ dataDir });
    const created = first.hub.tokenStore.create({ role: 'readonly' });
    await first.hub.stop();

    const second = await startTestHub({ dataDir });
    expect(second.hub.tokenStore.validate(created.token).valid).toBe(true);
    await second.hub.stop();
  });

  it('keeps concurrent token and audit writes consistent', async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'hub-sqlite-concurrent-'));
    const repository = openHubRepository(join(dataDir, 'hub.sqlite'));
    const store = new TokenStore({ repository });
    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        Promise.resolve().then(() => {
          store.create({ role: 'readonly', note: `concurrent-${index}` });
          repository.recordAudit({
            timestamp: Date.now(),
            action: 'token-create',
            resource: `concurrent-${index}`,
            outcome: 'success',
          });
        })
      )
    );
    expect(store.list()).toHaveLength(20);
    expect(repository.queryAudit({ action: 'token-create' }).total).toBe(20);
    repository.close();
  });
});
