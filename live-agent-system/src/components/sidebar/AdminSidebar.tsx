import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Bot,
  Building2,
  CalendarDays,
  Check,
  ChevronsUpDown,
  CircleHelp,
  LayoutDashboard,
  Layers3,
  Palette,
  Plus,
  Settings,
  Settings2,
  UsersRound,
  Wrench,
  X,
} from "lucide-react";
import { PAGE_LABELS, useAdmin, type AdminPage } from "../../app/admin/AdminContext";
import { CoreLogo, TenantMark } from "../../app/admin/components/shared";
import { cn } from "../../utils/cn";

const workspaceLinks = [
  { page: "dashboard", icon: LayoutDashboard },
  { page: "tenants", icon: Building2 },
  { page: "agents", icon: Bot },
  { page: "tools", icon: Wrench },
  { page: "leads", icon: UsersRound },
  { page: "bookings", icon: CalendarDays },
  { page: "logs", icon: Activity },
] as const;
const configLinks = [
  { page: "branding", icon: Palette },
  { page: "rules", icon: Settings2 },
  { page: "settings", icon: Settings },
] as const;

export function AdminSidebar({ open, onClose, onEnvironment }: { open: boolean; onClose: () => void; onEnvironment: () => void }) {
  const { page, allTenants, data, session } = useAdmin();
  const newLeads = data.leads.filter((lead) => lead.status === "new").length;
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [open, onClose]);

  const renderLink = (item: (typeof workspaceLinks)[number] | (typeof configLinks)[number]) => (
    <a
      key={item.page}
      href={`#/admin/${item.page}`}
      className={cn("nav-link", page === item.page && "active")}
      aria-current={page === item.page ? "page" : undefined}
      onClick={onClose}
    >
      <item.icon size={17} strokeWidth={1.7} />
      <span>{PAGE_LABELS[item.page as AdminPage]}</span>
      {item.page === "tenants" && <span className="nav-count">{allTenants.length}</span>}
      {item.page === "tools" && <span className="nav-count">4</span>}
      {item.page === "leads" && newLeads > 0 && <span className="nav-count">{newLeads}</span>}
      {item.page === "agents" && <i className="nav-online" />}
    </a>
  );

  return (
    <>
      {open && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={onClose} />}
      <aside className={cn("admin-sidebar", open && "is-open")} aria-label="Main navigation">
        <div className="sidebar-brand">
          <CoreLogo />
          <span className="admin-word">ADMIN</span>
          <button className="icon-button sidebar-close" onClick={onClose} aria-label="Close navigation">
            <X size={18} />
          </button>
        </div>
        <TenantSwitcher />
        <div className="sidebar-scroll">
          <div className="nav-section-label">WORKSPACE</div>
          <nav>{workspaceLinks.map(renderLink)}</nav>
          <div className="nav-section-label config-label">CONFIGURATION</div>
          <nav>{configLinks.map(renderLink)}</nav>
          <a className="nav-link client-console-link" href="#/console">
            <Layers3 size={17} strokeWidth={1.7} />
            <span>Live Agent / Human Console</span>
            <ArrowUpRight size={14} />
          </a>
        </div>
        <div className="sidebar-bottom">
          <button className="environment-button" onClick={onEnvironment}>
            <span className="live-dot" />
            <span>
              GitHub-ready mock runtime
              <small>Agents, OpenRouter & Tools wired</small>
            </span>
            <CircleHelp size={14} />
          </button>
          <div className="sidebar-profile">
            <button className="profile-button" onClick={onEnvironment}>
              <span className="avatar">AM</span>
              <span>
                {session.name}
                <small>Platform administrator</small>
              </span>
              <ChevronsUpDown size={13} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

function TenantSwitcher() {
  const { scope, setScope, allTenants, tenant, session, setTenantDialog } = useAdmin();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", outside); document.removeEventListener("keydown", key); };
  }, [open]);
  if (session.role !== "platform_admin")
    return tenant ? (
      <div className="tenant-switcher">
        <TenantMark tenant={tenant} />
        <span>{tenant.name}</span>
      </div>
    ) : null;

  return (
    <div className="tenant-switcher" ref={ref}>
      <button
        className="workspace-switch"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Switch tenant workspace"
        onClick={() => setOpen(!open)}
      >
        {tenant ? (
          <TenantMark tenant={tenant} />
        ) : (
          <span className="workspace-icon">
            <Layers3 size={20} strokeWidth={1.5} />
          </span>
        )}
        <span>
          <strong>{tenant?.name ?? "All tenants"}</strong>
          <small>{tenant ? "Tenant workspace" : `${allTenants.length} workspaces`}</small>
        </span>
        <ChevronsUpDown size={15} />
      </button>
      {open && (
        <div className="workspace-menu">
          <div className="menu-label">SWITCH WORKSPACE</div>
          <div role="listbox" aria-label="Tenant workspace">
            <button
              role="option"
              aria-selected={scope === "all"}
              className="workspace-option"
              onClick={() => {
                setScope("all");
                setOpen(false);
              }}
            >
              <span className="workspace-icon small">
                <Layers3 size={16} />
              </span>
              <span>All tenants</span>
              {scope === "all" && <Check size={14} />}
            </button>
            {allTenants.map((item) => (
              <button
                key={item.id}
                role="option"
                aria-selected={scope === item.id}
                className="workspace-option"
                onClick={() => {
                  setScope(item.id);
                  setOpen(false);
                }}
              >
                <TenantMark tenant={item} size="small" />
                <span>{item.name}</span>
                {scope === item.id && <Check size={14} />}
              </button>
            ))}
          </div>
          <button
            className="workspace-option create-workspace"
            onClick={() => {
              setOpen(false);
              setTenantDialog({ kind: "create" });
            }}
          >
            <Plus size={16} />
            <span>Create a tenant</span>
          </button>
        </div>
      )}
    </div>
  );
}
