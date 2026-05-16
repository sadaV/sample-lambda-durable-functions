/**
 * Execution parser library — pure functions that transform raw execution
 * history events into UI-ready state objects.
 *
 * All functions are side-effect-free for easy testing and predictable behavior.
 */

import type {
  ExecutionEvent,
  StepState,
  StepStatus,
  AgentNodeState,
  AgentNodeStatus,
  CallbackContext,
} from '@shared/execution';
import { getHumanCallbackStepIds, getCallbackPresetsForStep } from '@manifest';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Ordered step definitions for the PA workflow. */
const STEP_DEFINITIONS: { name: string; conditional: boolean; parallel: boolean }[] = [
  { name: 'Document Agent', conditional: false, parallel: false },
  { name: 'Provider Docs', conditional: true, parallel: false },
  { name: 'Specialist Agents', conditional: false, parallel: true },
  { name: 'Synthesis', conditional: false, parallel: false },
  { name: 'Human Review', conditional: true, parallel: false },
  { name: 'PA Submission', conditional: false, parallel: false },
  { name: 'Payer Decision', conditional: false, parallel: false },
  { name: 'Provider Notification', conditional: false, parallel: false },
];

/** Sub-agents within the parallel Specialist Agents step. */
const SPECIALIST_AGENTS = ['Eligibility', 'Policy', 'Medical Necessity'];

/** The 5 agents in the PA workflow. */
const AGENT_DEFINITIONS: { id: string; name: string }[] = [
  { id: 'document', name: 'Document' },
  { id: 'eligibility', name: 'Eligibility' },
  { id: 'policy', name: 'Policy' },
  { id: 'medical-necessity', name: 'Medical Necessity' },
  { id: 'synthesis', name: 'Synthesis' },
];

/** Step-to-agent mapping for deriving agent states. */
const STEP_TO_AGENT: Record<string, string> = {
  'Document Agent': 'document',
  'Eligibility': 'eligibility',
  'Policy': 'policy',
  'Medical Necessity': 'medical-necessity',
  'Synthesis': 'synthesis',
};

// ─── Timeline Display Types ──────────────────────────────────────────────────

/** A single event in the timeline display. */
export interface TimelineDisplayEvent {
  eventType: string;
  stepName: string;
  timestamp: string;
  elapsedMs: number;
  elapsedFormatted: string;
  payload?: Record<string, unknown>;
  error?: { code: string; message: string };
  isSuspension?: boolean;
  suspensionDuration?: string;
  group?: string;
}

/** A group of parallel events in the timeline. */
export interface GroupedTimelineEvent {
  groupName: string;
  events: TimelineDisplayEvent[];
}

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Derives an ordered StepState array from execution events.
 *
 * Rules:
 * - Steps with StepStarted but no completion → 'active'
 * - Steps with CallbackStarted but no CallbackSucceeded → 'suspended'
 * - Steps with StepSucceeded → 'succeeded'
 * - Steps with StepFailed → 'failed'
 * - Conditional steps not in events → 'skipped'
 * - Steps not yet reached → 'pending'
 */
export function deriveStepList(events: ExecutionEvent[]): StepState[] {
  const stepNames = new Set(events.map((e) => e.stepName));
  const hasAnyEvent = events.length > 0;

  // Determine which steps have been reached (any step after the last active one is pending)
  const reachedSteps = new Set<string>();
  let lastReachedIndex = -1;

  for (const def of STEP_DEFINITIONS) {
    if (def.parallel) {
      // Check specialist agents
      const anySpecialistPresent = SPECIALIST_AGENTS.some((a) => stepNames.has(a));
      if (anySpecialistPresent || stepNames.has(def.name)) {
        reachedSteps.add(def.name);
        lastReachedIndex = STEP_DEFINITIONS.indexOf(def);
      }
    } else if (stepNames.has(def.name)) {
      reachedSteps.add(def.name);
      lastReachedIndex = STEP_DEFINITIONS.indexOf(def);
    }
  }

  // All steps up to and including the last reached step are considered "reached"
  for (let i = 0; i <= lastReachedIndex; i++) {
    reachedSteps.add(STEP_DEFINITIONS[i].name);
  }

  return STEP_DEFINITIONS.map((def) => {
    if (def.parallel) {
      return deriveParallelStep(def.name, events, reachedSteps, hasAnyEvent);
    }
    return deriveSingleStep(def.name, def.conditional, events, reachedSteps, hasAnyEvent);
  });
}

