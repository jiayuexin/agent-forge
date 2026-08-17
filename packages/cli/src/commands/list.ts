import type { Command } from 'commander';
import { formatAgentList, listClientAgents } from '../lib/list-agents.js';

export function registerListCommand(program: Command): void {
  program
    .command('list')
    .description('List generated ClientAgents')
    .option('--path <dir>', 'Directory to scan', './client-agents')
    .option('--output <format>', 'Output format: table, json, yaml', 'table')
    .action(async (options) => {
      const format = options.output as 'table' | 'json' | 'yaml';
      if (!['table', 'json', 'yaml'].includes(format)) {
        throw new Error('Invalid --output format. Use table, json, or yaml.');
      }
      const agents = await listClientAgents(options.path);
      console.log(formatAgentList(agents, format));
    });
}
