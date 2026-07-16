import { CoreError, type AuditEvent } from '@agentforge/core';

export type AuditReporter = (
  event: Omit<AuditEvent, 'timestamp'> & { timestamp?: number }
) => Promise<void>;

export interface HubAuditReporterOptions {
  hubUrl: string;
  authToken: string;
  actor: string;
  fetch?: typeof fetch;
}

export function createHubAuditReporter(options: HubAuditReporterOptions): AuditReporter {
  const fetchImpl = options.fetch ?? fetch;
  const endpoint = new URL('/api/audit', `${resolveHubHttpOrigin(options.hubUrl)}/`).toString();

  return async (event) => {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${options.authToken}`,
      },
      body: JSON.stringify({
        ...event,
        actor: event.actor ?? options.actor,
      }),
    });
    if (!response.ok) {
      throw new CoreError(
        'AUDIT_REPORT_FAILED',
        `Failed to report audit event to Hub: HTTP ${response.status}`
      );
    }
  };
}

export function resolveHubHttpOrigin(hubUrl: string): string {
  return new URL(hubUrl.replace(/^ws/i, 'http')).origin;
}
