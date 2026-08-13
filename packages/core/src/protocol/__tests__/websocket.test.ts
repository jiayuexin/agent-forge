import { describe, it, expect } from 'vitest';
import { HUB_WS_BEARER_PREFIX, HUB_WS_SUBPROTOCOL } from '@agentforge/types';
import {
  buildHubWebSocketProtocols,
  parseControlMessage,
  parseAgentMessagePayload,
  parseHubWebSocketProtocols,
} from '../websocket.js';

describe('Hub protocol schemas', () => {
  it('builds and parses WebSocket subprotocols', () => {
    expect(buildHubWebSocketProtocols()).toEqual([HUB_WS_SUBPROTOCOL]);
    expect(buildHubWebSocketProtocols('secret-token')).toEqual([
      HUB_WS_SUBPROTOCOL,
      `${HUB_WS_BEARER_PREFIX}secret-token`,
    ]);
    expect(parseHubWebSocketProtocols(buildHubWebSocketProtocols('secret-token'))).toEqual({
      hasVersion: true,
      token: 'secret-token',
    });
    expect(parseHubWebSocketProtocols('other.v1')).toEqual({ hasVersion: false, token: undefined });
  });

  it('rejects control messages without messageId', () => {
    expect(
      parseControlMessage({
        type: 'ping',
        nodeId: 'n1',
        timestamp: Date.now(),
        payload: {},
      })
    ).toBeNull();
  });

  it('accepts current protocol version messages', () => {
    const message = parseControlMessage({
      type: 'ping',
      protocolVersion: 1,
      messageId: 'm1',
      nodeId: 'n1',
      timestamp: Date.now(),
      payload: {},
    });
    expect(message?.type).toBe('ping');
  });

  it('rejects incompatible protocol versions', () => {
    expect(
      parseControlMessage({
        type: 'ping',
        protocolVersion: 99,
        messageId: 'm1',
        nodeId: 'n1',
        timestamp: Date.now(),
        payload: {},
      })
    ).toBeNull();
    expect(
      parseAgentMessagePayload({
        type: 'pong',
        protocolVersion: 99,
        nodeId: 'n1',
        timestamp: Date.now(),
      })
    ).toBeNull();
  });
});
