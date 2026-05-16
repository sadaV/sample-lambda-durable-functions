/**
 * Shared execution types for the PA Demo UI.
 * Used by both API handlers and the React UI.
 */

/** Event types emitted by the Lambda Durable Functions execution history. */
export type ExecutionEventType =
  | 'StepStarted'
  | 'StepSucceeded'
  | 'StepFailed'
  | 'CallbackStarted'
  | 'CallbackSucceeded'
  | 'InvocationCompleted'
  | 'ExecutionSucceeded'
  | 'ExecutionFailed';

/** Normalized execution event derived from the raw durable execution history. */
export interface ExecutionEvent {
  eventType: ExecutionEventType;
  stepName: string;
  timestamp: string; // ISO 8601
  payload?: Record<string, unknown>;
  callbackId?: string;
  error?: { code: string; message: string };
}

/** Possible statuses for a workflow step. */
export type StepStatus = 'pending' | 'active' | 'suspended' | 'succeeded' | 'failed' | 'skipped';

/** State of an individual workflow step. */
export interface StepState {
  name: string;
  status: StepStatus;
  callbackId?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  startTime?: string;
  endTime?: string;
  children?: StepState[]; // for parallel sub-agents
}

/** Overall execution status values. */
export type ExecutionStatus = 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT';

/** Full execution state used by the UI. */
export interface ExecutionState {
  executionArn: string;
  status: ExecutionStatus;
  steps: StepState[];
  events: ExecutionEvent[];
  startTime: string;
  endTime?: string;
  outcome?: 'approved' | 'denied' | 'pending_review';
}

/** Possible statuses for an agent node in the graph visualization. */
export type AgentNodeStatus = 'pending' | 'active' | 'succeeded' | 'failed' | 'skipped';

/** State of an agent node in the Agent Graph. */
export interface AgentNodeState {
  id: string;
  name: string;
  status: AgentNodeStatus;
}

/** A preset callback scenario for a given callback type. */
export interface CallbackPreset {
  label: string;
  description: string;
  payload: Record<string, unknown>;
}

/** Context for the currently suspended callback step. */
export interface CallbackContext {
  stepName: string;
  callbackId: string;
  buttonLabel: string;
  presets: CallbackPreset[];
  defaultPayload: Record<string, unknown>;
}

/** A prior authorization request payload. */
export interface PARequest {
  patientId: string;
  providerId: string;
  payerId: string;
  procedureCode: string;
  diagnosisCode: string;
  clinicalNotes: string;
  requireHumanReview?: boolean;
}

/** Summary of a durable execution (used in list views). */
export interface ExecutionSummary {
  executionArn: string;
  status: ExecutionStatus;
  startTime: string;
  endTime?: string;
}
