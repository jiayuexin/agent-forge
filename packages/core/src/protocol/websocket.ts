import {
  HUB_PROTOCOL_VERSION,
  HUB_WS_BEARER_PREFIX,
  HUB_WS_SUBPROTOCOL,
  type AgentMessage,
  type ControlMessage,
} from '@agentforge/types';
import { agentMessageSchema, controlMessageSchema } from './schemas.js';

export function buildHubWebSocketProtocols(token?: string): string[] {
  const protocols = [HUB_WS_SUBPROTOCOL];
  if (token) {
    protocols.push(`${HUB_WS_BEARER_PREFIX}${token}`);
  }
  return protocols;
}

export function parseHubWebSocketProtocols(header: string | string[] | undefined): {
  hasVersion: boolean;
  token?: string;
} {
  const values = (Array.isArray(header) ? header.join(',') : header ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return {
    hasVersion: values.includes(HUB_WS_SUBPROTOCOL),
    token: values
      .find((item) => item.startsWith(HUB_WS_BEARER_PREFIX))
      ?.slice(HUB_WS_BEARER_PREFIX.length),
  };
}

const CONTROL_TYPES = new Set<ControlMessage['type']>([
  'execute',
  'stream',
  'config-update',
  'capability-distribute',
  'cancel',
  'ping',
  'stop',
]);

const AGENT_MESSAGE_TYPES = new Set<AgentMessage['type']>([
  'result',
  'stream-chunk',
  'status',
  'metric',
  'event',
  'capability-ack',
  'config-ack',
  'local-approval-request',
  'pong',
  'error',
]);

export function isSupportedProtocolVersion(version: unknown): boolean {
  return version === undefined || version === HUB_PROTOCOL_VERSION;
}

export function parseControlMessage(data: unknown): ControlMessage | null {
  const parsed = controlMessageSchema.safeParse(data);
  if (!parsed.success || !CONTROL_TYPES.has(parsed.data.type)) {
    return null;
  }
  return parsed.data as ControlMessage;
}

export function parseAgentMessagePayload(data: unknown): AgentMessage | null {
  const parsed = agentMessageSchema.safeParse(data);
  if (!parsed.success || !AGENT_MESSAGE_TYPES.has(parsed.data.type)) {
    return null;
  }
  return parsed.data as AgentMessage;
}
