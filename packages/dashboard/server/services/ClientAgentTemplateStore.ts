import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentTemplate, ClientAgentTemplateListItem } from '@agentforge/types';

type TemplateMeta = AgentTemplate & { tags?: string[] };

export interface ClientAgentTemplateStoreOptions {
  templatesDir?: string;
}

export class ClientAgentTemplateStore {
  private templatesDir: string;

  constructor(options: ClientAgentTemplateStoreOptions = {}) {
    this.templatesDir = options.templatesDir ?? `${process.cwd()}/templates/roles`;
  }

  async list(): Promise<ClientAgentTemplateListItem[]> {
    const entries = await readdir(this.templatesDir, { withFileTypes: true });
    const items: ClientAgentTemplateListItem[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const meta = await this.loadMeta(entry.name);
      if (!meta) continue;
      items.push({
        id: meta.id,
        name: meta.name,
        displayName: meta.displayName,
        description: meta.description,
        category: meta.category,
        tags: (meta as TemplateMeta).tags ?? [],
      });
    }
    return items;
  }

  async get(id: string): Promise<AgentTemplate | undefined> {
    return this.loadMeta(id);
  }

  private async loadMeta(id: string): Promise<TemplateMeta | undefined> {
    try {
      const text = await readFile(join(this.templatesDir, id, 'meta.json'), 'utf-8');
      return JSON.parse(text) as TemplateMeta;
    } catch {
      return undefined;
    }
  }
}
