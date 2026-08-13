import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { hashLookup, hashSecret } from '../services/TokenStore.js';
import type { HubRepository, TokenRecordInput } from './HubRepository.js';
import type { Capability, GeneratedClientAgentDetail, HubToken } from '@agentforge/types';
import type { AuditEvent } from '@agentforge/core';

export async function importLegacyJson(dataDir: string, repository: HubRepository): Promise<void> {
  await importLegacyTokens(join(dataDir, 'tokens.json'), repository);
  await importLegacyCapabilities(join(dataDir, 'capabilities.json'), repository);
  await importLegacyAgents(join(dataDir, 'generated-client-agents.json'), repository);
  await importLegacyAudit(join(dataDir, 'audit.log'), repository);
}

async function importLegacyTokens(path: string, repository: HubRepository): Promise<void> {
  const text = await readOptional(path);
  if (!text) return;
  const data = JSON.parse(text) as Record<string, HubToken & { token?: string }>;
  const existing = repository.listTokenRecords();
  const records = [...existing];
  for (const [plaintext, token] of Object.entries(data)) {
    if (plaintext.startsWith('aft_')) {
      const salt = token.id;
      records.push({
        id: token.id,
        role: token.role ?? 'node',
        nodeIds: token.nodeIds ?? [],
        scopes: token.scopes,
        createdAt: token.createdAt,
        expiresAt: token.expiresAt,
        note: token.note,
        tokenPrefix: plaintext.slice(0, 12),
        tokenSalt: salt,
        tokenHash: hashSecret(plaintext, salt),
        lookupHash: hashLookup(plaintext),
      } satisfies TokenRecordInput);
    }
  }
  repository.replaceTokens(records);
}

async function importLegacyCapabilities(path: string, repository: HubRepository): Promise<void> {
  const text = await readOptional(path);
  if (!text) return;
  const data = JSON.parse(text) as Record<string, { versions: Capability[] }>;
  repository.replaceCapabilities(
    Object.entries(data).map(([id, stored]) => ({ id, versions: stored.versions }))
  );
}

async function importLegacyAgents(path: string, repository: HubRepository): Promise<void> {
  const text = await readOptional(path);
  if (!text) return;
  const data = JSON.parse(text) as Record<string, GeneratedClientAgentDetail>;
  repository.replaceGeneratedAgents(Object.values(data));
}

async function importLegacyAudit(path: string, repository: HubRepository): Promise<void> {
  const text = await readOptional(path);
  if (!text) return;
  for (const line of text
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)) {
    repository.recordAudit(JSON.parse(line) as AuditEvent);
  }
}

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}
