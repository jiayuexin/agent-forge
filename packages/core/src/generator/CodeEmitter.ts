import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * CodeEmitter — writes generated code files to disk.
 *
 * Given an output directory and a map of relative file paths to content,
 * creates the necessary directory structure and writes each file.
 */
export class CodeEmitter {
  /**
   * Write all files to the output directory.
   * Creates subdirectories as needed.
   */
  async emit(outputDir: string, files: Record<string, string>): Promise<void> {
    // Ensure output directory exists
    fs.mkdirSync(outputDir, { recursive: true });

    for (const [relativePath, content] of Object.entries(files)) {
      const fullPath = path.join(outputDir, relativePath);
      const dir = path.dirname(fullPath);

      // Ensure parent directories exist
      fs.mkdirSync(dir, { recursive: true });

      fs.writeFileSync(fullPath, content, 'utf-8');
    }
  }
}
