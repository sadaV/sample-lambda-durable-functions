/**
 * Shared Lambda client instance for API handlers.
 * Reused across invocations within the same Lambda execution environment.
 */

import { LambdaClient } from '@aws-sdk/client-lambda';

/** Shared Lambda client instance configured from the execution environment. */
export const lambdaClient = new LambdaClient({});
