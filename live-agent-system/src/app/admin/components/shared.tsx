import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUpRight, Check, ChevronDown, Copy, Inbox, X } from "lucide-react";
import { AGENTS } from "../../../config/platform";
import { useDbStatus } from "../../../services/useDbStatus";
import type { AgentId, SystemEvent, Tenant } from "../../../types/database";
import { cn } from "../../../utils/cn";
import { useAdmin } from "../AdminContext";
import { fullDate, relative } from "../utils";

export function CoreLogo({ small = false }: { small?: boolean }) {
  return <div className={cn("core-logo", small && "small")}><svg width="27" height="29" viewBox="0 0 27 29" fill="none" aria-hidden="true"><path d="m13.5 2 11 6.4v12.2L13.5 27l-11-6.4V8.4L13.5 2Z" stroke="currentColor" strokeWidth="1.8" /><path d="m13.5 8 5.8 3.3v6.4L13.5 21l-5.8-3.3v-6.4L13.5 8Z" fill="currentColor"/><path d="M13.5 2v6m11 .4-5.2 2.9m5.2 9.3-5.2-2.9M13.5 27v-6m-11-.4 5.2-2.9M2.5 8.4l5.2 2.9" stroke="currentColor" strokeWidth="1.4"/></svg>{!small && <span>CORE<span className="logo-period">.</span></span>}</div>;
}

export function TenantMark({ tenant, size = "normal" }: { tenant: Tenant; size?: "small" | "normal" | "large" }) {
  const brand = tenant.branding_config;
  return <span className={cn("tenant-mark", size)} style={{ color: brand.primary_color, background: `${brand.primary_color}15`, borderColor: `${brand.primary_color}25` }} aria-hidden="true">{brand.logo.startsWith("data:image/") ? <img src={brand.logo} alt="" /> : brand.logo.slice(0, 3) || tenant.name[0]}</span>;
}

