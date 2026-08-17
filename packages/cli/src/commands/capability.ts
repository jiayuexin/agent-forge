import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Command } from 'commander';
import { CapabilityCache } from '@agentforge/runtime-client';
import { HubClient, resolveHubBaseUrl } from '../lib/hub-client.js';

export function registerCapabilityCommand(program: Command): void {
  const capability = program.command('capability').description('Manage capabilities on Capability Hub');

  capability
    .command('publish')
    .description('Publish a capability definition to Capability Hub')
    .argument('<capability-file>', 'Path to capability JSON file')
    .option('--hub <url>', 'Hub base URL', resolveHubBaseUrl())
    .option('--admin-token <token>', 'Admin token', process.env.AGENTFORGE_ADMIN_TOKEN)
    .action(async (capabilityFile: string, options) => {
      const body = JSON.parse(await readFile(resolve(capabilityFile), 'utf-8'));
      const client = new HubClient({
        baseUrl: resolveHubBaseUrl(options.hub),
        adminToken: options.adminToken,
      });
      const result = await client.publishCapability(body);
      console.log(JSON.stringify(result, null, 2));
    });

  capability
    .command('list')
    .description('List capabilities on Capability Hub')
    .option('--hub <url>', 'Hub base URL', resolveHubBaseUrl())
    .option('--admin-token <token>', 'Admin token', process.env.AGENTFORGE_ADMIN_TOKEN)
    .action(async (options) => {
      const client = new HubClient({
        baseUrl: resolveHubBaseUrl(options.hub),
        adminToken: options.adminToken,
      });
      const result = await client.listCapabilities();
      console.log(JSON.stringify(result, null, 2));
    });

  capability
    .command('install')
    .description('Install a capability JSON file into the local cache')
    .argument('<capability-file>', 'Path to capability JSON file')
    .option('--cache-dir <dir>', 'Local capability cache directory', '.agentforge/capabilities')
    .action(async (capabilityFile: string, options) => {
      const capability = JSON.parse(await readFile(resolve(capabilityFile), 'utf-8'));
      const cache = new CapabilityCache({ cacheDir: options.cacheDir });
      const ack = await cache.install({
        action: 'add',
        capability,
      });
      console.log(JSON.stringify(ack, null, 2));
    });

  capability
    .command('distribute')
    .description('Distribute a capability to Hub nodes')
    .argument('<capability-id>', 'Capability id')
    .requiredOption('--node <node-id>', 'Target node id')
    .option('--hub <url>', 'Hub base URL', resolveHubBaseUrl())
    .option('--admin-token <token>', 'Admin token', process.env.AGENTFORGE_ADMIN_TOKEN)
    .option('--action <action>', 'Distribute action', 'add')
    .action(async (capabilityId: string, options) => {
      const client = new HubClient({
        baseUrl: resolveHubBaseUrl(options.hub),
        adminToken: options.adminToken,
      });
      const result = await client.distributeCapability(capabilityId, {
        nodeIds: [options.node],
        action: options.action as 'add' | 'update' | 'remove',
      });
      console.log(JSON.stringify(result, null, 2));
    });
}
