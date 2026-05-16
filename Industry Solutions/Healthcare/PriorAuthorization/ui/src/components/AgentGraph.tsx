import { useContext } from 'react';
import { ExecutionContext } from '../pages/ExecutionView';
import AgentNode from './AgentNode';
import type { AgentNodeState, AgentNodeStatus } from '@shared/execution';

/**
 * Default agent states when no execution data is available.
 * All agents start in neutral pending state (Req 3.1, 3.6).
 */
const DEFAULT_AGENTS: AgentNodeState[] = [
  { id: 'document', name: 'Document', status: 'pending' },
  { id: 'eligibility', name: 'Eligibility', status: 'pending' },
  { id: 'policy', name: 'Policy', status: 'pending' },
  { id: 'medical-necessity', name: 'Medical Necessity', status: 'pending' },
  { id: 'synthesis', name: 'Synthesis', status: 'pending' },
];

/** Edge color based on agent status. */
function getEdgeColor(status: AgentNodeStatus): string {
  switch (status) {
    case 'active':
      return 'stroke-blue-500';
    case 'succeeded':
      return 'stroke-green-500';
    case 'failed':
      return 'stroke-red-500';
    case 'skipped':
      return 'stroke-gray-700';
    default:
      return 'stroke-gray-600';
  }
}

/** Edge opacity based on agent status. */
function getEdgeOpacity(status: AgentNodeStatus): string {
  return status === 'skipped' ? 'opacity-40' : 'opacity-100';
}

/**
 * AgentGraph — renders a node-and-edge diagram with the Coordinator as the
 * central node and 5 specialist agents arranged in a radial pattern.
 *
 * Uses SVG for edges and CSS for node positioning.
 * Active edges have a pulsing dashed animation (Req 3.2).
 * Multiple edges animate simultaneously for parallel agents (Req 3.5).
 * Skipped agents rendered with reduced opacity (Req 3.4).
 * Reset returns all to neutral pending state (Req 3.6).
 */
export default function AgentGraph() {
  const ctx = useContext(ExecutionContext);
  const agents = ctx?.state.agentStates.length
    ? ctx.state.agentStates
    : DEFAULT_AGENTS;

  // Layout: Coordinator at center, agents arranged around it
  // Using a fixed coordinate system within the SVG viewBox
  const centerX = 140;
  const centerY = 110;
  const radius = 80;

  // Position agents in a semi-circle (top arc) for a clean presentation layout
  const agentPositions = [
    { x: centerX - radius * 1.1, y: centerY - radius * 0.6 },  // Document (top-left)
    { x: centerX - radius * 0.55, y: centerY - radius },         // Eligibility (upper-left)
    { x: centerX, y: centerY - radius * 1.1 },                   // Policy (top-center)
    { x: centerX + radius * 0.55, y: centerY - radius },         // Medical Necessity (upper-right)
    { x: centerX + radius * 1.1, y: centerY - radius * 0.6 },   // Synthesis (top-right)
  ];

  return (
    <div className="flex flex-col items-center justify-center h-full w-full">
      <div className="relative w-full max-w-[320px] aspect-[4/3]">
        {/* SVG edges layer */}
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 280 220"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            {/* Animated dash pattern for active edges */}
            <style>{`
              @keyframes dash-flow {
                to { stroke-dashoffset: -20; }
              }
              .edge-active {
                stroke-dasharray: 6 4;
                animation: dash-flow 0.8s linear infinite;
              }
              .edge-pulse {
                animation: dash-flow 0.8s linear infinite, edge-glow 1.5s ease-in-out infinite;
              }
              @keyframes edge-glow {
                0%, 100% { opacity: 0.7; }
                50% { opacity: 1; }
              }
            `}</style>
          </defs>

          {/* Draw edges from coordinator center to each agent position */}
          {agents.map((agent, i) => {
            const pos = agentPositions[i];
            const isActive = agent.status === 'active';
            const edgeColor = getEdgeColor(agent.status);
            const edgeOpacity = getEdgeOpacity(agent.status);

            return (
              <line
                key={agent.id}
                x1={centerX}
                y1={centerY}
                x2={pos.x}
                y2={pos.y}
                className={`
                  ${edgeColor} ${edgeOpacity}
                  ${isActive ? 'edge-active edge-pulse' : ''}
                  transition-all duration-300
                `}
                strokeWidth={isActive ? 2.5 : 1.5}
                fill="none"
              />
            );
          })}
        </svg>

        {/* Coordinator node (center) */}
        <div
          className="absolute flex flex-col items-center justify-center w-20 h-12 rounded-lg border-2 border-indigo-500 bg-indigo-900/60 text-indigo-200 shadow-[0_0_8px_rgba(99,102,241,0.3)]"
          style={{
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        >
          <span className="text-xs font-semibold">Coordinator</span>
        </div>

        {/* Agent nodes positioned around the coordinator */}
        {agents.map((agent, i) => {
          const pos = agentPositions[i];
          // Convert SVG viewBox coordinates to percentage positions
          const leftPct = (pos.x / 280) * 100;
          const topPct = (pos.y / 220) * 100;

          return (
            <div
              key={agent.id}
              className="absolute"
              style={{
                left: `${leftPct}%`,
                top: `${topPct}%`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <AgentNode name={agent.name} status={agent.status} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
