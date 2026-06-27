import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';
import type { AgentTemplate } from '@agentforge/types';
import type { TemplateData, TemplateSet } from './types.js';

function resolveRepoRoot(): string {
  try {
    const dir = dirname(fileURLToPath(import.meta.url));
    return join(dir, '..', '..', '..', '..');
  } catch {
    return process.cwd();
  }
}

const REPO_ROOT = resolveRepoRoot();
const BASE_TEMPLATE_DIR = join(REPO_ROOT, 'templates', 'base');
const ROLES_TEMPLATE_DIR = join(REPO_ROOT, 'templates', 'roles');

export class TemplateEngine {
  private fallbackTemplates: Record<string, string> = {
    'src/main.ts': `import { agent } from './agent.js';\nimport { connectToHub } from './runtime.js';\n\nasync function main() {\n  await agent.init();\n  await agent.startDaemon();\n  const hubUrl = process.env.AGENTFORGE_HUB_URL;\n  const token = process.env.AGENTFORGE_HUB_TOKEN;\n  if (hubUrl && token) {\n    await connectToHub(agent, hubUrl, token);\n  }\n}\n\nmain().catch(console.error);\n`,
    'src/agent.ts': `import { ClientAgent } from '@agentforge/core';\nimport { config } from './config.js';\n\nexport const agent = new ClientAgent(config);\n`,
    'src/config.ts': `import type { ClientAgentConfig } from '@agentforge/types';\nimport { systemPrompt } from './prompts.js';\nimport { tools } from './tools.js';\n\nexport const config: ClientAgentConfig = {\n  identity: {\n    id: '<%= identity.id %>',\n    name: '<%= identity.name %>',\n    role: '<%= identity.role %>',\n    version: '<%= identity.version %>',\n  },\n  model: <%- JSON.stringify(config.model || { provider: 'openai', modelName: 'gpt-4', apiKey: 'REPLACE_WITH_OPENAI_API_KEY' }) %>,\n  systemPrompt,\n  tools,\n  hubUrl: process.env.AGENTFORGE_HUB_URL,\n  authToken: process.env.AGENTFORGE_HUB_TOKEN,\n};\n`,
    'src/prompts.ts': `export const systemPrompt = \`<%= systemPrompt %>\`;\n`,
    'src/tools.ts': `import type { ToolDefinition } from '@agentforge/types';\n\nexport const tools: ToolDefinition[] = <%- JSON.stringify(tools, null, 2) %>;\n`,
    'src/types.ts': `export type { ClientAgentConfig } from '@agentforge/types';\n`,
    'src/runtime.ts': `import { AgentRuntimeClient } from '@agentforge/runtime-client';\nimport type { ClientAgent } from '@agentforge/core';\n\nlet runtimeClient: AgentRuntimeClient | undefined;\n\nexport async function connectToHub(agent: ClientAgent, hubUrl: string, token: string): Promise<void> {\n  runtimeClient = new AgentRuntimeClient(agent, {\n    hubUrl,\n    authToken: token,\n    nodeName: agent.name,\n    allowRemoteExecution: true,\n    capabilityCacheDir: '.agentforge/capabilities',\n  });\n  await runtimeClient.start();\n}\n`,
    'package.json': `{\n  "name": "<%= parsed.name %>",\n  "version": "0.0.1",\n  "type": "module",\n  "scripts": {\n    "dev": "tsx src/main.ts",\n    "build": "tsc"\n  },\n  "dependencies": {\n    "@agentforge/core": "workspace:*",\n    "@agentforge/runtime-client": "workspace:*",\n    "@agentforge/types": "workspace:*"\n  },\n  "devDependencies": {\n    "tsx": "^4.0.0",\n    "typescript": "^5.4.0"\n  }\n}\n`,
    'tsconfig.json': `{\n  "extends": "../../tsconfig.base.json",\n  "compilerOptions": {\n    "outDir": "./dist",\n    "rootDir": "./src"\n  },\n  "include": ["src/**/*"]\n}\n`,
    'README.md': `# <%= parsed.displayName %>\n\n<%= parsed.description || parsed.role %>\n`,
    '.agentforge/security.json': `<%- JSON.stringify(security, null, 2) %>\n`,
    '.agentforge/config.json': `{\n  "identity": <%- JSON.stringify(identity) %>,\n  "role": "<%= parsed.role %>",\n  "capabilities": <%- JSON.stringify(parsed.capabilities) %>,\n  "scenarios": <%- JSON.stringify(parsed.scenarios) %>\n}\n`,
  };

