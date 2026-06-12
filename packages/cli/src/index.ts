#!/usr/bin/env node
import { Command } from 'commander';
import { createCommand } from './commands/create';
import { batchCommand } from './commands/batch';
import { serveCommand } from './commands/serve';
import { listCommand } from './commands/list';
import { runCommand } from './commands/run';
import { dashboardCommand } from './commands/dashboard';

const program = new Command();
program
  .name('agentforge')
  .description('AI Agent Framework — 从描述生成可运行的 Agent')
  .version('0.1.0');

program.addCommand(createCommand());
program.addCommand(batchCommand());
program.addCommand(serveCommand());
program.addCommand(listCommand());
program.addCommand(runCommand());
program.addCommand(dashboardCommand());

program.parse();
