/**
 * GetHistoryHandler — GET /executions/{executionArn}/history
 *
 * Retrieves execution event history for a given execution ARN using the
 * GetDurableExecution and GetDurableExecutionHistory SDK commands directly.
 *
 * Requirements: 7.2, 7.5, 7.6
 */

import {
  GetDurableExecutionCommand,
  GetDurableExecutionHistoryCommand,
} from '@aws-sdk/client-lambda';
import { lambdaClient } from './utils/lambda-client';
import { formatErrorResponse, formatSuccessResponse } from './utils/error-response';
import type { ExecutionEvent, ExecutionStatus } from '../../types/execution';
import type { GetHistoryResponse } from '../../types/api';

/** API Gateway event shape (minimal subset needed). */
interface APIGatewayProxyEvent {
  pathParameters?: Record<string, string> | null;
  queryStringParameters?: Record<string, string> | null;
  body?: string | null;
  httpMethod?: string;
}

/** Raw event from GetDurableExecutionHistory. */
interface RawHistoryEvent {
  EventType?: string;
  SubType?: string;
  Name?: string;
  Id?: string;
  EventId?: number;
  EventTimestamp?: Date;
  ParentId?: string;
  StepStartedDetails?: Record<string, unknown>;
  StepSucceededDetails?: { Result?: { Payload?: string } };
  StepFailedDetails?: { Error?: { Payload?: { ErrorType?: string; ErrorMessage?: string } } };
  CallbackStartedDetails?: { CallbackId?: string; Timeout?: number };
  CallbackSucceededDetails?: { Result?: { Payload?: string } };
  CallbackFailedDetails?: { Error?: { Payload?: { ErrorType?: string; ErrorMessage?: string } } };
  ContextStartedDetails?: Record<string, unknown>;
  ContextSucceededDetails?: { Result?: { Payload?: string } };
  ContextFailedDetails?: { Error?: { Payload?: { ErrorType?: string; ErrorMessage?: string } } };
  ExecutionStartedDetails?: { Input?: { Payload?: string } };
  ExecutionSucceededDetails?: { Result?: { Payload?: string } };
  ExecutionFailedDetails?: { Error?: { Payload?: { ErrorType?: string; ErrorMessage?: string } } };
  InvocationCompletedDetails?: Record<string, unknown>;
}

/**
 * Lambda handler for GET /executions/{executionArn}/history.
 */
