import { useState, type FormEvent } from "react";
import { AlertTriangle, ArrowUpRight, Bot, ChevronDown, Pencil, Plus, Trash2, Wrench } from "lucide-react";
import { bookingsApi } from "../../../api/bookings";
import { leadsApi } from "../../../api/leads";
import { getAdminData, tenantsApi } from "../../../api/tenants";
import { RULE_OPTIONS } from "../../../config/platform";
import type { AgentId, Tenant, TenantRules, TenantStatus } from "../../../types/database";
import { useAdmin } from "../AdminContext";
import { EventFeed, Modal, Status, TenantMark } from "../components/shared";
import { errorMessage, fullDate, money } from "../utils";

export function TenantDialogs() {
  const { tenantDialog, setTenantDialog, allTenants } = useAdmin();
  if (!tenantDialog) return null;
  const tenant = allTenants.find((t) => t.id === tenantDialog.id);
  const close = () => setTenantDialog(null);
  if (tenantDialog.kind === "create") return <TenantForm onClose={close} />;
  if (!tenant)
    return (
      <Modal title="Tenant unavailable" description="This workspace may have been deleted." onClose={close}>
        <button className="button secondary" onClick={close}>Close</button>
      </Modal>
    );
  if (tenantDialog.kind === "edit") return <TenantForm key={tenant.id} tenant={tenant} onClose={close} />;
  if (tenantDialog.kind === "delete") return <DeleteTenant tenant={tenant} onClose={close} />;
  return <TenantDetails tenant={tenant} onClose={close} />;
}

