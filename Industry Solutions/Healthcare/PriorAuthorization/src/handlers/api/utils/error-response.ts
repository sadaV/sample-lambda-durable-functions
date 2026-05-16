/**
 * Consistent error response formatting for API handlers.
 * Produces APIGatewayProxyResult-compatible responses with CORS headers.
 */

/** API Gateway proxy result shape (avoids hard dependency on @types/aws-lambda). */
export interface APIGatewayProxyResult {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
}

/** CORS headers included in all API responses. */
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Content-Type': 'application/json',
};

/**
 * Formats a consistent error response with CORS headers.
 *
 * @param statusCode - HTTP status code (4xx or 5xx)
 * @param error - Error code (e.g., 'VALIDATION_ERROR', AWS error code)
 * @param message - Human-readable error description
 * @returns An APIGatewayProxyResult with the error body and CORS headers
 */
export function formatErrorResponse(
  statusCode: number,
  error: string,
  message: string
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify({ error, message }),
  };
}

/**
 * Formats a successful JSON response with CORS headers.
 *
 * @param statusCode - HTTP status code (typically 200)
 * @param body - Response body object to serialize
 * @returns An APIGatewayProxyResult with the serialized body and CORS headers
 */
export function formatSuccessResponse(
  statusCode: number,
  body: Record<string, unknown>
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  };
}
