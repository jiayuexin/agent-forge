import { createPublicKey, createVerify } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export interface SignatureVerifyInput {
  payload: Buffer | string;
  signature: string;
  publicKeyPem: string;
}

export function verifySignature(input: SignatureVerifyInput): boolean {
  const verifier = createVerify('SHA256');
  verifier.update(input.payload);
  verifier.end();
  return verifier.verify(createPublicKey(input.publicKeyPem), input.signature, 'base64');
}

export async function loadTrustStorePublicKey(
  trustStoreDir: string,
  keyId = 'default'
): Promise<string | undefined> {
  if (!KEY_ID_PATTERN.test(keyId)) {
    return undefined;
  }

  try {
    const trustStorePath = await realpath(trustStoreDir);
    const keyPath = resolve(trustStorePath, `${keyId}.pem`);
    if (dirname(keyPath) !== trustStorePath) {
      return undefined;
    }

    const resolvedKeyPath = await realpath(keyPath);
    if (dirname(resolvedKeyPath) !== trustStorePath) {
      return undefined;
    }

    return await readFile(resolvedKeyPath, 'utf-8');
  } catch {
    return undefined;
  }
}

export async function verifyPluginSignature(options: {
  payload: Buffer | string;
  signature: string;
  trustStoreDir?: string;
  keyId?: string;
}): Promise<boolean> {
  const trustStoreDir = options.trustStoreDir ?? '.agentforge/trust-keys';
  const publicKeyPem = await loadTrustStorePublicKey(trustStoreDir, options.keyId);
  if (!publicKeyPem) {
    return false;
  }
  return verifySignature({
    payload: options.payload,
    signature: options.signature,
    publicKeyPem,
  });
}
