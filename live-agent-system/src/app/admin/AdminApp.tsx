import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  Activity,
  ArrowRight,
  Bell,
  Check,
  CheckCircle2,
  CircleHelp,
  Command,
  Database,
  ExternalLink,
  Info,
  Menu,
  LogOut,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { AdminSidebar } from "../../components/sidebar/AdminSidebar";
import { PLATFORM } from "../../config/platform";
import { runIsolationChecks, type IsolationCheck } from "../../core/isolationChecks";
import { db } from "../../services/db";
import { logout } from "../../services/auth";
import { openRouterCatalog, timeAgo, useOpenRouterCatalog } from "../../services/openrouter";
import { SyncDot } from "./components/OpenRouterSync";
import { engine } from "../../system/useSystemEngine";
import { AdminProvider, PAGE_LABELS, useAdmin, type AdminPage } from "./AdminContext";
import { EmptyState, EventFeed, Modal, TenantMark, Toggle } from "./components/shared";
import DashboardPage from "./dashboard/page";
import TenantsPage from "./tenants/page";
import AgentsPage from "./agents/page";
import ToolsPage from "./tools/page";
import LeadsPage from "./leads/page";
import BookingsPage from "./bookings/page";
import LogsPage from "./logs/page";
import BrandingPage from "./branding/page";
import RulesPage from "./rules/page";
import SettingsPage from "./settings/page";
import { TenantDialogs } from "./tenants/TenantDialogs";
import { contrast, errorMessage } from "./utils";
import "./admin.css";

const pages: Record<AdminPage, () => React.JSX.Element> = {
  dashboard: DashboardPage,
  tenants: TenantsPage,
  agents: AgentsPage,
  tools: ToolsPage,
  leads: LeadsPage,
  bookings: BookingsPage,
  logs: LogsPage,
  branding: BrandingPage,
  rules: RulesPage,
  settings: SettingsPage,
};

export default function AdminApp() {
  return (
    <AdminProvider>
      <AdminShell />
    </AdminProvider>
  );
}

