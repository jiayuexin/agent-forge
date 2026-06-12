import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ejs from 'ejs';

/**
 * TemplateEngine — loads and renders EJS templates from a template directory.
 *
 * Layout:
 *   templateDir/
 *     base/         — shared templates (index.ts.ejs, prompts.ts.ejs, …)
 *     roles/<id>/   — role-specific overrides (optional, takes precedence)
 *
 * For a given templateId, the engine:
 *   1. Collects all .ejs files from base/
 *   2. Collects all .ejs files from roles/<templateId>/ (overriding base files of the same name)
 *   3. Renders each collected template with the provided data
 *   4. Returns a map of filename (without .ejs extension) -> rendered content
 */
export class TemplateEngine {
  constructor(private readonly templateDir: string) {}

  /**
   * Render all templates for the given templateId using the provided data.
   * Returns a map of output filename to rendered content.
   */
  async render(templateId: string, data: Record<string, unknown>): Promise<Record<string, string>> {
    const baseDir = path.join(this.templateDir, 'base');
    const roleDir = path.join(this.templateDir, 'roles', templateId);

    // Collect template files: base first, then role overrides
    const files = new Map<string, string>(); // filename -> absolute path

    this.collectTemplates(baseDir, files);

    // Role-specific templates override base templates with the same name
    if (fs.existsSync(roleDir)) {
      this.collectTemplates(roleDir, files);
    }

    // Render each template
    const result: Record<string, string> = {};
    for (const [filename, filePath] of files) {
      const templateContent = fs.readFileSync(filePath, 'utf-8');
      // Output filename strips the .ejs extension
      const outputName = filename.replace(/\.ejs$/, '');
      result[outputName] = ejs.render(templateContent, data);
    }

    return result;
  }

  /**
   * Collect .ejs files from a directory into the given map.
   * Later entries (same filename) override earlier ones.
   */
  private collectTemplates(dir: string, files: Map<string, string>): void {
    if (!fs.existsSync(dir)) {
      return;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.ejs')) {
        files.set(entry.name, path.join(dir, entry.name));
      }
    }
  }
}
