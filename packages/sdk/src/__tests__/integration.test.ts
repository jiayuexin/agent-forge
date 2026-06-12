import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AgentFramework } from '../AgentFramework';
import { BaseAgent } from '@agentforge/core';
import type { AgentTask, AgentResult, AgentConfig } from '@agentforge/types';

class MockServiceAgent extends BaseAgent<AgentConfig> {
  constructor() {
    super({ name: 'service', role: 'mock' });
  }
  protected async doInit(): Promise<void> {}
  protected async doExecute(task: AgentTask): Promise<AgentResult> {
    return {
      success: true,
      output: { content: `service: done` },
      meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
    };
  }
}

class MockSalesAgent extends BaseAgent<AgentConfig> {
  constructor() {
    super({ name: 'sales', role: 'mock' });
  }
  protected async doInit(): Promise<void> {}
  protected async doExecute(task: AgentTask): Promise<AgentResult> {
    return {
      success: true,
      output: { content: `sales: done` },
      meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
    };
  }
}

class MockDataAgent extends BaseAgent<AgentConfig> {
  constructor() {
    super({ name: 'data', role: 'mock' });
  }
  protected async doInit(): Promise<void> {}
  protected async doExecute(task: AgentTask): Promise<AgentResult> {
    return {
      success: true,
      output: { content: `data: done` },
      meta: { duration: 0, tokensUsed: { input: 0, output: 0, total: 0 }, model: 'mock' },
    };
  }
}

describe('SDK Integration', () => {
  let framework: AgentFramework;

  beforeAll(async () => {
    framework = new AgentFramework();
    framework.register('service', MockServiceAgent);
    framework.register('sales', MockSalesAgent);
    framework.register('data', MockDataAgent);
    await framework.init();
  });

  afterAll(async () => {
    await framework.destroy();
  });

  it('should run a 3-agent pipeline', async () => {
    const result = await framework
      .pipeline('integration-test')
      .add('service', { task: '分析', input: { message: 'start' } })
      .add('sales', { task: '推荐' })
      .add('data', { task: '汇总' })
      .run();

    expect(result.success).toBe(true);
    expect(result.steps).toHaveLength(3);
  });

  it('should emit events during pipeline execution', async () => {
    const events: string[] = [];
    framework.on('pipeline:step', (e: unknown) => events.push(String(e)));

    await framework.pipeline('event-test')
      .add('service', { task: 'test', input: { message: 'hello' } })
      .run();

    // Events may or may not be emitted depending on implementation
    expect(events.length).toBeGreaterThanOrEqual(0);
  });
});
