import type { ClientAgentTemplateListItem } from '@agentforge/types';
import { apiClient } from './client.js';

export interface ClientAgentTemplateDetail extends ClientAgentTemplateListItem {
  systemPromptTemplate?: string;
  defaultTools?: string[];
  defaultConfig?: Record<string, unknown>;
}

export async function listTemplates(): Promise<ClientAgentTemplateListItem[]> {
  const response = await apiClient.get<ClientAgentTemplateListItem[]>('/client-agent-templates');
  return response.data;
}

export async function getTemplate(id: string): Promise<ClientAgentTemplateDetail> {
  const response = await apiClient.get<ClientAgentTemplateDetail>(`/client-agent-templates/${id}`);
  return response.data;
}
