import type { AgentResult } from '@agentforge/types';
import { VariableNotFoundError } from '../errors.js';

export function interpolateInput(
  input: Record<string, unknown>,
  variables: Record<string, AgentResult>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string') {
      result[key] = interpolateString(value, variables);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function interpolateString(value: string, variables: Record<string, AgentResult>): string {
  return value.replace(/\$\{([^}]+)\}/g, (match, path) => {
    const resolved = resolvePath(path, variables);
    if (resolved === undefined) {
      throw new VariableNotFoundError(match);
    }
    return typeof resolved === 'string' ? resolved : JSON.stringify(resolved);
  });
}

function resolvePath(path: string, variables: Record<string, AgentResult>): unknown {
  const parts = path.split('.');
  if (parts.length < 2) {
    throw new VariableNotFoundError(path);
  }
  const variableName = parts[0];
  const result = variables[variableName];
  if (!result) {
    throw new VariableNotFoundError(path);
  }

  let current: unknown = result;
  for (let i = 1; i < parts.length; i++) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (Array.isArray(current)) {
      const index = Number.parseInt(parts[i], 10);
      current = Number.isNaN(index) ? undefined : current[index];
    } else if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[parts[i]];
    } else {
      return undefined;
    }
  }
  return current;
}
