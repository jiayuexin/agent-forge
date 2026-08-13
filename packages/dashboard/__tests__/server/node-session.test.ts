import { EventEmitter } from 'node:events';
import { describe, it, expect } from 'vitest';
import { HUB_PROTOCOL_VERSION } from '@agentforge/types';
import { NodeSession } from '../../server/services/NodeSession.js';

class FakeWebSocket extends EventEmitter {
  readyState = 1;
  OPEN = 1;
  sent: string[] = [];

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
  }
}

describe('NodeSession stream', () => {
  it('fails the stream when the agent sends an error for the same messageId', async () => {
    const ws = new FakeWebSocket();
    const session = new NodeSession(ws as never, { nodeId: 'n1' });
    const chunks = session.stream(
      {
        taskId: 't1',
        type: 'stream',
        task: { type: 'chat', input: { message: 'x' } },
        source: 'hub',
        issuedAt: Date.now(),
      },
      2000
    );
    const result = (async () => {
      const received = [];
      for await (const chunk of chunks) {
        received.push(chunk);
      }
      return received;
    })();

    const sent = JSON.parse(ws.sent[0]) as { messageId: string };
    session.handleMessage({
      type: 'error',
      protocolVersion: HUB_PROTOCOL_VERSION,
      messageId: sent.messageId,
      nodeId: 'n1',
      timestamp: Date.now(),
      payload: { code: 'RUNTIME_ERROR', message: 'stream boom' },
    });

    await expect(result).rejects.toThrow(/RUNTIME_ERROR: stream boom/);
  });
});
