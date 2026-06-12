import type { IAgent } from '@agentforge/types';

/**
 * Simple in-memory registry for agents by name.
 * Used to look up agents at runtime (e.g. for pipeline step resolution).
 */
export class AgentRegistry {
  private readonly _agents = new Map<string, IAgent>();

  /** Register an agent under the given name. Overwrites if name already exists. */
  register(name: string, agent: IAgent): void {
    this._agents.set(name, agent);
  }

  /** Retrieve a registered agent by name, or undefined if not found. */
  get(name: string): IAgent | undefined {
    return this._agents.get(name);
  }

  /** List all registered agent names. */
  list(): string[] {
    return [...this._agents.keys()];
  }

  /** Check whether an agent with the given name is registered. */
  has(name: string): boolean {
    return this._agents.has(name);
  }

  /** Remove all registered agents. */
  clear(): void {
    this._agents.clear();
  }
}
