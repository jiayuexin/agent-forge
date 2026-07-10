import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  verifySignature,
  loadTrustStorePublicKey,
  verifyPluginSignature,
} from '../SignatureVerifier.js';

describe('SignatureVerifier', () => {
  let tempDir: string;
  let publicKeyPem: string;
  let privateKeyPem: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'sig-verify-'));
    const pair = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    publicKeyPem = pair.publicKey;
    privateKeyPem = pair.privateKey;
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  async function sign(payload: Buffer | string): Promise<string> {
    const { createSign } = await import('node:crypto');
    const signer = createSign('SHA256');
    signer.update(payload);
    signer.end();
    return signer.sign(privateKeyPem, 'base64');
  }

  it('returns true for a valid signature', async () => {
    const payload = 'hello world';
    const signature = await sign(payload);
    expect(verifySignature({ payload, signature, publicKeyPem })).toBe(true);
  });

  it('returns false for an invalid signature', async () => {
    const payload = 'hello world';
    expect(verifySignature({ payload, signature: 'invalid-signature', publicKeyPem })).toBe(false);
  });

  it('returns false when payload does not match', async () => {
    const payload = 'hello world';
    const signature = await sign(payload);
    expect(verifySignature({ payload: 'tampered', signature, publicKeyPem })).toBe(false);
  });

  it('loads existing public key from trust store', async () => {
    await writeFile(join(tempDir, 'default.pem'), publicKeyPem, 'utf-8');
    const loaded = await loadTrustStorePublicKey(tempDir, 'default');
    expect(loaded).toBe(publicKeyPem);
  });

  it('returns undefined when public key file is missing', async () => {
    const loaded = await loadTrustStorePublicKey(tempDir, 'missing');
    expect(loaded).toBeUndefined();
  });

  it('verifyPluginSignature returns false when public key is missing', async () => {
    const result = await verifyPluginSignature({
      payload: 'test',
      signature: 'sig',
      trustStoreDir: join(tempDir, 'empty'),
    });
    expect(result).toBe(false);
  });

  it('verifyPluginSignature returns true with a valid signature', async () => {
    const payload = randomBytes(32);
    const signature = await sign(payload);
    await writeFile(join(tempDir, 'default.pem'), publicKeyPem, 'utf-8');

    const result = await verifyPluginSignature({
      payload,
      signature,
      trustStoreDir: tempDir,
    });
    expect(result).toBe(true);
  });
});
