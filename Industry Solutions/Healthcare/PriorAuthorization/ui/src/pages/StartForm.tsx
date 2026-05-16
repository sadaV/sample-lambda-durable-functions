import PARequestForm from '../components/PARequestForm';
import RecentExecutionsList from '../components/RecentExecutionsList';
import WorkflowDiagram from '../components/WorkflowDiagram';

/**
 * StartForm page — shows the PA workflow overview, request form, and recent executions.
 */
export default function StartForm() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="flex h-full">
        {/* Left: Static workflow diagram */}
        <div className="w-[620px] shrink-0 border-r border-gray-800 overflow-y-auto p-6">
          <h2 className="text-2xl font-semibold text-gray-100 mb-2">PA Workflow</h2>
          <p className="text-sm text-gray-400 mb-5">
            End-to-end prior authorization workflow powered by Lambda Durable Functions and AgentCore.
          </p>
          <WorkflowDiagram mode="static" />
        </div>

        {/* Right: Form + Recent Executions */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto">
            <h1 className="text-2xl font-semibold text-gray-100 mb-4">
              Start a Prior Authorization Request
            </h1>
            <PARequestForm />

            <div className="mt-8 pt-6 border-t border-gray-800">
              <RecentExecutionsList />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
