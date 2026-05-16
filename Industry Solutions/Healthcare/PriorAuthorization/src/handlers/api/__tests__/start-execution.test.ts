/**
 * Unit tests for StartExecutionHandler.
 * Validates: Requirements 7.1, 7.6, 7.7, 1.2
 */

import { handler } from '../start-execution';

// Mock the Lambda client
const mockSend = jest.fn();
jest.mock('../utils/lambda-client', () => ({
  lambdaClient: { send: (cmd: any) => mockSend(cmd) },
}));

function makeEvent(body: unknown): Parameters<typeof handler>[0] {
  return {
    body: body === undefined ? null : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    httpMethod: 'POST',
    path: '/executions',
    pathParameters: null,
    queryStringParameters: null,
    requestContext: {},
    resource: '/executions',
    isBase64Encoded: false,
  };
}

const validRequest = {
  patientId: 'PAT-12345',
  providerId: 'PRV-67890',
  payerId: 'PAY-11111',
  procedureCode: '27447',
  diagnosisCode: 'M17.11',
  clinicalNotes: 'Patient presents with severe osteoarthritis.',
};

describe('StartExecutionHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.COORDINATOR_FUNCTION_NAME = 'TestCoordinatorFunction';
  });

  describe('validation', () => {
    it('returns 400 VALIDATION_ERROR when body is null', async () => {
      const event = { ...makeEvent(undefined), body: null };
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('VALIDATION_ERROR');
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('returns 400 VALIDATION_ERROR when body is not valid JSON', async () => {
      const event = { ...makeEvent(undefined), body: 'not json{' };
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('VALIDATION_ERROR');
      expect(body.message).toContain('valid JSON');
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('returns 400 VALIDATION_ERROR when required fields are missing', async () => {
      const event = makeEvent({ patientId: 'PAT-001' });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('VALIDATION_ERROR');
      expect(body.message).toContain('providerId');
      expect(body.message).toContain('payerId');
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('returns 400 VALIDATION_ERROR when field exceeds max length', async () => {
      const event = makeEvent({
        ...validRequest,
        patientId: 'A'.repeat(21), // exceeds 20 char limit
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('VALIDATION_ERROR');
      expect(body.message).toContain('patientId');
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('successful invocation', () => {
    it('invokes Coordinator with Event type and returns executionArn from payload', async () => {
      const executionArn = 'arn:aws:lambda:us-west-2:123456789:durable-execution:abc-123';
      mockSend.mockResolvedValue({
        StatusCode: 202,
        Payload: new TextEncoder().encode(JSON.stringify({ executionArn })),
      });

      const event = makeEvent(validRequest);
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.executionArn).toBe(executionArn);

      // Verify InvokeCommand was called with correct params
      expect(mockSend).toHaveBeenCalledTimes(1);
      const invokeCall = mockSend.mock.calls[0][0];
      // AWS SDK v3 InvokeCommand exposes params via .input
      expect(invokeCall.input).toMatchObject({
        FunctionName: 'TestCoordinatorFunction',
        InvocationType: 'Event',
      });
    });

    it('falls back to RequestId when payload has no executionArn', async () => {
      const requestId = 'req-id-fallback-123';
      mockSend.mockResolvedValue({
        StatusCode: 202,
        Payload: new Uint8Array(0),
        ResponseMetadata: { RequestId: requestId },
      });

      const event = makeEvent(validRequest);
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.executionArn).toBe(requestId);
    });

    it('returns executionArn from durableExecutionArn field', async () => {
      const arn = 'durable-exec-arn-456';
      mockSend.mockResolvedValue({
        StatusCode: 202,
        Payload: new TextEncoder().encode(JSON.stringify({ durableExecutionArn: arn })),
      });

      const event = makeEvent(validRequest);
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.executionArn).toBe(arn);
    });
  });

  describe('error handling', () => {
    it('returns 502 with AWS error code on Lambda invocation failure', async () => {
      mockSend.mockRejectedValue({
        name: 'ResourceNotFoundException',
        message: 'Function not found: TestCoordinatorFunction',
      });

      const event = makeEvent(validRequest);
      const result = await handler(event);

      expect(result.statusCode).toBe(502);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('ResourceNotFoundException');
      expect(body.message).toContain('Function not found');
    });

    it('returns 502 with INVOCATION_ERROR when no executionArn can be extracted', async () => {
      mockSend.mockResolvedValue({
        StatusCode: 200,
        FunctionError: 'Unhandled',
        Payload: new TextEncoder().encode(JSON.stringify({ errorMessage: 'boom' })),
      });

      const event = makeEvent(validRequest);
      const result = await handler(event);

      expect(result.statusCode).toBe(502);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('INVOCATION_ERROR');
    });
  });

  describe('CORS headers', () => {
    it('includes CORS headers in success response', async () => {
      mockSend.mockResolvedValue({
        StatusCode: 202,
        Payload: new TextEncoder().encode(JSON.stringify({ executionArn: 'test-arn' })),
      });

      const event = makeEvent(validRequest);
      const result = await handler(event);

      expect(result.headers).toBeDefined();
      expect(result.headers!['Access-Control-Allow-Origin']).toBe('*');
      expect(result.headers!['Access-Control-Allow-Methods']).toContain('POST');
      expect(result.headers!['Content-Type']).toBe('application/json');
    });

    it('includes CORS headers in error response', async () => {
      const event = makeEvent(null);
      const result = await handler(event);

      expect(result.headers).toBeDefined();
      expect(result.headers!['Access-Control-Allow-Origin']).toBe('*');
    });
  });
});
