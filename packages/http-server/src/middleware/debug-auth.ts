import { getHeader, type H3Event } from 'h3';
import { createHttpError } from './error.js';

export function requireDebugToken(debugToken: string | undefined) {
  return (event: H3Event) => {
    if (!debugToken) {
      throw createHttpError(
        'UNAUTHORIZED',
        'Debug execute/stream endpoints require AGENTFORGE_DEBUG_TOKEN',
        401
      );
    }
    const header = getHeader(event, 'authorization') ?? '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (bearer !== debugToken) {
      throw createHttpError('UNAUTHORIZED', 'Invalid debug token', 401);
    }
  };
}
