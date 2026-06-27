import type {
  Capability,
  CapabilityAckPayload,
  DistributeCapabilityRequest,
} from '@agentforge/types';
import { apiClient } from './client.js';

export async function listCapabilities(): Promise<Capability[]> {
  const response = await apiClient.get<Capability[]>('/capabilities');
  return response.data;
}

export async function getCapability(id: string): Promise<Capability> {
  const response = await apiClient.get<Capability>(`/capabilities/${id}`);
  return response.data;
}

export async function createCapability(capability: Capability): Promise<void> {
  await apiClient.post('/capabilities', capability);
}

export async function updateCapability(id: string, capability: Capability): Promise<void> {
  await apiClient.put(`/capabilities/${id}`, capability);
}

export async function deleteCapability(id: string): Promise<void> {
  await apiClient.delete(`/capabilities/${id}`);
}

export async function listCapabilityVersions(id: string): Promise<Capability[]> {
  const response = await apiClient.get<Capability[]>(`/capabilities/${id}/versions`);
  return response.data;
}

export async function distributeCapability(
  id: string,
  request: DistributeCapabilityRequest
): Promise<Record<string, CapabilityAckPayload>> {
  const response = await apiClient.post<Record<string, CapabilityAckPayload>>(
    `/capabilities/${id}/distribute`,
    request
  );
  return response.data;
}
