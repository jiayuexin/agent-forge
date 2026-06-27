import { createPublicKey, createVerify } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

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
  try {
    return await readFile(join(trustStoreDir, `${keyId}.pem`), 'utf-8');
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
