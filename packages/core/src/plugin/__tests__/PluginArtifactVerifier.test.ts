import { createSign, generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PluginCapability } from '@agentforge/types';
import { verifyPluginArtifact } from '../PluginArtifactVerifier.js';

const artifact = Buffer.from('agentforge-plugin');

describe('verifyPluginArtifact', () => {
  let trustStoreDir: string;
  let privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'];

  beforeEach(async () => {
    trustStoreDir = await mkdtemp(join(tmpdir(), 'agentforge-plugin-trust-'));
    const keyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    privateKey = keyPair.privateKey;
    await writeFile(
      join(trustStoreDir, 'publisher-1.pem'),
      keyPair.publicKey.export({ type: 'spki', format: 'pem' })
    );
  });

  afterEach(async () => {
    await rm(trustStoreDir, { recursive: true, force: true });
  });

  it('accepts an artifact signed by the declared trust-store key', async () => {
    const capability = createCapability(sign(artifact));

    await expect(
      verifyPluginArtifact(capability, artifact, { trustStoreDir })
    ).resolves.toBeUndefined();
  });

  it('rejects an empty mandatory signature at runtime', async () => {
    const capability = createCapability('');

    await expect(
      verifyPluginArtifact(capability, artifact, { trustStoreDir })
    ).rejects.toMatchObject({ code: 'PLUGIN_SIGNATURE_REQUIRED' });
  });

  it('rejects an artifact whose bytes do not match the signature', async () => {
    const capability = createCapability(sign(Buffer.from('different')));

    await expect(
      verifyPluginArtifact(capability, artifact, { trustStoreDir })
    ).rejects.toMatchObject({ code: 'PLUGIN_SIGNATURE_INVALID' });
  });

  function sign(payload: Buffer): string {
    const signer = createSign('SHA256');
    signer.update(payload);
    signer.end();
    return signer.sign(privateKey, 'base64');
  }
});

function createCapability(signature: string): PluginCapability {
  return {
    id: 'plugin:test',
    type: 'plugin',
    name: 'test-plugin',
    description: 'Test plugin',
    downloadUrl: 'https://example.com/plugin.wasm',
    signature,
    keyId: 'publisher-1',
    entry: 'run',
    allowedCapabilities: [],
    sandbox: { timeoutMs: 1_000, maxMemoryPages: 8 },
  };
}
