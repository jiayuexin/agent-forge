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

const SHELL_METACHARACTERS = /[;&|`$<>(){}\n\r]|&&|\|\||\$\(/;

export interface ParsedLocalCommand {
  executable: string;
  args: string[];
}

export interface CommandAuthResult {
  allowed: boolean;
  requiresConfirmation: boolean;
  reason?: string;
}

export class InvalidLocalCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidLocalCommandError';
  }
}

export function containsShellMetacharacters(command: string): boolean {
  return SHELL_METACHARACTERS.test(command);
}

export function parseLocalCommand(command: string): ParsedLocalCommand {
  const trimmed = command.trim();
  if (!trimmed) {
    throw new InvalidLocalCommandError('Command is empty');
  }
  if (containsShellMetacharacters(trimmed)) {
    throw new InvalidLocalCommandError('Command contains shell metacharacters');
  }
  const parts = trimmed.split(/\s+/);
  return { executable: parts[0], args: parts.slice(1) };
}

export function formatLocalCommand(command: ParsedLocalCommand): string {
  return [command.executable, ...command.args].join(' ');
}

export class LocalCommandAuth {
  constructor(private readonly config: LocalCommandAuthConfig) {}

  authorize(command: string | ParsedLocalCommand): CommandAuthResult {
    const level = this.config.level ?? 'disabled';
    let parsed: ParsedLocalCommand;
    try {
      parsed = typeof command === 'string' ? parseLocalCommand(command) : command;
      if (
        containsShellMetacharacters(parsed.executable) ||
        parsed.args.some(containsShellMetacharacters)
      ) {
        return {
          allowed: false,
          requiresConfirmation: false,
          reason: 'Command contains shell metacharacters',
        };
      }
    } catch (error) {
      if (error instanceof InvalidLocalCommandError) {
        return { allowed: false, requiresConfirmation: false, reason: error.message };
      }
      throw error;
    }

    if (level === 'disabled') {
      return {
        allowed: false,
        requiresConfirmation: false,
        reason: 'Local command execution is disabled',
      };
    }

    if (level === 'readonly') {
      const allowed = DEFAULT_READONLY_COMMANDS.some((entry) => matchesCommand(parsed, entry));
      if (!allowed) {
        return {
          allowed: false,
          requiresConfirmation: false,
          reason: 'Command is not in the readonly whitelist',
        };
      }
      return { allowed: true, requiresConfirmation: this.isSensitive(parsed) };
    }

    if (level === 'whitelist') {
      const whitelist = this.config.whitelist ?? [];
      const allowed = whitelist.some((entry) => matchesCommand(parsed, entry));
      if (!allowed) {
        return {
          allowed: false,
          requiresConfirmation: false,
          reason: 'Command is not in the configured whitelist',
        };
      }
      return { allowed: true, requiresConfirmation: this.isSensitive(parsed) };
    }

    return { allowed: true, requiresConfirmation: this.isSensitive(parsed) };
  }

  isSensitive(command: string | ParsedLocalCommand): boolean {
    let parsed: ParsedLocalCommand;
    try {
      parsed = typeof command === 'string' ? parseLocalCommand(command) : command;
    } catch {
      return true;
    }
    const extra = this.config.requireConfirmationFor ?? [];
    const candidates = [...DEFAULT_SENSITIVE_COMMANDS, ...extra];
    return candidates.some((entry) => matchesCommand(parsed, entry));
  }
}

function matchesCommand(command: ParsedLocalCommand, pattern: string): boolean {
  let parsedPattern: ParsedLocalCommand;
  try {
    parsedPattern = parseLocalCommand(pattern);
  } catch {
    return false;
  }
  if (command.executable.toLowerCase() !== parsedPattern.executable.toLowerCase()) {
    return false;
  }
  return parsedPattern.args.every(
    (arg, index) => command.args[index]?.toLowerCase() === arg.toLowerCase()
  );
}
