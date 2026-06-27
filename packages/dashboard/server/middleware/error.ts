import type { H3Event } from 'h3';
import { handleError, type HttpError } from '@agentforge/http-server';

export function dashboardErrorHandler(error: unknown, event: H3Event): { error: HttpError } {
  return handleError(error, event);
}
