import type {
  AgentNode,
  AgentResult,
  AgentStreamChunk,
  DebugConfig,
  NodeConfigUpdateRequest,
  NodeExecuteRequest,
} from '@agentforge/types';
import { useAuthStore } from '../store/authStore.js';
import { apiClient } from './client.js';

export async function listNodes(): Promise<AgentNode[]> {
  const response = await apiClient.get<AgentNode[]>('/nodes');
  return response.data;
}

export async function getNode(id: string): Promise<AgentNode> {
  const response = await apiClient.get<AgentNode>(`/nodes/${id}`);
  return response.data;
}

export async function executeNode(id: string, request: NodeExecuteRequest): Promise<AgentResult> {
  const response = await apiClient.post<AgentResult>(`/nodes/${id}/execute`, request);
  return response.data;
}

export async function updateNodeConfig(id: string, request: NodeConfigUpdateRequest): Promise<void> {
  await apiClient.post(`/nodes/${id}/config`, request);
}

export async function unregisterNode(id: string): Promise<void> {
  await apiClient.delete(`/nodes/${id}`);
}

export async function* streamNodeTask(
  id: string,
  request: NodeExecuteRequest,
  debugConfig?: DebugConfig
): AsyncIterable<AgentStreamChunk> {
  const token = useAuthStore.getState().token;
  const body: NodeExecuteRequest = {
    ...request,
    context: {
      ...request.context,
      metadata: {
        ...request.context?.metadata,
        debugConfig,
      },
    },
  };
  const response = await fetch(`/api/nodes/${id}/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token ?? ''}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Stream request failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);
        if (payload === '[DONE]') return;
        yield JSON.parse(payload) as AgentStreamChunk;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
