import { useState, useEffect, type ReactNode } from 'react';
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ScanSearch,
  FlaskConical,
  Database,
  Workflow,
  SlidersHorizontal,
  GraduationCap,
  ShieldCheck,
  Files,
  FolderKanban,
  Settings,
  Building2,
  Search,
  Bell,
  CircleHelp,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  ArrowUpRight,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  LogOut,
  CheckCircle2,
  TriangleAlert,
  Command,
  Leaf,
  X,
} from 'lucide-react';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { ROLE_LABELS } from '../../shared/domain';
import { Badge, Button, Modal, Empty } from './ui';
export const navigation = [
  { label: 'Overview', path: '/', icon: LayoutDashboard },
  { label: 'Problem Scoping', path: '/problem-scoping', icon: ScanSearch },
  { label: 'Experiment Lab', path: '/experiments', icon: FlaskConical },
  { label: 'Data Intelligence', path: '/data', icon: Database },
  { label: 'Programme Operations', path: '/operations', icon: Workflow },
  { label: 'Intervention Planner', path: '/planner', icon: SlidersHorizontal },
  { label: 'Learning Academy', path: '/learning', icon: GraduationCap },
  { label: 'Responsible AI', path: '/governance', icon: ShieldCheck },
  { label: 'Reports & Documents', path: '/reports', icon: Files },
  { label: 'Projects & Workspaces', path: '/projects', icon: FolderKanban },
  { label: 'Administration', path: '/administration', icon: Building2 },
  { label: 'Settings', path: '/settings', icon: Settings },
];
export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link to="/" className={`logo ${light ? 'logo-light' : ''}`} aria-label="AfriScope AI home">
      <svg viewBox="0 0 38 38" aria-hidden="true">
        <path
          d="M7 29 18 8l12 21M12 21h13"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="30" cy="29" r="3.5" fill="currentColor" />
      </svg>
      <span>
        AfriScope<span className="logo-ai">AI</span>
      </span>
    </Link>
  );
}
export function Shell({ children }: { children: ReactNode }) {
  const { workspace, project, data, role, selectProject, logout, realtimeConnected, liveEvents, switchPersona } = useStore();
  const [collapsed, setCollapsed] = useState(false),
    [mobile, setMobile] = useState(false),
    [search, setSearch] = useState(false),
    [notifications, setNotifications] = useState(false),
    [profile, setProfile] = useState(false);
  const location = useLocation(),
    navigate = useNavigate();
  const current =
    navigation.find((n) => n.path !== '/' && location.pathname.startsWith(n.path)) || navigation[0];
  const isDemo = workspace?.organisations.some(
    (o) => o.id === project?.organisation_id && o.is_demo,
  );
  useEffect(() => {
    setMobile(false);
    setProfile(false);
  }, [location.pathname]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearch((s) => !s);
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
  return (
    <div className={`app-shell ${collapsed ? 'collapsed' : ''} ${mobile ? 'mobile-open' : ''}`}>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      {mobile && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Logo light />
          <div className="sidebar-brand-actions">
            <button
              className="icon-btn collapse-button"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
            <button
              className="icon-btn mobile-close-button"
              aria-label="Close navigation"
              onClick={() => setMobile(false)}
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="workspace-switch">
          <span className="org-avatar">
            <Leaf size={16} />
          </span>
          <div>
            <strong>{isDemo ? 'Demonstration workspace' : 'Organisation workspace'}</strong>
            <span>
              {workspace?.organisations
                .find((o) => o.id === project?.organisation_id)
                ?.name.replace('AfriScope AI ', '') || 'AfriScope AI'}
            </span>
          </div>
          <ChevronsUpDown size={13} />
        </div>
        <nav className="sidebar-nav" aria-label="Primary navigation">
          <div className="nav-caption">CORE WORKSPACE</div>
          {navigation.slice(0, 6).map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              title={collapsed ? item.label : undefined}
            >
              <item.icon size={17} />
              <span>{item.label}</span>
              {item.path === '/operations' &&
                !!data?.operational_alerts.filter((a) => a.status === 'Open').length && (
                  <b className="nav-count">
                    {data.operational_alerts.filter((a) => a.status === 'Open').length}
                  </b>
                )}
            </NavLink>
          ))}

          <div className="nav-caption">GOVERN & COLLABORATE</div>
          {navigation.slice(6, 9).map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              title={collapsed ? item.label : undefined}
            >
              <item.icon size={17} />
              <span>{item.label}</span>
            </NavLink>
          ))}

          <div className="nav-caption">SYSTEM</div>
          {navigation.slice(9).map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              title={collapsed ? item.label : undefined}
            >
              <item.icon size={17} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <Link to="/governance" className="sidebar-footer-link" title="Responsible AI principles">
            <ShieldCheck size={15} />
            <span>Responsible AI</span>
            <ArrowUpRight size={12} />
          </Link>
          <div className="sidebar-version">
            <span className="connection-dot" />
            <span>v0.1</span>
          </div>
        </div>
      </aside>
      <div className="app-main">
        <header className="global-header">
          <div className="header-breadcrumb">
            <Building2 size={15} className="header-org-icon" />
            <span className="header-org-name">{isDemo ? 'Demo organisation' : 'Organisation'}</span>
            <ChevronRight size={13} className="header-sep" />
            <label className="project-select">
              <span className="sr-only">Current project</span>
              <select value={project?.id || ''} onChange={(e) => selectProject(e.target.value)}>
                {workspace?.projects.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} />
            </label>
          </div>
          <div className="header-actions">
            <button className="global-search-button" onClick={() => setSearch(true)} title="Search (⌘K)">
              <Search size={16} />
              <span className="search-label">Search workspace</span>
              <kbd className="search-kbd">
                <Command size={10} /> K
              </kbd>
            </button>
            {realtimeConnected && (
              <span className="live-realtime-badge" title="Live Supabase real-time webhook stream connected">
                <span className="live-dot" />
                <span className="live-text">Live</span>
              </span>
            )}
            {isDemo && (
              <span className="header-persona-pill" title={`Active role: ${ROLE_LABELS[role]}`}>
                <span className="persona-dot" />
                <span className="persona-role-name">{ROLE_LABELS[role]}</span>
              </span>
            )}
            <button
              className="icon-btn"
              aria-label="Notifications"
              onClick={() => setNotifications(true)}
            >
              <Bell size={18} />
              {(!!data?.operational_alerts.filter((a) => a.status === 'Open').length || !!liveEvents.length) && (
                <i className="notification-dot" />
              )}
            </button>
            <Link to="/guide" className="icon-btn header-help-link" aria-label="Help and documentation">
              <CircleHelp size={18} />
            </Link>
            <span className="header-divider" />
            <button
              className="profile-button"
              onClick={() => setProfile(!profile)}
              aria-expanded={profile}
            >
              <span className="avatar">{workspace?.user.full_name.slice(0, 1)}</span>
              <ChevronDown size={12} className="profile-chevron" />
            </button>
            {profile && (
              <div className="profile-menu">
                <strong>{workspace?.user.full_name}</strong>
                <small>{ROLE_LABELS[role]}</small>
                <button
                  onClick={() => {
                    navigate('/settings');
                    setProfile(false);
                  }}
                >
                  <Settings size={15} /> Account settings
                </button>
                <button
                  onClick={() => {
                    navigate('/guide');
                    setProfile(false);
                  }}
                >
                  <CircleHelp size={15} /> Platform guide
                </button>
                <button onClick={() => void logout()}>
                  <LogOut size={15} /> Sign out
                </button>
              </div>
            )}
          </div>
        </header>
        {isDemo && (
          <div className="demo-banner">
            <div className="demo-banner-info">
              <FlaskConical size={14} className="banner-flask shrink-0" />
              <span>
                <strong>Synthetic demonstration</strong>
                <span className="banner-divider">·</span>
                Fictional records & planning assumptions. Not live operational data.
              </span>
            </div>
            <Link to="/guide" className="demo-guide-link">
              Platform guide <ArrowUpRight size={12} />
            </Link>
          </div>
        )}
        <main id="main-content" className="main-content">
          <div className="context-breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={12} />
            <span>{current.label}</span>
          </div>
          {children}
          <footer className="app-footer">
            <span>
              AfriScope AI <span>·</span> Decision intelligence for development
            </span>
            <span>
              <ShieldCheck size={12} /> Human review required for consequential actions
            </span>
          </footer>
        </main>
      </div>
      {search && <SearchDialog onClose={() => setSearch(false)} />}
      {notifications && (
        <Modal title="Workspace notifications" onClose={() => setNotifications(false)}>
          <p className="muted mb-4">
            Open alerts in the current project. Each links to its triggering evidence.
          </p>
          {data?.operational_alerts
            .filter((a) => a.status === 'Open')
            .slice(0, 8)
            .map((a) => (
              <Link
                className="notification-item"
                to="/operations?tab=Alerts"
                key={a.id}
                onClick={() => setNotifications(false)}
              >
                <TriangleAlert size={19} />
                <div>
                  <strong>{a.title}</strong>
                  <span>{a.triggering_condition}</span>
                </div>
                <ChevronRight size={16} />
              </Link>
            ))}
          {!data?.operational_alerts.filter((a) => a.status === 'Open').length && (
            <Empty
              title="You're all caught up"
              description="No open operational alerts in this project."
            />
          )}
        </Modal>
      )}
    </div>
  );
}
function SearchDialog({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState(''),
    [results, setResults] = useState<
      { id: string; name: string; type: string; project_id: string }[]
    >([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const { selectProject } = useStore(),
    navigate = useNavigate();
  useEffect(() => {
    if (query.length < 1) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setBusy(true);
      api<typeof results>('/search?q=' + encodeURIComponent(query), { signal: controller.signal })
        .then(setResults)
        .catch((e) => {
          if (e.name !== 'AbortError') setError(e.message);
        })
        .finally(() => setBusy(false));
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);
  const paths: Record<string, string> = {
    projects: '/projects',
    datasets: '/data',
    reports: '/reports',
    experiments: '/experiments',
    operational_alerts: '/operations?tab=Alerts',
    learning_modules: '/learning',
  };
  return (
    <Modal title="Search your workspace" onClose={onClose}>
      <label className="command-input">
        <Search size={21} />
        <input
          autoFocus
          placeholder="Find projects, datasets, reports, alerts…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search all accessible records"
        />
      </label>
      <p className="search-hint">Only records available to your account are searched.</p>
      {busy && <p className="muted">Searching…</p>}
      {error && <p className="error-text">{error}</p>}
      <div className="search-results">
        {results.map((r) => (
          <button
            key={r.type + r.id}
            onClick={() => {
              selectProject(r.project_id);
              navigate(paths[r.type] || '/');
              onClose();
            }}
          >
            <span className="search-result-icon">
              {r.type === 'datasets' ? <Database size={18} /> : <Files size={18} />}
            </span>
            <span>
              <strong>{r.name}</strong>
              <small>{r.type.replaceAll('_', ' ')}</small>
            </span>
            <ArrowUpRight size={16} />
          </button>
        ))}
      </div>
      {query && !busy && !results.length && !error && (
        <Empty
          title="No matching records"
          description="Try a project name, dataset, report title, or alert."
        />
      )}
      {!query && (
        <div className="search-suggestions">
          <span>Try searching</span>
          {['Medicine', 'Inventory', 'finance', 'forecast'].map((s) => (
            <button key={s} onClick={() => setQuery(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
export function AssistantPanel() {
  const { project, notify } = useStore();
  const [question, setQuestion] = useState(''),
    [answer, setAnswer] = useState<{
      answer: string;
      mode: string;
      evidence_ids: string[];
      limitations: string[];
    } | null>(null),
    [busy, setBusy] = useState(false);
  const ask = async (q: string) => {
    setQuestion(q);
    setBusy(true);
    try {
      setAnswer(await api('/projects/' + project!.id + '/assistant', { body: { question: q } }));
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="assistant-panel">
      <div className="assistant-heading">
        <span>
          <Sparkles size={18} />
        </span>
        <div>
          <h2>Ask your evidence</h2>
          <p>Grounded answers. Clear sources. Human decisions.</p>
        </div>
        <Badge tone="green">Local assistant</Badge>
      </div>
      {answer ? (
        <div className="assistant-answer">
          <div className="eyebrow">{answer.mode}</div>
          <p>{answer.answer}</p>
          <div className="assistant-sources">
            <CheckCircle2 size={14} />
            {answer.evidence_ids.length} validated evidence reference
            {answer.evidence_ids.length !== 1 ? 's' : ''}
            <Link to="/reports">
              Inspect evidence <ArrowUpRight size={12} />
            </Link>
          </div>
          <details>
            <summary>Assumptions & limitations</summary>
            <ul>
              {answer.limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </details>
          <button
            className="text-button"
            onClick={() => {
              setAnswer(null);
              setQuestion('');
            }}
          >
            Ask another question
          </button>
        </div>
      ) : (
        <>
          <div className="assistant-prompts">
            {[
              'Which medicine stock risks need attention first?',
              'Where are funding releases delayed?',
              'Explain the intervention allocation trade-offs.',
            ].map((q) => (
              <button key={q} disabled={busy} onClick={() => void ask(q)}>
                {q}
                <ArrowUpRight size={14} />
              </button>
            ))}
          </div>
          <form
            className="assistant-input"
            onSubmit={(e) => {
              e.preventDefault();
              if (question.trim()) void ask(question);
            }}
          >
            <input
              aria-label="Question about project evidence"
              placeholder="Ask a question about this project…"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={1000}
            />
            <Button aria-label="Ask evidence assistant" busy={busy} disabled={!question.trim()}>
              <ArrowUpRight size={18} />
            </Button>
          </form>
          <p className="assistant-disclaimer">
            <ShieldCheck size={12} /> No external LLM is called in local mode. Answers cannot
            execute actions.
          </p>
        </>
      )}
    </section>
  );
}
