import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import fs from 'node:fs';
import path from 'node:path';
import { parse as yamlParse } from 'yaml';
import { AgentGenerator, type GenerateInput, type GenerateResult } from '@agentforge/core';

interface BatchAgentConfig {
  name?: string;
  description: string;
  templateId?: string;
  outputDir?: string;
  model?: string;
  provider?: string;
  tools?: string[];
}

interface BatchConfig {
  agents: BatchAgentConfig[];
}

function loadBatchConfig(configPath: string): BatchConfig {
  const resolvedPath = path.resolve(configPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Config file not found: ${resolvedPath}`);
  }

  const raw = fs.readFileSync(resolvedPath, 'utf-8');
  const ext = path.extname(resolvedPath).toLowerCase();

  if (ext === '.yaml' || ext === '.yml') {
    return yamlParse(raw) as BatchConfig;
  }

  if (ext === '.json') {
    return JSON.parse(raw) as BatchConfig;
  }

  // Try YAML first, fall back to JSON
  try {
    return yamlParse(raw) as BatchConfig;
  } catch {
    return JSON.parse(raw) as BatchConfig;
  }
}

export function batchCommand(): Command {
  return new Command('batch')
    .description('Batch-create agents from a YAML/JSON config file')
    .argument('<config-file>', 'Path to YAML/JSON batch configuration file')
    .action(async (configPath: string) => {
      const spinner = ora('Loading batch configuration...').start();

      try {
        const config = loadBatchConfig(configPath);

        if (!config.agents || !Array.isArray(config.agents) || config.agents.length === 0) {
          spinner.fail(chalk.red('No agents found in configuration file'));
          process.exit(1);
        }

        spinner.text = `Preparing ${config.agents.length} agents for generation...`;

        const templateDir = path.resolve(
          path.join(__dirname, '..', '..', '..', '..', 'templates'),
        );

        const generator = new AgentGenerator(templateDir);

        const inputs: GenerateInput[] = config.agents.map((agent) => ({
          description: agent.description,
          templateId: agent.templateId,
          outputDir: agent.outputDir ?? `./agents/${agent.name ?? 'agent'}`,
          config: {
            modelConfig: {
              provider: agent.provider ?? 'openai',
              ...(agent.model ? { modelName: agent.model } : {}),
            },
          },
        }));

        spinner.text = `Generating ${inputs.length} agents (concurrency: 3)...`;

        const results: GenerateResult[] = [];
        let errors = 0;

        // Process with progress tracking
        const total = inputs.length;
        let completed = 0;

        for (let i = 0; i < total; i += 3) {
          const chunk = inputs.slice(i, i + 3);
          const chunkResults = await Promise.allSettled(
            chunk.map(async (input) => {
              const result = await generator.generate(input);
              completed++;
              spinner.text = `Generating agents... (${completed}/${total})`;
              return result;
            }),
          );

          for (const r of chunkResults) {
            if (r.status === 'fulfilled') {
              results.push(r.value);
            } else {
              errors++;
              completed++;
            }
          }
        }

        spinner.succeed(
          chalk.green(
            `Batch generation complete: ${results.length} agents generated, ${errors} errors`,
          ),
        );

        console.log();
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          const agentCfg = config.agents[i];
          console.log(
            chalk.bold(`  ${agentCfg.name ?? result.metadata.parsed.title}`),
          );
          console.log(
            chalk.gray(`    Template: ${result.metadata.templateId}`),
          );
          console.log(
            chalk.gray(`    Files: ${Object.keys(result.files).length}`),
          );
        }

        if (errors > 0) {
          console.log();
          console.log(
            chalk.yellow(`${errors} agent(s) failed to generate.`),
          );
        }
      } catch (err) {
        spinner.fail(chalk.red('Batch generation failed'));
        const message = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(message));
        process.exit(1);
      }
    });
}