function deriveSingleStep(
  name: string,
  conditional: boolean,
  events: ExecutionEvent[],
  reachedSteps: Set<string>,
  hasAnyEvent: boolean
): StepState {
  const stepEvents = events.filter((e) => e.stepName === name);

  if (stepEvents.length === 0) {
    // No events for this step
    if (conditional && hasAnyEvent && reachedSteps.has(name)) {
      return { name, status: 'skipped' };
    }
    return { name, status: 'pending' };
  }

  return buildStepState(name, stepEvents);
}

function deriveParallelStep(
  name: string,
  events: ExecutionEvent[],
  reachedSteps: Set<string>,
  hasAnyEvent: boolean
): StepState {
  const children = SPECIALIST_AGENTS.map((agentName) => {
    const agentEvents = events.filter((e) => e.stepName === agentName);
    if (agentEvents.length === 0) {
      if (hasAnyEvent && reachedSteps.has(name)) {
        return { name: agentName, status: 'pending' as StepStatus };
      }
      return { name: agentName, status: 'pending' as StepStatus };
    }
    return buildStepState(agentName, agentEvents);
  });

  // Derive parent status from children
  const childStatuses = children.map((c) => c.status);
  let parentStatus: StepStatus;

  if (childStatuses.some((s) => s === 'failed')) {
    parentStatus = 'failed';
  } else if (childStatuses.some((s) => s === 'active' || s === 'suspended')) {
    parentStatus = 'active';
  } else if (childStatuses.every((s) => s === 'succeeded')) {
    parentStatus = 'succeeded';
  } else if (childStatuses.every((s) => s === 'pending')) {
    if (hasAnyEvent && reachedSteps.has(name)) {
      parentStatus = 'active';
    } else {
      parentStatus = 'pending';
    }
  } else {
    parentStatus = 'active';
  }

  const startTime = children
    .map((c) => c.startTime)
    .filter(Boolean)
    .sort()[0];
  const endTime = childStatuses.every((s) => s === 'succeeded' || s === 'failed')
    ? children
        .map((c) => c.endTime)
        .filter(Boolean)
        .sort()
        .pop()
    : undefined;

  return {
    name,
    status: parentStatus,
    children,
    startTime,
    endTime,
  };
}

function buildStepState(name: string, stepEvents: ExecutionEvent[]): StepState {
  const hasStarted = stepEvents.some((e) => e.eventType === 'StepStarted');
  const hasSucceeded = stepEvents.some((e) => e.eventType === 'StepSucceeded');
  const hasFailed = stepEvents.some((e) => e.eventType === 'StepFailed');
  const callbackStarted = stepEvents.find((e) => e.eventType === 'CallbackStarted');
  const hasCallbackSucceeded = stepEvents.some((e) => e.eventType === 'CallbackSucceeded');

  let status: StepStatus;
  if (hasFailed) {
    status = 'failed';
  } else if (hasSucceeded) {
    status = 'succeeded';
  } else if (callbackStarted && !hasCallbackSucceeded) {
    status = 'suspended';
  } else if (hasStarted) {
    status = 'active';
  } else {
    status = 'pending';
  }

  const startEvent = stepEvents.find((e) => e.eventType === 'StepStarted');
  const endEvent = stepEvents.find(
    (e) => e.eventType === 'StepSucceeded' || e.eventType === 'StepFailed'
  );

  const state: StepState = {
    name,
    status,
    startTime: startEvent?.timestamp,
    endTime: endEvent?.timestamp,
  };

  if (callbackStarted && !hasCallbackSucceeded) {
    state.callbackId = callbackStarted.callbackId;
  }

  if (startEvent?.payload) {
    state.input = startEvent.payload;
  }

  if (endEvent?.payload) {
    state.output = endEvent.payload;
  }

  return state;
}

