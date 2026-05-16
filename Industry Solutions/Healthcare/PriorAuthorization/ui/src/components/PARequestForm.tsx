import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { startExecution } from '../api/client';
import type { StartExecutionRequest } from '@shared/api';

/** Sample PA request pre-populated for one-click demo starts. */
const SAMPLE_PA_REQUEST: StartExecutionRequest = {
  patientId: 'PAT-12345',
  providerId: 'PRV-67890',
  payerId: 'PAY-11111',
  procedureCode: '27447',
  diagnosisCode: 'M17.11',
  clinicalNotes:
    'Patient presents with severe right knee osteoarthritis. Conservative treatment (physical therapy, NSAIDs, corticosteroid injections) failed over 12 months. BMI 28. No contraindications to surgery. Recommend total knee arthroplasty.',
  requireHumanReview: false,
};

/** Field length constraints matching the API validation. */
const MAX_LENGTHS: Record<string, number> = {
  patientId: 20,
  providerId: 20,
  payerId: 20,
  procedureCode: 10,
  diagnosisCode: 10,
  clinicalNotes: 2000,
};

/** Required text fields (excludes the optional boolean toggle). */
const REQUIRED_FIELDS = [
  'patientId',
  'providerId',
  'payerId',
  'procedureCode',
  'diagnosisCode',
  'clinicalNotes',
] as const;

type FieldErrors = Partial<Record<string, string>>;

/**
 * Validates the form data and returns a map of field → error message.
 * Returns an empty object when all fields are valid.
 */
function validate(data: StartExecutionRequest): FieldErrors {
  const errors: FieldErrors = {};

  for (const field of REQUIRED_FIELDS) {
    const value = data[field];
    if (!value || value.trim().length === 0) {
      errors[field] = 'This field is required';
    } else if (MAX_LENGTHS[field] && value.length > MAX_LENGTHS[field]) {
      errors[field] = `Maximum ${MAX_LENGTHS[field]} characters`;
    }
  }

  return errors;
}

/**
 * PARequestForm — renders the PA request form with inline validation,
 * pre-populated sample values, and submit handling.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
 */
export default function PARequestForm() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState<StartExecutionRequest>({
    ...SAMPLE_PA_REQUEST,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear field error on edit
    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  }

  function handleToggle(e: React.ChangeEvent<HTMLInputElement>) {
    setFormData((prev) => ({ ...prev, requireHumanReview: e.target.checked }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setApiError(null);

    const fieldErrors = validate(formData);
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    try {
      const response = await startExecution(formData);
      navigate(`/execution/${encodeURIComponent(response.executionArn)}`);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'An unexpected error occurred';
      setApiError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {/* API error banner */}
      {apiError && (
        <div
          role="alert"
          className="p-3 rounded bg-red-900/60 border border-red-700 text-red-200 text-sm"
        >
          <span className="font-medium">Error:</span> {apiError}
        </div>
      )}

      {/* Row 1: patientId, providerId, payerId */}
      <div className="grid grid-cols-3 gap-3">
        <Field
          label="Patient ID"
          name="patientId"
          value={formData.patientId}
          maxLength={MAX_LENGTHS.patientId}
          error={errors.patientId}
          onChange={handleChange}
        />
        <Field
          label="Provider ID"
          name="providerId"
          value={formData.providerId}
          maxLength={MAX_LENGTHS.providerId}
          error={errors.providerId}
          onChange={handleChange}
        />
        <Field
          label="Payer ID"
          name="payerId"
          value={formData.payerId}
          maxLength={MAX_LENGTHS.payerId}
          error={errors.payerId}
          onChange={handleChange}
        />
      </div>

      {/* Row 2: procedureCode, diagnosisCode */}
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Procedure Code"
          name="procedureCode"
          value={formData.procedureCode}
          maxLength={MAX_LENGTHS.procedureCode}
          error={errors.procedureCode}
          onChange={handleChange}
        />
        <Field
          label="Diagnosis Code"
          name="diagnosisCode"
          value={formData.diagnosisCode}
          maxLength={MAX_LENGTHS.diagnosisCode}
          error={errors.diagnosisCode}
          onChange={handleChange}
        />
      </div>

      {/* Clinical Notes */}
      <div>
        <label
          htmlFor="clinicalNotes"
          className="block text-sm font-medium text-gray-300 mb-1"
        >
          Clinical Notes
        </label>
        <textarea
          id="clinicalNotes"
          name="clinicalNotes"
          value={formData.clinicalNotes}
          onChange={handleChange}
          maxLength={MAX_LENGTHS.clinicalNotes}
          rows={3}
          className={`w-full px-3 py-2 rounded bg-gray-800 border text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none ${
            errors.clinicalNotes ? 'border-red-500' : 'border-gray-600'
          }`}
        />
        {errors.clinicalNotes && (
          <p className="mt-1 text-xs text-red-400">{errors.clinicalNotes}</p>
        )}
      </div>

      {/* Human Review Toggle */}
      <div className="flex items-center gap-2">
        <input
          id="requireHumanReview"
          name="requireHumanReview"
          type="checkbox"
          checked={formData.requireHumanReview ?? false}
          onChange={handleToggle}
          className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-900"
        />
        <label
          htmlFor="requireHumanReview"
          className="text-sm text-gray-300 select-none"
        >
          Require Human Review
        </label>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting}
        className="w-full py-2 px-4 rounded bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors"
      >
        {submitting ? 'Starting…' : 'Start PA Request'}
      </button>
    </form>
  );
}

/** Reusable text input field with label and inline error. */
function Field({
  label,
  name,
  value,
  maxLength,
  error,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  maxLength: number;
  error?: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div>
      <label
        htmlFor={name}
        className="block text-sm font-medium text-gray-300 mb-1"
      >
        {label}
      </label>
      <input
        id={name}
        name={name}
        type="text"
        value={value}
        onChange={onChange}
        maxLength={maxLength}
        className={`w-full px-3 py-2 rounded bg-gray-800 border text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          error ? 'border-red-500' : 'border-gray-600'
        }`}
      />
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}
