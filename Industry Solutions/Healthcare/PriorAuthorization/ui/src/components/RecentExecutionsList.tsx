import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listExecutions } from '../api/client';
import type { ExecutionSummary, ExecutionStatus } from '@shared/execution';

/**
 * Returns Tailwind classes for a status badge based on execution status.
 */
function statusBadgeClasses(status: ExecutionStatus): string {
  switch (status) {
    case 'RUNNING':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/40';
    case 'SUCCEEDED':
      return 'bg-green-500/20 text-green-400 border-green-500/40';
    case 'FAILED':
      return 'bg-red-500/20 text-red-400 border-red-500/40';
    case 'TIMED_OUT':
      return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40';
  }
}

/**
 * Formats a start time as a relative time string (e.g., "2 min ago")
 * or a short date if older than 24 hours.
 */
function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Truncates an execution ARN for display, showing the last segment.
 */
function truncateArn(arn: string): string {
  // ARNs can be long; show last meaningful segment
  const parts = arn.split(':');
  const last = parts[parts.length - 1] ?? arn;
  if (last.length <= 32) return last;
  return `${last.slice(0, 14)}…${last.slice(-14)}`;
}

/**
 * RecentExecutionsList — fetches and displays the 20 most recent executions.
 * Each row links to the execution detail view.
 *
 * Validates: Requirements 7.4
 */
export default function RecentExecutionsList() {
  const [executions, setExecutions] = useState<ExecutionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchExecutions() {
    setLoading(true);
    setError(null);
    try {
      const response = await listExecutions();
      setExecutions(response.executions);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load executions',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchExecutions();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="flex items-center gap-2 text-gray-400">
          <svg
            className="animate-spin h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <span>Loading executions…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-3">
        <p className="text-red-400 text-sm">{error}</p>
        <button
          onClick={fetchExecutions}
          className="px-3 py-1.5 text-sm font-medium bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (executions.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-gray-500 text-sm">No recent executions</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-hidden h-full">
      <h2 className="text-lg font-semibold text-gray-200 px-1 pb-2 shrink-0">
        Recent Executions
      </h2>
      <div className="flex-1 overflow-y-auto space-y-1">
        {executions.map((execution) => (
          <Link
            key={execution.executionArn}
            to={`/execution/${encodeURIComponent(execution.executionArn)}`}
            className="flex items-center gap-3 px-3 py-2 rounded hover:bg-gray-800 transition-colors group"
          >
            <span
              className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border shrink-0 ${statusBadgeClasses(execution.status)}`}
            >
              {execution.status}
            </span>
            <span className="text-sm text-gray-300 truncate flex-1 group-hover:text-gray-100">
              {truncateArn(execution.executionArn)}
            </span>
            <span className="text-xs text-gray-500 shrink-0">
              {formatRelativeTime(execution.startTime)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
