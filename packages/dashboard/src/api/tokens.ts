import type { CreateHubTokenRequest, HubToken } from '@agentforge/types';
import { apiClient } from './client.js';

export async function listTokens(): Promise<HubToken[]> {
  const response = await apiClient.get<HubToken[]>('/admin/tokens');
  return response.data;
}

export async function createToken(request: CreateHubTokenRequest): Promise<{ token: string; tokenId: string; nodeId: string; expiresAt?: number }> {
  const response = await apiClient.post<{ token: string; tokenId: string; nodeId: string; expiresAt?: number }>('/admin/tokens', request);
  return response.data;
}

export async function revokeToken(tokenId: string): Promise<void> {
  await apiClient.delete(`/admin/tokens/${tokenId}`);
}
