import type { ClientAgentConfig } from '@agentforge/types';
import { systemPrompt } from './prompts.js';
import { tools } from './tools.js';

export const config: ClientAgentConfig = {
  identity: {
    id: 'e59b4fea-22be-4efb-9177-af546b0b4d36',
    name: 'smoke-test-agent',
    role: 'smoke-test-agent',
    version: '0.0.1',
  },
  model: {"provider":"openai","modelName":"gpt-4","apiKey":"REPLACE_WITH_OPENAI_API_KEY"},
  systemPrompt,
  tools,
  hubUrl: process.env.AGENTFORGE_HUB_URL,
  authToken: process.env.AGENTFORGE_HUB_TOKEN,
};
