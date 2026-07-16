import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalCommandAuth, DEFAULT_READONLY_COMMANDS } from '../LocalCommandAuth.js';
import { sanitizeConfig } from '../sanitizeConfig.js';
import { isSensitiveTask, askLocalUserConfirmation } from '../SensitiveTaskGuard.js';
import { AuditLog } from '../AuditLog.js';

describe('LocalCommandAuth', () => {
  it('denies all commands when disabled', () => {
    const auth = new LocalCommandAuth({ level: 'disabled' });
    expect(auth.authorize('ls').allowed).toBe(false);
  });

  it('allows readonly commands', () => {
    const auth = new LocalCommandAuth({ level: 'readonly' });
    for (const command of DEFAULT_READONLY_COMMANDS.slice(0, 3)) {
      expect(auth.authorize(command).allowed).toBe(true);
    }
    expect(auth.authorize('rm -rf /').allowed).toBe(false);
  });

  it('requires confirmation for sensitive commands', () => {
    const auth = new LocalCommandAuth({ level: 'full' });
    expect(auth.authorize('git push origin main').requiresConfirmation).toBe(true);
  });

  it('whitelist level only allows configured commands', () => {
    const auth = new LocalCommandAuth({ level: 'whitelist', whitelist: ['custom-cmd'] });
    expect(auth.authorize('custom-cmd').allowed).toBe(true);
    expect(auth.authorize('ls').allowed).toBe(false);
  });

  it('extra confirmation commands are considered sensitive', () => {
    const auth = new LocalCommandAuth({ level: 'full', requireConfirmationFor: ['deploy'] });
    expect(auth.authorize('deploy prod').requiresConfirmation).toBe(true);
  });
});

describe('sanitizeConfig', () => {
  it('redacts sensitive keys', () => {
    const sanitized = sanitizeConfig({
      apiKey: 'secret-key',
      nested: { authToken: 'token-value' },
      port: 8080,
    });
    expect(sanitized.apiKey).toBe('***');
    expect((sanitized.nested as Record<string, unknown>).authToken).toBe('***');
    expect(sanitized.port).toBe(8080);
  });
});

describe('isSensitiveTask', () => {
  it('detects configured sensitive task types', () => {
    expect(isSensitiveTask({ type: 'payment-refund', input: {} }, ['payment'])).toBe(true);
  });

  it('detects sensitive content in task input', () => {
    expect(
      isSensitiveTask({ type: 'refund', input: { reason: 'payment dispute' } }, ['payment'])
    ).toBe(true);
  });

  it('returns false when nothing matches', () => {
    expect(isSensitiveTask({ type: 'greet', input: { name: 'world' } }, ['payment'])).toBe(false);
  });

  it('is case-insensitive for input matching', () => {
    expect(isSensitiveTask({ type: 'greet', input: { text: 'PAYMENT' } }, ['payment'])).toBe(true);
  });
});

describe('askLocalUserConfirmation', () => {
  const originalQuestion = vi.hoisted(() => vi.fn());

  vi.mock('node:readline/promises', () => ({
    createInterface: vi.fn(() => ({
      question: originalQuestion,
      close: vi.fn(),
    })),
  }));

  beforeEach(() => {
    originalQuestion.mockReset();
  });

  it.each(['y', 'Y', 'yes', 'YES'])('returns true for %s', async (answer) => {
    originalQuestion.mockResolvedValue(answer);
    const result = await askLocalUserConfirmation({ type: 'test', input: {} });
    expect(result).toBe(true);
  });

  it.each(['n', 'N', 'no', '', 'maybe'])('returns false for %s', async (answer) => {
    originalQuestion.mockResolvedValue(answer);
    const result = await askLocalUserConfirmation({ type: 'test', input: {} });
    expect(result).toBe(false);
  });
});

describe('AuditLog', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'audit-log-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('creates parent directory and appends a JSON event', async () => {
    const log = new AuditLog(join(tempDir, 'deep', 'audit.log'));
    await log.record({ action: 'test', resource: 'r1', outcome: 'success' });

    const content = await readFile(join(tempDir, 'deep', 'audit.log'), 'utf-8');
    const event = JSON.parse(content.trim());
    expect(event).toMatchObject({ action: 'test', resource: 'r1', outcome: 'success' });
    expect(typeof event.timestamp).toBe('number');
  });

  it('uses provided timestamp when given', async () => {
    const log = new AuditLog(join(tempDir, 'audit.log'));
    const timestamp = 1234567890;
    await log.record({ action: 'test', resource: 'r1', outcome: 'success', timestamp });

    const content = await readFile(join(tempDir, 'audit.log'), 'utf-8');
    const event = JSON.parse(content.trim());
    expect(event.timestamp).toBe(timestamp);
  });

  it('appends multiple events as separate lines', async () => {
    const log = new AuditLog(join(tempDir, 'audit.log'));
    await log.record({ action: 'a', outcome: 'success' });
    await log.record({ action: 'b', outcome: 'denied' });

    const content = await readFile(join(tempDir, 'audit.log'), 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).action).toBe('a');
    expect(JSON.parse(lines[1]).action).toBe('b');
  });

  it('queries events within time range, newest first', async () => {
    const log = new AuditLog(join(tempDir, 'audit.log'));
    const base = Date.now() - 60_000;
    await log.record({ action: 'local-command', outcome: 'success', timestamp: base });
    await log.record({
      action: 'capability-distribute',
      outcome: 'success',
      timestamp: base + 1000,
    });
    await log.record({ action: 'config-change', outcome: 'success', timestamp: base + 2000 });

    const result = await log.query({ from: base + 500, to: base + 2000 });
    expect(result.total).toBe(2);
    expect(result.items.map((e) => e.action)).toEqual(['config-change', 'capability-distribute']);
  });

  it('filters by action', async () => {
    const log = new AuditLog(join(tempDir, 'audit.log'));
    const now = Date.now();
    await log.record({ action: 'local-command', outcome: 'success', timestamp: now - 1000 });
    await log.record({ action: 'config-change', outcome: 'success', timestamp: now });

    const result = await log.query({ action: 'local-command' });
    expect(result.total).toBe(1);
    expect(result.items[0].action).toBe('local-command');
  });

  it('applies limit and offset', async () => {
    const log = new AuditLog(join(tempDir, 'audit.log'));
    const base = Date.now() - 30_000;
    await log.record({ action: 'a', outcome: 'success', timestamp: base });
    await log.record({ action: 'b', outcome: 'success', timestamp: base + 1000 });
    await log.record({ action: 'c', outcome: 'success', timestamp: base + 2000 });

    const result = await log.query({ limit: 1, offset: 1 });
    expect(result.total).toBe(3);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].action).toBe('b');
  });

  it('excludes events older than 90 days from default query window', async () => {
    const log = new AuditLog(join(tempDir, 'audit.log'));
    const now = Date.now();
    const ninetyOneDaysAgo = now - 91 * 24 * 60 * 60 * 1000;
    await log.record({ action: 'old', outcome: 'success', timestamp: ninetyOneDaysAgo });
    await log.record({ action: 'recent', outcome: 'success', timestamp: now });

    const result = await log.query();
    expect(result.total).toBe(1);
    expect(result.items[0].action).toBe('recent');
  });
});
