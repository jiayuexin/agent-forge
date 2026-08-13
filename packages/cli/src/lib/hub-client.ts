export interface HubClientOptions {
  baseUrl: string;
  adminToken?: string;
}

const API_PREFIX = '/api/v1';

export class HubClient {
  constructor(private readonly options: HubClientOptions) {}

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.options.adminToken) {
      headers.Authorization = `Bearer ${this.options.adminToken}`;
    }
    return headers;
  }

  async listCapabilities(): Promise<unknown> {
    return this.request(`${API_PREFIX}/capabilities`);
  }

  async publishCapability(capability: unknown): Promise<unknown> {
    return this.request(`${API_PREFIX}/capabilities`, {
      method: 'POST',
      body: JSON.stringify(capability),
    });
  }

  async distributeCapability(
    capabilityId: string,
    body: { nodeIds: string[]; action: 'add' | 'update' | 'remove'; targetVersion?: string }
  ): Promise<unknown> {
    return this.request(`${API_PREFIX}/capabilities/${capabilityId}/distribute`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async createToken(body: Record<string, unknown>): Promise<unknown> {
    return this.request(`${API_PREFIX}/admin/tokens`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async listTokens(): Promise<unknown> {
    return this.request(`${API_PREFIX}/admin/tokens`);
  }

  async revokeToken(tokenId: string): Promise<unknown> {
    return this.request(`${API_PREFIX}/admin/tokens/${tokenId}`, { method: 'DELETE' });
  }

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await fetch(`${this.options.baseUrl}${path}`, {
      ...init,
      headers: { ...this.headers(), ...(init.headers as Record<string, string> | undefined) },
    });
    if (!response.ok) {
      throw new Error(`Hub request failed: ${response.status} ${response.statusText} (${path})`);
    }
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
}

export function resolveHubBaseUrl(connect?: string): string {
  if (!connect) {
    return 'http://localhost:8080';
  }
  if (connect.startsWith('ws://')) {
    return connect.replace('ws://', 'http://').replace(/\/ws\/.*$/, '');
  }
  if (connect.startsWith('wss://')) {
    return connect.replace('wss://', 'https://').replace(/\/ws\/.*$/, '');
  }
  return connect.replace(/\/$/, '');
}
