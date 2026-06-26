import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodeEmitter } from '../CodeEmitter.js';
import type { EmitContext } from '../types.js';

describe('CodeEmitter', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agentforge-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes rendered files to output directory', async () => {
    const emitter = new CodeEmitter();
    const outputDir = join(tmpDir, 'output');

    const ctx: EmitContext = {
      template: {
        id: 'test',
        meta: {} as import('@agentforge/types').AgentTemplate,
        files: {
          'README.md': '# Test',
          'src/main.ts': 'console.log("hello")',
        },
      },
      parsed: {
        role: 'test',
        name: 'test',
        displayName: 'Test',
        capabilities: [],
        scenarios: [],
        toolCategories: [],
        riskLevel: 'low',
      },
      systemPrompt: '',
      tools: [],
      config: {},
    };

    const result = await emitter.emit(ctx, outputDir);

    expect(result.files['README.md']).toBe('# Test');
    expect(emitter.exists(join(outputDir, 'README.md'))).toBe(true);
  });

  it('refuses to overwrite existing directory', async () => {
    const emitter = new CodeEmitter();
    const outputDir = join(tmpDir, 'existing');
    mkdirSync(outputDir);

    await expect(emitter.emit({} as EmitContext, outputDir)).rejects.toThrow(
      'already exists'
    );
  });
});
