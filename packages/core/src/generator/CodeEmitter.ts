import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { EmitContext, GenerateResult } from './types.js';

export class CodeEmitter {
  async emit(ctx: EmitContext, outputDir: string): Promise<GenerateResult> {
    if (existsSync(outputDir)) {
      throw new Error(`Output directory already exists: ${outputDir}`);
    }

    const rendered = ctx.template.files;
    const files: Record<string, string> = {};

    for (const [relativePath, content] of Object.entries(rendered)) {
      const filePath = join(outputDir, relativePath);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content, 'utf-8');
      files[relativePath] = content;
    }

    return { files, metadata: ctx.parsed };
  }

  exists(outputPath: string): boolean {
    return existsSync(outputPath);
  }
}
