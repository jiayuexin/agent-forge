import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Command } from 'commander';
import { parse as parseYaml } from 'yaml';
import { createGenerator, defaultOutputDir } from '../lib/generator.js';

interface BatchConfig {
  agents: Array<{
    name: string;
    description: string;
    templateId?: string;
    model?: string;
    output?: string;
  }>;
}

export function registerBatchCommand(program: Command): void {
  program
    .command('batch')
    .description('Batch generate ClientAgents from a YAML/JSON config file')
    .argument('<config-file>', 'Path to batch config file')
    .action(async (configFile: string) => {
      const text = await readFile(resolve(configFile), 'utf-8');
      const config = (configFile.endsWith('.json')
        ? JSON.parse(text)
        : parseYaml(text)) as BatchConfig;

      if (!Array.isArray(config.agents) || config.agents.length === 0) {
        throw new Error('Batch config must contain a non-empty "agents" array');
      }

      const generator = createGenerator();
      const inputs = config.agents.map((agent) => ({
        description: agent.description,
        name: agent.name,
        templateId: agent.templateId,
        outputDir: resolve(agent.output ?? defaultOutputDir(agent.name)),
        config: agent.model
          ? {
              model: {
                provider: 'openai' as const,
                modelName: agent.model,
                apiKey: 'REPLACE_WITH_OPENAI_API_KEY',
              },
            }
          : undefined,
      }));

      const results = await generator.batch(inputs);
      for (const result of results) {
        console.log(`Generated ${result.metadata.name}`);
      }
    });
}
