import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'node:fs';
import path from 'node:path';

interface AgentForgeConfig {
  id?: string;
  name?: string;
  description?: string;
  role?: string;
  version?: string;
  template?: string;
  status?: string;
  [key: string]: unknown;
}

interface ListedAgent {
  dir: string;
  name: string;
  role: string;
  version: string;
  template: string;
  status: string;
}

function scanAgents(agentsDir: string): ListedAgent[] {
  const resolved = path.resolve(agentsDir);
  if (!fs.existsSync(resolved)) {
    return [];
  }

  const entries = fs.readdirSync(resolved, { withFileTypes: true });
  const agents: ListedAgent[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const configPath = path.join(resolved, entry.name, '.agentforge.json');
    if (!fs.existsSync(configPath)) continue;

    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const config: AgentForgeConfig = JSON.parse(raw);

      agents.push({
        dir: entry.name,
        name: config.name ?? entry.name,
        role: config.role ?? '-',
        version: config.version ?? '-',
        template: config.template ?? '-',
        status: config.status ?? 'ready',
      });
    } catch {
      // Skip malformed config files
      agents.push({
        dir: entry.name,
        name: entry.name,
        role: '-',
        version: '-',
        template: '-',
        status: 'unknown',
      });
    }
  }

  return agents;
}

export function listCommand(): Command {
  return new Command('list')
    .description('List all installed agents')
    .option('-d, --dir <path>', 'Agents directory', './agents')
    .action((options: { dir: string }) => {
      const agents = scanAgents(options.dir);

      if (agents.length === 0) {
        console.log(chalk.yellow('No agents found.'));
        console.log(chalk.gray(`Scanned directory: ${path.resolve(options.dir)}`));
        console.log(chalk.gray('Use "agentforge create" to generate an agent.'));
        return;
      }

      // Table header
      const columns = [
        { key: 'name', header: 'NAME', width: 25 },
        { key: 'role', header: 'ROLE', width: 20 },
        { key: 'version', header: 'VERSION', width: 10 },
        { key: 'template', header: 'TEMPLATE', width: 20 },
        { key: 'status', header: 'STATUS', width: 10 },
      ] as const;

      // Print header
      const headerLine = columns
        .map((col) => chalk.bold(col.header.padEnd(col.width)))
        .join('  ');
      console.log(headerLine);
      console.log(chalk.gray('─'.repeat(headerLine.length + 10)));

      // Print rows
      for (const agent of agents) {
        const row = columns
          .map((col) => {
            const value = agent[col.key] as string;
            const padded = value.length > col.width
              ? value.slice(0, col.width - 1) + '…'
              : value.padEnd(col.width);
            if (col.key === 'status') {
              return agent.status === 'ready'
                ? chalk.green(padded)
                : agent.status === 'error'
                  ? chalk.red(padded)
                  : chalk.yellow(padded);
            }
            return padded;
          })
          .join('  ');
        console.log(row);
      }

      console.log();
      console.log(chalk.gray(`${agents.length} agent(s) found in ${path.resolve(options.dir)}`));
    });
}
