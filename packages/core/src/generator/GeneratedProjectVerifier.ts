import ts from 'typescript';

export function verifyGeneratedTypeScript(files: Record<string, string>): void {
  const errors: string[] = [];
  for (const [filePath, content] of Object.entries(files)) {
    if (!filePath.endsWith('.ts') && !filePath.endsWith('.json')) {
      continue;
    }
    if (filePath.endsWith('.json')) {
      try {
        JSON.parse(content);
      } catch (error) {
        errors.push(
          `${filePath}: invalid JSON (${error instanceof Error ? error.message : String(error)})`
        );
      }
      continue;
    }
    const result = ts.transpileModule(content, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        strict: true,
      },
      reportDiagnostics: true,
      fileName: filePath,
    });
    for (const diagnostic of result.diagnostics ?? []) {
      if (diagnostic.category !== ts.DiagnosticCategory.Error) {
        continue;
      }
      errors.push(`${filePath}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`);
    }
  }
  if (errors.length > 0) {
    throw new Error(`Generated project failed verification:\n${errors.join('\n')}`);
  }
}
