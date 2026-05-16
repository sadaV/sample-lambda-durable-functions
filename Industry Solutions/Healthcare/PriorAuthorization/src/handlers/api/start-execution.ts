/**
 * StartExecutionHandler — POST /executions
 *
 * Validates a PA request, invokes the Coordinator with Event invocation type,
 * and returns the execution ARN from the response.
 *
 * Requirements: 7.1, 7.6, 7.7, 1.2
 */

import { InvokeCommand } from '@aws-sdk/client-lambda';
import { lambdaClient } from './utils/lambda-client';
import { validatePARequest } from './utils/validation';
import { formatErrorResponse, formatSuccessResponse } from './utils/error-response';
import type { APIGatewayProxyResult } from './utils/error-response';

/** Minimal APIGatewayProxyEvent shape. */
interface APIGatewayProxyEvent {
  body: string | null;
  headers: Record<string, string | undefined>;
  httpMethod: string;
  path: string;
  pathParameters: Record<string, string | undefined> | null;
  queryStringParameters: Record<string, string | undefined> | null;
}

/**
 * Lambda handler for POST /executions.
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const COORDINATOR_FUNCTION_NAME = process.env.COORDINATOR_FUNCTION_NAME!;

  // Parse request body
  let body: unknown;
  try {
    body = event.body ? JSON.parse(event.body) : null;
  } catch {
    return formatErrorResponse(400, 'VALIDATION_ERROR', 'Request body must be valid JSON');
  }

  // Validate PA request fields
  const validation = validatePARequest(body);
  if (!validation.valid) {
    const message = validation.errors.map((e) => `${e.field}: ${e.message}`).join('; ');
    return formatErrorResponse(400, 'VALIDATION_ERROR', message);
  }

  // Invoke Coordinator with Event invocation type (async)
  try {
    const response = await lambdaClient.send(
      new InvokeCommand({
        FunctionName: COORDINATOR_FUNCTION_NAME,
        InvocationType: 'Event',
        Payload: new TextEncoder().encode(JSON.stringify(body)),
      })
    );

    // For durable functions, the DurableExecutionArn is returned directly in the response
    const executionArn = (response as { DurableExecutionArn?: string }).DurableExecutionArn;

    if (!executionArn) {
      return formatErrorResponse(502, 'INVOCATION_ERROR', 'Failed to obtain execution ARN from Coordinator');
    }

    return formatSuccessResponse(200, { executionArn });
  } catch (error: unknown) {
    const awsError = error as { name?: string; message?: string };
    const errorCode = awsError.name ?? 'UNKNOWN_ERROR';
    const errorMessage = awsError.message ?? 'An unexpected error occurred while invoking the Coordinator';
    return formatErrorResponse(502, errorCode, errorMessage);
  }
}
