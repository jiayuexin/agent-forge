import type {
  AgentConstructor,
  AgentResult,
  AgentTask,
  FrameworkConfig,
  IStatelessAgent,
} from '@agentforge/types';
import { WasiPluginRunner } from '@agentforge/core';
import {
  AgentFramework,
  CapabilityExecutorRegistry,
  type CapabilityExecutionContext,
  type PluginCapabilityInvoker,
  type SkillAgentFactory,
  type ToolEndpointAdapters,
} from '../src/index.js';

declare const AgentClass: AgentConstructor;

const framework = new AgentFramework();
const frameworkConfig: FrameworkConfig = { maxCapabilityDepth: 8 };
new AgentFramework(frameworkConfig);

framework.register('reviewer', AgentClass, {
  type: 'agent',
  name: 'review',
  description: 'Reviews changes',
});

framework.register('invalid-tool', AgentClass, {
  // @ts-expect-error AgentFramework.register only accepts Agent capability metadata.
  type: 'tool',
  name: 'tool',
  description: 'Must be registered through the capability registry',
});

const adapters: ToolEndpointAdapters = {
  'local-function': async (tool, args) => {
    void tool;
    return args;
  },
};
framework.setToolAdapters(adapters);

const pluginInvoker: PluginCapabilityInvoker = {
  execute: async (capability, task, context) => {
    void capability;
    void task;
    void context.callStack;
    return {} as AgentResult;
  },
};
framework.setPluginInvoker(pluginInvoker);
framework.setPluginInvoker(new WasiPluginRunner());

const skillAgentFactory: SkillAgentFactory = async () => ({}) as IStatelessAgent;
framework.setSkillAgentFactory(skillAgentFactory);

const execution: Promise<AgentResult> = framework.executeCapability(
  'capability-id',
  {} as AgentTask
);
void execution;

const executorRegistry = new CapabilityExecutorRegistry();
void executorRegistry;

declare const context: CapabilityExecutionContext;
// @ts-expect-error Capability call stacks are immutable.
context.callStack.push('mutate');
