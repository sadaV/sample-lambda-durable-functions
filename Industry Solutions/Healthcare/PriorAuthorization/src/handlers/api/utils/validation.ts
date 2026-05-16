/**
 * PA request validation utility.
 * Enforces required fields and max-length constraints.
 */

import { ValidationResult } from '../../../types/api';

/** Field constraints for PA request validation. */
const FIELD_CONSTRAINTS: Record<string, { required: boolean; maxLength: number }> = {
  patientId: { required: true, maxLength: 20 },
  providerId: { required: true, maxLength: 20 },
  payerId: { required: true, maxLength: 20 },
  procedureCode: { required: true, maxLength: 10 },
  diagnosisCode: { required: true, maxLength: 10 },
  clinicalNotes: { required: true, maxLength: 2000 },
};

/**
 * Validates a PA request body against required fields and max-length constraints.
 *
 * @param body - The raw request body (unknown type, parsed from JSON)
 * @returns A ValidationResult indicating whether the request is valid and any field-level errors
 */
export function validatePARequest(body: unknown): ValidationResult {
  const errors: { field: string; message: string }[] = [];

  if (body === null || body === undefined || typeof body !== 'object' || Array.isArray(body)) {
    return {
      valid: false,
      errors: [{ field: 'body', message: 'Request body must be a JSON object' }],
    };
  }

  const record = body as Record<string, unknown>;

  for (const [field, constraint] of Object.entries(FIELD_CONSTRAINTS)) {
    const value = record[field];

    if (value === undefined || value === null || value === '') {
      errors.push({ field, message: `${field} is required` });
      continue;
    }

    if (typeof value !== 'string') {
      errors.push({ field, message: `${field} must be a string` });
      continue;
    }

    if (value.length > constraint.maxLength) {
      errors.push({
        field,
        message: `${field} must not exceed ${constraint.maxLength} characters`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
