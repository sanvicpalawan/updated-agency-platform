import { Activity, ArrowDownToLine, ArrowRight, ArrowUpRight, Bot, Building2, CalendarDays, ChevronDown, Plus, ShieldCheck, UsersRound } from "lucide-react";
import { AGENTS, AGENT_IDS } from "../../../config/platform";
import { ActivityChart, Sparkline } from "../../../components/charts/ActivityChart";
import { DataTable, type Column } from "../../../components/tables/DataTable";
import type { Tenant } from "../../../types/database";
import { useAdmin } from "../AdminContext";
import { AgentMark, EmptyState, EventFeed, PageHeader, SectionHeading, Status, TenantMark } from "../components/shared";
import { inPeriod, number, PERIODS, type Period } from "../utils";

export default function DashboardPage() {
  const { data, allTenants, tenant, period, setPeriod, navigate, setTenantDialog, live } = useAdmin();
  const leads = data.leads.filter((item) => inPeriod(item.created_at, period));
  const bookings = data.bookings.filter((item) => inPeriod(item.created_at, period));
  const actions = data.events.filter((item) => inPeriod(item.created_at, period) && item.agent && item.level === "success");
  const activeTenants = data.tenants.filter((item) => item.status === "active").length;
  const metrics = [
    { label: "Total tenants", count: data.tenants.length, icon: Building2, detail: `${activeTenants} active`, note: "workspaces", dates: data.tenants.map((item) => item.created_at) },
    { label: "Total leads", count: leads.length, icon: UsersRound, detail: `${leads.filter((item) => item.status === "new").length} new`, note: "in the pipeline", dates: leads.map((item) => item.created_at) },
    { label: "Total bookings", count: bookings.length, icon: CalendarDays, detail: `${bookings.filter((item) => item.status === "confirmed").length} confirmed`, note: "and assigned", dates: bookings.map((item) => item.created_at) },
    { label: "Automated actions", count: actions.length, icon: Activity, detail: `${AGENT_IDS.filter((id) => data.agents.some((a) => a.agent === id && a.enabled)).length} agents`, note: "at work", dates: actions.map((item) => item.created_at) },
  ];
  const tenantColumns: Column<Tenant>[] = [
    { key: "name", label: "Tenant", render: (item) => <button className="tenant-cell" onClick={() => setTenantDialog({ kind: "view", id: item.id })}><TenantMark tenant={item}/><span className="table-name">{item.name}<span className="table-subtext">{item.slug}.core.app</span></span></button> },
    { key: "status", label: "Status", render: (item) => <Status value={item.status}/> },
    { key: "agents", label: "Agents", render: (item) => <span className="agent-mini-dots">{AGENT_IDS.map((id) => <i key={id} style={{ background: data.agents.find((a) => a.agent === id && a.tenant_id === item.id)?.enabled && item.status === "active" ? AGENTS[id].color : "var(--admin-line)" }}/>)}</span> },
    { key: "leads", label: "Leads", className: "align-right", render: (item) => number(data.leads.filter((lead) => lead.tenant_id === item.id).length) },
    { key: "open", label: <span className="sr-only">View tenant</span>, className: "align-right", render: (item) => <button className="icon-button" onClick={() => setTenantDialog({ kind: "view", id: item.id })} aria-label={`View ${item.name}`}><ArrowUpRight size={14}/></button> },
  ];

  return <><PageHeader eyebrow="CONTROL CENTER" title={tenant ? `${tenant.name} overview` : "Operations overview"} description="One view of every tenant, agent, and workflow."><label className="period-select"><CalendarDays size={13}/><select value={period} aria-label="Reporting period" onChange={(e) => setPeriod(e.target.value as Period)}>{Object.entries(PERIODS).map(([value, option]) => <option key={value} value={value}>{option.label}</option>)}</select><ChevronDown size={12}/></label><button className="button primary" onClick={() => setTenantDialog({ kind: "create" })}><Plus size={15}/>Add tenant</button></PageHeader>
    <div className="metric-row">{metrics.map((metric, index) => {
      const bins = Array.from({ length: 10 }, (_, i) => metric.dates.filter((date) => { const age = Date.now() - Date.parse(date); const span = PERIODS[period].milliseconds / 10; return age >= (9 - i) * span && age < (10 - i) * span; }).length);
      return <div className="metric-block" key={metric.label}><div className="metric-label"><metric.icon/>{metric.label}</div><div className="metric-number">{number(metric.count)}</div><Sparkline values={index === 0 ? data.tenants.map((_, i) => i + 1) : bins} variant={index % 2}/><div className="metric-bottom"><span className="metric-change"><ArrowUpRight size={11}/>{metric.detail}</span><span>{metric.note}</span></div></div>;
    })}</div>
    <div className="dashboard-top"><ActivityChart data={data} period={period}/><section className="panel agent-workforce"><SectionHeading title="Agent workforce" action={<span className="live-indicator"><span className="live-dot"/>{AGENT_IDS.filter((id) => data.agents.some((a) => a.agent === id && a.enabled && data.tenants.some((t) => t.id === a.tenant_id && t.status === "active"))).length}/3 online</span>}/><div className="workforce-list">{AGENT_IDS.map((id) => {
      const enabled = data.agents.filter((a) => a.agent === id && a.enabled && data.tenants.some((t) => t.id === a.tenant_id && t.status === "active"));
      const count = actions.filter((event) => event.agent === id).length;
      return <button key={id} className="workforce-entry" onClick={() => navigate("agents")}><AgentMark agent={id}/><div className="workforce-copy"><div className="workforce-title">{AGENTS[id].name}<Status value={enabled.length ? "active" : "paused"}/></div><div className="workforce-role">{AGENTS[id].role}</div><div className="workforce-activity"><strong>{count} actions</strong><span>/ across {enabled.length} {enabled.length === 1 ? "tenant" : "tenants"}</span></div></div></button>;
    })}</div><div className="workforce-footer"><span><Bot size={11} style={{ display: "inline", marginRight: 5 }}/>Rule-based. Tenant-scoped.</span><button className="text-button" onClick={() => navigate("agents")}>Manage agents<ArrowRight size={12}/></button></div></section></div>
    <div className="dashboard-bottom"><section className="panel"><SectionHeading title={<>Tenant workspaces<span className="section-count">{data.tenants.length}</span></>} action={<button className="text-button" onClick={() => navigate("tenants")}>View all<ArrowUpRight size={12}/></button>}/>{data.tenants.length ? <DataTable data={data.tenants.slice(0, 5)} columns={tenantColumns} label="Tenant workspaces" compact/> : <EmptyState title="Your first workspace starts here" description="Create a tenant to activate its agents and branding." action={<button className="button primary" onClick={() => setTenantDialog({ kind: "create" })}><Plus size={14}/>Create tenant</button>}/>}<button className="table-footer-link" onClick={() => navigate("tenants")}>Manage {allTenants.length} tenant workspaces<ArrowRight size={12}/></button></section><section className="panel"><SectionHeading title="Live activity" action={<span className="live-indicator"><span className={`live-dot ${live ? "pulse" : "paused"}`}/>{live ? "LIVE" : "PAUSED"}</span>}/><EventFeed events={data.events} limit={5}/><button className="table-footer-link" onClick={() => navigate("logs")}>Open system logs<ArrowRight size={12}/></button></section></div>
    <div className="dashboard-note"><ShieldCheck size={13}/><span>Every workspace is isolated. All agents run on the same system.</span><a href="#/admin/logs"><ArrowDownToLine size={11}/>Inspect the event trail</a></div>
  </>;
}