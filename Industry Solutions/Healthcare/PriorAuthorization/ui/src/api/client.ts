/**
 * API client for the PA Demo UI.
 * All functions use fetch() and handle errors consistently.
 */

import { API_BASE_URL } from '../config';
import type {
  StartExecutionRequest,
  StartExecutionResponse,
  GetHistoryResponse,
  SendCallbackRequest,
  SendCallbackResponse,
  ListExecutionsResponse,
} from '@shared/api';

/** Error thrown when an API request fails. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly errorCode: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Parses a fetch response. Throws ApiError on non-2xx status.
 */
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorCode = 'UNKNOWN_ERROR';
    let message = `Request failed with status ${response.status}`;

    try {
      const body = await response.json();
      if (body.error) errorCode = body.error;
      if (body.message) message = body.message;
    } catch {
      // Response body wasn't JSON — use defaults
    }

    throw new ApiError(response.status, errorCode, message);
  }

  return response.json() as Promise<T>;
}

/**
 * Starts a new PA execution.
 * POST /executions
 */
export async function startExecution(
  request: StartExecutionRequest,
): Promise<StartExecutionResponse> {
  const response = await fetch(`${API_BASE_URL}/executions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  return handleResponse<StartExecutionResponse>(response);
}

/**
 * Retrieves execution history for a given execution ARN.
 * GET /executions/{executionArn}/history
 */
export async function getHistory(
  executionArn: string,
): Promise<GetHistoryResponse> {
  const encoded = encodeURIComponent(executionArn);
  const response = await fetch(
    `${API_BASE_URL}/executions/${encoded}/history`,
  );

  return handleResponse<GetHistoryResponse>(response);
}

/**
 * Sends a callback payload to resume a suspended execution step.
 * POST /executions/{executionArn}/callbacks/{callbackId}
 */
export async function sendCallback(
  executionArn: string,
  callbackId: string,
  payload: Record<string, unknown>,
): Promise<SendCallbackResponse> {
  const encodedArn = encodeURIComponent(executionArn);
  const encodedCb = encodeURIComponent(callbackId);
  const body: SendCallbackRequest = { payload };

  const response = await fetch(
    `${API_BASE_URL}/executions/${encodedArn}/callbacks/${encodedCb}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );

  return handleResponse<SendCallbackResponse>(response);
}

/**
 * Lists the most recent durable executions.
 * GET /executions
 */
export async function listExecutions(): Promise<ListExecutionsResponse> {
  const response = await fetch(`${API_BASE_URL}/executions`);
  return handleResponse<ListExecutionsResponse>(response);
}
