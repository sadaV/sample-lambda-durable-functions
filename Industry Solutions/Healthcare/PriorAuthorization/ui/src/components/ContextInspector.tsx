import { useContext, useMemo } from 'react';
import { JsonView, darkStyles } from 'react-json-view-lite';
import 'react-json-view-lite/dist/index.css';
import { ExecutionContext } from '../pages/ExecutionView';
import { extractStepPayloads } from '../lib/execution-parser';
import type { ExecutionEvent } from '@shared/execution';

// ─── PayloadPanel ────────────────────────────────────────────────────────────

interface PayloadPanelProps {
  label: 'Input' | 'Output';
  data: Record<string, unknown> | undefined;
  placeholder?: string;
}

/**
 * Renders a single JSON payload with a label ("Input" or "Output").
 * Collapsible sections for objects with >5 keys or arrays with >5 elements.
 */
function PayloadPanel({ label, data, placeholder }: PayloadPanelProps) {
  const shouldExpandNode = (level: number, value: unknown): boolean => {
    if (level === 0) return true;
    if (Array.isArray(value)) return value.length <= 5;
    if (typeof value === 'object' && value !== null) {
      return Object.keys(value).length <= 5;
    }
    return true;
  };

  return (
    <div className="flex flex-col flex-1 min-w-0 min-h-0">
      <span className="mb-1 text-xs font-medium text-gray-400 uppercase tracking-wide">
        {label}
      </span>
      <div className="flex-1 min-h-0 overflow-auto rounded bg-gray-900/60 p-2 text-sm">
        {data ? (
          <JsonView
            data={data}
            style={darkStyles}
            shouldExpandNode={shouldExpandNode}
          />
        ) : (
          <p className="text-gray-500 italic text-xs">
            {placeholder ?? 'No data'}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── DirectionalArrow ────────────────────────────────────────────────────────

function DirectionalArrow() {
  return (
    <div className="flex items-center justify-center px-1 shrink-0">
      <span className="text-gray-500 text-lg" aria-label="data flows from input to output">
        →
      </span>
    </div>
  );
}

// ─── ContextInspector ────────────────────────────────────────────────────────

/**
 * Context Inspector — displays side-by-side Input/Output panels for the
 * selected step, showing how data flows between agents through the Coordinator.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */
export default function ContextInspector() {
  const ctx = useContext(ExecutionContext);

  const { events, selectedStep } = useMemo(() => {
    if (!ctx) return { events: [] as ExecutionEvent[], selectedStep: null };
    return { events: ctx.state.events, selectedStep: ctx.selectedStep };
  }, [ctx]);

  const payloads = useMemo(() => {
    if (!selectedStep) return null;
    return extractStepPayloads(events, selectedStep);
  }, [events, selectedStep]);

  // No step selected
  if (!selectedStep) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-gray-500 italic">
          Select a step to view payloads
        </p>
      </div>
    );
  }

  // Step selected but no payload data at all
  if (payloads && !payloads.input && !payloads.output) {
    return (
      <div className="flex flex-col h-full">
        <h3 className="text-xs font-semibold text-gray-300 mb-2 truncate">
          {selectedStep}
        </h3>
        <div className="flex items-center justify-center flex-1">
          <p className="text-sm text-gray-500 italic">
            No payload data recorded
          </p>
        </div>
      </div>
    );
  }

  // Determine if step is in-progress (has input but no output)
  const isInProgress = payloads?.input && !payloads?.output;

  return (
    <div className="flex flex-col h-full min-h-0">
      <h3 className="text-xs font-semibold text-gray-300 mb-2 truncate shrink-0">
        {selectedStep}
      </h3>
      <div className="flex flex-1 min-h-0 gap-1">
        <PayloadPanel label="Input" data={payloads?.input} placeholder="No input data" />
        <DirectionalArrow />
        <PayloadPanel
          label="Output"
          data={payloads?.output}
          placeholder={isInProgress ? 'Output not yet available' : 'No output data'}
        />
      </div>
    </div>
  );
}
