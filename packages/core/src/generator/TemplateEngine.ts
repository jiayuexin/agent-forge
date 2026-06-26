import ejs from 'ejs';
import type { TemplateData, TemplateSet } from './types.js';

export class TemplateEngine {
  private fallbackTemplates: Record<string, string> = {
    'src/main.ts': `import { ClientAgent } from '@agentforge/core';
import { config } from './config.js';
import { agent } from './agent.js';

async function main() {
  const clientAgent = new ClientAgent(config);
  await clientAgent.init();
  await clientAgent.startDaemon();
}

main().catch(console.error);
`,
    'src/agent.ts': `import { ClientAgent } from '@agentforge/core';
import { config } from './config.js';

export const agent = new ClientAgent(config);
`,
    'src/config.ts': `import type { ClientAgentConfig } from '@agentforge/types';

export const config: ClientAgentConfig = <%- JSON.stringify(config, null, 2) %>;
`,
    'src/prompts.ts': `export const systemPrompt = \`<%= systemPrompt %>\`;
`,
    'src/tools.ts': `import type { ToolDefinition } from '@agentforge/types';

export const tools: ToolDefinition[] = <%- JSON.stringify(tools, null, 2) %>;
`,
    'package.json': `{
  "name": "<%= parsed.name %>",
  "version": "0.0.1",
  "type": "module",
  "dependencies": {
    "@agentforge/core": "workspace:*",
    "@agentforge/runtime-client": "workspace:*"
  },
  "scripts": {
    "dev": "tsx src/main.ts",
    "build": "tsc"
  }
}
`,
    'tsconfig.json': `{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
`,
    'README.md': `# <%= parsed.displayName %>

<%= parsed.role %>
`,
    '.agentforge/security.json': `<%- JSON.stringify(security, null, 2) %>
`,
  };

  load(templateId: string): TemplateSet {
    return {
      id: templateId,
      meta: {
        id: templateId,
        name: templateId,
        displayName: templateId,
        description: `Fallback ${templateId} template`,
        category: templateId,
        systemPromptTemplate: '',
        defaultTools: [],
        defaultConfig: {},
        codeTemplates: {
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
        },
      },
      files: { ...this.fallbackTemplates },
    };
  }

  render(template: TemplateSet, data: TemplateData): Record<string, string> {
    const rendered: Record<string, string> = {};
    for (const [filePath, templateString] of Object.entries(template.files)) {
      rendered[filePath] = ejs.render(templateString, data, { rmWhitespace: false });
    }
    return rendered;
  }
}
