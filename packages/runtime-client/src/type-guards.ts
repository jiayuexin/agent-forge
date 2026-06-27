import type {
  AgentRuntimeConfig,
  CapabilityDistributePayload,
  RemoteTask,
} from '@agentforge/types';

export function isRemoteTask(payload: unknown): payload is RemoteTask {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'taskId' in payload &&
    'type' in payload &&
    'task' in payload &&
    'source' in payload &&
    'issuedAt' in payload
  );
}

export function isCapabilityDistributePayload(
  payload: unknown
): payload is CapabilityDistributePayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'action' in payload &&
    'capability' in payload
  );
}

export function isPartialAgentRuntimeConfig(
  payload: unknown
): payload is Partial<AgentRuntimeConfig> {
  return typeof payload === 'object' && payload !== null && !('taskId' in payload);
}
