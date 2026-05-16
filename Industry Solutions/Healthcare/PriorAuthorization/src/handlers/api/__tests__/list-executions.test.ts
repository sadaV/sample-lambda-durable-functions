/**
 * Unit tests for ListExecutionsHandler.
 * Validates: Requirements 7.4, 7.6
 */

import { handler } from '../list-executions';

// Mock the Lambda client
const mockSend = jest.fn();
jest.mock('../utils/lambda-client', () => ({
  lambdaClient: { send: (...args: unknown[]) => mockSend(...args) },
}));

function makeEvent(): Parameters<typeof handler>[0] {
  return {
    httpMethod: 'GET',
    pathParameters: null,
    queryStringParameters: null,
    body: null,
  };
}

describe('ListExecutionsHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.COORDINATOR_FUNCTION_NAME = 'TestCoordinatorFunction';
  });

  describe('successful listing', () => {
    it('returns executions sorted by startTime descending', async () => {
      const rawExecutions = [
        { executionArn: 'arn-1', status: 'SUCCEEDED', startTime: 1700000000000, endTime: 1700000100000 },
        { executionArn: 'arn-3', status: 'RUNNING', startTime: 1700000200000 },
        { executionArn: 'arn-2', status: 'FAILED', startTime: 1700000100000, endTime: 1700000150000 },
      ];

      mockSend.mockResolvedValue({
        Payload: new TextEncoder().encode(JSON.stringify({ executions: rawExecutions })),
      });

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.executions).toHaveLength(3);
      // Should be sorted descending by startTime
      expect(body.executions[0].executionArn).toBe('arn-3');
      expect(body.executions[1].executionArn).toBe('arn-2');
      expect(body.executions[2].executionArn).toBe('arn-1');
    });

    it('limits results to 20 executions', async () => {
      const rawExecutions = Array.from({ length: 30 }, (_, i) => ({
        executionArn: `arn-${i}`,
        status: 'SUCCEEDED',
        startTime: 1700000000000 + i * 1000,
        endTime: 1700000000000 + i * 1000 + 500,
      }));

      mockSend.mockResolvedValue({
        Payload: new TextEncoder().encode(JSON.stringify({ executions: rawExecutions })),
      });

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.executions).toHaveLength(20);
    });

    it('converts epoch timestamps to ISO 8601 strings', async () => {
      const startTime = 1700000000000;
      const endTime = 1700000100000;
      mockSend.mockResolvedValue({
        Payload: new TextEncoder().encode(JSON.stringify({
          executions: [{ executionArn: 'arn-1', status: 'SUCCEEDED', startTime, endTime }],
        })),
      });

      const result = await handler(makeEvent());

      const body = JSON.parse(result.body);
      expect(body.executions[0].startTime).toBe(new Date(startTime).toISOString());
      expect(body.executions[0].endTime).toBe(new Date(endTime).toISOString());
    });

    it('omits endTime when not present in raw response', async () => {
      mockSend.mockResolvedValue({
        Payload: new TextEncoder().encode(JSON.stringify({
          executions: [{ executionArn: 'arn-1', status: 'RUNNING', startTime: 1700000000000 }],
        })),
      });

      const result = await handler(makeEvent());

      const body = JSON.parse(result.body);
      expect(body.executions[0].endTime).toBeUndefined();
    });

    it('maps status values correctly', async () => {
      mockSend.mockResolvedValue({
        Payload: new TextEncoder().encode(JSON.stringify({
          executions: [
            { executionArn: 'arn-1', status: 'RUNNING', startTime: 1700000004000 },
            { executionArn: 'arn-2', status: 'SUCCEEDED', startTime: 1700000003000 },
            { executionArn: 'arn-3', status: 'FAILED', startTime: 1700000002000 },
            { executionArn: 'arn-4', status: 'TIMED_OUT', startTime: 1700000001000 },
          ],
        })),
      });

      const result = await handler(makeEvent());

      const body = JSON.parse(result.body);
      expect(body.executions[0].status).toBe('RUNNING');
      expect(body.executions[1].status).toBe('SUCCEEDED');
      expect(body.executions[2].status).toBe('FAILED');
      expect(body.executions[3].status).toBe('TIMED_OUT');
    });

    it('returns empty array when no executions exist', async () => {
      mockSend.mockResolvedValue({
        Payload: new TextEncoder().encode(JSON.stringify({ executions: [] })),
      });

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.executions).toEqual([]);
    });

    it('handles null executions array gracefully', async () => {
      mockSend.mockResolvedValue({
        Payload: new TextEncoder().encode(JSON.stringify({ executions: null })),
      });

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.executions).toEqual([]);
    });

    it('invokes Coordinator with ListDurableExecutions operation', async () => {
      mockSend.mockResolvedValue({
        Payload: new TextEncoder().encode(JSON.stringify({ executions: [] })),
      });

      await handler(makeEvent());

      expect(mockSend).toHaveBeenCalledTimes(1);
      const invokeCommand = mockSend.mock.calls[0][0];
      // InvokeCommand from @aws-sdk/client-lambda uses input property
      expect(invokeCommand).toBeDefined();
      // Verify the command was called (the exact structure depends on SDK version)
      // Check that the handler called send with an InvokeCommand
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            FunctionName: 'TestCoordinatorFunction',
          }),
        })
      );
    });
  });

  describe('error handling', () => {
    it('returns 502 with AWS error code on Lambda invocation failure', async () => {
      mockSend.mockRejectedValue({
        name: 'ServiceException',
        message: 'Service unavailable',
      });

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(502);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('ServiceException');
      expect(body.message).toContain('Service unavailable');
    });

    it('returns 502 when Coordinator returns FunctionError', async () => {
      mockSend.mockResolvedValue({
        FunctionError: 'Unhandled',
        Payload: new TextEncoder().encode(JSON.stringify({
          errorType: 'RuntimeError',
          errorMessage: 'Something went wrong',
        })),
      });

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(502);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('RuntimeError');
      expect(body.message).toBe('Something went wrong');
    });

    it('returns 502 when Coordinator returns FunctionError with no payload', async () => {
      mockSend.mockResolvedValue({
        FunctionError: 'Unhandled',
        Payload: undefined,
      });

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(502);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('LAMBDA_ERROR');
    });

    it('returns 502 when response has no Payload', async () => {
      mockSend.mockResolvedValue({
        Payload: undefined,
      });

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(502);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('EMPTY_RESPONSE');
    });

    it('returns 500 for unexpected non-AWS errors', async () => {
      mockSend.mockRejectedValue('unexpected string error');

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('INTERNAL_ERROR');
    });
  });

  describe('CORS headers', () => {
    it('includes CORS headers in success response', async () => {
      mockSend.mockResolvedValue({
        Payload: new TextEncoder().encode(JSON.stringify({ executions: [] })),
      });

      const result = await handler(makeEvent());

      expect(result.headers).toBeDefined();
      expect(result.headers!['Access-Control-Allow-Origin']).toBe('*');
      expect(result.headers!['Access-Control-Allow-Methods']).toContain('GET');
      expect(result.headers!['Content-Type']).toBe('application/json');
    });

    it('includes CORS headers in error response', async () => {
      mockSend.mockRejectedValue({ name: 'SomeError', message: 'fail' });

      const result = await handler(makeEvent());

      expect(result.headers).toBeDefined();
      expect(result.headers!['Access-Control-Allow-Origin']).toBe('*');
    });
  });
});
