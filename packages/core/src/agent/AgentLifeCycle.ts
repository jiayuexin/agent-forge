import { AgentStatus } from '@agentforge/types';

export class AgentStatusError extends Error {
  constructor(
    public readonly from: AgentStatus,
    public readonly to: AgentStatus,
  ) {
    super(`Invalid status transition: ${from} → ${to}`);
    this.name = 'AgentStatusError';
  }
}

export class AgentLifeCycle {
  private _status: AgentStatus = AgentStatus.UNINITIALIZED;

  private static readonly transitions: Map<AgentStatus, Set<AgentStatus>> = new Map([
    [AgentStatus.UNINITIALIZED, new Set([AgentStatus.INITIALIZING, AgentStatus.DESTROYED])],
    [AgentStatus.INITIALIZING, new Set([AgentStatus.READY, AgentStatus.ERROR, AgentStatus.DESTROYED])],
    [AgentStatus.READY, new Set([AgentStatus.RUNNING, AgentStatus.DESTROYED])],
    [AgentStatus.RUNNING, new Set([AgentStatus.READY, AgentStatus.PAUSED, AgentStatus.ERROR, AgentStatus.DESTROYED])],
    [AgentStatus.PAUSED, new Set([AgentStatus.RUNNING, AgentStatus.DESTROYED])],
    [AgentStatus.ERROR, new Set([AgentStatus.READY, AgentStatus.DESTROYED])],
    [AgentStatus.DESTROYED, new Set()],
  ]);

  get status(): AgentStatus {
    return this._status;
  }

  transition(to: AgentStatus): void {
    if (!this.canTransition(to)) {
      throw new AgentStatusError(this._status, to);
    }
    this._status = to;
  }

  canTransition(to: AgentStatus): boolean {
    const allowed = AgentLifeCycle.transitions.get(this._status);
    return allowed !== undefined && allowed.has(to);
  }

  assertStatus(...expected: AgentStatus[]): void {
    if (!expected.includes(this._status)) {
      throw new AgentStatusError(this._status, expected[0]);
    }
  }
}
