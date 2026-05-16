import { useCallback, useEffect, useRef, useState } from 'react';
import { clampPollingInterval } from '../lib/polling-utils';

interface UsePollingOptions<T> {
  /** Async function that fetches data. */
  fetchFn: () => Promise<T>;
  /** Polling interval in milliseconds. Clamped to [1000, 30000]. */
  intervalMs: number;
  /** Predicate that returns true when polling should stop (e.g., terminal state). */
  shouldStop: (data: T) => boolean;
  /** Whether polling is enabled. Defaults to true. */
  enabled?: boolean;
}

interface UsePollingResult<T> {
  /** Latest data from the fetch function, or null if not yet fetched. */
  data: T | null;
  /** Latest error from the fetch function, or null if last fetch succeeded. */
  error: Error | null;
  /** Whether the hook is actively polling. */
  isPolling: boolean;
}

/**
 * Custom hook that polls a fetch function at a configurable interval.
 * Automatically stops when the shouldStop predicate returns true.
 * Handles errors gracefully — a failed fetch does not crash the hook;
 * it retries on the next interval.
 * Cleans up the interval on unmount.
 */
export function usePolling<T>({
  fetchFn,
  intervalMs,
  shouldStop,
  enabled = true,
}: UsePollingOptions<T>): UsePollingResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  // Use refs to keep the latest values accessible inside the interval callback
  // without causing the effect to re-run on every render.
  const fetchFnRef = useRef(fetchFn);
  const shouldStopRef = useRef(shouldStop);

  useEffect(() => {
    fetchFnRef.current = fetchFn;
  }, [fetchFn]);

  useEffect(() => {
    shouldStopRef.current = shouldStop;
  }, [shouldStop]);

  const clampedInterval = clampPollingInterval(intervalMs);

  const poll = useCallback(async () => {
    try {
      const result = await fetchFnRef.current();
      setData(result);
      setError(null);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      return null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setIsPolling(false);
      return;
    }

    let intervalId: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const startPolling = async () => {
      setIsPolling(true);

      // Perform an initial fetch immediately
      const initialResult = await poll();
      if (cancelled) return;

      // Check if we should stop after the initial fetch
      if (initialResult !== null && shouldStopRef.current(initialResult)) {
        setIsPolling(false);
        return;
      }

      // Set up the interval for subsequent fetches
      intervalId = setInterval(async () => {
        const result = await poll();
        if (cancelled) return;

        if (result !== null && shouldStopRef.current(result)) {
          if (intervalId !== null) {
            clearInterval(intervalId);
            intervalId = null;
          }
          setIsPolling(false);
        }
      }, clampedInterval);
    };

    startPolling();

    // Cleanup on unmount or when dependencies change
    return () => {
      cancelled = true;
      if (intervalId !== null) {
        clearInterval(intervalId);
      }
      setIsPolling(false);
    };
  }, [enabled, clampedInterval, poll]);

  return { data, error, isPolling };
}
