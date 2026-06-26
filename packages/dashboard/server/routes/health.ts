import { eventHandler } from 'h3';

export function createHealthRoute() {
  return eventHandler(() => {
    return { status: 'ok' };
  });
}
