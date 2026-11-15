import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { api, ensureAuth, getToken, setToken, clearToken, ApiError } from './api';
import {
  can,
  ROLE_LABELS,
  type Permission,
  type Role,
  type Project,
  type UserProfile,
} from '../../shared/domain';
export type Row = { id: string; [key: string]: any }; // API record boundary; domain engines use validated types.
export type ProjectData = {
  project: Project;
  user?: Row & Record<string, unknown>;
  my_role?: Role;
} & Record<
  | 'datasets'
  | 'dataset_versions'
  | 'data_import_jobs'
  | 'data_quality_results'
  | 'data_dictionary_entries'
  | 'evidence_records'
  | 'recommendations'
  | 'approvals'
  | 'operational_alerts'
  | 'action_items'
  | 'milestones'
  | 'reports'
  | 'problem_briefs'
  | 'requirements_documents'
  | 'stakeholders'
  | 'risk_assessments'
  | 'ai_incidents'
  | 'experiments'
  | 'experiment_runs'
  | 'experiment_results'
  | 'models'
  | 'model_versions'
  | 'intervention_options'
  | 'optimisation_scenarios'
  | 'learning_modules'
  | 'learning_progress'
  | 'facilities'
  | 'medicine_products'
  | 'deliveries'
  | 'audit_logs'
  | 'notifications'
  | 'analytical_runs'
  | 'members'
  | 'budgets',
  Row[]
>;
type Workspace = {
  user: UserProfile;
  projects: Project[];
  organisations: Row[];
  memberships: Row[];
};
type Store = {
  workspace: Workspace | null;
  data: ProjectData | null;
  project: Project | null;
  role: Role;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  selectProject: (id: string) => void;
  allow: (p: Permission) => boolean;
  notify: (message: string, error?: boolean) => void;
  toast: { message: string; error: boolean } | null;
  logout: () => Promise<void>;
  switchPersona: (role: Role) => Promise<void>;
  setData: React.Dispatch<React.SetStateAction<ProjectData | null>>;
  realtimeConnected: boolean;
  liveEvents: Array<{ id: string; title: string; message: string; timestamp: string; severity?: string }>;
};
const Context = createContext<Store | null>(null);
export function StoreProvider({ children }: { children: ReactNode }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null),
    [data, setData] = useState<ProjectData | null>(null),
    [projectId, setProjectId] = useState(localStorage.getItem('afriscope-project') || ''),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [toast, setToast] = useState<{ message: string; error: boolean } | null>(null),
    [realtimeConnected, setRealtimeConnected] = useState(false),
    [liveEvents, setLiveEvents] = useState<Array<{ id: string; title: string; message: string; timestamp: string; severity?: string }>>([]);

  const notify = useCallback((message: string, error = false) => setToast({ message, error }), []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5500);
    return () => clearTimeout(timer);
  }, [toast]);
  const refresh = useCallback(async () => {
    // Authenticate only when no token is stored (api() re-authenticates once
    // on 401). Retry the workspace load so serverless cold starts (first
    // request pays DB init + migrations) do not strand the user on an error
    // screen. No sign-in step is required. The stored token is never cleared
    // here — that would mint a new token on every retry.
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        if (!getToken()) {
          await ensureAuth();
        }
        const w = await api<Workspace>('/workspace');
        setWorkspace(w);
        const chosen = w.projects.find((p) => p.id === projectId) || w.projects[0];
        if (chosen) {
          setProjectId(chosen.id);
          localStorage.setItem('afriscope-project', chosen.id);
          setData(await api<ProjectData>('/projects/' + chosen.id));
        } else setData(null);
        setError('');
        setLoading(false);
        return;
      } catch (e) {
        lastError = e as Error;
        // A 401 here means api() already cleared the token and re-authed
        // once; retrying would just mint more tokens. Fail fast.
        if (e instanceof ApiError && e.status === 401) break;
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        }
      }
    }
    setError(lastError?.message || 'Workspace connection failed.');
    setLoading(false);
  }, [projectId]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let es: EventSource | null = null;
    let retryTimeout: NodeJS.Timeout | null = null;

    const connectSse = () => {
      try {
        const token = getToken() || '';
        const url = `/api/realtime/stream?token=${encodeURIComponent(token)}`;
        es = new EventSource(url);

        es.onopen = () => {
          setRealtimeConnected(true);
        };

        es.addEventListener('connected', () => {
          setRealtimeConnected(true);
        });

        const handlePushEvent = (e: MessageEvent) => {
          try {
            const parsed = JSON.parse(e.data);
            notify(`${parsed.title}: ${parsed.message}`, parsed.severity === 'critical');
            setLiveEvents((prev) => [parsed, ...prev.slice(0, 19)]);
            if (parsed.type?.includes('alert') || parsed.type?.includes('stock') || parsed.type?.includes('sync')) {
              void refresh();
            }
          } catch {
            // ignore
          }
        };

        es.addEventListener('supabase:operational_alerts:insert', handlePushEvent);
        es.addEventListener('supabase:operational_alerts:update', handlePushEvent);
        es.addEventListener('supabase:inventory_records:insert', handlePushEvent);
        es.addEventListener('supabase:recommendations:update', handlePushEvent);
        es.addEventListener('backup:completed', handlePushEvent);
        es.addEventListener('sync:completed', handlePushEvent);

        es.onerror = () => {
          setRealtimeConnected(false);
          es?.close();
          retryTimeout = setTimeout(connectSse, 5000);
        };
      } catch {
        setRealtimeConnected(false);
      }
    };

    connectSse();

    return () => {
      es?.close();
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [notify, refresh]);

  const selectProject = (id: string) => {
    setProjectId(id);
    localStorage.setItem('afriscope-project', id);
    setData(null);
  };
  const role = (data?.my_role ||
    workspace?.memberships.find((m) => m.organisation_id === data?.project.organisation_id)?.role ||
    'executive') as Role;
  const logout = async () => {
    try {
      await api('/auth/logout', { method: 'POST', body: {} });
    } catch {
      // ignore
    } finally {
      clearToken();
      await refresh();
      notify('Workspace session reset to default');
    }
  };
  const switchPersona = async (newRole: Role) => {
    try {
      setLoading(true);
      const res = await api<{ ok: boolean; token?: string }>('/auth/demo', {
        body: { role: newRole },
      });
      if (res.token) {
        setToken(res.token);
      }
      await refresh();
      notify(`Switched demonstration persona to ${ROLE_LABELS[newRole] || newRole}`);
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setLoading(false);
    }
  };
  return (
    <Context.Provider
      value={{
        workspace,
        data,
        project: data?.project || null,
        role,
        loading,
        error,
        refresh,
        selectProject,
        allow: (p) => can(role, p),
        notify,
        toast,
        logout,
        switchPersona,
        setData,
        realtimeConnected,
        liveEvents,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useStore() {
  const store = useContext(Context);
  if (!store) throw new Error('Workspace provider missing');
  return store;
}
export function useAction() {
  const { refresh, notify } = useStore();
  return async (fn: () => Promise<unknown>, message = 'Changes saved') => {
    try {
      await fn();
      await refresh();
      notify(message);
      return true;
    } catch (e) {
      notify((e as Error).message, true);
      return false;
    }
  };
}