/**
 * Derives agent node states from execution events.
 * Maps each of the 5 agents to exactly one status:
 * - pending: not yet invoked
 * - active: StepStarted, no completion
 * - succeeded: StepSucceeded
 * - failed: StepFailed
 * - skipped: not invoked and execution has progressed past that phase
 */
export function deriveAgentStates(events: ExecutionEvent[]): AgentNodeState[] {
  const stepNames = new Set(events.map((e) => e.stepName));

  // Determine if execution has progressed past the specialist agents phase
  const postSpecialistSteps = ['Synthesis', 'Human Review', 'PA Submission', 'Payer Decision', 'Provider Notification'];
  const pastSpecialistPhase = postSpecialistSteps.some((s) => stepNames.has(s));

  // Determine if execution has progressed past the document phase
  const postDocumentSteps = ['Provider Docs', 'Eligibility', 'Policy', 'Medical Necessity', 'Synthesis', 'Human Review', 'PA Submission', 'Payer Decision', 'Provider Notification'];
  const pastDocumentPhase = postDocumentSteps.some((s) => stepNames.has(s));

  // Determine if execution has progressed past the synthesis phase
  const postSynthesisSteps = ['Human Review', 'PA Submission', 'Payer Decision', 'Provider Notification'];
  const pastSynthesisPhase = postSynthesisSteps.some((s) => stepNames.has(s));

  return AGENT_DEFINITIONS.map((agent) => {
    // Find the step name that maps to this agent
    const stepName = Object.entries(STEP_TO_AGENT).find(([, id]) => id === agent.id)?.[0];
    if (!stepName) {
      return { id: agent.id, name: agent.name, status: 'pending' as AgentNodeStatus };
    }

    const agentEvents = events.filter((e) => e.stepName === stepName);

    if (agentEvents.length === 0) {
      // Not invoked — check if we've passed this agent's phase
      let pastPhase = false;
      if (agent.id === 'document') {
        pastPhase = pastDocumentPhase;
      } else if (agent.id === 'eligibility' || agent.id === 'policy' || agent.id === 'medical-necessity') {
        pastPhase = pastSpecialistPhase;
      } else if (agent.id === 'synthesis') {
        pastPhase = pastSynthesisPhase;
      }

      return {
        id: agent.id,
        name: agent.name,
        status: pastPhase ? 'skipped' as AgentNodeStatus : 'pending' as AgentNodeStatus,
      };
    }

    const hasFailed = agentEvents.some((e) => e.eventType === 'StepFailed');
    const hasSucceeded = agentEvents.some((e) => e.eventType === 'StepSucceeded');
    const hasStarted = agentEvents.some((e) => e.eventType === 'StepStarted');

    let status: AgentNodeStatus;
    if (hasFailed) {
      status = 'failed';
    } else if (hasSucceeded) {
      status = 'succeeded';
    } else if (hasStarted) {
      status = 'active';
    } else {
      status = 'pending';
    }

    return { id: agent.id, name: agent.name, status };
  });
}

/**
 * Derives callback context when a step is suspended.
 * Returns null if no step is currently suspended.
 */
