import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GeneratedClientAgentStore } from '../../server/services/GeneratedClientAgentStore.js';
import * as generatorModule from '../../server/lib/generator.js';
import type { GenerateResult } from '../../../core/src/generator/types.js';

function mockGenerator(generate: () => Promise<GenerateResult>) {
  return vi.spyOn(generatorModule, 'createGenerator').mockReturnValue({
    generate: vi.fn().mockImplementation(generate),
  } as unknown as ReturnType<typeof generatorModule.createGenerator>);
}

function baseGenerateResult(overrides?: Partial<GenerateResult>): GenerateResult {
  return {
    files: { 'src/prompts.ts': 'export const systemPrompt = `prompt`;' },
    metadata: {
      riskLevel: 'low',
      role: 'test',
      name: 'test',
      displayName: 'Test',
      capabilities: [],
      scenarios: [],
      toolCategories: [],
    },
    ...overrides,
  } as GenerateResult;
}

describe('GeneratedClientAgentStore', () => {
  let dataDir: string;
  let store: GeneratedClientAgentStore;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'generated-agent-store-'));
    store = new GeneratedClientAgentStore({ dataDir });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('load handles missing index file gracefully', async () => {
    await expect(store.load()).resolves.toBeUndefined();
  });

  it('list returns sorted items by createdAt descending', async () => {
    mockGenerator(async () => baseGenerateResult());
    const first = await store.create({
      name: 'first-agent',
      description: 'First generated agent description',
      templateId: 'general',
    });

    mockGenerator(async () => baseGenerateResult());
    const second = await store.create({
      name: 'second-agent',
      description: 'Second generated agent description',
      templateId: 'general',
    });

    const list = store.list();
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe(second.id);
    expect(list[1].id).toBe(first.id);
  });

  it('get returns a stored detail and undefined for unknown id', async () => {
    mockGenerator(async () => baseGenerateResult());
    const detail = await store.create({
      name: 'known-agent',
      description: 'Known generated agent description',
      templateId: 'general',
    });

    expect(store.get(detail.id)).toEqual(detail);
    expect(store.get('unknown-id')).toBeUndefined();
  });

  describe('create', () => {
    it('generates a slug from request.name', async () => {
      mockGenerator(async () => baseGenerateResult());
      const detail = await store.create({
        name: 'My Agent Name',
        description: 'Description for my agent',
        templateId: 'general',
      });

      expect(detail.name).toBe('my-agent-name');
    });

    it('throws CLIENT_AGENT_EXISTS for duplicate names', async () => {
      mockGenerator(async () => baseGenerateResult());
      await store.create({
        name: 'Duplicate Agent',
        description: 'First duplicate agent description',
        templateId: 'general',
      });

      mockGenerator(async () => baseGenerateResult());
      await expect(
        store.create({
          name: 'duplicate-agent',
          description: 'Second duplicate agent description',
          templateId: 'general',
        })
      ).rejects.toMatchObject({
        code: 'CLIENT_AGENT_EXISTS',
        statusCode: 409,
      });
    });

    it('includes model config placeholder when request.model is provided', async () => {
      const generate = vi.fn().mockResolvedValue(baseGenerateResult());
      vi.spyOn(generatorModule, 'createGenerator').mockReturnValue({
        generate,
      } as unknown as ReturnType<typeof generatorModule.createGenerator>);

      await store.create({
        name: 'model-agent',
        description: 'Agent that uses a model',
        templateId: 'general',
        model: 'gpt-4o',
      });

      expect(generate).toHaveBeenCalledWith(
        expect.objectContaining({
          config: {
            model: {
              provider: 'openai',
              modelName: 'gpt-4o',
              apiKey: 'REPLACE_WITH_OPENAI_API_KEY',
            },
          },
        })
      );
    });

    it('persists and returns the detail', async () => {
      mockGenerator(async () => baseGenerateResult());
      const detail = await store.create({
        name: 'persisted-agent',
        description: 'Persisted generated agent description',
        templateId: 'general',
      });

      expect(detail).toMatchObject({
        name: 'persisted-agent',
        displayName: 'persisted-agent',
        description: 'Persisted generated agent description',
        templateId: 'general',
        systemPrompt: 'prompt',
        riskLevel: 'low',
      });

      const reloaded = new GeneratedClientAgentStore({ dataDir });
      await reloaded.load();
      expect(reloaded.get(detail.id)).toEqual(detail);
    });
  });

  describe('extractSystemPrompt', () => {
    it('parses src/prompts.ts correctly', async () => {
      mockGenerator(async () =>
        baseGenerateResult({
          files: {
            'src/prompts.ts': 'export const systemPrompt = `Hello system prompt`;',
          },
        })
      );
      const detail = await store.create({
        name: 'parsed-agent',
        description: 'Parsed system prompt agent',
        templateId: 'general',
      });

      expect(detail.systemPrompt).toBe('Hello system prompt');
    });

    it('falls back to the whole file', async () => {
      mockGenerator(async () =>
        baseGenerateResult({
          files: {
            'src/prompts.ts': 'Plain prompt content without export statement',
          },
        })
      );
      const detail = await store.create({
        name: 'fallback-agent',
        description: 'Fallback system prompt agent',
        templateId: 'general',
      });

      expect(detail.systemPrompt).toBe('Plain prompt content without export statement');
    });
  });
});