  async load(templateId: string): Promise<TemplateSet> {
    const baseFiles = await this.loadDirectory(BASE_TEMPLATE_DIR);
    const roleFiles = await this.loadDirectory(join(ROLES_TEMPLATE_DIR, templateId));
    const roleMeta = await this.loadRoleMeta(templateId);

    const files: Record<string, string> = {};
    for (const [outputPath, content] of Object.entries(baseFiles)) {
      files[outputPath] = content;
    }
    for (const [outputPath, content] of Object.entries(roleFiles)) {
      files[outputPath] = content;
    }

    if (Object.keys(files).length === 0) {
      return this.loadFallback(templateId, roleMeta);
    }

    const meta: AgentTemplate = {
      id: templateId,
      name: templateId,
      displayName: roleMeta?.displayName ?? templateId,
      description: roleMeta?.description ?? `Role template ${templateId}`,
      category: roleMeta?.category ?? templateId,
      riskLevel: roleMeta?.riskLevel ?? 'low',
      systemPromptTemplate: roleMeta?.systemPromptTemplate ?? '',
      defaultTools: roleMeta?.defaultTools ?? [],
      defaultConfig: roleMeta?.defaultConfig ?? {},
      codeTemplates: roleMeta?.codeTemplates ?? this.buildCodeTemplates(files),
    };

    return { id: templateId, meta, files };
  }

  render(template: TemplateSet, data: TemplateData): Record<string, string> {
    const rendered: Record<string, string> = {};
    for (const [filePath, templateString] of Object.entries(template.files)) {
      rendered[filePath] = ejs.render(templateString, data, { rmWhitespace: false });
    }
    return rendered;
  }

  private async loadDirectory(dir: string): Promise<Record<string, string>> {
    const files: Record<string, string> = {};
    const entries = await this.readDirRecursive(dir);

    for (const { fullPath, relativePath } of entries) {
      if (!fullPath.endsWith('.ejs')) continue;
      const content = await readFile(fullPath, 'utf-8');
      const outputPath = relativePath.replace(/\.ejs$/, '').replace(/\\/g, '/');
      files[outputPath] = content;
    }

    return files;
  }

  private async readDirRecursive(dir: string): Promise<Array<{ fullPath: string; relativePath: string }>> {
    const results: Array<{ fullPath: string; relativePath: string }> = [];

    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        const relativePath = entry.name;
        if (entry.isDirectory()) {
          const nested = await this.readDirRecursive(fullPath);
          for (const n of nested) {
            results.push({
              fullPath: n.fullPath,
              relativePath: join(relativePath, n.relativePath),
            });
          }
        } else {
          results.push({ fullPath, relativePath });
        }
      }
    } catch {
      // Directory does not exist or is unreadable; return empty.
    }

    return results;
  }

  private async loadRoleMeta(templateId: string): Promise<Partial<AgentTemplate> | undefined> {
    try {
      const content = await readFile(
        join(ROLES_TEMPLATE_DIR, templateId, 'meta.json'),
        'utf-8'
      );
      return JSON.parse(content) as Partial<AgentTemplate>;
    } catch {
      return undefined;
    }
  }

  private loadFallback(templateId: string, roleMeta?: Partial<AgentTemplate>): TemplateSet {
    const meta: AgentTemplate = {
      id: templateId,
      name: templateId,
      displayName: roleMeta?.displayName ?? templateId,
      description: roleMeta?.description ?? `Fallback ${templateId} template`,
      category: roleMeta?.category ?? templateId,
      riskLevel: roleMeta?.riskLevel ?? 'low',
      systemPromptTemplate: roleMeta?.systemPromptTemplate ?? '',
      defaultTools: roleMeta?.defaultTools ?? [],
      defaultConfig: roleMeta?.defaultConfig ?? {},
      codeTemplates: roleMeta?.codeTemplates ?? this.buildCodeTemplates(this.fallbackTemplates),
    };

    return { id: templateId, meta, files: { ...this.fallbackTemplates } };
  }

  private buildCodeTemplates(files: Record<string, string>): AgentTemplate['codeTemplates'] {
    const mapping: Record<string, string> = {
      main: 'src/main.ts',
      agent: 'src/agent.ts',
      prompts: 'src/prompts.ts',
      tools: 'src/tools.ts',
      types: 'src/types.ts',
      runtime: 'src/runtime.ts',
      config: 'src/config.ts',
      tsconfig: 'tsconfig.json',
      readme: 'README.md',
      security: '.agentforge/security.json',
    };

    const codeTemplates = {} as AgentTemplate['codeTemplates'];
    for (const [key, defaultPath] of Object.entries(mapping)) {
      if (files[defaultPath] !== undefined) {
        (codeTemplates as Record<string, string>)[key] = defaultPath;
      }
    }

    return codeTemplates;
  }
}
