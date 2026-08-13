import { eventHandler } from 'h3';
import type { HubRuntimeConfig } from '@agentforge/types';

export function createOpenApiRoute(runtimeConfig: HubRuntimeConfig) {
  return eventHandler(() => ({
    openapi: '3.1.0',
    info: {
      title: 'AgentForge Capability Hub',
      version: runtimeConfig.version,
    },
    servers: [{ url: '/api/v1' }],
    paths: {
      '/health': {
        get: { summary: 'Liveness probe', responses: { '200': { description: 'Hub is up' } } },
      },
      '/metrics': {
        get: { summary: 'Prometheus metrics', security: [{ bearerAuth: [] }] },
      },
      '/nodes': {
        get: { summary: 'List connected nodes', security: [{ bearerAuth: [] }] },
      },
      '/nodes/{id}/execute': {
        post: { summary: 'Execute a remote task', security: [{ bearerAuth: [] }] },
      },
      '/nodes/{id}/cancel': {
        post: { summary: 'Cancel a remote task', security: [{ bearerAuth: [] }] },
      },
      '/capabilities': {
        get: { summary: 'List capabilities', security: [{ bearerAuth: [] }] },
        post: { summary: 'Create a capability', security: [{ bearerAuth: [] }] },
      },
      '/admin/tokens': {
        get: { summary: 'List tokens', security: [{ bearerAuth: [] }] },
        post: { summary: 'Create a token', security: [{ bearerAuth: [] }] },
      },
      '/audit': {
        get: { summary: 'Query audit events', security: [{ bearerAuth: [] }] },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer' },
      },
    },
  }));
}
