import type { AgentStreamChunk, CallTrace } from '@agentforge/types';

const TRACE_LABELS: Record<CallTrace['type'], string> = {
  system_prompt: 'System Prompt 构建',
  llm_call: 'LLM 调用',
  tool_call: '工具调用',
  output_parse: '结构化输出解析',
};

export function getTraceLabel(type: CallTrace['type']): string {
  return TRACE_LABELS[type];
}

export function buildCallTraces(chunks: AgentStreamChunk[]): CallTrace[] {
  const traces: CallTrace[] = [];
  let index = 0;

  for (const chunk of chunks) {
    const timestamp = Date.now();
    switch (chunk.type) {
      case 'thinking':
        traces.push({
          id: `trace-${index++}`,
          timestamp,
          type: 'system_prompt',
          input: chunk.content ?? '',
          output: chunk.content ?? '',
          duration: 0,
          status: 'success',
        });
        break;
      case 'text':
        traces.push({
          id: `trace-${index++}`,
          timestamp,
          type: 'llm_call',
          input: '',
          output: chunk.content ?? '',
          duration: 0,
          status: 'success',
        });
        break;
      case 'tool_call':
        traces.push({
          id: `trace-${index++}`,
          timestamp,
          type: 'tool_call',
          input: chunk.toolCall ?? chunk.content ?? '',
          output: chunk.toolCall?.name ?? chunk.content ?? '',
          duration: 0,
          status: 'success',
        });
        break;
      case 'tool_result':
        traces.push({
          id: `trace-${index++}`,
          timestamp,
          type: 'tool_call',
          input: chunk.toolResult ?? '',
          output: chunk.toolResult ?? '',
          duration: 0,
          status: 'success',
        });
        break;
      case 'done':
        traces.push({
          id: `trace-${index++}`,
          timestamp,
          type: 'output_parse',
          input: '',
          output: 'done',
          duration: 0,
          status: 'success',
        });
        break;
      case 'error':
        traces.push({
          id: `trace-${index++}`,
          timestamp,
          type: 'output_parse',
          input: '',
          output: chunk.content ?? 'error',
          duration: 0,
          status: 'error',
          error: chunk.content,
        });
        break;
      default:
        break;
    }
  }

  return traces;
}

export function buildStreamContent(chunks: AgentStreamChunk[], newChunk: AgentStreamChunk): string {
  const textChunks = [...chunks, newChunk]
    .filter((chunk) => chunk.type === 'text')
    .map((chunk) => (chunk as { content?: string }).content ?? '');
  return textChunks.join('');
}
