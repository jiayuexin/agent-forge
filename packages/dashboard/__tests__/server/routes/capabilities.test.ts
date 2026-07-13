import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createCapabilitiesRoute } from '../../../server/routes/capabilities.js';
import type { CapabilityStore } from '../../../server/services/CapabilityStore.js';
import type { NodeRegistry } from '../../../server/services/NodeRegistry.js';
import type { Capability, CapabilityDistributePayload } from '@agentforge/types';
import { startRouteServer, type RouteServer } from '../route-helpers.js';

const TOOL_CONTRACT = {
  endpointType: 'local-function',
  endpoint: { target: 'tools.example' },
  inputSchema: { type: 'object' },
} as const;

function createMockStore() {
  const capabilities = new Map<string, Capability>();
  return {
    list: () => Array.from(capabilities.values()),
    create: async (capability: Capability) => {
      capabilities.set(capability.id, capability);
    },
    get: (id: string) => capabilities.get(id),
    update: async (id: string, capability: Capability) => {
      capabilities.set(id, capability);
    },
    delete: async (id: string) => {
      capabilities.delete(id);
    },
    versions: (id: string) => {
      const cap = capabilities.get(id);
      return cap ? [cap] : [];
    },
  } as unknown as CapabilityStore;
}

function createMockRegistry() {
  return {
    distribute: async (nodeIds: string[], payload: CapabilityDistributePayload) => {
      return Object.fromEntries(
        nodeIds.map((nodeId) => [
          nodeId,
          { status: 'installed', capabilityId: payload.capability.id },
        ])
      );
    },
  } as unknown as NodeRegistry;
}

describe('capabilities route', () => {
  let routeServer: RouteServer;
  let store: CapabilityStore;
  let registry: NodeRegistry;
  let url: string;

  beforeEach(async () => {
    store = createMockStore();
    registry = createMockRegistry();
    routeServer = await startRouteServer(
      createCapabilitiesRoute(store, registry),
      '/api/capabilities'
    );
    url = routeServer.url;
  });

  afterEach(async () => {
    await routeServer.stop();
  });

  it('GET /api/capabilities lists capabilities', async () => {
    await store.create({
      ...TOOL_CONTRACT,
      id: 'cap-1',
      type: 'tool',
      name: 'tool-one',
      description: 'First tool',
    });

    const response = await fetch(`${url}/api/capabilities`);
    expect(response.status).toBe(200);

    const body = (await response.json()) as Capability[];
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe('cap-1');
  });

  it('POST /api/capabilities creates a capability and returns { success: true }', async () => {
    const response = await fetch(`${url}/api/capabilities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'cap-2',
        type: 'skill',
        name: 'skill-one',
        description: 'First skill',
        tools: ['tool-one'],
        promptTemplate: 'Use tool-one to complete the task.',
        examples: [{ input: 'request', output: 'result' }],
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ success: true });
    expect(store.get('cap-2')).toEqual({
      id: 'cap-2',
      type: 'skill',
      name: 'skill-one',
      description: 'First skill',
      tools: ['tool-one'],
      promptTemplate: 'Use tool-one to complete the task.',
      examples: [{ input: 'request', output: 'result' }],
    });
  });

  it.each([
    {
      id: 'tool-preserved',
      type: 'tool',
      name: 'preserved-tool',
      description: 'Preserves Tool fields',
      endpointType: 'http',
      endpoint: { target: '/tools/preserved', method: 'post' },
      inputSchema: { type: 'object' },
      outputSchema: { type: 'string' },
    },
    {
      id: 'remote-preserved',
      type: 'remote-agent',
      name: 'preserved-remote',
      description: 'Preserves Remote Agent fields',
      nodeId: 'node-remote',
      endpoint: 'wss://hub.example.com/ws/nodes/node-remote',
    },
    {
      id: 'plugin-preserved',
      type: 'plugin',
      name: 'preserved-plugin',
      description: 'Preserves Plugin fields',
      downloadUrl: 'https://example.com/plugin.wasm',
      signature: 'base64-signature',
      keyId: 'release-key',
      entry: 'plugin.wasm',
      allowedCapabilities: ['tool-preserved'],
      sandbox: {
        timeoutMs: 30_000,
        maxMemoryPages: 256,
      },
    },
  ] satisfies Capability[])('POST preserves $type-specific fields', async (capability) => {
    const response = await fetch(`${url}/api/capabilities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(capability),
    });

    expect(response.status).toBe(200);
    expect(store.get(capability.id)).toEqual(capability);
  });

  it('POST rejects a Tool capability without its execution contract', async () => {
    const response = await fetch(`${url}/api/capabilities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'tool-incomplete',
        type: 'tool',
        name: 'incomplete-tool',
        description: 'Missing endpoint and schema',
      }),
    });

    expect(response.status).toBe(400);
    expect(store.get('tool-incomplete')).toBeUndefined();
  });

  it.each([
    {
      id: 'skill-incomplete',
      type: 'skill',
      name: 'incomplete-skill',
      description: 'Missing promptTemplate',
      tools: ['tool-preserved'],
    },
    {
      id: 'plugin-incomplete',
      type: 'plugin',
      name: 'incomplete-plugin',
      description: 'Missing sandbox',
      downloadUrl: 'https://example.com/plugin.wasm',
      signature: 'base64-signature',
      keyId: 'release-key',
      entry: 'plugin.wasm',
      allowedCapabilities: [],
    },
    {
      id: 'remote-incomplete',
      type: 'remote-agent',
      name: 'incomplete-remote',
      description: 'Missing nodeId',
    },
  ])('POST rejects an incomplete $type capability', async (capability) => {
    const response = await fetch(`${url}/api/capabilities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(capability),
    });

    expect(response.status).toBe(400);
    expect(store.get(capability.id)).toBeUndefined();
  });

  it('GET /api/capabilities/:id returns 404 for unknown id', async () => {
    const response = await fetch(`${url}/api/capabilities/unknown`);
    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body.error.code).toBe('CAPABILITY_NOT_FOUND');
  });

  it('PUT /api/capabilities/:id updates and returns { success: true }', async () => {
    await store.create({
      ...TOOL_CONTRACT,
      id: 'cap-3',
      type: 'tool',
      name: 'tool-three',
      description: 'Original description',
    });

    const response = await fetch(`${url}/api/capabilities/cap-3`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...TOOL_CONTRACT,
        id: 'cap-3',
        type: 'tool',
        name: 'tool-three',
        description: 'Updated description',
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ success: true });
    expect(store.get('cap-3')?.description).toBe('Updated description');
  });

  it('DELETE /api/capabilities/:id deletes and returns { success: true }', async () => {
    await store.create({
      ...TOOL_CONTRACT,
      id: 'cap-4',
      type: 'tool',
      name: 'tool-four',
      description: 'To be deleted',
    });

    const response = await fetch(`${url}/api/capabilities/cap-4`, {
      method: 'DELETE',
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ success: true });
    expect(store.get('cap-4')).toBeUndefined();
  });

  it('POST /api/capabilities/:id/distribute returns distribution results', async () => {
    await store.create({
      id: 'cap-5',
      type: 'agent',
      name: 'agent-five',
      description: 'Distributable agent',
    });

    const response = await fetch(`${url}/api/capabilities/cap-5/distribute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodeIds: ['node-a', 'node-b'],
        action: 'add',
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      'node-a': { status: 'installed', capabilityId: 'cap-5' },
      'node-b': { status: 'installed', capabilityId: 'cap-5' },
    });
  });
});
