import { AgentStatus } from '@agentforge/types';
import { CoreError } from '../errors.js';

const TRANSITIONS: Record<AgentStatus, AgentStatus[]> = {
  [AgentStatus.UNINITIALIZED]: [AgentStatus.INITIALIZING],
  [AgentStatus.INITIALIZING]: [AgentStatus.READY, AgentStatus.ERROR],
  [AgentStatus.READY]: [
    AgentStatus.DAEMON_RUNNING,
    AgentStatus.RUNNING,
    AgentStatus.ERROR,
    AgentStatus.DESTROYED,
  ],
  [AgentStatus.DAEMON_RUNNING]: [
    AgentStatus.RUNNING,
    AgentStatus.ERROR,
    AgentStatus.DESTROYED,
  ],
  [AgentStatus.RUNNING]: [
    AgentStatus.READY,
    AgentStatus.DAEMON_RUNNING,
    AgentStatus.ERROR,
  ],
  [AgentStatus.ERROR]: [AgentStatus.READY, AgentStatus.DESTROYED],
  [AgentStatus.DESTROYED]: [],
};

export class AgentLifeCycle {
  private _status: AgentStatus = AgentStatus.UNINITIALIZED;

  get status(): AgentStatus {
    return this._status;
  }

  transition(to: AgentStatus): void {
    if (!this.canTransition(to)) {
      throw new CoreError(
        'ILLEGAL_STATUS_TRANSITION',
        `Cannot transition from ${this._status} to ${to}`
      );
    }
    this._status = to;
  }

  canTransition(to: AgentStatus): boolean {
    return TRANSITIONS[this._status].includes(to);
  }

  assertStatus(expected: AgentStatus): void {
    if (this._status !== expected) {
      throw new CoreError(
        'UNEXPECTED_STATUS',
        `Expected status ${expected} but got ${this._status}`
      );
    }
  }

  reset(): void {
    this._status = AgentStatus.UNINITIALIZED;
  }
}