function TenantForm({ tenant, onClose }: { tenant?: Tenant; onClose: () => void }) {
  const { session, notify } = useAdmin();
  const [name, setName] = useState(tenant?.name ?? "");
  const [slug, setSlug] = useState(tenant?.slug ?? "");
  const [industry, setIndustry] = useState(tenant?.industry ?? "Hospitality");
  const [status, setStatus] = useState<TenantStatus>(tenant?.status ?? "active");
  const [appName, setAppName] = useState(tenant?.branding_config.app_name ?? "");
  const [logo, setLogo] = useState(tenant?.branding_config.logo ?? "");
  const [primaryColor, setPrimaryColor] = useState(tenant?.branding_config.primary_color ?? "#bcf58b");
  const [theme, setTheme] = useState<"dark" | "light">(tenant?.branding_config.theme ?? "dark");
  const [openrouterKey, setOpenrouterKey] = useState(tenant?.openrouter_api_key ?? "");
  const [rules, setRules] = useState<TenantRules>(
    tenant?.rules ?? { tala: "auto-reply-leads", nyx: "follow-up-after-24h", hermes: "log-all-bookings" },
  );
  const [error, setError] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      const cleanName = name.trim();
      const input = {
        name: cleanName,
        slug: slug.trim(),
        industry: industry.trim() || "General business",
        status,
        openrouter_api_key: openrouterKey.trim(),
        branding_config: {
          app_name: (appName.trim() || cleanName),
          logo: (logo.trim() || cleanName[0]?.toUpperCase() || "B"),
          primary_color: primaryColor,
          theme,
        },
        rules,
      };
      if (tenant) tenantsApi.update(session, tenant.id, input);
      else tenantsApi.create(session, input);
      notify(tenant ? `${cleanName} settings saved.` : `${cleanName} workspace created with 3 agents and 4 tools.`);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Modal
      title={tenant ? `Tenant Settings — ${tenant.name}` : "Create a tenant workspace"}
      description="Configure identity, branding, OpenRouter API key, and automation rules."
      onClose={onClose}
      wide
    >
      <form onSubmit={submit}>
        <div className="form-grid">
          <label className="admin-field">
            <span>Business name</span>
            <input
              required
              maxLength={60}
              autoFocus
              placeholder="e.g. BAIA"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!tenant) {
                  setAppName(e.target.value);
                  setSlug(e.target.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
                }
              }}
            />
          </label>
          <label className="admin-field">
            <span>White-label app display name</span>
            <input
              required
              maxLength={60}
              placeholder="BAIA Concierge"
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
            />
          </label>
          <label className="admin-field">
            <span>Workspace slug</span>
            <input
              required
              maxLength={60}
              placeholder="baia"
              value={slug}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
            />
            <small>Unique deployment identifier.</small>
          </label>
          <label className="admin-field">
            <span>Business type / industry</span>
            <input required maxLength={60} placeholder="Hospitality" value={industry} onChange={(e) => setIndustry(e.target.value)} />
          </label>
          <label className="admin-field">
            <span>Workspace status</span>
            <div className="select-wrap">
              <select value={status} onChange={(e) => setStatus(e.target.value as TenantStatus)}>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="setup">Setting up</option>
              </select>
              <ChevronDown size={13} />
            </div>
          </label>
          <label className="admin-field">
            <span>Interface theme</span>
            <div className="select-wrap">
              <select value={theme} onChange={(e) => setTheme(e.target.value as "dark" | "light")}>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
              <ChevronDown size={13} />
            </div>
          </label>
          <label className="admin-field">
            <span>Logo lettermark (or upload in Branding)</span>
            <input maxLength={3} placeholder="B" value={logo.startsWith("data:") ? "IMG" : logo} onChange={(e) => setLogo(e.target.value)} />
          </label>
          <label className="admin-field">
            <span>Primary brand color</span>
            <div className="color-input-row">
              <input type="color" value={primaryColor} aria-label="Choose primary color" onChange={(e) => setPrimaryColor(e.target.value)} />
              <input pattern="#[a-fA-F0-9]{6}" value={primaryColor} aria-label="Primary color hex" onChange={(e) => setPrimaryColor(e.target.value)} maxLength={7} />
            </div>
          </label>
          <label className="admin-field full">
            <span>Workspace OpenRouter API Key (shared across TALA, NYX, HERMES)</span>
            <input
              type="password"
              className="mono"
              value={openrouterKey}
              onChange={(e) => setOpenrouterKey(e.target.value)}
              placeholder="sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            />
            <small>Supports both Free ($0) and Paid OpenRouter models. Ready for GitHub / backend hookup.</small>
          </label>
        </div>

        <div className="code-heading" style={{ marginTop: 6 }}>
          <span>DEFAULT AGENT AUTOMATION RULES</span>
        </div>
        <div className="form-grid">
          {(["tala", "nyx", "hermes"] as AgentId[]).map((ag) => (
            <label key={ag} className="admin-field">
              <span>{ag.toUpperCase()} rule</span>
              <select
                value={rules[ag]}
                onChange={(e) => setRules({ ...rules, [ag]: e.target.value })}
              >
                {RULE_OPTIONS[ag].map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </label>
          ))}
        </div>

        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="dialog-footer">
          <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
          <button className="button primary" type="submit">
            {tenant ? <Pencil size={13} /> : <Plus size={14} />}
            {tenant ? "Save tenant settings" : "Create tenant"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function TenantDetails({ tenant, onClose }: { tenant: Tenant; onClose: () => void }) {
  const { session, setScope, navigate, setTenantDialog, act } = useAdmin();
  const [tab, setTab] = useState<"overview" | "leads" | "bookings">("overview");
  const scoped = getAdminData(session, tenant.id);

  return (
    <Modal
      title={`${tenant.name} — Workspace & Data Manager`}
      description="Inspect and manage all tenant records, agent configurations, and tools."
      onClose={onClose}
      wide
    >
      <div className="detail-tenant">
        <TenantMark tenant={tenant} size="large" />
        <div>
          <h3>{tenant.name}</h3>
          <p>{tenant.industry} / {tenant.slug}.core.app</p>
        </div>
        <Status value={tenant.status} />
      </div>

      <div className="filter-tabs" style={{ marginBottom: 16, borderBottom: "1px solid var(--admin-line)", paddingBottom: 10 }}>
        <button type="button" className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}>
          Overview & Settings
        </button>
        <button type="button" className={tab === "leads" ? "active" : ""} onClick={() => setTab("leads")}>
          Leads Data ({scoped.leads.length})
        </button>
        <button type="button" className={tab === "bookings" ? "active" : ""} onClick={() => setTab("bookings")}>
          Bookings Data ({scoped.bookings.length})
        </button>
      </div>

      {tab === "overview" && (
        <>
          <div className="detail-metrics">
            <div>
              <span>Leads</span>
              <strong>{scoped.leads.length}</strong>
            </div>
            <div>
              <span>Bookings</span>
              <strong>{scoped.bookings.length}</strong>
            </div>
            <div>
              <span>Enabled agents</span>
              <strong>{scoped.agents.filter((a) => a.enabled).length}/3</strong>
            </div>
          </div>

          <dl className="detail-list">
            <div>
              <dt>Tenant ID</dt>
              <dd className="mono small-text">{tenant.id}</dd>
            </div>
            <div>
              <dt>OpenRouter API Key</dt>
              <dd>{tenant.openrouter_api_key ? "Configured (sk-or-v1-••••)" : "Using Free Model / Rule Fallback"}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{fullDate(tenant.created_at)}</dd>
            </div>
            <div>
              <dt>Branding</dt>
              <dd>{tenant.branding_config.app_name} / {tenant.branding_config.theme}</dd>
            </div>
          </dl>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
            <button
              className="button secondary small"
              onClick={() => {
                setScope(tenant.id);
                navigate("agents");
                onClose();
              }}
            >
              <Bot size={13} />
              Agent & OpenRouter Settings
            </button>
            <button
              className="button secondary small"
              onClick={() => {
                setScope(tenant.id);
                navigate("tools");
                onClose();
              }}
            >
              <Wrench size={13} />
              Tools & Client Outcomes
            </button>
          </div>

          <div className="code-heading">RECENT ACTIVITY</div>
          <EventFeed events={scoped.events} limit={3} />
        </>
      )}

      {tab === "leads" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span className="subtle small-text">Manage leads for {tenant.name}</span>
            <button
              className="button secondary small"
              onClick={() => {
                setScope(tenant.id);
                navigate("leads");
                onClose();
              }}
            >
              Open full Leads manager
              <ArrowUpRight size={12} />
            </button>
          </div>
          <div style={{ maxHeight: 260, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            {scoped.leads.map((l) => (
              <div
                key={l.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 10px",
                  border: "1px solid var(--admin-line)",
                  borderRadius: 5,
                  background: "var(--admin-bg)",
                }}
              >
                <div>
                  <strong style={{ fontSize: 12, display: "block" }}>{l.name}</strong>
                  <small className="subtle" style={{ fontSize: 10 }}>{l.email} · {l.channel} · Score {l.score}</small>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Status value={l.status} />
                  <button
                    className="icon-button"
                    aria-label={`Delete ${l.name}`}
                    onClick={() => act(() => leadsApi.remove(session, tenant.id, l.id), `Deleted lead ${l.name}.`)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "bookings" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span className="subtle small-text">Manage bookings for {tenant.name}</span>
            <button
              className="button secondary small"
              onClick={() => {
                setScope(tenant.id);
                navigate("bookings");
                onClose();
              }}
            >
              Open full Bookings manager
              <ArrowUpRight size={12} />
            </button>
          </div>
          <div style={{ maxHeight: 260, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            {scoped.bookings.map((b) => (
              <div
                key={b.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 10px",
                  border: "1px solid var(--admin-line)",
                  borderRadius: 5,
                  background: "var(--admin-bg)",
                }}
              >
                <div>
                  <strong style={{ fontSize: 12, display: "block" }}>{b.guest} ({b.reference})</strong>
                  <small className="subtle" style={{ fontSize: 10 }}>{b.service} · {money(b.amount)}</small>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Status value={b.status} />
                  <button
                    className="icon-button"
                    aria-label={`Delete ${b.reference}`}
                    onClick={() => act(() => bookingsApi.remove(session, tenant.id, b.id), `Deleted booking ${b.reference}.`)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="dialog-footer">
        <button className="button danger small" onClick={() => setTenantDialog({ kind: "delete", id: tenant.id })}>
          <Trash2 size={13} />
          Delete tenant
        </button>
        <button className="button secondary" onClick={() => setTenantDialog({ kind: "edit", id: tenant.id })}>
          <Pencil size={13} />
          Edit settings
        </button>
        <button
          className="button primary"
          onClick={() => {
            setScope(tenant.id);
            navigate("dashboard");
            onClose();
          }}
        >
          Open workspace
          <ArrowUpRight size={14} />
        </button>
      </div>
    </Modal>
  );
}

function DeleteTenant({ tenant, onClose }: { tenant: Tenant; onClose: () => void }) {
  const { session, act } = useAdmin();
  const [confirm, setConfirm] = useState("");
  return (
    <Modal title={`Delete ${tenant.name}?`} description="This action cannot be undone." onClose={onClose}>
      <div className="delete-warning">
        <AlertTriangle size={22} />
        <p>
          This permanently removes this tenant and its leads, bookings, messages, events, users, and agent configurations. Other tenants are not affected.
        </p>
      </div>
      <label className="admin-field">
        <span>Type <strong>{tenant.name}</strong> to confirm</span>
        <input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" autoFocus />
      </label>
      <div className="dialog-footer">
        <button className="button secondary" onClick={onClose}>Keep tenant</button>
        <button
          className="button danger"
          disabled={confirm !== tenant.name}
          onClick={() => {
            if (act(() => tenantsApi.remove(session, tenant.id), `${tenant.name} and its scoped records deleted.`)) onClose();
          }}
        >
          <Trash2 size={14} />
          Delete tenant
        </button>
      </div>
    </Modal>
  );
}
