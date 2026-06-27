#!/usr/bin/env node
import { Command } from 'commander';
import { registerCreateCommand } from './commands/create.js';
import { registerBatchCommand } from './commands/batch.js';
import { registerRunCommand } from './commands/run.js';
import { registerServeCommand } from './commands/serve.js';
import { registerDashboardCommand } from './commands/dashboard.js';
import { registerCapabilityCommand } from './commands/capability.js';
import { registerListCommand } from './commands/list.js';

const program = new Command();

program.name('agentforge').description('AgentForge CLI').version('0.0.0');

registerCreateCommand(program);
registerBatchCommand(program);
registerRunCommand(program);
registerServeCommand(program);
registerDashboardCommand(program);
registerCapabilityCommand(program);
registerListCommand(program);

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
