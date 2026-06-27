import { describe, it, expect } from 'vitest';
import { LocalCommandAuth, DEFAULT_READONLY_COMMANDS } from '../LocalCommandAuth.js';
import { sanitizeConfig } from '../sanitizeConfig.js';
import { isSensitiveTask } from '../SensitiveTaskGuard.js';

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
    expect(
      isSensitiveTask({ type: 'payment-refund', input: {} }, ['payment'])
    ).toBe(true);
  });
});
