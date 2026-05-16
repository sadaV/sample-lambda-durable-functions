/**
 * Polling utilities for the PA Demo UI.
 */

const MIN_POLLING_INTERVAL_MS = 1000;
const MAX_POLLING_INTERVAL_MS = 30000;

/**
 * Clamps a polling interval to the allowed range [1000ms, 30000ms].
 * Values below the minimum are raised to 1000ms.
 * Values above the maximum are lowered to 30000ms.
 * Values within bounds are returned unchanged.
 */
export function clampPollingInterval(ms: number): number {
  if (ms < MIN_POLLING_INTERVAL_MS) return MIN_POLLING_INTERVAL_MS;
  if (ms > MAX_POLLING_INTERVAL_MS) return MAX_POLLING_INTERVAL_MS;
  return ms;
}
