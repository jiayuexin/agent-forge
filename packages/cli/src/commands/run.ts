import { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';
import fs from 'node:fs';
import * as readline from 'node:readline';
import { BaseAgent, AgentStatus } from '@agentforge/core';
import type { IAgent, AgentConfig, AgentTask, AgentResult } from '@agentforge/types';

interface RunOptions {
  provider: string;
  model?: string;
}

/**
 * Dynamically load an agent from a directory.
 * Looks for .agentforge.json and the compiled index.js to instantiate the agent.
 */
async function loadAgent(agentPath: string, options: RunOptions): Promise<IAgent | null> {
  const resolved = path.resolve(agentPath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`Agent directory not found: ${resolved}`);
  }

  // Try to load .agentforge.json for metadata
  const configPath = path.join(resolved, '.agentforge.json');
  let agentMeta: Record<string, unknown> = {};
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf-8');
    agentMeta = JSON.parse(raw);
  }

  // Try dynamic import of the compiled agent
  const indexPath = path.join(resolved, 'dist', 'index.js');
  if (fs.existsSync(indexPath)) {
    try {
      const module = await import(indexPath);
      // Look for a default export or the first exported class extending BaseAgent
      const Exported = module.default ?? module.Agent ?? module[Object.keys(module)[0]];
      if (Exported && typeof Exported === 'function') {
        const instance = new Exported();
        if (instance && typeof instance.execute === 'function') {
          return instance as IAgent;
        }
      }
    } catch {
      // Fall through to stub agent
    }
  }

  // Create a minimal stub agent if no compiled agent is found
  const agentName = (agentMeta.name as string) ?? path.basename(resolved);
  const agentRole = (agentMeta.role as string) ?? 'general';

  class StubAgent extends BaseAgent {
    constructor() {
      super({ name: agentName, role: agentRole });
    }

    protected async doInit(): Promise<void> {
      // No-op
    }

    protected async doExecute(task: AgentTask): Promise<AgentResult> {
      return {
        success: true,
        output: {
          content: `[Stub] Agent "${agentName}" received task of type "${task.type}". No compiled agent code found at ${resolved}.`,
        },
        meta: {
          duration: 0,
          tokensUsed: { input: 0, output: 0, total: 0 },
          model: options.model ?? 'stub',
        },
      };
    }
  }

  return new StubAgent();
}

export function runCommand(): Command {
  return new Command('run')
    .description('Run an agent interactively')
    .argument('<agent-path>', 'Path to the agent directory')
    .option('-p, --provider <provider>', 'Model provider', 'openai')
    .option('-m, --model <model>', 'Model name')
    .action(async (agentPath: string, options: RunOptions) => {
      try {
        const agent = await loadAgent(agentPath, options);

        if (!agent) {
          console.error(chalk.red('Failed to load agent.'));
          process.exit(1);
        }

        // Initialize the agent
        const config: AgentConfig = {
          model: {
            provider: options.provider,
            modelName: options.model ?? 'gpt-4o',
          } as AgentConfig['model'],
          systemPrompt: '',
        };

        await agent.init(config);

        console.log(chalk.green(`Agent "${agent.name}" loaded (role: ${agent.role})`));
        console.log(chalk.gray('Type your message and press Enter. Type "exit" or Ctrl+C to quit.'));
        console.log();

        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
          prompt: chalk.blue('you> '),
        });

        rl.prompt();

        rl.on('line', async (line: string) => {
          const input = line.trim();
          if (!input) {
            rl.prompt();
            return;
          }

          if (input.toLowerCase() === 'exit') {
            console.log(chalk.gray('Goodbye!'));
            await agent.destroy();
            rl.close();
            return;
          }

          const task: AgentTask = {
            type: 'chat',
            input: { message: input },
          };

          try {
            const result: AgentResult = await agent.execute(task);

            if (result.success) {
              console.log(chalk.green('agent>'), result.output.content);
            } else {
              console.log(
                chalk.red('agent>'),
                result.error?.message ?? 'Unknown error',
              );
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.log(chalk.red('agent> Error:'), message);
          }

          console.log();
          rl.prompt();
        });

        rl.on('close', async () => {
          if (agent.status !== AgentStatus.DESTROYED) {
            await agent.destroy().catch(() => {});
          }
          process.exit(0);
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`Failed to run agent: ${message}`));
        process.exit(1);
      }
    });
}
