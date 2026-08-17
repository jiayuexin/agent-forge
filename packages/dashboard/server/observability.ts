import type { Logger } from '@agentforge/types';

export async function startOtelIfConfigured(logger: Logger): Promise<void> {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) {
    return;
  }

  try {
    const { trace } = await import('@opentelemetry/api');
    trace.getTracer('agentforge-hub');
    logger.info('OpenTelemetry tracer registered for Capability Hub', { endpoint });
  } catch (error) {
    logger.warn('Failed to initialize OpenTelemetry API', {
      endpoint,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
