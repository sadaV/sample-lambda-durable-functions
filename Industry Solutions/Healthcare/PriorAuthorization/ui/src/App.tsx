import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import StartForm from './pages/StartForm';
import ExecutionView from './pages/ExecutionView';

/**
 * App — root component with React Router.
 * Routes:
 *   /                   → StartForm (PA request form)
 *   /execution/:arn     → ExecutionView (execution detail)
 */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<StartForm />} />
          <Route path="/execution/:arn" element={<ExecutionView />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
