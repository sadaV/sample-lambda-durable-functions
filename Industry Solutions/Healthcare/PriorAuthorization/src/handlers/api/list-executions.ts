/**
 * ListExecutionsHandler — GET /executions
 *
 * Lists the 20 most recent durable executions for the Coordinator function,
 * ordered by start time descending.
 *
 * Uses the ListDurableExecutionsByFunctionCommand SDK API directly.
 *
 * Requirements: 7.4, 7.6
 */

import { ListDurableExecutionsByFunctionCommand } from '@aws-sdk/client-lambda';
import { lambdaClient } from './utils/lambda-client';
import { formatErrorResponse, formatSuccessResponse } from './utils/error-response';
import type { ExecutionSummary, ExecutionStatus } from '../../types/execution';
import type { ListExecutionsResponse } from '../../types/api';

/** Maximum number of executions to return. */
const MAX_RESULTS = 20;

/** API Gateway event shape (minimal subset needed). */
interface APIGatewayProxyEvent {
  pathParameters?: Record<string, string> | null;
  queryStringParameters?: Record<string, string> | null;
  body?: string | null;
  httpMethod?: string;
}

/**
 * Lambda handler for GET /executions.
 */
export async function handler(_event: APIGatewayProxyEvent) {
  const COORDINATOR_FUNCTION_NAME = process.env.COORDINATOR_FUNCTION_NAME!;

  // The env var is a qualified ARN like arn:aws:lambda:region:account:function:name:live
  // ListDurableExecutionsByFunction needs just the function name (not qualified)
  const functionName = extractFunctionName(COORDINATOR_FUNCTION_NAME);

  try {
    const command = new ListDurableExecutionsByFunctionCommand({
      FunctionName: functionName,
      MaxItems: MAX_RESULTS,
      ReverseOrder: true, // most recent first
    });

    const response = await lambdaClient.send(command);

    const executions: ExecutionSummary[] = (response.DurableExecutions ?? []).map((exec) => {
      const summary: ExecutionSummary = {
        executionArn: exec.DurableExecutionArn!,
        status: (exec.Status as ExecutionStatus) ?? 'RUNNING',
        startTime: exec.StartTimestamp!.toISOString(),
      };
      if (exec.EndTimestamp) {
        summary.endTime = exec.EndTimestamp.toISOString();
      }
      return summary;
    });

    const listResponse: ListExecutionsResponse = { executions };
    return formatSuccessResponse(200, listResponse as unknown as Record<string, unknown>);
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'name' in error) {
      const awsError = error as { name: string; message: string };
      return formatErrorResponse(502, awsError.name, awsError.message ?? 'AWS service error');
    }
    return formatErrorResponse(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/** Extracts the function name from a qualified ARN or returns as-is if already a name. */
function extractFunctionName(arnOrName: string): string {
  // ARN format: arn:aws:lambda:region:account:function:name:qualifier
  if (arnOrName.startsWith('arn:')) {
    const parts = arnOrName.split(':');
    return parts[6]; // function name is the 7th segment
  }
  return arnOrName;
}
