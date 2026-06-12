import { 一个电商客服助手，帮助用户查询订单状态、处理退换货申请Agent } from './agent';
import { SYSTEM_PROMPT } from './prompts';
import { TOOLS } from './tools';
import { AgentConfig } from './types';
import { DEFAULT_CONFIG } from './config';

export { 一个电商客服助手，帮助用户查询订单状态、处理退换货申请Agent } from './agent';
export { SYSTEM_PROMPT } from './prompts';
export { TOOLS } from './tools';
export { DEFAULT_CONFIG } from './config';
export type { AgentConfig } from './types';

/**
 * Create a pre-configured 一个电商客服助手，帮助用户查询订单状态、处理退换货申请 agent.
 */
export function create一个电商客服助手，帮助用户查询订单状态、处理退换货申请Agent(
  config?: Partial<AgentConfig>,
) {
  return new 一个电商客服助手，帮助用户查询订单状态、处理退换货申请Agent({
    ...DEFAULT_CONFIG,
    ...config,
  });
}

export default create一个电商客服助手，帮助用户查询订单状态、处理退换货申请Agent;
