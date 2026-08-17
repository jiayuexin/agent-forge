import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import type {
  CreateHubTokenRequest,
  CreateHubTokenResponse,
  HubToken,
  HubTokenRole,
} from '@agentforge/types';
import { createHttpError } from '@agentforge/http-server';
import type { HubRepository, TokenRecordInput } from '../storage/HubRepository.js';

export interface TokenStoreOptions {
  dataDir?: string;
  defaultExpiresInHours?: number;
  repository?: HubRepository;
}

export class TokenStore {
  private tokens = new Map<string, TokenRecordInput>();
  private defaultExpiresInHours: number;
  private repository?: HubRepository;

  constructor(options: TokenStoreOptions = {}) {
    this.defaultExpiresInHours = options.defaultExpiresInHours ?? 720;
    this.repository = options.repository;
  }

  async load(): Promise<void> {
    if (!this.repository) {
      return;
    }
    const records = this.repository.listTokenRecords();
    this.tokens = new Map(records.map((record) => [record.lookupHash, record]));
  }

  async save(): Promise<void> {
    if (!this.repository) {
      return;
    }
    this.repository.replaceTokens([...this.tokens.values()]);
  }

  create(request: CreateHubTokenRequest): CreateHubTokenResponse {
    const role: HubTokenRole = request.role ?? 'node';
    const generatedNodeId = this.generateNodeId(request.nodeName);
    const nodeIds =
      role === 'node'
        ? request.nodeIds && request.nodeIds.length > 0
          ? request.nodeIds
          : [generatedNodeId]
        : request.nodeIds ?? [];

    if (role === 'node' && nodeIds.length === 0) {
      throw createHttpError(
        'INVALID_TOKEN_SCOPE',
        'Node tokens must be bound to at least one nodeId',
        400
      );
    }

    const tokenId = randomUUID();
    const token = `aft_${randomBytes(32).toString('base64url')}`;
    const salt = randomBytes(16).toString('hex');
    const expiresInHours = request.expiresInHours ?? this.defaultExpiresInHours;
    const createdAt = Date.now();
    const expiresAt = createdAt + expiresInHours * 60 * 60 * 1000;
    const lookupHash = hashLookup(token);
    const tokenHash = hashSecret(token, salt);
    const tokenPrefix = token.slice(0, 12);

    const record: TokenRecordInput = {
      id: tokenId,
      role,
      nodeIds,
      scopes: request.scopes,
      createdAt,
      expiresAt,
      note: request.note,
      tokenPrefix,
      tokenHash,
      tokenSalt: salt,
      lookupHash,
    };

    this.tokens.set(lookupHash, record);
    this.repository?.replaceTokens([...this.tokens.values()]);
    return {
      token,
      tokenId,
      tokenPrefix,
      role,
      nodeId: role === 'node' ? nodeIds[0] : undefined,
      nodeIds,
      expiresAt,
    };
  }

  validate(token: string, options?: { nodeId?: string }): { valid: boolean; token?: HubToken } {
    if (!token) {
      return { valid: false };
    }
    const record = this.tokens.get(hashLookup(token));
    if (!record) {
      return { valid: false };
    }
    const expected = Buffer.from(record.tokenHash, 'hex');
    const actual = Buffer.from(hashSecret(token, record.tokenSalt), 'hex');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      return { valid: false };
    }
    if (record.expiresAt && record.expiresAt < Date.now()) {
      return { valid: false };
    }
    if (record.role === 'node' && options?.nodeId && !record.nodeIds?.includes(options.nodeId)) {
      return { valid: false };
    }
    return {
      valid: true,
      token: toPublicToken(record),
    };
  }

  async revoke(tokenId: string): Promise<void> {
    let found = false;
    for (const [lookupHash, record] of this.tokens) {
      if (record.id === tokenId) {
        this.tokens.delete(lookupHash);
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
    return Array.from(this.tokens.values()).map(toPublicToken);
  }

  private generateNodeId(nodeName?: string): string {
    const base = nodeName?.trim() ?? 'node';
    const slug =
      base
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'node';
    return `${slug}-${randomUUID().slice(0, 8)}`;
  }
}

export function hashLookup(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function hashSecret(token: string, salt: string): string {
  return scryptSync(token, salt, 32).toString('hex');
}

function toPublicToken(record: TokenRecordInput): HubToken {
  return {
    id: record.id,
    role: record.role,
    nodeIds: record.nodeIds,
    scopes: record.scopes,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    note: record.note,
    tokenPrefix: record.tokenPrefix,
  };
}