export function deriveCallbackContext(events: ExecutionEvent[]): CallbackContext | null {
  // Get human callback step IDs from the manifest — only these show the action panel
  const humanStepIds = getHumanCallbackStepIds();

  // Find all CallbackStarted events with a callbackId
  const callbackStartedEvents = events.filter((e) => e.eventType === 'CallbackStarted' && e.callbackId);
  
  // Find all resolved callbacks (by callbackId)
  const resolvedCallbackIds = new Set(
    events
      .filter((e) => e.eventType === 'CallbackSucceeded' && e.callbackId)
      .map((e) => e.callbackId)
  );

  // Find unresolved callbacks
  const unresolvedCallbacks = callbackStartedEvents.filter(
    (e) => !resolvedCallbackIds.has(e.callbackId)
  );

  if (unresolvedCallbacks.length === 0) {
    return null;
  }

  // Strategy 1: Check if any unresolved callback's step name matches a human callback step
  for (const cb of unresolvedCallbacks) {
    if (humanStepIds.includes(cb.stepName)) {
      const presets = getCallbackPresetsForStep(cb.stepName);
      if (presets) {
        return {
          stepName: cb.stepName,
          callbackId: cb.callbackId!,
          buttonLabel: presets.buttonLabel,
          presets: presets.presets,
          defaultPayload: presets.defaultPayload,
        };
      }
    }
  }

  // Strategy 2: Check if any known human callback step is in "started but not completed" state
  const startedSteps = new Set(events.filter(e => e.eventType === 'StepStarted').map(e => e.stepName));
  const completedSteps = new Set(events.filter(e => e.eventType === 'StepSucceeded').map(e => e.stepName));

  for (const humanStepId of humanStepIds) {
    if (startedSteps.has(humanStepId) && !completedSteps.has(humanStepId)) {
      const presets = getCallbackPresetsForStep(humanStepId);
      if (presets) {
        const latestCallback = unresolvedCallbacks[unresolvedCallbacks.length - 1];
        return {
          stepName: humanStepId,
          callbackId: latestCallback.callbackId!,
          buttonLabel: presets.buttonLabel,
          presets: presets.presets,
          defaultPayload: presets.defaultPayload,
        };
      }
    }
  }

  // No human callback is pending — don't show action panel for agent-internal callbacks
  return null;
}

/**
 * Extracts input/output payloads for a given step name.
 * - Completed steps: returns both input and output
 * - In-progress steps: returns input with undefined output
 */
export function extractStepPayloads(
  events: ExecutionEvent[],
  stepName: string
): { input?: Record<string, unknown>; output?: Record<string, unknown> } {
  const stepEvents = events.filter((e) => e.stepName === stepName);

  const startEvent = stepEvents.find((e) => e.eventType === 'StepStarted');
  const successEvent = stepEvents.find((e) => e.eventType === 'StepSucceeded');

  return {
    input: startEvent?.payload,
    output: successEvent?.payload,
  };
}

/**
 * Produces chronologically sorted timeline display events.
 * Each event includes elapsed time since execution start and formatted duration.
 */
