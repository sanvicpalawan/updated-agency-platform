import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { eventsApi } from "../../api/events";
import { getAdminData, tenantsApi } from "../../api/tenants";
import { AGENT_IDS } from "../../config/platform";
import { authStore } from "../../services/auth";
import { db } from "../../services/db";
import type { AdminData, Session, Tenant } from "../../types/database";
import { errorMessage, type Period } from "./utils";

export type AdminPage = "dashboard" | "tenants" | "agents" | "tools" | "leads" | "bookings" | "logs" | "branding" | "rules" | "settings";
export const PAGE_LABELS: Record<AdminPage, string> = {
  dashboard: "Overview",
  tenants: "Tenants",
  agents: "Agents & AI",
  tools: "Tools & outcomes",
  leads: "Leads",
  bookings: "Bookings",
  logs: "System logs",
  branding: "Branding",
  rules: "Automation rules",
  settings: "Settings",
};
export type TenantDialog = { kind: "create" | "view" | "edit" | "delete"; id?: string } | null;
interface Notice { id: number; text: string; tone: "success" | "error" | "info" }
interface AdminContextValue {
  session: Session;
  scope: string;
  setScope: (id: string) => void;
  allTenants: Tenant[];
  tenant: Tenant | undefined;
  data: AdminData;
  page: AdminPage;
  navigate: (page: AdminPage) => void;
  period: Period;
  setPeriod: (period: Period) => void;
  live: boolean;
  setLive: (live: boolean) => void;
  notices: Notice[];
  dismissNotice: (id: number) => void;
  notify: (text: string, tone?: Notice["tone"]) => void;
  act: (action: () => unknown, message?: string) => Promise<boolean>;
  tenantDialog: TenantDialog;
  setTenantDialog: (dialog: TenantDialog) => void;
}

const AdminContext = createContext<AdminContextValue | null>(null);

function initialScope(session: Session) {
  // Tenant-bound users are always scoped to their own workspace.
  if (session.role !== "platform_admin" && session.tenant_id) return session.tenant_id;
  try {
    const saved = localStorage.getItem("core.admin.scope");
    return saved && tenantsApi.list(session).some((t) => t.id === saved) ? saved : "all";
  } catch { return "all"; }
}
function currentPage(): AdminPage {
  const path = window.location.hash.replace(/^#/, "") || window.location.pathname;
  const segment = path.split("?")[0].split("/").filter(Boolean).pop() ?? "dashboard";
  return Object.prototype.hasOwnProperty.call(PAGE_LABELS, segment) ? segment as AdminPage : "dashboard";
}

export function AdminProvider({ children }: { children: ReactNode }) {
  const revision = useSyncExternalStore(db.subscribe, db.getRevision, db.getRevision);
  const authed = useSyncExternalStore(authStore.subscribe, authStore.get, authStore.get);
  // AdminProvider is only mounted behind the login gate, but a session can be
  // revoked mid-flight (401 → clearAuth). Render nothing until re-signed-in.
  const session = authed?.session ?? null;
  const [scope, updateScope] = useState(() => initialScope(authed?.session ?? { user_id: "", name: "", role: "member", tenant_id: null }));
  const [page, setPage] = useState<AdminPage>(currentPage);
  const [period, setPeriod] = useState<Period>("7d");
  const [live, setLive] = useState(true);
  const [tenantDialog, setTenantDialog] = useState<TenantDialog>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const noticeId = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const allTenants = useMemo(() => (session ? tenantsApi.list(session) : []), [revision, session]);
  const data = useMemo(
    () => (session ? getAdminData(session, scope) : { tenants: [], leads: [], bookings: [], messages: [], events: [], agents: [] }),
    [scope, revision, session],
  );
  const tenant = allTenants.find((t) => t.id === scope);

  const notify = useCallback((text: string, tone: Notice["tone"] = "success") => {
    const id = ++noticeId.current;
    setNotices((current) => [...current.slice(-2), { id, text, tone }]);
    timers.current.push(setTimeout(() => setNotices((current) => current.filter((notice) => notice.id !== id)), 5500));
  }, []);

  /**
   * Run a mutation and own its outcome. `action` may return a promise (all
   * backend writes do) — the toast only fires AFTER the server responds, and
   * a rejection surfaces as an error notice instead of a false success.
   */
  const act = useCallback(async (action: () => unknown, message?: string): Promise<boolean> => {
    try {
      const result = action();
      if (result instanceof Promise) await result;
      if (message) notify(message);
      return true;
    } catch (error) {
      notify(errorMessage(error), "error");
      return false;
    }
  }, [notify]);

  const setScope = useCallback((id: string) => {
    if (!session) return;
    if (session.role !== "platform_admin" && id !== session.tenant_id) {
      notify("Access denied: that tenant is outside your workspace.", "error");
      return;
    }
    if (id !== "all" && !tenantsApi.list(session).some((t) => t.id === id)) {
      notify("This tenant is not available.", "error");
      return;
    }
    updateScope(id);
    try { localStorage.setItem("core.admin.scope", id); } catch { /* Memory-only environments are supported. */ }
  }, [notify, session]);

  useEffect(() => {
    if (!session) return;
    if (scope !== "all" && !allTenants.some((t) => t.id === scope)) setScope(session.role === "platform_admin" ? "all" : (session.tenant_id ?? "all"));
  }, [scope, allTenants, setScope, session]);

  useEffect(() => {
    const handle = () => setPage(currentPage());
    window.addEventListener("hashchange", handle);
    return () => window.removeEventListener("hashchange", handle);
  }, []);

  // Pull the platform snapshot on mount, then keep the cache warm so
  // backend-driven agent activity shows up without a manual refresh.
  useEffect(() => {
    if (!session) return;
    void db.load().catch(() => undefined);
    const poll = window.setInterval(() => { void db.load(true).catch(() => undefined); }, 10_000);
    return () => { window.clearInterval(poll); timers.current.forEach(clearTimeout); };
  }, [session]);

  useEffect(() => {
    if (!live || !session) return;
    let turn = 0;
    const timer = window.setInterval(() => {
      const active = tenantsApi.list(session).filter((t) => t.status === "active");
      if (!active.length) return;
      const selected = active[turn % active.length];
      const agent = AGENT_IDS[Math.floor(turn / active.length) % AGENT_IDS.length];
      turn += 1;
      void eventsApi.trigger(session, selected.id, agent, true).catch(() => undefined);
    }, 18_000);
    return () => window.clearInterval(timer);
  }, [live, session]);

  const navigate = (next: AdminPage) => { window.location.hash = `/admin/${next}`; setPage(next); };

  if (!session) return null;

  return <AdminContext.Provider value={{ session, scope, setScope, allTenants, tenant, data, page, navigate, period, setPeriod, live, setLive, notices, dismissNotice: (id) => setNotices((current) => current.filter((n) => n.id !== id)), notify, act, tenantDialog, setTenantDialog }}>{children}</AdminContext.Provider>;
}

export function useAdmin() {
  const context = useContext(AdminContext);
  if (!context) throw new Error("Admin components require AdminProvider.");
  return context;
}

export function useTenantTarget() {
  const { scope, allTenants } = useAdmin();
  const [selected, setSelected] = useState("");
  const target = scope !== "all" ? allTenants.find((t) => t.id === scope) : allTenants.find((t) => t.id === selected) ?? allTenants[0];
  return { target, selectTarget: setSelected };
}
