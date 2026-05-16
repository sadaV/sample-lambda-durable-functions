/**
 * PA Workflow Manifest — Single source of truth for the workflow definition.
 *
 * This file is imported by both:
 * - The coordinator Lambda (for step name validation)
 * - The Demo UI (for display labels, descriptions, callback presets)
 *
 * Convention:
 * - type: 'agent-callback' → AI agent processing (waitForCallback where the agent calls back)
 * - type: 'human-callback' → Human/external action required (waitForCallback where a person acts)
 * - type: 'step'           → Automated step (context.step, no waiting)
 * - type: 'parallel'       → Fan-out of multiple sub-steps
 */

export interface CallbackPresetDef {
  label: string;
  description: string;
  payload: Record<string, unknown>;
}

export interface WorkflowStepDef {
  /** Unique step ID — must match the name passed to context.waitForCallback() or context.step() */
  id: string;
  /** Human-readable label for display */
  label: string;
  /** Description of what this step does */
  description: string;
  /** Step type — determines UI behavior */
  type: 'agent-callback' | 'human-callback' | 'step' | 'parallel';
  /** Whether this step is conditional (may be skipped) */
  conditional?: boolean;
  /** For parallel steps: child step definitions */
  children?: WorkflowStepDef[];
  /** For human-callback steps: preset payloads the presenter can choose from */
  callbackPresets?: {
    buttonLabel: string;
    defaultPayload: Record<string, unknown>;
    presets: CallbackPresetDef[];
  };
  /** Narrative text shown in the activity feed when this step starts */
  narrativeStart?: string;
  /** Narrative text shown in the activity feed when this step completes */
  narrativeComplete?: string;
  /** Narrative text shown when this step is waiting (suspended) */
  narrativeWaiting?: string;
}

/**
 * The complete PA workflow definition.
 * Order matters — this defines the expected sequential flow.
 */