export async function handler(event: APIGatewayProxyEvent) {
  const executionArn = event.pathParameters?.executionArn;

  if (!executionArn) {
    return formatErrorResponse(400, 'VALIDATION_ERROR', 'Missing executionArn path parameter');
  }

  const decodedArn = decodeURIComponent(executionArn);

  try {
    // Get execution status
    const execResponse = await lambdaClient.send(
      new GetDurableExecutionCommand({ DurableExecutionArn: decodedArn })
    );

    // Get execution history (paginate to get all events)
    let allRawEvents: RawHistoryEvent[] = [];
    let marker: string | undefined;

    do {
      const historyResponse = await lambdaClient.send(
        new GetDurableExecutionHistoryCommand({
          DurableExecutionArn: decodedArn,
          IncludeExecutionData: true,
          Marker: marker,
        })
      );
      allRawEvents = allRawEvents.concat(
        (historyResponse.Events ?? []) as unknown as RawHistoryEvent[]
      );
      marker = historyResponse.NextMarker;
    } while (marker);

    // Build a map of Id → Name for parent context resolution
    // ContextStarted events carry the human-readable step name (e.g., "extract-clinical-facts")
    // Their child events (CallbackStarted, CallbackSucceeded) reference them via ParentId
    const idToName = new Map<string, string>();
    for (const raw of allRawEvents) {
      if (raw.Id && raw.Name) {
        idToName.set(raw.Id, raw.Name);
      }
    }

    // Normalize events, resolving names from parent context
    const events: ExecutionEvent[] = [];
    for (const raw of allRawEvents) {
      const normalized = normalizeEvent(raw, idToName);
      if (normalized) {
        events.push(normalized);
      }
    }

    const historyResult: GetHistoryResponse = {
      executionArn: decodedArn,
      status: (execResponse.Status as ExecutionStatus) ?? 'RUNNING',
      events,
      startTime: execResponse.StartTimestamp!.toISOString(),
    };

    if (execResponse.EndTimestamp) {
      historyResult.endTime = execResponse.EndTimestamp.toISOString();
    }

    return formatSuccessResponse(200, historyResult as unknown as Record<string, unknown>);
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'name' in error) {
      const awsError = error as { name: string; message: string };

      if (awsError.name === 'ResourceNotFoundException') {
        return formatErrorResponse(404, 'NOT_FOUND', `Execution not found: ${decodedArn}`);
      }

      return formatErrorResponse(502, awsError.name, awsError.message ?? 'AWS service error');
    }
    return formatErrorResponse(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Normalizes a raw durable execution history event into our ExecutionEvent format.
 * Uses the idToName map to resolve human-readable step names from parent context events.
 */
export function normalizeEvent(raw: RawHistoryEvent, idToName: Map<string, string>): ExecutionEvent | null {
  const eventType = raw.EventType;
  if (!eventType) return null;

  // Map SDK event types to our simplified types
  // Include Context events as they carry the meaningful step names
  const typeMap: Record<string, ExecutionEvent['eventType']> = {
    ContextStarted: 'StepStarted',
    ContextSucceeded: 'StepSucceeded',
    ContextFailed: 'StepFailed',
    StepStarted: 'StepStarted',
    StepSucceeded: 'StepSucceeded',
    StepFailed: 'StepFailed',
    CallbackStarted: 'CallbackStarted',
    CallbackSucceeded: 'CallbackSucceeded',
    CallbackFailed: 'StepFailed',
    InvocationCompleted: 'InvocationCompleted',
    ExecutionSucceeded: 'ExecutionSucceeded',
    ExecutionFailed: 'ExecutionFailed',
  };

  const mappedType = typeMap[eventType];
  if (!mappedType) return null;

  // Resolve the step name:
  // 1. Use the event's own Name if it looks meaningful (not a hex ID)
  // 2. Otherwise, look up the parent's Name via ParentId
  // 3. Fall back to the raw Name or Id
  let stepName = raw.Name ?? '';
  
  // Check if the name is a hex ID (not meaningful)
  const isHexId = /^[0-9a-f]{8,}$/i.test(stepName);
  
  if (isHexId && raw.ParentId) {
    // Try to get the parent's name
    const parentName = idToName.get(raw.ParentId);
    if (parentName && !/^[0-9a-f]{8,}$/i.test(parentName)) {
      stepName = parentName;
    }
  }
  
  // If still a hex ID, try the Id field's parent
  if (/^[0-9a-f]{8,}$/i.test(stepName) && raw.Id) {
    // The event itself might be referenced by children — keep the Id for mapping
    // but for display, try to find a meaningful ancestor
    stepName = findMeaningfulName(raw, idToName) || stepName;
  }

  const event: ExecutionEvent = {
    eventType: mappedType,
    stepName,
    timestamp: raw.EventTimestamp ? raw.EventTimestamp.toISOString() : new Date().toISOString(),
  };

  // Extract payload based on event type
  const payload = extractPayload(raw, eventType);
  if (payload) {
    event.payload = payload;
  }

  // Extract callbackId
  if (raw.CallbackStartedDetails?.CallbackId) {
    event.callbackId = raw.CallbackStartedDetails.CallbackId;
  }

  // Extract error
  const errorDetails = extractError(raw, eventType);
  if (errorDetails) {
    event.error = errorDetails;
  }

  return event;
}

/**
 * Walks up the parent chain to find a meaningful (non-hex) name.
 */
function findMeaningfulName(raw: RawHistoryEvent, idToName: Map<string, string>): string | null {
  let parentId = raw.ParentId;
  const visited = new Set<string>();
  
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parentName = idToName.get(parentId);
    if (parentName && !/^[0-9a-f]{8,}$/i.test(parentName)) {
      return parentName;
    }
    // We don't have the parent's ParentId easily accessible here,
    // so we stop after one level
    break;
  }
  
  return null;
}

function extractPayload(raw: RawHistoryEvent, eventType: string): Record<string, unknown> | undefined {
  let payloadStr: string | undefined;

  switch (eventType) {
    case 'StepSucceeded':
      payloadStr = raw.StepSucceededDetails?.Result?.Payload;
      break;
    case 'ContextSucceeded':
      payloadStr = raw.ContextSucceededDetails?.Result?.Payload;
      break;
    case 'CallbackSucceeded':
      payloadStr = raw.CallbackSucceededDetails?.Result?.Payload;
      break;
    case 'ExecutionSucceeded':
      payloadStr = raw.ExecutionSucceededDetails?.Result?.Payload;
      break;
    case 'ExecutionStarted':
      payloadStr = raw.ExecutionStartedDetails?.Input?.Payload;
      break;
  }

  if (!payloadStr) return undefined;

  try {
    return JSON.parse(payloadStr);
  } catch {
    return { raw: payloadStr };
  }
}

function extractError(raw: RawHistoryEvent, eventType: string): { code: string; message: string } | undefined {
  let errorPayload: { ErrorType?: string; ErrorMessage?: string } | undefined;

  switch (eventType) {
    case 'StepFailed':
      errorPayload = raw.StepFailedDetails?.Error?.Payload;
      break;
    case 'ContextFailed':
      errorPayload = raw.ContextFailedDetails?.Error?.Payload;
      break;
    case 'CallbackFailed':
      errorPayload = raw.CallbackFailedDetails?.Error?.Payload;
      break;
    case 'ExecutionFailed':
      errorPayload = raw.ExecutionFailedDetails?.Error?.Payload;
      break;
  }

  if (!errorPayload) return undefined;

  return {
    code: errorPayload.ErrorType ?? 'UnknownError',
    message: errorPayload.ErrorMessage ?? 'An error occurred',
  };
}
