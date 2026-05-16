import { useContext, useState, useCallback } from 'react';
import { sendCallback } from '../api/client';
import { ExecutionContext } from '../pages/ExecutionView';

/**
 * CallbackPanel — simplified action panel for demos.
 * Shows a single contextual button when the workflow is waiting for human action.
 * No JSON editing, no multiple presets — just click to continue.
 */
export default function CallbackPanel() {
  const ctx = useContext(ExecutionContext);

  if (!ctx) return null;

  const { state } = ctx;
  const { callbackContext, executionArn } = state;

  if (!callbackContext) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-gray-500">No action needed — workflow is progressing automatically.</p>
      </div>
    );
  }

  return (
    <ActiveCallback
      buttonLabel={callbackContext.buttonLabel}
      callbackId={callbackContext.callbackId}
      executionArn={executionArn}
      payload={callbackContext.defaultPayload}
      description={callbackContext.presets[0]?.description ?? 'Send the callback to resume the workflow.'}
    />
  );
}

function ActiveCallback({
  buttonLabel,
  callbackId,
  executionArn,
  payload,
  description,
}: {
  buttonLabel: string;
  callbackId: string;
  executionArn: string;
  payload: Record<string, unknown>;
  description: string;
}) {
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleSend = useCallback(async () => {
    setSending(true);
    setFeedback(null);

    try {
      await sendCallback(executionArn, callbackId, payload);
      setFeedback({ type: 'success', message: 'Done — workflow resuming...' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to send callback';
      setFeedback({ type: 'error', message });
    } finally {
      setSending(false);
    }
  }, [executionArn, callbackId, payload]);

  return (
    <div className="flex items-center gap-4 h-full px-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-sm font-medium text-amber-200">Action Required</span>
        </div>
        <p className="text-xs text-gray-400">{description}</p>
        {feedback && (
          <p className={`text-xs mt-1 ${feedback.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
            {feedback.message}
          </p>
        )}
      </div>
      <button
        onClick={handleSend}
        disabled={sending || feedback?.type === 'success'}
        className="px-5 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium text-sm transition-colors whitespace-nowrap"
      >
        {sending ? 'Sending...' : buttonLabel}
      </button>
    </div>
  );
}
