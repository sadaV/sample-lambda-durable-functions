import type { AgentNodeStatus } from '@shared/execution';

interface AgentNodeProps {
  name: string;
  status: AgentNodeStatus;
}

/** Status-to-style mapping for agent nodes. */
const STATUS_STYLES: Record<AgentNodeStatus, { bg: string; border: string; text: string; icon: string }> = {
  pending: {
    bg: 'bg-gray-700',
    border: 'border-gray-600',
    text: 'text-gray-300',
    icon: '○',
  },
  active: {
    bg: 'bg-blue-900/60',
    border: 'border-blue-500',
    text: 'text-blue-200',
    icon: '◉',
  },
  succeeded: {
    bg: 'bg-green-900/60',
    border: 'border-green-500',
    text: 'text-green-200',
    icon: '✓',
  },
  failed: {
    bg: 'bg-red-900/60',
    border: 'border-red-500',
    text: 'text-red-200',
    icon: '✗',
  },
  skipped: {
    bg: 'bg-gray-800',
    border: 'border-gray-700',
    text: 'text-gray-500',
    icon: '–',
  },
};

/**
 * AgentNode — renders a single agent node in the Agent Graph.
 * Displays the agent name, a status icon, and applies visual styling
 * based on the current AgentNodeStatus.
 *
 * Skipped agents are rendered with reduced opacity (Req 3.4).
 */
export default function AgentNode({ name, status }: AgentNodeProps) {
  const style = STATUS_STYLES[status];
  const isSkipped = status === 'skipped';
  const isActive = status === 'active';

  return (
    <div
      className={`
        flex flex-col items-center justify-center
        w-24 h-16 rounded-lg border-2
        ${style.bg} ${style.border} ${style.text}
        ${isSkipped ? 'opacity-40' : 'opacity-100'}
        ${isActive ? 'shadow-[0_0_12px_rgba(59,130,246,0.5)]' : ''}
        transition-all duration-300
      `}
    >
      <span className="text-lg leading-none">{style.icon}</span>
      <span className="text-[10px] font-medium mt-1 text-center leading-tight px-1">
        {name}
      </span>
    </div>
  );
}
