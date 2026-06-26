import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { CreateHubTokenRequest, CreateHubTokenResponse, HubToken } from '@agentforge/types';
import { createHttpError } from '@agentforge/http-server';

export interface TokenStoreOptions {
  dataDir?: string;
  defaultExpiresInHours?: number;
}

export class TokenStore {
  private tokens = new Map<string, HubToken>();
  private dataDir: string;
  private defaultExpiresInHours: number;

  constructor(options: TokenStoreOptions = {}) {
    this.dataDir = options.dataDir ?? '.agentforge/hub';
    this.defaultExpiresInHours = options.defaultExpiresInHours ?? 720;
  }

  async load(): Promise<void> {
    try {
      const path = this.filePath();
      const text = await readFile(path, 'utf-8');
      const data = JSON.parse(text) as Record<string, HubToken>;
      this.tokens = new Map(Object.entries(data));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async save(): Promise<void> {
    const path = this.filePath();
    await mkdir(dirname(path), { recursive: true });
    const data = Object.fromEntries(this.tokens);
    await writeFile(path, JSON.stringify(data, null, 2));
  }

  create(request: CreateHubTokenRequest): CreateHubTokenResponse {
    const nodeId = this.generateNodeId(request.nodeName);
    const tokenId = randomUUID();
    const token = `aft_${randomBytes(32).toString('base64url')}`;
    const expiresInHours = request.expiresInHours ?? this.defaultExpiresInHours;
    const createdAt = Date.now();
    const expiresAt = createdAt + expiresInHours * 60 * 60 * 1000;

    const record: HubToken = {
      id: tokenId,
      nodeIds: request.nodeIds ?? [nodeId],
      createdAt,
      expiresAt,
      note: request.note,
    };

    this.tokens.set(token, record);
    return {
      token,
      tokenId,
      nodeId,
      expiresAt,
    };
  }

  validate(token: string, options?: { nodeId?: string }): { valid: boolean; token?: HubToken } {
    const record = this.tokens.get(token);
    if (!record) {
      return { valid: false };
    }
    if (record.expiresAt && record.expiresAt < Date.now()) {
      return { valid: false };
    }
    if (options?.nodeId && record.nodeIds && record.nodeIds.length > 0 && !record.nodeIds.includes(options.nodeId)) {
      return { valid: false };
    }
    return { valid: true, token: record };
  }

  async revoke(tokenId: string): Promise<void> {
    let found = false;
    for (const [token, record] of this.tokens) {
      if (record.id === tokenId) {
        this.tokens.delete(token);
        found = true;
        break;
      }
    }
    if (!found) {
      throw createHttpError('TOKEN_NOT_FOUND', `Token "${tokenId}" not found`, 404);
    }
    await this.save();
  }

  list(): HubToken[] {
    return Array.from(this.tokens.values()).map((record) => ({ ...record, token: undefined }));
  }

  private generateNodeId(nodeName?: string): string {
    const base = nodeName?.trim() ?? 'node';
    const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'node';
    return `${slug}-${randomUUID().slice(0, 8)}`;
  }

  private filePath(): string {
    return join(this.dataDir, 'tokens.json');
  }
}
