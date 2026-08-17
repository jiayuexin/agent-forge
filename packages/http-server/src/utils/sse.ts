import type { AgentStreamChunk } from '@agentforge/types';
import type { H3Event } from 'h3';

export async function sendAgentStream(
  event: H3Event,
  stream: AsyncIterable<AgentStreamChunk>
): Promise<void> {
  event.node.res.statusCode = 200;
  event.node.res.setHeader('Content-Type', 'text/event-stream');
  event.node.res.setHeader('Cache-Control', 'no-cache');
  event.node.res.setHeader('Connection', 'keep-alive');

  try {
    for await (const chunk of stream) {
      const line = `data: ${JSON.stringify(chunk)}\n\n`;
      event.node.res.write(line);
    }
    event.node.res.write('data: [DONE]\n\n');
  } catch (error) {
    if (event.node.res.writableEnded) {
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    event.node.res.write(
      `data: ${JSON.stringify({
        type: 'error',
        content: message,
        error: { code: 'STREAM_ERROR', message },
        index: 0,
      })}\n\n`
    );
  } finally {
    if (!event.node.res.writableEnded) {
      event.node.res.end();
    }
  }
}
