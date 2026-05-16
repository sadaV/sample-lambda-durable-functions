import type { StepState, StepStatus } from '@shared/execution';

// ─── Status Visual Config ────────────────────────────────────────────────────

interface StatusVisual {
  icon: React.ReactNode;
  containerClass: string;
  labelClass: string;
}

function getStatusVisual(status: StepStatus): StatusVisual {
  switch (status) {
    case 'pending':
      return {
        icon: <span className="block w-3 h-3 rounded-full border-2 border-gray-500" />,
        containerClass: 'border-gray-700',
        labelClass: 'text-gray-400',
      };
    case 'active':
      return {
        icon: (
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-blue-500" />
          </span>
        ),
        containerClass: 'border-blue-500/50 bg-blue-900/20',
        labelClass: 'text-blue-200',
      };
    case 'suspended':
      return {
        icon: (
          <svg className="w-3.5 h-3.5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        ),
        containerClass: 'border-amber-500/50 bg-amber-900/20',
        labelClass: 'text-amber-200',
      };
    case 'succeeded':
      return {
        icon: (
          <svg className="w-3.5 h-3.5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        ),
        containerClass: 'border-green-500/30',
        labelClass: 'text-green-300',
      };
    case 'failed':
      return {
        icon: (
          <svg className="w-3.5 h-3.5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        ),
        containerClass: 'border-red-500/30',
        labelClass: 'text-red-300',
      };
    case 'skipped':
      return {
        icon: (
          <span className="block w-3 h-3 rounded-full border-2 border-dashed border-gray-600 opacity-50" />
        ),
        containerClass: 'border-gray-700 opacity-50',
        labelClass: 'text-gray-500',
      };
  }
}

// ─── StepItem Component ──────────────────────────────────────────────────────

interface StepItemProps {
  step: StepState;
  isSelected: boolean;
  onSelect: (stepName: string) => void;
  isChild?: boolean;
}

export default function StepItem({ step, isSelected, onSelect, isChild = false }: StepItemProps) {
  const visual = getStatusVisual(step.status);

  return (
    <button
      type="button"
      onClick={() => onSelect(step.name)}
      className={`
        w-full text-left rounded-md border px-2.5 py-1.5 transition-colors
        hover:bg-gray-700/40 focus:outline-none focus:ring-1 focus:ring-blue-500
        ${visual.containerClass}
        ${isSelected ? 'ring-1 ring-blue-400 bg-gray-700/30' : ''}
        ${isChild ? 'ml-4' : ''}
      `}
      aria-label={`Step: ${step.name}, Status: ${step.status}`}
    >
      <div className="flex items-center gap-2">
        <div className="flex-shrink-0 flex items-center justify-center w-5 h-5">
          {visual.icon}
        </div>
        <span className={`text-sm font-medium truncate ${visual.labelClass}`}>
          {step.name}
        </span>
      </div>

      {/* Show callbackId for suspended steps */}
      {step.status === 'suspended' && step.callbackId && (
        <div className="mt-1 ml-7 text-xs text-amber-400/80 font-mono truncate">
          callback: {step.callbackId}
        </div>
      )}
    </button>
  );
}
