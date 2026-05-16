import { Component, type ReactNode } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';

/**
 * ErrorBoundary — catches rendering errors and displays a fallback UI.
 */
class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center p-8">
            <h2 className="text-2xl font-semibold text-red-400">
              Something went wrong
            </h2>
            <p className="mt-2 text-gray-400">
              {this.state.error?.message ?? 'An unexpected error occurred.'}
            </p>
            <button
              onClick={() => window.location.assign('/')}
              className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
            >
              Return to Start
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Header — displays the app title and a reset button that navigates to /
 * and clears any execution state.
 */
function Header() {
  const navigate = useNavigate();

  function handleReset() {
    navigate('/');
  }

  return (
    <header className="flex items-center justify-between px-6 py-3 bg-gray-800 border-b border-gray-700 shrink-0">
      <h1 className="text-2xl font-bold text-gray-100">
        Prior Authorization Workflow using Durable Lambda Function
      </h1>
      <button
        onClick={handleReset}
        className="p-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors"
        aria-label="Home"
        title="Home"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      </button>
    </header>
  );
}

/**
 * Layout — wraps all routes with a Header and ErrorBoundary.
 * Uses h-screen to fit within the viewport without scrolling (Req 8.3).
 */
export default function Layout() {
  return (
    <div className="flex flex-col h-screen bg-gray-900 text-gray-100 overflow-hidden">
      <Header />
      <main className="flex-1 overflow-hidden">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
