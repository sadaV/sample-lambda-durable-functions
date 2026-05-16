import { useContext, useState } from 'react';
import { ExecutionContext } from '../pages/ExecutionView';
import StepItem from './StepItem';

/**
 * StepList — renders a vertical list of workflow steps with visual status indicators.
 *
 * Sequential flow:
 *   Document Agent → Provider Docs (conditional) → Specialist Agents (parallel, expandable)
 *   → Synthesis → Human Review (conditional) → PA Submission → Payer Decision → Provider Notification
 *
 * The Specialist Agents step has a `children` array that renders as an expandable sub-list.
 * Clicking a step selects it for the Context Inspector.
 */
export default function StepList() {
  const ctx = useContext(ExecutionContext);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set(['Specialist Agents']));

  if (!ctx) {
    return null;
  }

  const { state, selectedStep, setSelectedStep } = ctx;
  const { steps } = state;

  const toggleExpand = (stepName: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepName)) {
        next.delete(stepName);
      } else {
        next.add(stepName);
      }
      return next;
    });
  };

  const handleSelect = (stepName: string) => {
    setSelectedStep(stepName);
  };

  if (steps.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-gray-500">No steps available</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 px-1 shrink-0">
        Workflow Steps
      </h3>
      <div className="flex-1 overflow-y-auto space-y-1 pr-1">
        {steps.map((step) => (
          <div key={step.name}>
            {/* Parent step with optional expand toggle */}
            <div className="flex items-center gap-1">
              {step.children && step.children.length > 0 && (
                <button
                  type="button"
                  onClick={() => toggleExpand(step.name)}
                  className="flex-shrink-0 w-4 h-4 flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors"
                  aria-label={expandedSteps.has(step.name) ? 'Collapse' : 'Expand'}
                >
                  <svg
                    className={`w-3 h-3 transition-transform ${expandedSteps.has(step.name) ? 'rotate-90' : ''}`}
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              )}
              <div className={step.children && step.children.length > 0 ? 'flex-1 min-w-0' : 'flex-1 min-w-0 ml-5'}>
                <StepItem
                  step={step}
                  isSelected={selectedStep === step.name}
                  onSelect={handleSelect}
                />
              </div>
            </div>

            {/* Expandable children (parallel sub-agents) */}
            {step.children && step.children.length > 0 && expandedSteps.has(step.name) && (
              <div className="mt-1 space-y-1 ml-5 border-l border-gray-700 pl-2">
                {step.children.map((child) => (
                  <StepItem
                    key={child.name}
                    step={child}
                    isSelected={selectedStep === child.name}
                    onSelect={handleSelect}
                    isChild
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
