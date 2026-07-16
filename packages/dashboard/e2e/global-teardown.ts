import type { AgentRuntimeClient } from '@agentforge/runtime-client';

export default async function globalTeardown(): Promise<void> {
  const mockRuntime = (globalThis as unknown as { __MOCK_RUNTIME__?: AgentRuntimeClient })
    .__MOCK_RUNTIME__;
  if (mockRuntime) {
    await mockRuntime.stop();
    console.log('Mock runtime stopped');
  }
}
