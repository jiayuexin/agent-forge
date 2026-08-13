import type { AgentRuntimeClient } from '@agentforge/runtime-client';

export default async function globalTeardown(): Promise<void> {
  const runtime = (globalThis as unknown as { __E2E_RUNTIME__?: AgentRuntimeClient })
    .__E2E_RUNTIME__;
  if (runtime) {
    await runtime.stop();
    console.log('E2E ClientAgent runtime stopped');
  }
}
