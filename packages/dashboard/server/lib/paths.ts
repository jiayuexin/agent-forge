import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function resolveRepoRoot(): string {
  if (process.env.AGENTFORGE_REPO_ROOT) {
    return process.env.AGENTFORGE_REPO_ROOT;
  }
  try {
    const dir = dirname(fileURLToPath(import.meta.url));
    return join(dir, '..', '..', '..', '..');
  } catch {
    return process.cwd();
  }
}

export function resolveTemplatesDir(): string {
  if (process.env.AGENTFORGE_TEMPLATES_DIR) {
    return process.env.AGENTFORGE_TEMPLATES_DIR;
  }
  return join(resolveRepoRoot(), 'templates', 'roles');
}
