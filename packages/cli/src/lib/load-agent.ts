import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
import type { IClientAgent } from '@agentforge/types';

export async function loadClientAgent(agentPath: string): Promise<IClientAgent> {
  const root = resolve(agentPath);
  const candidates = [join(root, 'dist', 'agent.js'), join(root, 'src', 'agent.js')];
  const entry = candidates.find((candidate) => existsSync(candidate));

  if (!entry) {
    throw new Error(
      `Cannot find agent entry in ${root}. Build the ClientAgent first (pnpm build) or ensure src/agent.js exists.`
    );
  }

  const moduleUrl = pathToFileURL(entry).href;
  const loaded = (await import(moduleUrl)) as { agent?: IClientAgent; default?: IClientAgent };
  const agent = loaded.agent ?? loaded.default;

  if (!agent || typeof agent.init !== 'function') {
    throw new Error(`Module ${entry} does not export a valid ClientAgent instance as "agent"`);
  }

  await agent.init();
  return agent;
}
