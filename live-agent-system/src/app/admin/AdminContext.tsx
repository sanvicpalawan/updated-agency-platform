import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { eventsApi } from "../../api/events";
import { getAdminData, tenantsApi } from "../../api/tenants";
import { AGENT_IDS, MOCK_ADMIN } from "../../config/platform";
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
  act: (action: () => unknown, message?: string) => boolean;
  tenantDialog: TenantDialog;
  setTenantDialog: (dialog: TenantDialog) => void;
}

const AdminContext = createContext<AdminContextValue | null>(null);

function initialScope() {
  try {
    const saved = localStorage.getItem("core.admin.scope");
    return saved && tenantsApi.list(MOCK_ADMIN).some((t) => t.id === saved) ? saved : "all";
  } catch { return "all"; }
}
function currentPage(): AdminPage {
  const path = window.location.hash.replace(/^#/, "") || window.location.pathname;
  const segment = path.split("?")[0].split("/").filter(Boolean).pop() ?? "dashboard";
  return Object.prototype.hasOwnProperty.call(PAGE_LABELS, segment) ? segment as AdminPage : "dashboard";
}

export function AdminProvider({ children }: { children: ReactNode }) {
  const revision = useSyncExternalStore(db.subscribe, db.getRevision, db.getRevision);
  const [scope, updateScope] = useState(initialScope);
  const [page, setPage] = useState<AdminPage>(currentPage);
  const [period, setPeriod] = useState<Period>("7d");
  const [live, setLive] = useState(true);
  const [tenantDialog, setTenantDialog] = useState<TenantDialog>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const noticeId = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const allTenants = useMemo(() => tenantsApi.list(MOCK_ADMIN), [revision]);
  const data = useMemo(() => getAdminData(MOCK_ADMIN, scope), [scope, revision]);
  const tenant = allTenants.find((t) => t.id === scope);

  const notify = useCallback((text: string, tone: Notice["tone"] = "success") => {
    const id = ++noticeId.current;
    setNotices((current) => [...current.slice(-2), { id, text, tone }]);
    timers.current.push(setTimeout(() => setNotices((current) => current.filter((notice) => notice.id !== id)), 5500));
  }, []);

  const act = useCallback((action: () => unknown, message?: string): boolean => {
    try { action(); if (message) notify(message); return true; }
    catch (error) { notify(errorMessage(error), "error"); return false; }
  }, [notify]);

  const setScope = useCallback((id: string) => {
    if (id !== "all" && !tenantsApi.list(MOCK_ADMIN).some((t) => t.id === id)) {
      notify("This tenant is not available.", "error");
      return;
    }
    updateScope(id);
    try { localStorage.setItem("core.admin.scope", id); } catch { /* Memory-only environments are supported. */ }
  }, [notify]);

  useEffect(() => {
    if (scope !== "all" && !allTenants.some((t) => t.id === scope)) setScope("all");
  }, [scope, allTenants, setScope]);

  useEffect(() => {
    const handle = () => setPage(currentPage());
    window.addEventListener("hashchange", handle);
    return () => window.removeEventListener("hashchange", handle);
  }, []);

  // Pull the platform snapshot on mount, then keep the cache warm so
  // backend-driven agent activity shows up without a manual refresh.
  useEffect(() => {
    void db.load().catch(() => undefined);
    const poll = window.setInterval(() => { void db.load(true).catch(() => undefined); }, 10_000);
    return () => { window.clearInterval(poll); timers.current.forEach(clearTimeout); };
  }, []);

  useEffect(() => {
    if (!live) return;
    let turn = 0;
    const timer = window.setInterval(() => {
      const active = tenantsApi.list(MOCK_ADMIN).filter((t) => t.status === "active");
      if (!active.length) return;
      const selected = active[turn % active.length];
      const agent = AGENT_IDS[Math.floor(turn / active.length) % AGENT_IDS.length];
      turn += 1;
      try { eventsApi.trigger(MOCK_ADMIN, selected.id, agent, true); }
      catch { /* Disabled agents and empty queues are expected in the simulator. */ }
    }, 18_000);
    return () => window.clearInterval(timer);
  }, [live]);

  const navigate = (next: AdminPage) => { window.location.hash = `/admin/${next}`; setPage(next); };

  return <AdminContext.Provider value={{ session: MOCK_ADMIN, scope, setScope, allTenants, tenant, data, page, navigate, period, setPeriod, live, setLive, notices, dismissNotice: (id) => setNotices((current) => current.filter((n) => n.id !== id)), notify, act, tenantDialog, setTenantDialog }}>{children}</AdminContext.Provider>;
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