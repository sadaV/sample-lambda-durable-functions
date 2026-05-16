import { useContext } from 'react';
import { ExecutionContext } from '../pages/ExecutionView';
import type { StepStatus } from '@shared/execution';

/**
 * High-level workflow steps for the horizontal stepper.
 * Maps internal step names to user-friendly labels.
 */
const WORKFLOW_STEPS = [
  { key: 'Document Agent', label: 'Extract Clinical Facts', eventNames: ['extract-clinical-facts', 'Document Agent'] },
  { key: 'Provider Docs', label: 'Provider Uploads Docs', conditional: true, eventNames: ['wait-for-provider-docs', 'Provider Docs'] },
  { key: 'Specialist Agents', label: 'Specialist Review', eventNames: ['check-eligibility', 'check-policy', 'check-medical-necessity', 'Eligibility', 'Policy', 'Medical Necessity', 'Specialist Agents'] },
  { key: 'Synthesis', label: 'Synthesize Findings', eventNames: ['synthesize-findings', 'Synthesis'] },
  { key: 'Human Review', label: 'Clinical Review', conditional: true, eventNames: ['wait-for-human-review', 'Human Review'] },
  { key: 'PA Submission', label: 'Submit PA', eventNames: ['submit-prior-auth', 'PA Submission'] },
  { key: 'Payer Decision', label: 'Payer Decision', eventNames: ['wait-for-payer-decision', 'Payer Decision'] },
  { key: 'Provider Notification', label: 'Notify Provider', eventNames: ['notify-provider', 'Provider Notification'] },
];

/** Status-to-style mapping for stepper dots. */
function getStepStyle(status: StepStatus): { dot: string; label: string; connector: string } {
  switch (status) {
    case 'succeeded':
      return {
        dot: 'bg-green-500 border-green-400',
        label: 'text-green-300',
        connector: 'bg-green-500',
      };
    case 'active':
      return {
        dot: 'bg-blue-500 border-blue-400 animate-pulse',
        label: 'text-blue-200 font-semibold',
        connector: 'bg-gray-600',
      };
    case 'suspended':
      return {
        dot: 'bg-amber-500 border-amber-400 animate-pulse',
        label: 'text-amber-200 font-semibold',
        connector: 'bg-gray-600',
      };
    case 'failed':
      return {
        dot: 'bg-red-500 border-red-400',
        label: 'text-red-300',
        connector: 'bg-red-500',
      };
    case 'skipped':
      return {
        dot: 'bg-gray-700 border-gray-600 border-dashed',
        label: 'text-gray-500',
        connector: 'bg-gray-700',
      };
    default: // pending
      return {
        dot: 'bg-gray-700 border-gray-500',
        label: 'text-gray-400',
        connector: 'bg-gray-700',
      };
  }
}

/** Icon inside the stepper dot. */
function StepIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case 'succeeded':
      return <span className="text-white text-[10px]">✓</span>;
    case 'failed':
      return <span className="text-white text-[10px]">✗</span>;
    case 'suspended':
      return <span className="text-white text-[10px]">⏸</span>;
    case 'skipped':
      return <span className="text-gray-500 text-[10px]">–</span>;
    case 'active':
      return <span className="w-2 h-2 rounded-full bg-white" />;
    default:
      return null;
  }
}

/**
 * WorkflowStepper — horizontal progress bar showing the high-level workflow steps.
 * Highlights the current step and shows which steps are complete/pending/skipped.
 */
export default function WorkflowStepper() {
  const ctx = useContext(ExecutionContext);
  if (!ctx) return null;

  const { events } = ctx.state;

  // Build a set of event names and their latest status
  const eventStatusMap = new Map<string, StepStatus>();
  for (const event of events) {
    const name = event.stepName;
    if (event.eventType === 'StepSucceeded') {
      eventStatusMap.set(name, 'succeeded');
    } else if (event.eventType === 'StepFailed') {
      eventStatusMap.set(name, 'failed');
    } else if (event.eventType === 'CallbackStarted' && !events.some(e => e.stepName === name && e.eventType === 'CallbackSucceeded')) {
      eventStatusMap.set(name, 'suspended');
    } else if (event.eventType === 'CallbackSucceeded') {
      if (eventStatusMap.get(name) === 'suspended') {
        eventStatusMap.set(name, 'active');
      }
    } else if (event.eventType === 'StepStarted' && !eventStatusMap.has(name)) {
      eventStatusMap.set(name, 'active');
    }
  }

  // Determine status for each workflow step by checking its eventNames
  function getWorkflowStepStatus(step: typeof WORKFLOW_STEPS[number], stepIdx: number): StepStatus {
    const statuses: StepStatus[] = [];
    for (const name of step.eventNames) {
      const s = eventStatusMap.get(name);
      if (s) statuses.push(s);
    }

    if (statuses.length === 0) {
      const laterStepHasEvents = WORKFLOW_STEPS.slice(stepIdx + 1).some(later =>
        later.eventNames.some(n => eventStatusMap.has(n))
      );
      if (laterStepHasEvents && step.conditional) return 'skipped';
      return 'pending';
    }

    if (statuses.includes('failed')) return 'failed';
    if (statuses.includes('suspended')) return 'suspended';
    if (statuses.includes('active')) return 'active';
    if (statuses.every(s => s === 'succeeded')) return 'succeeded';
    return 'active';
  }

  return (
    <div className="flex items-center gap-0 w-full overflow-x-auto px-2 py-2">
      {WORKFLOW_STEPS.map((step, idx) => {
        const status = getWorkflowStepStatus(step, idx);
        const style = getStepStyle(status);
        const isLast = idx === WORKFLOW_STEPS.length - 1;

        return (
          <div key={step.key} className="flex items-center flex-1 min-w-0">
            {/* Step dot + label */}
            <div className="flex flex-col items-center gap-1 min-w-[60px]">
              <div
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${style.dot}`}
              >
                <StepIcon status={status} />
              </div>
              <span className={`text-[10px] text-center leading-tight whitespace-nowrap ${style.label}`}>
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {!isLast && (
              <div className={`flex-1 h-0.5 mx-1 rounded ${style.connector}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
