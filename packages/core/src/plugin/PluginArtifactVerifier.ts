import type { PluginCapability } from '@agentforge/types';
import { CoreError } from '../errors.js';
import { verifyPluginSignature } from '../security/SignatureVerifier.js';

export interface PluginArtifactVerifierOptions {
  trustStoreDir?: string;
}

export async function verifyPluginArtifact(
  capability: PluginCapability,
  artifact: Uint8Array,
  options: PluginArtifactVerifierOptions = {}
): Promise<void> {
  if (!capability.signature.trim()) {
    throw new CoreError(
      'PLUGIN_SIGNATURE_REQUIRED',
      `Plugin "${capability.id}" must include a signature`
    );
  }

  const valid = await verifyPluginSignature({
    payload: Buffer.from(artifact.buffer, artifact.byteOffset, artifact.byteLength),
    signature: capability.signature,
    trustStoreDir: options.trustStoreDir,
    keyId: capability.keyId,
  });
  if (!valid) {
    throw new CoreError(
      'PLUGIN_SIGNATURE_INVALID',
      `Plugin "${capability.id}" signature verification failed`
    );
  }
}
