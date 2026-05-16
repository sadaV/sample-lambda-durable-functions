/**
 * Shared API request/response types for the PA Demo UI.
 * Used by both API handlers and the React UI.
 */

import { ExecutionEvent, ExecutionStatus, ExecutionSummary } from './execution';

/** POST /executions — request body. */
export interface StartExecutionRequest {
  patientId: string;       // max 20 chars
  providerId: string;      // max 20 chars
  payerId: string;         // max 20 chars
  procedureCode: string;   // max 10 chars
  diagnosisCode: string;   // max 10 chars
  clinicalNotes: string;   // max 2000 chars
  requireHumanReview?: boolean;
}

/** POST /executions — response body. */
export interface StartExecutionResponse {
  executionArn: string; // DurableExecutionArn
}

/** GET /executions/{executionArn}/history — response body. */
export interface GetHistoryResponse {
  executionArn: string;
  status: ExecutionStatus;
  events: ExecutionEvent[];
  startTime: string;
  endTime?: string;
}

/** POST /executions/{executionArn}/callbacks/{callbackId} — request body. */
export interface SendCallbackRequest {
  payload: Record<string, unknown>; // callback data
}

/** POST /executions/{executionArn}/callbacks/{callbackId} — response body. */
export interface SendCallbackResponse {
  success: boolean;
}

/** GET /executions — response body. */
export interface ListExecutionsResponse {
  executions: ExecutionSummary[];
}

/** Result of validating a PA request. */
export interface ValidationResult {
  valid: boolean;
  errors: { field: string; message: string }[];
}

/** Standard API error response format. */
export interface ApiErrorResponse {
  error: string;    // AWS error code or 'VALIDATION_ERROR'
  message: string;  // human-readable description
}
