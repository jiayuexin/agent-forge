import { describe, it, expect } from 'vitest';
import { parseControlMessage, parseAgentMessagePayload } from '../websocket.js';

describe('Hub protocol schemas', () => {
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
