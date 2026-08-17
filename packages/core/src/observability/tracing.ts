export interface TraceSpan {
  name: string;
  end(error?: unknown): void;
}

export function startTraceSpan(name: string, attributes: Record<string, string> = {}): TraceSpan {
  const startedAt = Date.now();
  return {
    name,
    end(error?: unknown) {
      const durationMs = Date.now() - startedAt;
      const payload = {
        level: error ? 'error' : 'info',
        time: new Date().toISOString(),
        message: 'trace',
        span: name,
        ...attributes,
        durationMs: String(durationMs),
        ...(error ? { error: error instanceof Error ? error.message : String(error) } : {}),
      };
      const line = JSON.stringify(payload);
      if (error) {
        console.error(line);
        return;
      }
      console.log(line);
    },
  };
}
