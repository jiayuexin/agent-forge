import type { HubRuntimeConfig } from '@agentforge/types';
import { apiClient } from './client.js';

export async function getRuntimeConfig(): Promise<HubRuntimeConfig> {
  const response = await apiClient.get<HubRuntimeConfig>('/config');
  return response.data;
}
