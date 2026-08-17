import { eventHandler } from 'h3';
import type { HubRuntimeConfig } from '@agentforge/types';
import { sanitizeConfig } from '@agentforge/core';

export function createConfigRoute(config: HubRuntimeConfig) {
  return eventHandler(() => sanitizeConfig(config as unknown as Record<string, unknown>));
}
