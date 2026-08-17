import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createClientAgentsRoute } from '../../../server/routes/client-agents.js';
import type { GeneratedClientAgentStore } from '../../../server/services/GeneratedClientAgentStore.js';
import type {
  CreateClientAgentRequest,
  GeneratedClientAgentDetail,
  GeneratedClientAgentListItem,
} from '@agentforge/types';
import { startRouteServer, type RouteServer } from '../route-helpers.js';

function createMockStore() {
  const agents = new Map<string, GeneratedClientAgentDetail>();
  let idCounter = 0;

  return {
    list: () =>
      Array.from(agents.values()).map(
        ({ id, name, displayName, description, templateId, model, createdAt }) => ({
          id,
          name,
          displayName,
          description,
          templateId,
          model,
          createdAt,
        })
      ) as GeneratedClientAgentListItem[],
    get: (id: string) => agents.get(id),
    create: async (request: CreateClientAgentRequest) => {
      idCounter += 1;
      const id = `agent-${idCounter}`;
      const detail: GeneratedClientAgentDetail = {
        id,
        name: request.name.toLowerCase().replace(/\s+/g, '-'),
        displayName: request.name,
        description: request.description,
        templateId: request.templateId,
        model: request.model,
        createdAt: Date.now(),
        outputDir: `/tmp/${id}`,
        systemPrompt: 'mock system prompt',
        riskLevel: 'low',
      };
      agents.set(id, detail);
      return detail;
    },
  } as unknown as GeneratedClientAgentStore;
}

describe('client-agents route', () => {
  let routeServer: RouteServer;
  let store: GeneratedClientAgentStore;
  let url: string;

  beforeEach(async () => {
    store = createMockStore();
    routeServer = await startRouteServer(createClientAgentsRoute(store), '/api/client-agents');
    url = routeServer.url;
  });

  afterEach(async () => {
    await routeServer.stop();
  });

  it('GET /api/client-agents lists generated agents', async () => {
    await store.create({
      name: 'Agent One',
      description: 'First generated agent',
      templateId: 'general',
    });

    const response = await fetch(`${url}/api/client-agents`);
    expect(response.status).toBe(200);

    const body = (await response.json()) as GeneratedClientAgentListItem[];
    expect(body).toHaveLength(1);
    expect(body[0].displayName).toBe('Agent One');
  });

  it('GET /api/client-agents/:id returns 404 for unknown id', async () => {
    const response = await fetch(`${url}/api/client-agents/unknown-id`);
    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body.error.code).toBe('CLIENT_AGENT_NOT_FOUND');
  });

  it('POST /api/client-agents creates a client agent with valid body', async () => {
    const response = await fetch(`${url}/api/client-agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'New Agent',
        description: 'A valid generated agent description',
        templateId: 'general',
        model: 'gpt-4o',
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as GeneratedClientAgentDetail;
    expect(body).toMatchObject({
      name: 'new-agent',
      displayName: 'New Agent',
      description: 'A valid generated agent description',
      templateId: 'general',
      model: 'gpt-4o',
    });
  });

  it('POST /api/client-agents rejects invalid body with 400 VALIDATION_ERROR', async () => {
    const response = await fetch(`${url}/api/client-agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'x',
        description: 'short',
        templateId: '',
      }),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});
