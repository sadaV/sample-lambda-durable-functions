/**
 * SendCallbackHandler — POST /executions/{executionArn}/callbacks/{callbackId}
 *
 * Sends a callback payload to resume a suspended durable execution step.
 * Uses the SendDurableExecutionCallbackSuccessCommand SDK API directly.
 *
 * Requirements: 7.3, 7.6, 7.7, 4.2
 */

import { SendDurableExecutionCallbackSuccessCommand } from '@aws-sdk/client-lambda';
import { lambdaClient } from './utils/lambda-client';
import {
  formatErrorResponse,
  formatSuccessResponse,
  APIGatewayProxyResult,
} from './utils/error-response';

/** Minimal API Gateway proxy event shape used by this handler. */
interface APIGatewayProxyEvent {
  body?: string | null;
  pathParameters?: Record<string, string | undefined> | null;
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  // Extract path parameters
  const callbackId = event.pathParameters?.callbackId;

  if (!callbackId) {
    return formatErrorResponse(
      400,
      'VALIDATION_ERROR',
      'Missing required path parameter: callbackId'
    );
  }

  // Validate request body is present and valid JSON
  if (!event.body) {
    return formatErrorResponse(
      400,
      'VALIDATION_ERROR',
      'Request body is required'
    );
  }

  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(event.body);
    // The UI sends { payload: {...} } — unwrap if present
    payload = parsed.payload ?? parsed;
  } catch {
    return formatErrorResponse(
      400,
      'VALIDATION_ERROR',
      'Request body must be valid JSON'
    );
  }

  // Send callback using the dedicated SDK command
  try {
    // Decode in case API Gateway URL-encoded the path parameter
    const decodedCallbackId = decodeURIComponent(callbackId);
    
    console.log('Sending callback:', { callbackId: decodedCallbackId, payloadSize: JSON.stringify(payload).length });

    const command = new SendDurableExecutionCallbackSuccessCommand({
      CallbackId: decodedCallbackId,
      Result: new TextEncoder().encode(JSON.stringify(payload)),
    });

    await lambdaClient.send(command);

    return formatSuccessResponse(200, { success: true });
  } catch (error: unknown) {
    console.error('SendCallback error:', JSON.stringify(error, Object.getOwnPropertyNames(error as object)));
    if (error && typeof error === 'object' && 'name' in error) {
      const awsError = error as { name: string; message: string };
      return formatErrorResponse(502, awsError.name, awsError.message ?? 'Failed to send callback');
    }
    return formatErrorResponse(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
};
