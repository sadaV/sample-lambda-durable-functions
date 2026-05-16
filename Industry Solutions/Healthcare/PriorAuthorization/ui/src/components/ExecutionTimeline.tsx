import { useContext, useEffect, useRef } from 'react';
import { ExecutionContext } from '../pages/ExecutionView';
import {
  deriveTimelineEvents,
  calculateSuspensionDuration,
  isTerminalState,
} from '../lib/execution-parser';
import type { TimelineDisplayEvent } from '../lib/execution-parser';

// ─── Event Type Badge Config ─────────────────────────────────────────────────

const EVENT_TYPE_BADGES: Record<string, { label: string; className: string }> = {
  StepStarted: { label: 'Started', className: 'bg-blue-500/20 text-blue-300 border-blue-500/40' },
  StepSucceeded: { label: 'Succeeded', className: 'bg-green-500/20 text-green-300 border-green-500/40' },
  StepFailed: { label: 'Failed', className: 'bg-red-500/20 text-red-300 border-red-500/40' },
  CallbackStarted: { label: 'Suspended', className: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  CallbackSucceeded: { label: 'Resumed', className: 'bg-green-500/20 text-green-300 border-green-500/40' },
  ExecutionSucceeded: { label: 'Completed', className: 'bg-green-500/20 text-green-300 border-green-500/40' },
  ExecutionFailed: { label: 'Failed', className: 'bg-red-500/20 text-red-300 border-red-500/40' },
  InvocationCompleted: { label: 'Invoked', className: 'bg-gray-500/20 text-gray-300 border-gray-500/40' },
};

// ─── Outcome Styling ─────────────────────────────────────────────────────────

const OUTCOME_STYLES: Record<string, { label: string; className: string }> = {
  approved: { label: 'Approved', className: 'text-green-300 bg-green-500/20 border-green-500/40' },
  denied: { label: 'Denied', className: 'text-red-300 bg-red-500/20 border-red-500/40' },
  pending_review: { label: 'Pending Review', className: 'text-amber-300 bg-amber-500/20 border-amber-500/40' },
};

// ─── Human-Readable Step Names ───────────────────────────────────────────────

/** Maps raw step/event names to human-readable labels for the timeline. */
const STEP_DISPLAY_NAMES: Record<string, string> = {
  'extract-clinical-facts': 'Extract Clinical Facts',
  'wait-for-provider-docs': 'Wait for Provider Docs',
  'check-eligibility': 'Check Eligibility',
  'check-policy': 'Check Policy',
  'check-medical-necessity': 'Check Medical Necessity',
  'synthesize-findings': 'Synthesize Findings',
  'wait-for-human-review': 'Human Review',
  'submit-prior-auth': 'Submit PA',
  'wait-for-payer-decision': 'Payer Decision',
  'notify-provider': 'Notify Provider',
  'Document Agent': 'Extract Clinical Facts',
  'Provider Docs': 'Wait for Provider Docs',
  'Eligibility': 'Check Eligibility',
  'Policy': 'Check Policy',
  'Medical Necessity': 'Check Medical Necessity',
  'Synthesis': 'Synthesize Findings',
  'Human Review': 'Human Review',
  'PA Submission': 'Submit PA',
  'Payer Decision': 'Payer Decision',
  'Provider Notification': 'Notify Provider',
};

/** Returns a human-readable name for a step, falling back to the raw name. */
function displayStepName(rawName: string): string {
  return STEP_DISPLAY_NAMES[rawName] ?? rawName;
}

// ─── Specialist Agents (for parallel grouping) ───────────────────────────────

const SPECIALIST_AGENTS = ['Eligibility', 'Policy', 'Medical Necessity'];

// ─── Sub-Components ──────────────────────────────────────────────────────────

interface TimelineEventProps {
  event: TimelineDisplayEvent;
  isParallelGrouped?: boolean;
}

/**
 * TimelineEvent — renders a single event row in the timeline.
 */
function TimelineEvent({ event, isParallelGrouped = false }: TimelineEventProps) {
  const badge = EVENT_TYPE_BADGES[event.eventType] ?? {
    label: event.eventType,
    className: 'bg-gray-500/20 text-gray-300 border-gray-500/40',
  };

  const absoluteTime = new Date(event.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div
      className={`flex items-center gap-2 px-2 py-1 rounded text-xs ${
        isParallelGrouped ? 'ml-4 border-l-2 border-purple-500/40 pl-3' : ''
      }`}
    >
      {/* Elapsed time */}
      <span className="text-gray-500 font-mono w-14 shrink-0 text-right">
        +{event.elapsedFormatted}
      </span>

      {/* Event type badge */}
      <span
        className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-medium shrink-0 ${badge.className}`}
      >
        {badge.label}
      </span>

      {/* Step name */}
      <span className="text-gray-200 truncate flex-1 font-medium">{displayStepName(event.stepName)}</span>

      {/* Error indicator */}
      {event.error && (
        <span className="text-red-400 text-[10px] truncate max-w-[120px]" title={event.error.message}>
          {event.error.code}
        </span>
      )}

      {/* Absolute time */}
      <span className="text-gray-500 font-mono shrink-0">{absoluteTime}</span>
    </div>
  );
}

interface SuspensionIndicatorProps {
  stepName: string;
  duration: string;
}

/**
 * SuspensionIndicator — renders the suspension period between CallbackStarted and CallbackSucceeded.
 */
function SuspensionIndicator({ stepName, duration }: SuspensionIndicatorProps) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 mx-1 my-0.5 rounded bg-amber-900/10 border border-dashed border-amber-500/30">
      <svg className="w-3.5 h-3.5 text-amber-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z"
          clipRule="evenodd"
        />
      </svg>
      <span className="text-amber-300 text-xs font-medium">
        Suspended: {displayStepName(stepName)}
      </span>
      <span className="text-amber-400/70 text-xs font-mono ml-auto">{duration}</span>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

/**
 * ExecutionTimeline — displays all execution events chronologically.
 *
 * Features:
 * - Event type badges with color coding
 * - Elapsed time and absolute timestamps
 * - Suspension period indicators with human-readable duration
 * - Final outcome display on completion
 * - Failure indicator with step name and error category
 * - Parallel events grouped into visual clusters
 * - Scroll position preserved when new events are appended
 */
export default function ExecutionTimeline() {
  const ctx = useContext(ExecutionContext);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(true);
  const prevEventCountRef = useRef(0);

  // Preserve scroll position when new events are appended
  useEffect(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    const eventCount = ctx?.state.events.length ?? 0;

    if (eventCount > prevEventCountRef.current) {
      // New events were appended — only auto-scroll if user was at the bottom
      if (wasAtBottomRef.current) {
        el.scrollTop = el.scrollHeight;
      }
    }
    prevEventCountRef.current = eventCount;
  }, [ctx?.state.events.length]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    const threshold = 30;
    wasAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  };

  if (!ctx) {
    return null;
  }

  const { state } = ctx;
  const { events, startTime, status, endTime } = state;

  // Derive timeline events
  const timelineEvents = deriveTimelineEvents(events, startTime);

  // Determine final outcome
  const isComplete = isTerminalState(status);
  const outcome = deriveOutcome(events, status);

  // Calculate total elapsed time
  const totalElapsed =
    isComplete && endTime
      ? calculateSuspensionDuration(startTime, endTime)
      : null;

  // Detect failure info
  const failureInfo = getFailureInfo(events);

  // Group parallel events
  const groupedEvents = groupTimelineForDisplay(timelineEvents);

  if (events.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 px-1 shrink-0">
          Timeline
        </h3>
        <div className="flex items-center justify-center flex-1">
          <p className="text-sm text-gray-500">Waiting for events…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 px-1 shrink-0">
        Timeline
      </h3>

      {/* Scrollable event list */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto space-y-0.5 pr-1"
      >
        {groupedEvents.map((item, idx) => {
          if (item.type === 'parallel-group') {
            return (
              <div
                key={`group-${idx}`}
                className="rounded border border-purple-500/20 bg-purple-900/10 py-0.5 my-0.5"
              >
                <div className="px-2 py-0.5 text-[10px] text-purple-300 font-semibold uppercase tracking-wider">
                  ⚡ Parallel: Specialist Agents
                </div>
                {item.events.map((event, eIdx) => (
                  <TimelineEvent key={`${event.timestamp}-${eIdx}`} event={event} isParallelGrouped />
                ))}
              </div>
            );
          }

          if (item.type === 'suspension') {
            return (
              <SuspensionIndicator
                key={`suspension-${idx}`}
                stepName={item.stepName}
                duration={item.duration}
              />
            );
          }

          return (
            <TimelineEvent key={`${item.event.timestamp}-${idx}`} event={item.event} />
          );
        })}
      </div>

      {/* Footer: outcome or failure */}
      {isComplete && (
        <div className="shrink-0 mt-2 pt-2 border-t border-gray-700 px-1">
          {failureInfo && status === 'FAILED' ? (
            <div className="flex items-center gap-2 text-xs">
              <svg className="w-3.5 h-3.5 text-red-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-red-300 font-medium">
                Failed at: {failureInfo.stepName}
              </span>
              <span className="text-red-400/70 font-mono text-[10px]">
                {failureInfo.errorCategory}
              </span>
              {totalElapsed && (
                <span className="text-gray-500 font-mono ml-auto">{totalElapsed}</span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs">
              {outcome && (
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-semibold ${
                    OUTCOME_STYLES[outcome]?.className ?? 'text-gray-300 bg-gray-500/20 border-gray-500/40'
                  }`}
                >
                  {OUTCOME_STYLES[outcome]?.label ?? outcome}
                </span>
              )}
              {totalElapsed && (
                <span className="text-gray-400 font-mono ml-auto">
                  Total: {totalElapsed}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Helper Functions ────────────────────────────────────────────────────────

type DisplayItem =
  | { type: 'event'; event: TimelineDisplayEvent }
  | { type: 'suspension'; stepName: string; duration: string }
  | { type: 'parallel-group'; events: TimelineDisplayEvent[] };

/**
 * Groups timeline events for display:
 * - Parallel specialist agent events are clustered
 * - Suspension periods are inserted between CallbackStarted and CallbackSucceeded
 */
function groupTimelineForDisplay(timelineEvents: TimelineDisplayEvent[]): DisplayItem[] {
  const items: DisplayItem[] = [];
  let i = 0;

  while (i < timelineEvents.length) {
    const event = timelineEvents[i];

    // Check if this is a specialist agent event that might be part of a parallel group
    if (SPECIALIST_AGENTS.includes(event.stepName)) {
      // Collect consecutive specialist agent events with similar timestamps (within 2s)
      const parallelGroup: TimelineDisplayEvent[] = [event];
      let j = i + 1;
      while (j < timelineEvents.length) {
        const next = timelineEvents[j];
        if (
          SPECIALIST_AGENTS.includes(next.stepName) &&
          Math.abs(new Date(next.timestamp).getTime() - new Date(event.timestamp).getTime()) < 2000
        ) {
          parallelGroup.push(next);
          j++;
        } else {
          break;
        }
      }

      if (parallelGroup.length > 1) {
        items.push({ type: 'parallel-group', events: parallelGroup });
        i = j;
        continue;
      }
    }

    // Insert suspension indicator after CallbackStarted
    if (event.eventType === 'CallbackSucceeded' && event.isSuspension && event.suspensionDuration) {
      // Insert the suspension indicator before the CallbackSucceeded event
      items.push({
        type: 'suspension',
        stepName: event.stepName,
        duration: event.suspensionDuration,
      });
    }

    items.push({ type: 'event', event });
    i++;
  }

  return items;
}

/**
 * Derives the final outcome from events or status.
 */
function deriveOutcome(
  events: Array<{ eventType: string; payload?: Record<string, unknown> }>,
  status: string
): string | null {
  if (status === 'FAILED' || status === 'TIMED_OUT') {
    return null;
  }

  if (status !== 'SUCCEEDED') {
    return null;
  }

  // Look for the last event that might contain outcome info
  const successEvent = [...events]
    .reverse()
    .find((e) => e.eventType === 'ExecutionSucceeded' || e.eventType === 'StepSucceeded');

  if (successEvent?.payload) {
    if ('approved' in successEvent.payload) {
      return successEvent.payload.approved ? 'approved' : 'denied';
    }
    if ('outcome' in successEvent.payload) {
      return successEvent.payload.outcome as string;
    }
  }

  // Default to approved for succeeded executions
  return 'approved';
}

/**
 * Extracts failure information from events.
 */
function getFailureInfo(
  events: Array<{ eventType: string; stepName: string; error?: { code: string; message: string } }>
): { stepName: string; errorCategory: string } | null {
  const failedEvent = [...events]
    .reverse()
    .find((e) => e.eventType === 'StepFailed' || e.eventType === 'ExecutionFailed');

  if (!failedEvent) {
    return null;
  }

  let errorCategory = 'invocation error';
  if (failedEvent.error?.code) {
    const code = failedEvent.error.code.toLowerCase();
    if (code.includes('timeout')) {
      errorCategory = failedEvent.stepName.includes('Callback') ? 'callback timeout' : 'agent timeout';
    } else {
      errorCategory = failedEvent.error.code;
    }
  }

  return {
    stepName: failedEvent.stepName,
    errorCategory,
  };
}
