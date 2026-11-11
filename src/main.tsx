import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { StoreProvider, useStore } from './lib/store';
import { Shell } from './components/Shell';
import { Button, Loading, Notice, Empty } from './components/ui';
import { Dashboard } from './features/Dashboard';
import { Operations } from './features/Operations';
import { DataIntelligence } from './features/DataIntelligence';
import { Planner } from './features/Planner';
import { ProblemScoping } from './features/ProblemScoping';
import { Experiments } from './features/Experiments';
import { Learning } from './features/Learning';
import { Governance } from './features/Governance';
import { Reports } from './features/Reports';
import { Projects, Administration, SettingsPage } from './features/Administration';
import { Guide } from './features/Public';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import './styles.css';
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(e: Error) {
    return { error: e.message };
  }
  render() {
    return this.state.error ? (
      <div className="fatal-error">
        <AlertCircle size={35} />
        <h1>Something interrupted this view.</h1>
        <p>Your saved workspace records have not been changed by this display error.</p>
        <Button onClick={() => location.reload()}>Reload application</Button>
      </div>
    ) : (
      this.props.children
    );
  }
}
function Workspace() {
  const { workspace, loading, error, data, role } = useStore();
  const location = useLocation();
  if (loading) return <Loading />;
  if (error && !workspace) {
    return (
      <div className="fatal-error">
        <AlertCircle size={35} />
        <h1>Workspace connection</h1>
        <p>{error}</p>
        <Button onClick={() => window.location.reload()}>Retry connection</Button>
      </div>
    );
  }
  if (!workspace) return <Loading />;
  if (error) return <Notice tone="warning">{error}</Notice>;
  const restricted =
    location.pathname === '/administration' &&
    !['organisation_admin', 'platform_admin'].includes(role);
  return (
    <Shell>
      {restricted ? (
        <Empty
          title="Administrator access required"
          description="Your current role cannot manage organisation membership or invitations. Project evidence remains available in the other modules."
          action={
            <Link to="/" className="btn btn-secondary">
              Return to overview
            </Link>
          }
        />
      ) : !data && location.pathname !== '/projects' ? (
        <Empty
          title="Create a project to get started"
          description="This workspace has no accessible project yet."
          action={
            <Link to="/projects" className="btn btn-primary">
              Create project
            </Link>
          }
        />
      ) : null}
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/problem-scoping" element={<ProblemScoping />} />
        <Route path="/experiments" element={<Experiments />} />
        <Route path="/data" element={<DataIntelligence />} />
        <Route path="/operations" element={<Operations />} />
        <Route path="/planner" element={<Planner />} />
        <Route path="/learning" element={<Learning />} />
        <Route path="/governance" element={<Governance />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/administration" element={<Administration />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/guide" element={<InlineGuide />} />
        <Route
          path="*"
          element={
            <Empty
              title="Page not found"
              description="Use the navigation to return to your workspace."
              action={
                <Link className="btn btn-primary" to="/">
                  Overview
                </Link>
              }
            />
          }
        />
      </Routes>
    </Shell>
  );
}
function InlineGuide() {
  return (
    <div className="inline-guide">
      <Guide />
    </div>
  );
}
function Toast() {
  const { toast } = useStore();
  return toast ? (
    <div
      role={toast.error ? 'alert' : 'status'}
      className={`toast ${toast.error ? 'toast-error' : ''}`}
    >
      {toast.error ? <AlertCircle size={19} /> : <CheckCircle2 size={19} />}
      <span>{toast.message}</span>
    </div>
  ) : null;
}
function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <StoreProvider>
          <Routes>
            <Route path="/welcome" element={<Navigate to="/" replace />} />
            <Route path="/sign-in" element={<Navigate to="/" replace />} />
            <Route path="/accept-invite" element={<Navigate to="/" replace />} />
            <Route path="/privacy" element={<Guide />} />
            <Route path="/terms" element={<Guide />} />
            <Route path="/*" element={<Workspace />} />
          </Routes>
          <Toast />
        </StoreProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
