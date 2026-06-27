const SENSITIVE_KEY = /apikey|api_key|secret|token|password/i;

export function sanitizeConfig<T extends Record<string, unknown>>(config: T): T {
  const result = { ...config } as Record<string, unknown>;

  for (const [key, value] of Object.entries(result)) {
    if (SENSITIVE_KEY.test(key)) {
      result[key] = '***';
      continue;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = sanitizeConfig(value as Record<string, unknown>);
    }
  }

  return result as T;
}
