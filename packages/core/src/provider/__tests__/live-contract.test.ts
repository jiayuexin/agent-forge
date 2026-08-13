import { describe, it, expect } from 'vitest';
import { OpenAIProvider } from '../OpenAIProvider.js';
import { AnthropicProvider } from '../AnthropicProvider.js';

const openaiKey = process.env.OPENAI_API_KEY;
const anthropicKey = process.env.ANTHROPIC_API_KEY;

describe.skipIf(!openaiKey)('OpenAI live contract', () => {
  it('returns a chat completion from the live API', async () => {
    const provider = new OpenAIProvider({
      provider: 'openai',
      modelName: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      apiKey: openaiKey as string,
    });
    const response = await provider.chat({
      messages: [{ role: 'user', content: 'Reply with the word ping only.' }],
    });
    expect(response.content.toLowerCase()).toContain('ping');
  }, 30_000);
});

describe.skipIf(!anthropicKey)('Anthropic live contract', () => {
  it('returns a chat completion from the live API', async () => {
    const provider = new AnthropicProvider({
      provider: 'anthropic',
      modelName: process.env.ANTHROPIC_MODEL ?? 'claude-3-haiku-20240307',
      apiKey: anthropicKey as string,
    });
    const response = await provider.chat({
      messages: [{ role: 'user', content: 'Reply with the word ping only.' }],
    });
    expect(response.content.toLowerCase()).toContain('ping');
  }, 30_000);
});
