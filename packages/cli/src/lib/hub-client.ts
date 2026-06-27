export interface HubClientOptions {
  baseUrl: string;
  adminToken?: string;
}

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
    const response = await fetch(`${this.options.baseUrl}/api/capabilities`, {
      headers: this.headers(),
    });
    if (!response.ok) {
      throw new Error(`Failed to list capabilities: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  async publishCapability(capability: unknown): Promise<unknown> {
    const response = await fetch(`${this.options.baseUrl}/api/capabilities`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(capability),
    });
    if (!response.ok) {
      throw new Error(`Failed to publish capability: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  async distributeCapability(
    capabilityId: string,
    body: { nodeIds: string[]; action: 'add' | 'update' | 'remove'; targetVersion?: string }
  ): Promise<unknown> {
    const response = await fetch(`${this.options.baseUrl}/api/capabilities/${capabilityId}/distribute`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`Failed to distribute capability: ${response.status} ${response.statusText}`);
    }
    return response.json();
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
