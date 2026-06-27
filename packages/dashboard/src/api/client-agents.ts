import type {
  CreateClientAgentRequest,
  GeneratedClientAgentDetail,
  GeneratedClientAgentListItem,
} from '@agentforge/types';
import { apiClient } from './client.js';

export async function listGeneratedClientAgents(): Promise<GeneratedClientAgentListItem[]> {
  const response = await apiClient.get<GeneratedClientAgentListItem[]>('/client-agents');
  return response.data;
}

export async function getGeneratedClientAgent(id: string): Promise<GeneratedClientAgentDetail> {
  const response = await apiClient.get<GeneratedClientAgentDetail>(`/client-agents/${id}`);
  return response.data;
}

export async function createGeneratedClientAgent(
  request: CreateClientAgentRequest
): Promise<GeneratedClientAgentDetail> {
  const response = await apiClient.post<GeneratedClientAgentDetail>('/client-agents', request);
  return response.data;
}