export const PA_WORKFLOW: WorkflowStepDef[] = [
  {
    id: 'extract-clinical-facts',
    label: 'Extract Clinical Facts',
    description: 'Document Agent analyzes clinical notes, extracts diagnosis/procedure info, and determines which specialist reviews are needed.',
    type: 'agent-callback',
    narrativeStart: 'Analyzing clinical notes and extracting key facts...',
    narrativeComplete: 'Clinical facts extracted successfully',
    narrativeWaiting: 'Document Agent is processing...',
  },
  {
    id: 'wait-for-provider-docs',
    label: 'Provider Uploads Documents',
    description: 'If documentation is incomplete, the workflow pauses for the provider to upload missing records (up to 72 hours).',
    type: 'human-callback',
    conditional: true,
    narrativeStart: 'Requesting additional documents from provider...',
    narrativeComplete: 'Provider documents received',
    narrativeWaiting: 'Waiting for provider to upload missing documents',
    callbackPresets: {
      buttonLabel: 'Upload Documents',
      defaultPayload: {
        additionalNotes: 'MRI results confirm L4-L5 disc herniation. Physical therapy notes attached.',
        documentsUploaded: ['mri_report.pdf', 'specialist_referral.pdf', 'pt_notes.pdf'],
      },
      presets: [
        {
          label: 'Upload Complete',
          description: 'Provider uploads all requested clinical documentation.',
          payload: {
            additionalNotes: 'MRI results confirm L4-L5 disc herniation. Physical therapy notes attached.',
            documentsUploaded: ['mri_report.pdf', 'specialist_referral.pdf', 'pt_notes.pdf'],
          },
        },
      ],
    },
  },
  {
    id: 're-extract-clinical-facts',
    label: 'Re-analyze with New Docs',
    description: 'Document Agent re-analyzes clinical notes with the newly uploaded documentation.',
    type: 'agent-callback',
    conditional: true,
    narrativeStart: 'Re-analyzing clinical notes with additional documentation...',
    narrativeComplete: 'Updated clinical facts extracted',
    narrativeWaiting: 'Document Agent re-processing...',
  },
  {
    id: 'specialist-agents',
    label: 'Specialist Agent Review',
    description: 'Selected specialist agents run in parallel to check eligibility, policy compliance, and medical necessity.',
    type: 'parallel',
    children: [
      {
        id: 'invoke-eligibility',
        label: 'Eligibility Check',
        description: 'Verifies patient insurance coverage for the procedure.',
        type: 'agent-callback',
        conditional: true,
        narrativeStart: 'Checking insurance eligibility...',
        narrativeComplete: 'Eligibility verified',
        narrativeWaiting: 'Eligibility Agent processing...',
      },
      {
        id: 'invoke-policy',
        label: 'Policy Lookup',
        description: 'Checks payer policy requirements and coverage criteria.',
        type: 'agent-callback',
        conditional: true,
        narrativeStart: 'Looking up payer policy requirements...',
        narrativeComplete: 'Policy requirements checked',
        narrativeWaiting: 'Policy Agent processing...',
      },
      {
        id: 'invoke-medical-necessity',
        label: 'Medical Necessity',
        description: 'Assesses whether the procedure is medically necessary based on clinical evidence.',
        type: 'agent-callback',
        conditional: true,
        narrativeStart: 'Assessing medical necessity...',
        narrativeComplete: 'Medical necessity confirmed',
        narrativeWaiting: 'Medical Necessity Agent processing...',
      },
    ],
  },
  {
    id: 'synthesize-findings',
    label: 'Synthesize Findings',
    description: 'Synthesis Agent combines all specialist results into a unified recommendation with confidence score.',
    type: 'agent-callback',
    narrativeStart: 'Synthesizing all findings into a recommendation...',
    narrativeComplete: 'Recommendation ready',
    narrativeWaiting: 'Synthesis Agent processing...',
  },
  {
    id: 'wait-for-human-review',
    label: 'Clinical Review',
    description: 'If confidence is low or specialist agents failed, a human clinical reviewer approves or denies the request.',
    type: 'human-callback',
    conditional: true,
    narrativeStart: 'Routing to clinical reviewer...',
    narrativeComplete: 'Clinical review decision received',
    narrativeWaiting: 'Waiting for clinical reviewer decision',
    callbackPresets: {
      buttonLabel: 'Approve Request',
      defaultPayload: {
        approved: true,
        rationale: 'Clinical evidence supports medical necessity for the requested procedure.',
        referenceId: 'REV-2024-001',
      },
      presets: [
        {
          label: 'Approve',
          description: 'Clinical reviewer approves the PA request based on the evidence.',
          payload: {
            approved: true,
            rationale: 'Clinical evidence supports medical necessity for the requested procedure.',
            referenceId: 'REV-2024-001',
          },
        },
      ],
    },
  },
  {
    id: 'submit-prior-auth',
    label: 'Submit to Payer',
    description: 'Submits the prior authorization request to the insurance payer (at-most-once semantics to prevent duplicates).',
    type: 'step',
    narrativeStart: 'Submitting prior authorization to payer...',
    narrativeComplete: 'PA submitted to payer',
  },
  {
    id: 'wait-for-payer-decision',
    label: 'Payer Decision',
    description: 'Waits for the payer to respond with approval or denial (up to 14 days).',
    type: 'human-callback',
    narrativeStart: 'Registered webhook for payer response...',
    narrativeComplete: 'Payer decision received',
    narrativeWaiting: 'Waiting for payer to respond',
    callbackPresets: {
      buttonLabel: 'Approve PA',
      defaultPayload: {
        approved: true,
        rationale: 'Meets all medical policy criteria',
        authorizationNumber: 'AUTH-2024-78901',
      },
      presets: [
        {
          label: 'Approve',
          description: 'Payer approves the prior authorization request.',
          payload: {
            approved: true,
            rationale: 'Meets all medical policy criteria',
            authorizationNumber: 'AUTH-2024-78901',
          },
        },
      ],
    },
  },
  {
    id: 'notify-provider',
    label: 'Notify Provider',
    description: 'Sends the final decision to the healthcare provider.',
    type: 'step',
    narrativeStart: 'Notifying the healthcare provider...',
    narrativeComplete: 'Provider notified',
  },
];

/**
 * Helper: get all human-callback step IDs.
 * These are the only steps that should show the action panel in the UI.
 */
export function getHumanCallbackStepIds(): string[] {
  const ids: string[] = [];
  function collect(steps: WorkflowStepDef[]) {
    for (const step of steps) {
      if (step.type === 'human-callback') ids.push(step.id);
      if (step.children) collect(step.children);
    }
  }
  collect(PA_WORKFLOW);
  return ids;
}

/**
 * Helper: get callback presets for a given step ID.
 */
export function getCallbackPresetsForStep(stepId: string): WorkflowStepDef['callbackPresets'] | undefined {
  function find(steps: WorkflowStepDef[]): WorkflowStepDef['callbackPresets'] | undefined {
    for (const step of steps) {
      if (step.id === stepId) return step.callbackPresets;
      if (step.children) {
        const found = find(step.children);
        if (found) return found;
      }
    }
    return undefined;
  }
  return find(PA_WORKFLOW);
}

/**
 * Helper: get a step definition by ID.
 */
export function getStepById(stepId: string): WorkflowStepDef | undefined {
  function find(steps: WorkflowStepDef[]): WorkflowStepDef | undefined {
    for (const step of steps) {
      if (step.id === stepId) return step;
      if (step.children) {
        const found = find(step.children);
        if (found) return found;
      }
    }
    return undefined;
  }
  return find(PA_WORKFLOW);
}

/**
 * Helper: build a lookup map from step ID to step definition.
 */
export function buildStepLookup(): Map<string, WorkflowStepDef> {
  const map = new Map<string, WorkflowStepDef>();
  function collect(steps: WorkflowStepDef[]) {
    for (const step of steps) {
      map.set(step.id, step);
      if (step.children) collect(step.children);
    }
  }
  collect(PA_WORKFLOW);
  return map;
}
