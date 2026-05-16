import { createContext, useCallback, useMemo, useReducer, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getHistory } from '../api/client';
import { usePolling } from '../hooks/usePolling';
import WorkflowDiagram from '../components/WorkflowDiagram';
import ActivityFeed from '../components/ActivityFeed';
import CallbackPanel from '../components/CallbackPanel';
import {
  isTerminalState,
  deriveStepList,
  deriveAgentStates,
  deriveCallbackContext,
} from '../lib/execution-parser';
import type {
  ExecutionState,
  StepState,
  AgentNodeState,
  CallbackContext,
  ExecutionEvent,
  StepStatus,
} from '@shared/execution';
import type { GetHistoryResponse } from '@shared/api';

// ─── Reducer Types ───────────────────────────────────────────────────────────

type ExecutionAction =
  | { type: 'SET_HISTORY'; payload: GetHistoryResponse }
  | { type: 'SET_ERROR'; payload: string }
  | { type: 'RESET' };

interface ExecutionViewState {
  executionArn: string;
  status: ExecutionState['status'];
  events: ExecutionEvent[];
  steps: StepState[];
  agentStates: AgentNodeState[];
  callbackContext: CallbackContext | null;
  startTime: string;
  endTime?: string;
  error: string | null;
}

// ─── Context ─────────────────────────────────────────────────────────────────

export interface ExecutionContextValue {
  state: ExecutionViewState;
  selectedStep: string | null;
  setSelectedStep: (stepName: string | null) => void;
  isPolling: boolean;
  dispatch: React.Dispatch<ExecutionAction>;
}

export const ExecutionContext = createContext<ExecutionContextValue | null>(null);

// ─── Reducer ─────────────────────────────────────────────────────────────────

function createInitialState(arn: string): ExecutionViewState {
  return {
    executionArn: arn,
    status: 'RUNNING',
    events: [],
    steps: [],
    agentStates: [],
    callbackContext: null,
    startTime: '',
    endTime: undefined,
    error: null,
  };
}

function executionReducer(
  state: ExecutionViewState,
  action: ExecutionAction,
): ExecutionViewState {
  switch (action.type) {
    case 'SET_HISTORY': {
      const { status, events, startTime, endTime } = action.payload;
      return {
        ...state,
        status,
        events,
        steps: deriveStepList(events),
        agentStates: deriveAgentStates(events),
        callbackContext: deriveCallbackContext(events),
        startTime,
        endTime,
        error: null,
      };
    }
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'RESET':
      return createInitialState(state.executionArn);
    default:
      return state;
  }
}

// ─── Polling Interval ────────────────────────────────────────────────────────

const DEFAULT_POLLING_INTERVAL_MS = 3000;

// ─── Helper: derive step statuses from events for the workflow diagram ────────

function deriveStepStatusMap(events: ExecutionEvent[]): Map<string, StepStatus> {
  const statusMap = new Map<string, StepStatus>();

  for (const event of events) {
    const name = event.stepName;
    if (event.eventType === 'StepSucceeded') {
      statusMap.set(name, 'succeeded');
    } else if (event.eventType === 'StepFailed') {
      statusMap.set(name, 'failed');
    } else if (event.eventType === 'CallbackStarted') {
      // Only mark as suspended if no CallbackSucceeded for this step
      if (!events.some(e => e.stepName === name && e.eventType === 'CallbackSucceeded')) {
        statusMap.set(name, 'suspended');
      }
    } else if (event.eventType === 'CallbackSucceeded') {
      // Callback completed — mark as succeeded (the step result came back)
      if (statusMap.get(name) === 'suspended') {
        statusMap.set(name, 'succeeded');
      }
    } else if (event.eventType === 'StepStarted' && !statusMap.has(name)) {
      statusMap.set(name, 'active');
    }
  }

  return statusMap;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ExecutionView() {
  const { arn } = useParams<{ arn: string }>();
  const decodedArn = arn ? decodeURIComponent(arn) : '';

  const [state, dispatch] = useReducer(
    executionReducer,
    decodedArn,
    createInitialState,
  );

  const [selectedStep, setSelectedStep] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!decodedArn) throw new Error('No execution ARN provided');
    const response = await getHistory(decodedArn);
    dispatch({ type: 'SET_HISTORY', payload: response });
    return response;
  }, [decodedArn]);

  const shouldStop = useCallback(
    (data: GetHistoryResponse) => isTerminalState(data.status),
    [],
  );

  const { isPolling } = usePolling<GetHistoryResponse>({
    fetchFn: fetchHistory,
    intervalMs: DEFAULT_POLLING_INTERVAL_MS,
    shouldStop,
    enabled: !!decodedArn,
  });

  const contextValue = useMemo<ExecutionContextValue>(
    () => ({ state, selectedStep, setSelectedStep, isPolling, dispatch }),
    [state, selectedStep, isPolling],
  );

  const stepStatuses = useMemo(() => deriveStepStatusMap(state.events), [state.events]);

  if (!decodedArn) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-400">No execution ARN provided.</p>
      </div>
    );
  }

  return (
    <ExecutionContext.Provider value={contextValue}>
      <div className="flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 shrink-0 border-b border-gray-800">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-100">Prior Authorization Execution</h2>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <StatusBadge status={state.status} />
            {isPolling && (
              <span className="text-xs text-gray-500 animate-pulse">● Live</span>
            )}
          </div>
        </div>

        {/* Error banner */}
        {state.error && (
          <div className="px-4 py-2 text-sm text-red-300 bg-red-900/40 shrink-0">
            {state.error}
          </div>
        )}

        {/* Main content: Workflow diagram (left) + Activity feed (right) */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left: Workflow Diagram */}
          <div className="w-[420px] shrink-0 border-r border-gray-800 overflow-y-auto p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Workflow Progress</h3>
            <WorkflowDiagram stepStatuses={stepStatuses} mode="dynamic" />
          </div>

          {/* Right: Activity Feed */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 min-h-0 border-b border-gray-800">
              <div className="h-full flex flex-col">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 px-4 pt-3 pb-2 shrink-0">Activity</h3>
                <div className="flex-1 min-h-0 overflow-hidden">
                  <ActivityFeed />
                </div>
              </div>
            </div>

            {/* Bottom: Action Panel (like VS Code terminal) */}
            <div className="h-[220px] shrink-0 bg-gray-850 border-t border-gray-700">
              <div className="h-full flex flex-col">
                <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 shrink-0">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Actions</h3>
                  {state.callbackContext && (
                    <span className="text-[10px] text-amber-400 animate-pulse">● Action required</span>
                  )}
                </div>
                <div className="flex-1 min-h-0 overflow-hidden p-3">
                  <CallbackPanel />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ExecutionContext.Provider>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ExecutionState['status'] }) {
  const colorMap: Record<ExecutionState['status'], string> = {
    RUNNING: 'bg-blue-600 text-blue-100',
    SUCCEEDED: 'bg-green-600 text-green-100',
    FAILED: 'bg-red-600 text-red-100',
    TIMED_OUT: 'bg-yellow-600 text-yellow-100',
  };

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colorMap[status]}`}>
      {status}
    </span>
  );
}
