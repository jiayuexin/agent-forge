import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';

export interface ListedClientAgent {
  name: string;
  path: string;
  role?: string;
  capabilities?: string[];
}

export async function listClientAgents(baseDir: string): Promise<ListedClientAgent[]> {
  const root = resolve(baseDir);
  if (!existsSync(root)) {
    return [];
  }

  const entries = await readdir(root, { withFileTypes: true });
  const agents: ListedClientAgent[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const agentPath = join(root, entry.name);
    const configPath = join(agentPath, '.agentforge', 'config.json');
    if (!existsSync(configPath)) {
      continue;
    }

    const config = JSON.parse(await readFile(configPath, 'utf-8')) as {
      identity?: { name?: string };
      role?: string;
      capabilities?: string[];
    };

    agents.push({
      name: config.identity?.name ?? entry.name,
      path: agentPath,
      role: config.role,
      capabilities: config.capabilities,
    });
  }

  return agents;
}

export function formatAgentList(agents: ListedClientAgent[], format: 'table' | 'json' | 'yaml'): string {
  if (format === 'json') {
    return JSON.stringify(agents, null, 2);
  }

  if (format === 'yaml') {
    return agents
      .map((agent) => `- name: ${agent.name}\n  path: ${agent.path}\n  role: ${agent.role ?? ''}`)
      .join('\n');
  }

  if (agents.length === 0) {
    return 'No ClientAgents found.';
  }

  const lines = ['NAME\tROLE\tPATH'];
  for (const agent of agents) {
    lines.push(`${agent.name}\t${agent.role ?? '-'}\t${agent.path}`);
  }
  return lines.join('\n');
}
