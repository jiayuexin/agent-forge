import { createRouter, eventHandler, getRouterParam } from 'h3';
import { z } from 'zod';
import type { CreateHubTokenRequest } from '@agentforge/types';
import { readValidatedBody } from '@agentforge/http-server';
import type { TokenStore } from '../services/TokenStore.js';

const createTokenSchema = z.object({
  nodeName: z.string().optional(),
  nodeIds: z.array(z.string()).optional(),
  expiresInHours: z.number().optional(),
  note: z.string().optional(),
});

export function createAdminTokensRoute(tokenStore: TokenStore) {
  const router = createRouter();

  router.post('/', eventHandler(async (event) => {
    const body = await readValidatedBody(event, createTokenSchema);
    const response = tokenStore.create(body as CreateHubTokenRequest);
    await tokenStore.save();
    return response;
  }));

  router.delete('/:tokenId', eventHandler(async (event) => {
    const tokenId = getRouterParam(event, 'tokenId')!;
    await tokenStore.revoke(tokenId);
    return { success: true };
  }));

  router.get('/', eventHandler(() => tokenStore.list()));

  return router;
}