function AdminShell() {
  const { page, tenant, live, notices, dismissNotice, data, session } = useAdmin();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [environmentOpen, setEnvironmentOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [reviewed, setReviewed] = useState<string[]>([]);
  const content = useRef<HTMLDivElement>(null);
  const Page = pages[page] ?? DashboardPage;
  const accent = tenant?.branding_config.primary_color ?? PLATFORM.primary_color;
  const theme = tenant?.branding_config.theme ?? "dark";
  const alerts = data.events.filter((event) => ["warning", "error"].includes(event.level) && !reviewed.includes(event.id));

  useEffect(() => {
    content.current?.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    setSidebarOpen(false);
  }, [page]);
  useEffect(() => {
    document.title = `${tenant?.branding_config.app_name ?? "CORE"} | ${PAGE_LABELS[page]}`;
  }, [tenant?.branding_config.app_name, page]);
  useEffect(() => {
    // Warm the live OpenRouter catalog in the background (daily TTL, cached)
    openRouterCatalog.startAuto();
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      className="admin-app"
      data-theme={theme}
      style={{ "--admin-accent": accent, "--admin-on-accent": contrast(accent) } as CSSProperties}
    >
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} onEnvironment={() => setEnvironmentOpen(true)} />
      <div className="admin-main">
        <header className="admin-topbar">
          <button className="icon-button mobile-menu-button" onClick={() => setSidebarOpen(true)} aria-label="Open navigation">
            <Menu size={19} />
          </button>
          <div className="breadcrumbs">
            <span>{tenant ? tenant.branding_config.app_name : "Workspace"}</span>
            <span className="breadcrumb-slash">/</span>
            <strong>{PAGE_LABELS[page]}</strong>
          </div>
          <div className="topbar-actions">
            {/* Global Mode Switcher: HUMAN / AGENT / ADMIN */}
            <div
              className="chart-tabs"
              role="group"
              aria-label="Switch interface mode"
              style={{ marginRight: 4 }}
            >
              <button
                type="button"
                onClick={() => {
                  engine.setMode("HUMAN");
                  window.location.hash = "#/console";
                }}
                title="Open clean Human client outcome view"
              >
                HUMAN
              </button>
              <button
                type="button"
                onClick={() => {
                  engine.setMode("SYSTEM");
                  window.location.hash = "#/console";
                }}
                title="Open live Agent / System operations console"
              >
                AGENT / SYSTEM
              </button>
              <button type="button" className="active" aria-pressed="true">
                ADMIN
              </button>
            </div>

            <button className="search-trigger" onClick={() => setSearchOpen(true)} aria-label="Search pages and tenants">
              <Search size={14} />
              <span>Search...</span>
              <kbd>
                <Command size={9} style={{ display: "inline", marginRight: 2 }} />K
              </kbd>
            </button>
            <CatalogChip />
            <button className="system-health" onClick={() => setEnvironmentOpen(true)} title="View runtime information">
              <span className={`live-dot ${live ? "pulse" : "paused"}`} />
              {live ? "System operational" : "Simulation paused"}
            </button>
            <button
              className="icon-button"
              onClick={() => setNotificationsOpen(true)}
              aria-label={`Notifications${alerts.length ? `, ${alerts.length} unread` : ""}`}
              title="Notifications"
            >
              <Bell size={16} />
              {alerts.length > 0 && <i className="notification-dot" />}
            </button>
            <button
              className="icon-button help-top-button"
              onClick={() => setEnvironmentOpen(true)}
              aria-label="Environment and help"
              title="Environment and help"
            >
              <CircleHelp size={16} />
            </button>
            <span
              className="live-indicator"
              title={`Signed in as ${session.name} (${session.role.replace(/_/g, " ")})`}
              style={{ gap: 7 }}
            >
              {session.name}
              <button
                className="icon-button"
                onClick={() => logout()}
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut size={14} />
              </button>
            </span>
          </div>
        </header>
        <div className="admin-content" ref={content}>
          <main className="admin-page" key={page}>
            <Page />
          </main>
        </div>
        <footer className="admin-statusbar">
          <span className={`live-dot ${live ? "pulse" : "paused"}`} />
          <span>{live ? "All agents & tools connected (mock runtime)" : "Automatic simulation paused"}</span>
          <div className="right">
            <span>
              <ShieldCheck size={10} style={{ display: "inline", marginRight: 4 }} />
              Tenant-scoped · GitHub ready
            </span>
            <span>
              <Database size={10} style={{ display: "inline", marginRight: 4 }} />
              {db.status === "ready" ? "Backend connected" : db.status === "error" ? "Backend unreachable" : "Connecting…"}
            </span>
            <span>v{PLATFORM.version}</span>
          </div>
        </footer>
      </div>
      <div className="toast-region" aria-live="polite">
        {notices.map((notice) => (
          <div className={`admin-toast ${notice.tone}`} key={notice.id}>
            {notice.tone === "success" ? <CheckCircle2 size={17} /> : <Info size={17} />}
            <span>{notice.text}</span>
            <button className="icon-button" aria-label="Dismiss notification" onClick={() => dismissNotice(notice.id)}>
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
      <TenantDialogs />
      {searchOpen && <CommandSearch onClose={() => setSearchOpen(false)} />}
      {environmentOpen && <EnvironmentDialog onClose={() => setEnvironmentOpen(false)} />}
      {notificationsOpen && (
        <Modal
          title="Attention queue"
          description="Workspace alerts from the tenant-scoped event stream."
          onClose={() => setNotificationsOpen(false)}
        >
          {alerts.length ? (
            <>
              <EventFeed events={alerts} limit={12} />
              <div className="dialog-footer">
                <button
                  className="button primary"
                  onClick={() => {
                    setReviewed((current) => [...current, ...alerts.map((event) => event.id)]);
                  }}
                >
                  Mark all as reviewed
                  <Check size={13} />
                </button>
              </div>
            </>
          ) : (
            <EmptyState
              title="You're up to date"
              description="New warnings and errors will appear here. Reviewed entries remain in the system logs."
            />
          )}
        </Modal>
      )}
    </div>
  );
}

function CatalogChip() {
  const catalog = useOpenRouterCatalog();
  const { navigate } = useAdmin();
  const label =
    catalog.health === "live"
      ? `${catalog.total} models · ${timeAgo(catalog.fetchedAt)}`
      : catalog.health === "loading"
        ? "Syncing models…"
        : "Models need refresh";
  return (
    <button
      className="system-health"
      onClick={() => navigate("settings")}
      title={catalog.health === "live" ? `OpenRouter catalog live — ${label}. Click to manage.` : "Open Settings to refresh the OpenRouter catalog"}
      style={{ border: "1px solid var(--admin-line)", borderRadius: 999, padding: "5px 10px" }}
    >
      <SyncDot health={catalog.health} size={7} />
      <span className="mono" style={{ fontSize: 10 }}>{label}</span>
    </button>
  );
}

function CommandSearch({ onClose }: { onClose: () => void }) {
  const { allTenants, navigate, setScope } = useAdmin();
  const [search, setSearch] = useState("");
  const query = search.toLowerCase();
  const matchingPages = Object.entries(PAGE_LABELS).filter(([, label]) => label.toLowerCase().includes(query));
  const tenants = allTenants.filter((tenant) => `${tenant.name} ${tenant.slug}`.toLowerCase().includes(query));
  return (
    <Modal title="Go anywhere" description="Search pages and tenant workspaces. Ctrl / Cmd + K." onClose={onClose}>
      <label className="table-search command-search">
        <Search size={16} />
        <input
          autoFocus
          aria-label="Search pages and workspaces"
          placeholder="Search pages or tenants..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <div className="command-results">
        {matchingPages.length > 0 && <div className="menu-label">PAGES</div>}
        {matchingPages.map(([id, label]) => (
          <button
            key={id}
            className="command-result"
            onClick={() => {
              navigate(id as AdminPage);
              onClose();
            }}
          >
            <Activity size={15} />
            <span>{label}</span>
            <ArrowRight size={13} />
          </button>
        ))}
        {tenants.length > 0 && <div className="menu-label">TENANT WORKSPACES</div>}
        {tenants.map((tenant) => (
          <button
            className="command-result"
            key={tenant.id}
            onClick={() => {
              setScope(tenant.id);
              navigate("dashboard");
              onClose();
            }}
          >
            <TenantMark tenant={tenant} size="small" />
            <span>
              {tenant.name}
              <small>{tenant.slug}</small>
            </span>
            <ArrowRight size={13} />
          </button>
        ))}
        {!matchingPages.length && !tenants.length && (
          <EmptyState title="No matches" description="Try a workspace name or a page such as Agents or Tools." />
        )}
      </div>
    </Modal>
  );
}

function EnvironmentDialog({ onClose }: { onClose: () => void }) {
  const { live, setLive, session, notify } = useAdmin();
  const [checks, setChecks] = useState<IsolationCheck[] | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  return (
    <Modal title="System environment & GitHub readiness" description="One codebase. Tenant-scoped workflows. Local mock storage." onClose={onClose}>
      <div className="environment-notice">
        <Database size={20} />
        <p>
          All agents (TALA, NYX, HERMES), OpenRouter Free/Paid model configurations, behavioral prompts, and the 4 operational tools are wired to <code>services/db.ts</code> and ready to connect to your backend when pushed to GitHub.
        </p>
      </div>
      <dl className="detail-list">
        <div>
          <dt>Automatic event simulation</dt>
          <dd><Toggle checked={live} onChange={setLive} label="Enable automatic event simulation" /></dd>
        </div>
        <div>
          <dt>Data adapter</dt>
          <dd>services/db.ts → Node API → SQLite{db.lastSyncedAt ? ` · synced ${new Date(db.lastSyncedAt).toLocaleTimeString()}` : ""}</dd>
        </div>
        <div>
          <dt>OpenRouter models</dt>
          <dd>5 Free models + 5 Paid models pre-configured</dd>
        </div>
        <div>
          <dt>Connected tools</dt>
          <dd>Lead Capture · Booking Engine · WhatsApp Outbox · Ops Ledger</dd>
        </div>
      </dl>
      <div className="diagnostic-heading">
        <span>ISOLATION DIAGNOSTICS</span>
        <button className="button secondary small" onClick={() => setChecks(runIsolationChecks())}>
          <ShieldCheck size={12} />
          Run checks
        </button>
      </div>
      {checks && (
        <ul className="diagnostic-list">
          {checks.map((check) => (
            <li key={check.name}>
              {check.passed ? <Check size={13} /> : <X size={13} />}
              <span>{check.name}</span>
              <strong>{check.passed ? "PASS" : "FAIL"}</strong>
            </li>
          ))}
        </ul>
      )}
      <a className="environment-console-link" href="#/console" onClick={onClose}>
        Open Live Human / Agent Console
        <ExternalLink size={13} />
      </a>
      <div className="reset-environment">
        <button className="text-button danger-text" onClick={() => setResetOpen(!resetOpen)}>
          Reset demo data
        </button>
        {resetOpen && (
          <>
            <p>Clears your local edits and restores the seeded workspaces. Type RESET to continue.</p>
            <div className="reset-confirmation">
              <input
                aria-label="Confirm reset by typing RESET"
                placeholder="RESET"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
              <button
                className="button danger small"
                disabled={confirmation !== "RESET"}
                onClick={() => {
                  // The reset wipes ALL sessions server-side (the sessions table
                  // is part of the demo data), so it necessarily signs us out.
                  void db
                    .reset(session)
                    .then(() => {
                      notify("Demo workspaces restored. Sign in again with the demo credentials.");
                      onClose();
                      logout();
                    })
                    .catch((err) => notify(errorMessage(err), "error"));
                }}
              >
                Reset data
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
