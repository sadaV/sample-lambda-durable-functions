import { useContext, useEffect, useRef, useMemo } from 'react';
import { ExecutionContext } from '../pages/ExecutionView';
import type { ExecutionEvent } from '@shared/execution';
import { buildStepLookup } from '@manifest';

// Build the lookup once
const stepLookup = buildStepLookup();

/**
 * A consolidated activity entry — one per logical step, showing only the
 * most relevant state (not every internal transition).
 */
interface ActivityEntry {
  icon: string;
  text: string;
  detail?: string;
  timestamp: string;
  status: 'in-progress' | 'waiting' | 'completed' | 'failed';
}

/** Known step names from the manifest. */
function getStepInfo(stepId: string): { label: string; detail: string } | undefined {
  // Try direct lookup first
  const step = stepLookup.get(stepId);
  if (step) return { label: step.label, detail: step.description };
  
  // Try with 'invoke-' prefix (specialist agents use 'eligibility' in events but 'invoke-eligibility' in manifest)
  const withPrefix = stepLookup.get(`invoke-${stepId}`);
  if (withPrefix) return { label: withPrefix.label, detail: withPrefix.description };
  
  return undefined;
}

/** Get narrative text for a step based on its status. */
function getNarrative(stepId: string, status: 'start' | 'complete' | 'waiting'): string | undefined {
  const step = stepLookup.get(stepId) ?? stepLookup.get(`invoke-${stepId}`);
  if (!step) return undefined;
  switch (status) {
    case 'start': return step.narrativeStart;
    case 'complete': return step.narrativeComplete;
    case 'waiting': return step.narrativeWaiting;
  }
}

/** Icons for different statuses. */
const STATUS_ICONS: Record<ActivityEntry['status'], string> = {
  'in-progress': '⏳',
  'waiting': '⏸️',
  'completed': '✅',
  'failed': '❌',
};

/**
 * Derives consolidated activity entries from raw events.
 * Groups events by step name and shows only one entry per step with its current status.
 */
function deriveActivityEntries(events: ExecutionEvent[]): ActivityEntry[] {
  // Track the latest status for each known step
  const stepStates = new Map<string, { status: ActivityEntry['status']; timestamp: string }>();
  const entries: ActivityEntry[] = [];
  const processedSteps = new Set<string>();

  // First pass: determine the final status of each step
  for (const event of events) {
    const name = event.stepName;
    if (!name || /^[0-9a-f]{8,}$/i.test(name)) continue; // Skip hex IDs

    if (event.eventType === 'StepSucceeded') {
      stepStates.set(name, { status: 'completed', timestamp: event.timestamp });
    } else if (event.eventType === 'StepFailed') {
      stepStates.set(name, { status: 'failed', timestamp: event.timestamp });
    } else if (event.eventType === 'CallbackStarted') {
      // Only mark as waiting if not already completed
      if (!stepStates.has(name) || stepStates.get(name)!.status !== 'completed') {
        stepStates.set(name, { status: 'waiting', timestamp: event.timestamp });
      }
    } else if (event.eventType === 'CallbackSucceeded') {
      stepStates.set(name, { status: 'completed', timestamp: event.timestamp });
    } else if (event.eventType === 'StepStarted') {
      if (!stepStates.has(name)) {
        stepStates.set(name, { status: 'in-progress', timestamp: event.timestamp });
      }
    }
  }

  // Second pass: build entries in chronological order of first appearance
  for (const event of events) {
    const name = event.stepName;
    if (!name || /^[0-9a-f]{8,}$/i.test(name)) continue;
    if (processedSteps.has(name)) continue;

    // Only show entry on first meaningful event for this step
    if (event.eventType === 'StepStarted' || event.eventType === 'CallbackStarted') {
      processedSteps.add(name);
      const state = stepStates.get(name)!;
      const known = getStepInfo(name);

      let text: string;
      if (state.status === 'completed') {
        text = getNarrative(name, 'complete') ?? known?.label ?? name;
      } else if (state.status === 'waiting') {
        text = getNarrative(name, 'waiting') ?? known?.label ?? name;
      } else {
        text = getNarrative(name, 'start') ?? known?.label ?? name;
      }

      entries.push({
        icon: STATUS_ICONS[state.status],
        text,
        detail: known?.detail,
        timestamp: state.timestamp,
        status: state.status,
      });
    }
  }

  // Add execution-level events
  const execSucceeded = events.find(e => e.eventType === 'ExecutionSucceeded');
  const execFailed = events.find(e => e.eventType === 'ExecutionFailed');

  if (execSucceeded) {
    entries.push({
      icon: '🎉',
      text: 'Prior authorization workflow completed',
      timestamp: execSucceeded.timestamp,
      status: 'completed',
    });
  } else if (execFailed) {
    entries.push({
      icon: '❌',
      text: 'Workflow failed',
      detail: execFailed.error?.message,
      timestamp: execFailed.timestamp,
      status: 'failed',
    });
  }

  return entries;
}

/**
 * ActivityFeed — consolidated narrative of workflow progress.
 * Shows one entry per logical step with its current status.
 */
export default function ActivityFeed() {
  const ctx = useContext(ExecutionContext);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  const entries = useMemo(() => {
    if (!ctx) return [];
    return deriveActivityEntries(ctx.state.events);
  }, [ctx?.state.events]);

  useEffect(() => {
    if (!scrollRef.current) return;
    if (entries.length > prevCountRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    prevCountRef.current = entries.length;
  }, [entries.length]);

  if (!ctx) return null;

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-gray-500 italic">Waiting for workflow to start...</p>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex flex-col gap-0.5 overflow-y-auto h-full px-2 py-2">
      {entries.map((entry, idx) => {
        const time = new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const isActive = entry.status === 'in-progress' || entry.status === 'waiting';

        return (
          <div
            key={idx}
            className={`flex items-start gap-3 py-2 px-3 rounded-lg transition-all ${
              isActive ? 'bg-gray-800/60 ring-1 ring-gray-700' : ''
            }`}
          >
            <span className="text-base shrink-0 mt-0.5">{entry.icon}</span>
            <div className="flex-1 min-w-0">
              <p className={`text-sm ${isActive ? 'text-gray-100 font-medium' : 'text-gray-300'}`}>
                {entry.text}
                {isActive && <span className="ml-2 inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />}
              </p>
              {entry.detail && (
                <p className="text-xs text-gray-500 mt-0.5">{entry.detail}</p>
              )}
            </div>
            <span className="text-xs text-gray-500 shrink-0 mt-1">{time}</span>
          </div>
        );
      })}
    </div>
  );
}
