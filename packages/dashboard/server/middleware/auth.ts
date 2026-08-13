import { getHeader, type H3Event } from 'h3';
import { createHttpError } from '@agentforge/http-server';
import type { HubToken, HubTokenRole } from '@agentforge/types';
import type { TokenStore } from '../services/TokenStore.js';

export interface AuthContext {
  token?: HubToken;
  isAdmin: boolean;
  role: HubTokenRole;
}

declare module 'h3' {
  interface H3EventContext {
    auth?: AuthContext;
    requestStartedAt?: number;
  }
}

export function createAuthMiddleware(
  tokenStore: TokenStore,
  adminToken?: string,
  onUnauthorized?: () => void
) {
  return (event: H3Event) => {
    const header = getHeader(event, 'authorization') ?? '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';

    if (adminToken && bearer === adminToken) {
      event.context.auth = { isAdmin: true, role: 'admin' };
      return;
    }

    const validation = tokenStore.validate(bearer);
    if (!validation.valid || !validation.token) {
      onUnauthorized?.();
      throw createHttpError('UNAUTHORIZED', 'Invalid or expired token', 401);
    }

    event.context.auth = {
      token: validation.token,
      isAdmin: validation.token.role === 'admin',
      role: validation.token.role,
    };
  };
}

export function getAuth(event: H3Event): AuthContext {
  const auth = event.context.auth;
  if (!auth) {
    throw createHttpError('UNAUTHORIZED', 'Authentication required', 401);
  }
  return auth;
}

export function requireRoles(event: H3Event, roles: HubTokenRole[]): AuthContext {
  const auth = getAuth(event);
  if (!roles.includes(auth.role)) {
    throw createHttpError('FORBIDDEN', 'Insufficient token role', 403);
  }
  return auth;
}

export function requireAdmin(event: H3Event): AuthContext {
  return requireRoles(event, ['admin']);
}

export function requireWriteAccess(event: H3Event): AuthContext {
  return requireRoles(event, ['admin']);
}

export function actorFromAuth(auth: AuthContext): string {
  if (auth.role === 'admin') {
    return 'admin';
  }
  return auth.token?.nodeIds?.[0] ?? auth.token?.id ?? auth.role;
}

export function requireNodeScope(
  event: H3Event,
  nodeId: string,
  access: 'read' | 'write'
): AuthContext {
  const auth = getAuth(event);
  if (auth.role === 'admin') {
    return auth;
  }
  if (access === 'write') {
    if (auth.role !== 'node' || !auth.token?.nodeIds?.includes(nodeId)) {
      throw createHttpError('FORBIDDEN', `Token cannot operate on node "${nodeId}"`, 403);
    }
    return auth;
  }
  if (auth.role === 'readonly') {
    return auth;
  }
  if (auth.role === 'node' && auth.token?.nodeIds?.includes(nodeId)) {
    return auth;
  }
  throw createHttpError('FORBIDDEN', `Token cannot access node "${nodeId}"`, 403);
}

export function filterNodesForAuth<T extends { id: string }>(auth: AuthContext, nodes: T[]): T[] {
  if (auth.role === 'admin' || auth.role === 'readonly') {
    return nodes;
  }
  const allowed = new Set(auth.token?.nodeIds ?? []);
  return nodes.filter((node) => allowed.has(node.id));
}
