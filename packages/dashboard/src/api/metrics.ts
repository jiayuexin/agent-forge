import { apiClient } from './client.js';

export async function getMetrics(): Promise<string> {
  const response = await apiClient.get<string>('/metrics', {
    responseType: 'text',
  });
  return response.data;
}
