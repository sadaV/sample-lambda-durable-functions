import type { StepStatus } from '@shared/execution';
import { PA_WORKFLOW } from '@manifest';
import type { WorkflowStepDef } from '@manifest';

/** Props for the WorkflowDiagram component. */
interface WorkflowDiagramProps {
  /** Map of step ID → status. If not provided, all steps show as neutral (static mode). */
  stepStatuses?: Map<string, StepStatus>;
  /** Whether this is the static (home page) or dynamic (execution) version. */
  mode?: 'static' | 'dynamic';
}

/** Type badge colors. */
function typeBadge(type: WorkflowStepDef['type']): { label: string; className: string } {
  switch (type) {
    case 'agent-callback': return { label: 'AI Agent', className: 'bg-purple-500/20 text-purple-300 border-purple-500/40' };
    case 'human-callback': return { label: 'Human Action', className: 'bg-amber-500/20 text-amber-300 border-amber-500/40' };
    case 'step': return { label: 'Automated', className: 'bg-blue-500/20 text-blue-300 border-blue-500/40' };
    case 'parallel': return { label: 'Parallel', className: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40' };
  }
}

/** Status indicator styles. */
function statusStyle(status: StepStatus | undefined): { dot: string; ring: string; text: string } {
  switch (status) {
    case 'succeeded': return { dot: 'bg-green-500', ring: 'ring-green-500/30', text: 'text-green-300' };
    case 'active': return { dot: 'bg-blue-500 animate-pulse', ring: 'ring-blue-500/30', text: 'text-blue-200' };
    case 'suspended': return { dot: 'bg-amber-500 animate-pulse', ring: 'ring-amber-500/30', text: 'text-amber-200' };
    case 'failed': return { dot: 'bg-red-500', ring: 'ring-red-500/30', text: 'text-red-300' };
    case 'skipped': return { dot: 'bg-gray-600', ring: '', text: 'text-gray-500' };
    default: return { dot: 'bg-gray-600', ring: '', text: 'text-gray-400' };
  }
}

/**
 * WorkflowDiagram — visual representation of the PA workflow steps.
 * 
 * In "static" mode (home page): shows all steps in neutral state with descriptions.
 * In "dynamic" mode (execution page): highlights active/completed/pending steps.
 */
export default function WorkflowDiagram({ stepStatuses, mode = 'static' }: WorkflowDiagramProps) {
  return (
    <div className="flex flex-col gap-0">
      {PA_WORKFLOW.map((step, idx) => {
        const status = stepStatuses?.get(step.id);
        const style = statusStyle(status);
        const badge = typeBadge(step.type);
        const isLast = idx === PA_WORKFLOW.length - 1;

        return (
          <div key={step.id}>
            {/* Step row */}
            <div className={`flex items-start gap-3 py-2 px-3 rounded-lg transition-all ${
              status === 'active' || status === 'suspended' ? 'bg-gray-800/80 ring-1 ' + style.ring : ''
            } ${step.conditional && !status ? 'opacity-60' : ''}`}>
              {/* Status dot + connector line */}
              <div className="flex flex-col items-center pt-1">
                <div className={`w-3 h-3 rounded-full ${style.dot} ${
                  mode === 'static' ? 'bg-gray-500' : ''
                }`} />
                {!isLast && <div className="w-0.5 h-8 bg-gray-700 mt-1" />}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-lg font-semibold ${mode === 'dynamic' && status ? style.text : 'text-gray-200'}`}>
                    {step.label}
                  </span>
                  {step.conditional && (
                    <span className="text-[9px] text-gray-500 uppercase tracking-wider">conditional</span>
                  )}
                  <span className={`text-[9px] px-1.5 py-0.5 rounded border ${badge.className}`}>
                    {badge.label}
                  </span>
                  {status === 'succeeded' && <span className="text-green-400 text-xs">✓</span>}
                  {status === 'suspended' && <span className="text-amber-400 text-xs">⏸ waiting</span>}
                </div>
                <p className="text-sm text-gray-300 mt-1 leading-relaxed">{step.description}</p>

                {/* Parallel children */}
                {step.children && (
                  <div className="mt-2 ml-2 flex gap-2 flex-wrap">
                    {step.children.map((child) => {
                      const childStatus = stepStatuses?.get(child.id);
                      const childStyle = statusStyle(childStatus);
                      return (
                        <div key={child.id} className={`flex items-center gap-1.5 px-2 py-1 rounded border border-gray-700 bg-gray-800/50 ${
                          childStatus === 'active' ? 'border-blue-500/50' : ''
                        }`}>
                          <div className={`w-2 h-2 rounded-full ${mode === 'dynamic' && childStatus ? childStyle.dot : 'bg-gray-600'}`} />
                          <span className={`text-xs ${mode === 'dynamic' && childStatus ? childStyle.text : 'text-gray-400'}`}>
                            {child.label}
                          </span>
                          {childStatus === 'succeeded' && <span className="text-green-400 text-[10px]">✓</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