export function AgentMark({ agent, size = "normal" }: { agent: AgentId; size?: "small" | "normal" | "large" }) {
  const color = AGENTS[agent].color;
  return <span className={cn("agent-mark", size)} style={{ color, background: `${color}10`, borderColor: `${color}25` }}><svg viewBox="0 0 28 28" fill="none" aria-hidden="true">{agent === "tala" ? <><circle cx="14" cy="14" r="5.5" stroke="currentColor" strokeWidth="1.5"/><path d="M14 3v4m0 14v4M3 14h4m14 0h4M6.2 6.2l2.8 2.8m10 10 2.8 2.8M21.8 6.2 19 9M9 19l-2.8 2.8" stroke="currentColor" strokeWidth="1.5"/></> : agent === "nyx" ? <><path d="m14 3 10 11-10 11L4 14 14 3Z" stroke="currentColor" strokeWidth="1.5"/><path d="m14 9 4.5 5-4.5 5-4.5-5L14 9Z" fill="currentColor"/></> : <><path d="m4 9 10-5 10 5-10 5L4 9Zm0 5 10 5 10-5M4 19l10 5 10-5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></>}</svg></span>;
}

export function Status({ value, dot = true }: { value: string; dot?: boolean }) {
  const tone = ["active", "enabled", "confirmed", "converted", "success", "running"].includes(value) ? "green" : ["paused", "pending", "setup", "warning", "new"].includes(value) ? "amber" : ["cancelled", "error"].includes(value) ? "red" : ["contacted", "info", "completed"].includes(value) ? "blue" : "muted";
  const label = value === "setup" ? "Setting up" : value;
  return <span className={`status-label ${tone}`}>{dot && <i />}{label.charAt(0).toUpperCase() + label.slice(1)}</span>;
}

export function PageHeader({ eyebrow, title, description, children }: { eyebrow?: string; title: string; description: string; children?: ReactNode }) {
  return <header className="page-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1><p>{description}</p></div><div className="page-actions">{children}</div></header>;
}

export function SectionHeading({ title, description, action }: { title: ReactNode; description?: string; action?: ReactNode }) {
  return <div className="section-heading"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>;
}

export function EmptyState({ title = "No records found", description = "Try a different filter or add your first record.", action }: { title?: string; description?: string; action?: ReactNode }) {
  return <div className="admin-empty"><Inbox size={27} strokeWidth={1.3}/><h3>{title}</h3><p>{description}</p>{action}</div>;
}

/**
 * Three distinct "nothing to show" states (fix from da39f3c):
 *   loading  → the snapshot fetch is still in flight
 *   error    → the backend is unreachable / rejected the session
 *   ready    → there genuinely are no workspaces yet
 * Collapsing all three into the empty state made pages claim "No workspaces"
 * during every initial load, before db.load() had resolved.
 */
export function WorkspaceGate({ title, description, action, onRetry }: { title?: string; description?: string; action?: ReactNode; onRetry?: () => void }) {
  const { status, error } = useDbStatus();
  if (status === "idle" || status === "loading") {
    return <EmptyState title="Loading workspaces…" description="Fetching the platform snapshot from the backend." />;
  }
  if (status === "error") {
    return (
      <EmptyState
        title="Backend unreachable"
        description={`The agent runtime did not return a snapshot. ${error ?? ""}`.trim()}
        action={onRetry ? <button className="button secondary" onClick={onRetry}>Retry connection</button> : action}
      />
    );
  }
  return <EmptyState title={title ?? "No workspaces yet"} description={description ?? "Create a tenant to get started."} action={action} />;
}

export function Toggle({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" className={cn("admin-toggle", checked && "is-on")} role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}><span /></button>;
}

export function TenantSelect({ value, onChange, label = "Tenant" }: { value: string; onChange: (id: string) => void; label?: string }) {
  const { allTenants, scope } = useAdmin();
  const available = scope === "all" ? allTenants : allTenants.filter((t) => t.id === scope);
  return <label className="admin-field"><span>{label}</span><div className="select-wrap"><select value={value} onChange={(e) => onChange(e.target.value)} required><option value="" disabled>Select a tenant</option>{available.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</select><ChevronDown size={14}/></div></label>;
}

export function ScopeFilter() {
  const { scope, setScope, allTenants, session } = useAdmin();
  if (session.role !== "platform_admin") return null;
  return <select aria-label="Filter by tenant" value={scope} onChange={(e) => setScope(e.target.value)}><option value="all">All tenants</option>{allTenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</select>;
}

export function Modal({ title, description, children, onClose, wide = false }: { title: string; description?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => { dialog?.close(); };
  }, []);
  return <dialog ref={ref} className={cn("admin-dialog", wide && "wide")} aria-label={title} onCancel={(e) => { e.preventDefault(); close.current(); }} onClick={(e) => { if (e.target === e.currentTarget) { const box = e.currentTarget.getBoundingClientRect(); if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) close.current(); } }}><div className="dialog-heading"><div><h2>{title}</h2>{description && <p>{description}</p>}</div><button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={18}/></button></div><div className="dialog-body">{children}</div></dialog>;
}

export function EventDetail({ event, onClose }: { event: SystemEvent; onClose: () => void }) {
  const { allTenants, notify } = useAdmin();
  const tenant = allTenants.find((t) => t.id === event.tenant_id);
  const copy = async () => {
    try { await navigator.clipboard.writeText(JSON.stringify(event.payload, null, 2)); notify("Event payload copied."); }
    catch { notify("Clipboard access is unavailable. Select and copy the payload below.", "info"); }
  };
  return <Modal title="Event details" description={event.type} onClose={onClose}><div className="detail-message">{event.message}</div><dl className="detail-list"><div><dt>Tenant</dt><dd>{tenant?.name ?? "Unknown tenant"}</dd></div><div><dt>Agent</dt><dd>{event.agent ? AGENTS[event.agent].name : "Administrator"}</dd></div><div><dt>Timestamp</dt><dd>{fullDate(event.created_at)}</dd></div><div><dt>Result</dt><dd><Status value={event.level}/></dd></div><div><dt>Tenant ID</dt><dd className="mono small-text">{event.tenant_id}</dd></div></dl><div className="code-heading"><span>EVENT PAYLOAD</span><button type="button" className="text-button" onClick={copy}><Copy size={13}/> Copy</button></div><pre className="json-preview">{JSON.stringify(event.payload, null, 2)}</pre><div className="dialog-footer"><span className="subtle small-text">Stored in the local mock event bus.</span><button className="button secondary" onClick={onClose}>Close</button></div></Modal>;
}

export function EventFeed({ events, limit = 5 }: { events: SystemEvent[]; limit?: number }) {
  const { allTenants } = useAdmin();
  const [selected, setSelected] = useState<SystemEvent | null>(null);
  if (!events.length) return <EmptyState title="Waiting for activity" description="Agent and administrator actions will appear here."/>;
  return <><div className="event-feed">{events.slice(0, limit).map((event) => {
    const tenant = allTenants.find((t) => t.id === event.tenant_id);
    return <button className={cn("feed-entry", Date.now() - Date.parse(event.created_at) < 5000 && "fresh")} key={event.id} onClick={() => setSelected(event)}><span className={cn("feed-icon", event.level === "warning" && "warning")}>{event.type.includes("booking") ? <Check size={14}/> : event.type.includes("lead") ? <ArrowDown size={14}/> : <ArrowUpRight size={14}/>}</span><span className="feed-copy"><span>{event.message}</span><small>{tenant?.name ?? "Tenant"}<i/>{relative(event.created_at)}</small></span><ArrowUpRight className="feed-arrow" size={13}/></button>;
  })}</div>{selected && <EventDetail event={selected} onClose={() => setSelected(null)}/>}</>;
}