import type { LocalCommandAuthConfig } from '@agentforge/types';

export const DEFAULT_READONLY_COMMANDS = [
  'ls',
  'pwd',
  'cat',
  'echo',
  'ps',
  'top',
  'df',
  'du',
  'git status',
  'git log',
  'git diff',
  'git branch',
  'Get-Process',
  'Get-Location',
  'Get-ChildItem',
];

export const DEFAULT_SENSITIVE_COMMANDS = [
  'rm',
  'rmdir',
  'del',
  'format',
  'mkfs',
  'git push',
  'git reset --hard',
  'git clean -fd',
  'sudo',
  'su',
  'chmod',
  'chown',
];

export interface CommandAuthResult {
  allowed: boolean;
  requiresConfirmation: boolean;
  reason?: string;
}

export class LocalCommandAuth {
  constructor(private readonly config: LocalCommandAuthConfig) {}

  authorize(command: string): CommandAuthResult {
    const level = this.config.level ?? 'disabled';
    const normalized = command.trim();

    if (level === 'disabled') {
      return { allowed: false, requiresConfirmation: false, reason: 'Local command execution is disabled' };
    }

    if (level === 'readonly') {
      const allowed = DEFAULT_READONLY_COMMANDS.some((entry) => matchesCommand(normalized, entry));
      if (!allowed) {
        return {
          allowed: false,
          requiresConfirmation: false,
          reason: 'Command is not in the readonly whitelist',
        };
      }
      return { allowed: true, requiresConfirmation: this.isSensitive(normalized) };
    }

    if (level === 'whitelist') {
      const whitelist = this.config.whitelist ?? [];
      const allowed = whitelist.some((entry) => matchesCommand(normalized, entry));
      if (!allowed) {
        return {
          allowed: false,
          requiresConfirmation: false,
          reason: 'Command is not in the configured whitelist',
        };
      }
      return { allowed: true, requiresConfirmation: this.isSensitive(normalized) };
    }

    return { allowed: true, requiresConfirmation: this.isSensitive(normalized) };
  }

  isSensitive(command: string): boolean {
    const extra = this.config.requireConfirmationFor ?? [];
    const candidates = [...DEFAULT_SENSITIVE_COMMANDS, ...extra];
    return candidates.some((entry) => matchesCommand(command, entry));
  }
}

function matchesCommand(command: string, pattern: string): boolean {
  const lowerCommand = command.toLowerCase();
  const lowerPattern = pattern.toLowerCase();
  return lowerCommand === lowerPattern || lowerCommand.startsWith(`${lowerPattern} `);
}