export function deriveTimelineEvents(
  events: ExecutionEvent[],
  startTime: string
): TimelineDisplayEvent[] {
  const startMs = new Date(startTime).getTime();

  // Sort events chronologically
  const sorted = [...events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // Build a map of suspension durations (CallbackStarted → CallbackSucceeded)
  const callbackStarts = new Map<string, string>();
  for (const event of sorted) {
    if (event.eventType === 'CallbackStarted') {
      callbackStarts.set(event.stepName, event.timestamp);
    }
  }

  return sorted.map((event) => {
    const eventMs = new Date(event.timestamp).getTime();
    const elapsedMs = eventMs - startMs;

    const displayEvent: TimelineDisplayEvent = {
      eventType: event.eventType,
      stepName: event.stepName,
      timestamp: event.timestamp,
      elapsedMs,
      elapsedFormatted: formatElapsedTime(elapsedMs),
      payload: event.payload,
      error: event.error,
    };

    // Mark suspension events and calculate duration
    if (event.eventType === 'CallbackSucceeded') {
      const suspensionStart = callbackStarts.get(event.stepName);
      if (suspensionStart) {
        displayEvent.isSuspension = true;
        displayEvent.suspensionDuration = calculateSuspensionDuration(
          suspensionStart,
          event.timestamp
        );
      }
    }

    if (event.eventType === 'CallbackStarted') {
      displayEvent.isSuspension = true;
    }

    return displayEvent;
  });
}

/**
 * Calculates a human-readable duration string between two ISO timestamps.
 * Produces strings like "2h 15m", "45s", "1d 3h".
 */
export function calculateSuspensionDuration(start: string, end: string): string {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  const diffMs = Math.max(0, endMs - startMs);

  return formatDuration(diffMs);
}

/**
 * Groups parallel events (events with the same parent step from context.map)
 * into clusters while preserving individual event details.
 */
export function groupParallelEvents(events: ExecutionEvent[]): GroupedTimelineEvent[] {
  const groups: GroupedTimelineEvent[] = [];
  const startTime = events.length > 0 ? events[0].timestamp : new Date().toISOString();
  const startMs = new Date(startTime).getTime();

  // Identify specialist agent events that occur in parallel
  // Events for specialist agents (Eligibility, Policy, Medical Necessity) that have
  // overlapping time windows are considered parallel
  const specialistEvents = events.filter((e) => SPECIALIST_AGENTS.includes(e.stepName));
  const otherEvents = events.filter((e) => !SPECIALIST_AGENTS.includes(e.stepName));

  // Group specialist events by timestamp proximity (within 1 second = likely parallel)
  const specialistByTimestamp: Map<number, ExecutionEvent[]> = new Map();
  for (const event of specialistEvents) {
    const ts = Math.floor(new Date(event.timestamp).getTime() / 1000);
    const existing = specialistByTimestamp.get(ts);
    if (existing) {
      existing.push(event);
    } else {
      specialistByTimestamp.set(ts, [event]);
    }
  }

  // Create groups for parallel specialist events
  for (const [, parallelEvents] of specialistByTimestamp) {
    if (parallelEvents.length > 1) {
      const timelineEvents = parallelEvents.map((event) => {
        const eventMs = new Date(event.timestamp).getTime();
        return {
          eventType: event.eventType,
          stepName: event.stepName,
          timestamp: event.timestamp,
          elapsedMs: eventMs - startMs,
          elapsedFormatted: formatElapsedTime(eventMs - startMs),
          payload: event.payload,
          error: event.error,
          group: 'Specialist Agents',
        };
      });

      groups.push({
        groupName: 'Specialist Agents',
        events: timelineEvents,
      });
    } else {
      // Single specialist event — still group it under Specialist Agents
      const event = parallelEvents[0];
      const eventMs = new Date(event.timestamp).getTime();
      groups.push({
        groupName: 'Specialist Agents',
        events: [
          {
            eventType: event.eventType,
            stepName: event.stepName,
            timestamp: event.timestamp,
            elapsedMs: eventMs - startMs,
            elapsedFormatted: formatElapsedTime(eventMs - startMs),
            payload: event.payload,
            error: event.error,
            group: 'Specialist Agents',
          },
        ],
      });
    }
  }

  // Add non-specialist events as individual groups
  for (const event of otherEvents) {
    const eventMs = new Date(event.timestamp).getTime();
    groups.push({
      groupName: event.stepName,
      events: [
        {
          eventType: event.eventType,
          stepName: event.stepName,
          timestamp: event.timestamp,
          elapsedMs: eventMs - startMs,
          elapsedFormatted: formatElapsedTime(eventMs - startMs),
          payload: event.payload,
          error: event.error,
        },
      ],
    });
  }

  // Sort groups by earliest event timestamp
  groups.sort((a, b) => {
    const aMin = Math.min(...a.events.map((e) => new Date(e.timestamp).getTime()));
    const bMin = Math.min(...b.events.map((e) => new Date(e.timestamp).getTime()));
    return aMin - bMin;
  });

  return groups;
}

/**
 * Returns true if the given status represents a terminal execution state.
 * Terminal states: SUCCEEDED, FAILED, TIMED_OUT (case-insensitive).
 */
export function isTerminalState(status: string): boolean {
  const normalized = status.toUpperCase();
  return normalized === 'SUCCEEDED' || normalized === 'FAILED' || normalized === 'TIMED_OUT';
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return '0s';
  }

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const remainingHours = hours % 24;
  const remainingMinutes = minutes % 60;
  const remainingSeconds = seconds % 60;

  const parts: string[] = [];

  if (days > 0) parts.push(`${days}d`);
  if (remainingHours > 0) parts.push(`${remainingHours}h`);
  if (remainingMinutes > 0) parts.push(`${remainingMinutes}m`);
  if (remainingSeconds > 0 && days === 0) parts.push(`${remainingSeconds}s`);

  return parts.length > 0 ? parts.join(' ') : '0s';
}

function formatElapsedTime(ms: number): string {
  if (ms < 0) return '0s';
  return formatDuration(ms);
}
