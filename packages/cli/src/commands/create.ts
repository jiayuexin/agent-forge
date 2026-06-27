import { resolve } from 'node:path';
import type { Command } from 'commander';
import { createGenerator, defaultOutputDir, slugifyName } from '../lib/generator.js';
import { loadClientAgent } from '../lib/load-agent.js';
import { AgentRuntimeClient } from '@agentforge/runtime-client';

export function registerCreateCommand(program: Command): void {
  program
    .command('create')
    .description('Generate a ClientAgent from a job description')
    .argument('<description>', 'Job description')
    .option('-n, --name <name>', 'ClientAgent name')
    .option('-o, --output <path>', 'Output directory')
    .option('-t, --template <template>', 'Template id')
    .option('-m, --model <model>', 'Default model name')
    .option('--run', 'Start the ClientAgent after generation')
    .option('--confirm-high-risk', 'Confirm high-risk template generation')
    .action(async (description: string, options) => {
      const name = options.name ?? slugifyName(description);
      const outputDir = resolve(options.output ?? defaultOutputDir(name));
      const generator = createGenerator();

      const result = await generator.generate({
        description,
        name,
        templateId: options.template,
        outputDir,
        config: options.model
          ? {
              model: {
                provider: 'openai' as const,
                modelName: options.model,
                apiKey: 'REPLACE_WITH_OPENAI_API_KEY',
              },
            }
          : undefined,
      });

      if (result.metadata.riskLevel === 'high' && !options.confirmHighRisk) {
        console.warn('High-risk template generated. Re-run with --confirm-high-risk if intended.');
      }

      console.log(`Generated ClientAgent at ${outputDir}`);

      if (options.run) {
        const agent = await loadClientAgent(outputDir);
        const hubUrl = process.env.AGENTFORGE_HUB_URL ?? 'ws://localhost:8080/ws/nodes/default';
        const token = process.env.AGENTFORGE_HUB_TOKEN;
        if (!token) {
          throw new Error('AGENTFORGE_HUB_TOKEN is required when using --run');
        }
        const client = new AgentRuntimeClient(agent, {
          hubUrl,
          authToken: token,
          nodeName: agent.name,
          allowRemoteExecution: true,
        });
        await client.start();
        console.log(`ClientAgent connected to ${hubUrl}`);
      }
    });
}
