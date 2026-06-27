import type { AgentError } from '@agentforge/types';

export class SDKError extends Error implements AgentError {
  code: string;
  details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'SDKError';
    this.code = code;
    this.details = details;
  }
}

export class ModelNotFoundError extends SDKError {
  constructor(model: string | undefined) {
    super('MODEL_NOT_FOUND', `Model "${model ?? '<unset>'}" could not be resolved`);
  }
}

export class CapabilityConflictError extends SDKError {
  constructor(id: string) {
    super('CAPABILITY_CONFLICT', `Capability "${id}" conflicts with an existing entry`);
  }
}

export class AgentNotFoundError extends SDKError {
  constructor(name: string) {
    super('AGENT_NOT_FOUND', `Agent "${name}" is not registered`);
  }
}

export class PipelineError extends SDKError {
  constructor(code: string, message: string, details?: unknown) {
    super(code, message, details);
    this.name = 'PipelineError';
  }
}

export class VariableNotFoundError extends SDKError {
  constructor(variable: string) {
    super('VARIABLE_NOT_FOUND', `Variable "${variable}" could not be resolved`);
  }
}

export class RemoteAgentNotConnectedError extends SDKError {
  constructor() {
    super('REMOTE_AGENT_NOT_CONNECTED', 'No remote agent invoker has been configured');
  }
}

export class NotImplementedError extends SDKError {
  constructor(feature: string) {
    super('NOT_IMPLEMENTED', `${feature} is not implemented in this phase`);
  }
}

export class ApprovalRequiredError extends SDKError {
  constructor(reason?: string) {
    super('APPROVAL_REQUIRED', reason ?? 'Plan execution requires approval');
  }
}
