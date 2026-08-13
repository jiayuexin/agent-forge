import { createRouter, eventHandler, getRouterParam } from 'h3';
import { z } from 'zod';
import type { CreateHubTokenRequest } from '@agentforge/types';
import { readValidatedBody } from '@agentforge/http-server';
import type { TokenStore } from '../services/TokenStore.js';
import { actorFromAuth, requireAdmin } from '../middleware/auth.js';

const createTokenSchema = z.object({
  role: z.enum(['admin', 'node', 'readonly']).optional(),
  nodeName: z.string().optional(),
  nodeIds: z.array(z.string()).optional(),
  scopes: z.array(z.string()).optional(),
  expiresInHours: z.number().optional(),
  note: z.string().optional(),
});

export function createAdminTokensRoute(tokenStore: TokenStore) {
  const router = createRouter();

  router.post(
    '/',
    eventHandler(async (event) => {
      requireAdmin(event);
      const body = await readValidatedBody(event, createTokenSchema);
      const response = tokenStore.create(body as CreateHubTokenRequest);
      await tokenStore.save();
      return response;
    })
  );

  router.delete(
    '/:tokenId',
    eventHandler(async (event) => {
      requireAdmin(event);
      const tokenId = getRouterParam(event, 'tokenId')!;
      await tokenStore.revoke(tokenId);
      return { success: true };
    })
  );

  router.get(
    '/',
    eventHandler((event) => {
      requireAdmin(event);
      return tokenStore.list();
    })
  );

  return router;
}

export { actorFromAuth };
