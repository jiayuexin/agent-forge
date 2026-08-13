import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type {
  CreateClientAgentRequest,
  GeneratedClientAgentDetail,
  GeneratedClientAgentListItem,
} from '@agentforge/types';
import { createHttpError } from '@agentforge/http-server';
import { createGenerator, slugifyName } from '../lib/generator.js';
import type { HubRepository } from '../storage/HubRepository.js';

function extractSystemPrompt(files: Record<string, string>): string {
  const prompts = files['src/prompts.ts'];
  if (!prompts) return '';
  const match = prompts.match(/export const systemPrompt = `([\s\S]*)`;/);
  return match?.[1] ?? prompts;
}

export interface GeneratedClientAgentStoreOptions {
  dataDir?: string;
  repository?: HubRepository;
}

type StoredGeneratedClientAgent = GeneratedClientAgentDetail;

export class GeneratedClientAgentStore {
  private agents = new Map<string, StoredGeneratedClientAgent>();
  private dataDir: string;
  private repository?: HubRepository;

  constructor(options: GeneratedClientAgentStoreOptions = {}) {
    this.dataDir = options.dataDir ?? '.agentforge/hub';
    this.repository = options.repository;
  }

  async load(): Promise<void> {
    if (!this.repository) {
      return;
    }
    this.agents = new Map(this.repository.listGeneratedAgents().map((agent) => [agent.id, agent]));
  }

  async save(): Promise<void> {
    if (!this.repository) {
      return;
    }
    this.repository.replaceGeneratedAgents([...this.agents.values()]);
  }

  list(): GeneratedClientAgentListItem[] {
    return [...this.agents.values()]
      .map(({ id, name, displayName, description, templateId, model, createdAt }) => ({
        id,
        name,
        displayName,
        description,
        templateId,
        model,
        createdAt,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  get(id: string): GeneratedClientAgentDetail | undefined {
    return this.agents.get(id);
  }

  async create(request: CreateClientAgentRequest): Promise<GeneratedClientAgentDetail> {
    const name = slugifyName(request.name);
    const duplicate = [...this.agents.values()].find((agent) => agent.name === name);
    if (duplicate) {
      throw createHttpError('CLIENT_AGENT_EXISTS', `ClientAgent "${name}" already exists`, 409);
    }

    const outputDir = join(this.dataDir, 'client-agents', name);
    const generator = createGenerator();
    const result = await generator.generate({
      description: request.description,
      name,
      templateId: request.templateId,
      outputDir,
      config: request.model
        ? {
            model: {
              provider: 'openai',
              modelName: request.model,
              apiKey: 'REPLACE_WITH_OPENAI_API_KEY',
            },
          }
        : undefined,
    });

    const id = randomUUID();
    const detail: GeneratedClientAgentDetail = {
      id,
      name,
      displayName: request.name,
      description: request.description,
      templateId: request.templateId,
      model: request.model,
      createdAt: Date.now(),
      outputDir,
      systemPrompt: extractSystemPrompt(result.files),
      riskLevel: result.metadata.riskLevel,
    };

    this.agents.set(id, detail);
    await this.save();
    return detail;
  }
}
