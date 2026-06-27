import { eventHandler } from 'h3';
import type { HubRuntimeConfig } from '@agentforge/types';

export function createConfigRoute(config: HubRuntimeConfig) {
  return eventHandler(() => {
    return config;
  });
}
