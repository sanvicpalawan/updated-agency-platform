import { useMemo, useState } from "react";
import { ArrowUpRight, Download, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { DataTable, type Column } from "../../../components/tables/DataTable";
import { AGENTS, AGENT_IDS } from "../../../config/platform";
import type { Tenant } from "../../../types/database";
import { useAdmin } from "../AdminContext";
import { PageHeader, Status, TenantMark } from "../components/shared";
import { csv, download, shortDate } from "../utils";

export default function TenantsPage() {
  const { data, setTenantDialog, notify } = useAdmin();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const records = useMemo(() => data.tenants.filter((t) => (status === "all" || t.status === status) && `${t.name} ${t.slug} ${t.industry}`.toLowerCase().includes(search.toLowerCase())), [data.tenants, status, search]);
  const columns: Column<Tenant>[] = [
    { key: "name", label: "Tenant workspace", sortValue: (t) => t.name, render: (t) => <button className="tenant-cell" onClick={() => setTenantDialog({ kind: "view", id: t.id })}><TenantMark tenant={t}/><span className="table-name">{t.name}<span className="table-subtext">{t.slug}.core.app</span></span></button> },
    { key: "industry", label: "Business type", render: (t) => t.industry },
    { key: "status", label: "Status", sortValue: (t) => t.status, render: (t) => <Status value={t.status}/> },
    { key: "agents", label: "Agents", render: (t) => <span className="agent-mini-dots">{AGENT_IDS.map((id) => <i key={id} style={{ background: data.agents.some((a) => a.agent === id && a.tenant_id === t.id && a.enabled) && t.status === "active" ? AGENTS[id].color : "var(--admin-line)" }}/>) }<span>{data.agents.filter((a) => a.tenant_id === t.id && a.enabled).length}/3</span></span> },
    { key: "leads", label: "Leads", sortValue: (t) => data.leads.filter((l) => l.tenant_id === t.id).length, render: (t) => data.leads.filter((l) => l.tenant_id === t.id).length },
    { key: "bookings", label: "Bookings", sortValue: (t) => data.bookings.filter((b) => b.tenant_id === t.id).length, render: (t) => data.bookings.filter((b) => b.tenant_id === t.id).length },
    { key: "created", label: "Created", sortValue: (t) => t.created_at, render: (t) => shortDate(t.created_at) },
    { key: "actions", label: "", className: "align-right", render: (t) => <div className="inline-actions"><button className="icon-button" aria-label={`View ${t.name}`} title="View workspace" onClick={() => setTenantDialog({ kind: "view", id: t.id })}><ArrowUpRight size={14}/></button><button className="icon-button" aria-label={`Edit ${t.name}`} title="Edit tenant" onClick={() => setTenantDialog({ kind: "edit", id: t.id })}><Pencil size={13}/></button><button className="icon-button" aria-label={`Delete ${t.name}`} title="Delete tenant" onClick={() => setTenantDialog({ kind: "delete", id: t.id })}><Trash2 size={13}/></button></div> },
  ];
  const exportTenants = () => {
    download(csv([["id", "name", "slug", "industry", "status", "created_at"], ...records.map((t) => [t.id, t.name, t.slug, t.industry, t.status, t.created_at])]), "tenants.csv");
    notify(`Exported ${records.length} tenants.`);
  };
  return <><PageHeader eyebrow="WORKSPACE MANAGEMENT" title="Tenants" description="Independent brands. One shared operating system."><button className="button secondary" onClick={exportTenants}><Download size={14}/>Export</button><button className="button primary" onClick={() => setTenantDialog({ kind: "create" })}><Plus size={15}/>Add tenant</button></PageHeader><section className="panel"><div className="table-toolbar"><div className="filter-tabs" role="group" aria-label="Tenant status">{["all", "active", "paused", "setup"].map((value) => <button key={value} aria-pressed={status === value} className={status === value ? "active" : ""} onClick={() => setStatus(value)}>{value === "all" ? `All tenants (${data.tenants.length})` : value === "setup" ? "Setting up" : value.charAt(0).toUpperCase() + value.slice(1)}</button>)}</div><label className="table-search"><Search size={14}/><input placeholder="Search tenants..." aria-label="Search tenants" value={search} onChange={(e) => setSearch(e.target.value)}/></label></div><DataTable data={records} columns={columns} label="Tenants" pageSize={10}/></section><p className="page-footnote">Each tenant has an isolated workspace, agent configuration, and brand identity. Displayed domains are mock deployment labels.</p></>;
}