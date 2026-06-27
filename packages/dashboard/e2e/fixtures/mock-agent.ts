import type {
  AgentResult,
  AgentStreamChunk,
  IClientAgent,
} from '@agentforge/types';
import { AgentStatus } from '@agentforge/types';

export function createE2EMockAgent(overrides?: Partial<IClientAgent>): IClientAgent {
  const agent: IClientAgent = {
    id: 'e2e-mock-agent',
    name: 'e2e-mock-node',
    role: 'test',
    version: '1.0.0',
    capabilities: [],
    status: AgentStatus.READY,
    init: async () => undefined,
    execute: async () =>
      ({
        success: true,
        output: { content: 'ok' },
        meta: {
          duration: 0,
          tokensUsed: { input: 0, output: 0, total: 0 },
          model: 'mock',
        },
      }) as AgentResult,
    stream: async function* () {
      yield {
        type: 'thinking',
        content: 'Building system prompt',
        index: 0,
      } as AgentStreamChunk;
      yield {
        type: 'text',
        content: '## E2E Reply\n\n```js\nconsole.log("hello")\n```',
        index: 1,
      } as AgentStreamChunk;
      yield {
        type: 'tool_call',
        toolCall: { name: 'git-status', arguments: {} },
        index: 2,
      } as AgentStreamChunk;
      yield {
        type: 'tool_result',
        toolResult: { name: 'git-status', output: 'clean' },
        index: 3,
      } as AgentStreamChunk;
      yield { type: 'done', index: 4 } as AgentStreamChunk;
    },
    destroy: async () => undefined,
    use: function () {
      return this;
    },
    on: function () {
      return this;
    },
    off: function () {
      return this;
    },
    startDaemon: async () => undefined,
    stopDaemon: async () => undefined,
    connectToHub: async () => undefined,
    disconnectFromHub: async () => undefined,
    getLocalCapabilityCache: () => [],
    getLocalCommandAuthorization: () => 'disabled',
    ...overrides,
  };

  return agent;
}
