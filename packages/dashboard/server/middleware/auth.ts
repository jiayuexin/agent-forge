import { getHeader, type H3Event } from 'h3';
import { createHttpError } from '@agentforge/http-server';
import type { HubToken } from '@agentforge/types';
import type { TokenStore } from '../services/TokenStore.js';

export interface AuthContext {
  token?: HubToken;
  isAdmin: boolean;
}

declare module 'h3' {
  interface H3EventContext {
    auth?: AuthContext;
  }
}

export function createAuthMiddleware(tokenStore: TokenStore, adminToken?: string) {
  return (event: H3Event) => {
    const header = getHeader(event, 'authorization') ?? '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';

    if (adminToken && bearer === adminToken) {
      event.context.auth = { isAdmin: true };
      return;
    }

    const validation = tokenStore.validate(bearer);
    if (!validation.valid) {
      throw createHttpError('UNAUTHORIZED', 'Invalid or expired token', 401);
    }

    event.context.auth = { token: validation.token, isAdmin: false };
  };
}

export function requireAdmin(event: H3Event): AuthContext {
  const auth = event.context.auth;
  if (!auth?.isAdmin) {
    throw createHttpError('FORBIDDEN', 'Admin access required', 403);
  }
  return auth;
}

export function getAuth(event: H3Event): AuthContext {
  const auth = event.context.auth;
  if (!auth) {
    throw createHttpError('UNAUTHORIZED', 'Authentication required', 401);
  }
  return auth;
}
