import { useMemo, useState, type FormEvent } from "react";
import { ArrowUpRight, Download, Pause, Play, Radio, Search } from "lucide-react";
import { eventsApi } from "../../../api/events";
import { AGENTS, AGENT_IDS } from "../../../config/platform";
import { DataTable, type Column } from "../../../components/tables/DataTable";
import type { AgentId, SystemEvent } from "../../../types/database";
import { useAdmin } from "../AdminContext";
import { EventDetail, Modal, PageHeader, ScopeFilter, Status, TenantMark, TenantSelect } from "../components/shared";
import { clock, download, errorMessage, shortDate } from "../utils";

export default function LogsPage() {
  const { data, allTenants, notify, scope } = useAdmin();
  const [query, setQuery] = useState("");
  const [agent, setAgent] = useState(() => { const value = new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("agent"); return AGENT_IDS.includes(value as AgentId) ? value! : "all"; });
  const [level, setLevel] = useState("all");
  const [frozen, setFrozen] = useState<{ scope: string; records: SystemEvent[] } | null>(null);
  const [selected, setSelected] = useState<SystemEvent | null>(null);
  const [simulate, setSimulate] = useState(false);
  const source = frozen?.scope === scope ? frozen.records.filter((event) => data.tenants.some((tenant) => tenant.id === event.tenant_id)) : data.events;
  const paused = frozen?.scope === scope;
  const records = useMemo(() => source.filter((event) => (agent === "all" || event.agent === agent || (agent === "admin" && !event.agent)) && (level === "all" || event.level === level) && `${event.type} ${event.message} ${JSON.stringify(event.payload)}`.toLowerCase().includes(query.toLowerCase())), [source, agent, level, query]);
  const columns: Column<SystemEvent>[] = [
    { key: "time", label: "Timestamp", sortValue: (event) => event.created_at, render: (event) => <span className="mono small-text">{clock(event.created_at)}<span className="table-subtext">{shortDate(event.created_at)}</span></span> },
    { key: "type", label: "Event", sortValue: (event) => event.type, render: (event) => <button className="event-type-cell" onClick={() => setSelected(event)}><code>{event.type}</code><span>{event.message}</span></button> },
    { key: "tenant", label: "Tenant", render: (event) => { const tenant = allTenants.find((t) => t.id === event.tenant_id); return tenant && <span className="tenant-inline"><TenantMark tenant={tenant} size="small"/>{tenant.name}</span>; } },
    { key: "agent", label: "Agent", render: (event) => event.agent ? <span className="agent-inline" style={{ color: AGENTS[event.agent].color }}>{AGENTS[event.agent].name}</span> : <span className="subtle">Admin</span> },
    { key: "level", label: "Result", render: (event) => <Status value={event.level}/> },
    { key: "payload", label: "Payload", render: (event) => <button className="payload-snippet mono" onClick={() => setSelected(event)}>{JSON.stringify(event.payload)}</button> },
    { key: "details", label: "", render: (event) => <button className="icon-button" title="Inspect event" aria-label={`Inspect ${event.type} event`} onClick={() => setSelected(event)}><ArrowUpRight size={14}/></button> },
  ];
  return <><PageHeader eyebrow="SYSTEM OBSERVABILITY" title="System logs" description="The full event trail. Every trigger, action, and result."><button className="button secondary" onClick={() => { download(JSON.stringify(records, null, 2), "scoped-events.json", "application/json"); notify(`Exported ${records.length} events.`); }}><Download size={14}/>Export logs</button><button className="button primary" onClick={() => setSimulate(true)}><Radio size={14}/>Simulate event</button></PageHeader><section className="panel"><div className="table-toolbar"><label className="table-search log-search"><Search size={14}/><input aria-label="Search events" placeholder="Search events or payloads..." value={query} onChange={(e) => setQuery(e.target.value)}/></label><button className="button secondary small" onClick={() => setFrozen(paused ? null : { scope, records: [...data.events] })}>{paused ? <Play size={12}/> : <Pause size={12}/>}{paused ? "Resume feed" : "Pause feed"}</button></div><div className="secondary-toolbar"><div className="table-filters"><ScopeFilter/><select value={agent} aria-label="Filter events by agent" onChange={(e) => setAgent(e.target.value)}><option value="all">All actors</option>{AGENT_IDS.map((id) => <option key={id} value={id}>{AGENTS[id].name}</option>)}<option value="admin">Administrator</option></select><select value={level} aria-label="Filter event result" onChange={(e) => setLevel(e.target.value)}><option value="all">All results</option><option value="success">Success</option><option value="info">Info</option><option value="warning">Warning</option><option value="error">Error</option></select></div><span className="live-indicator"><span className={`live-dot ${paused ? "paused" : "pulse"}`}/>{paused ? "Feed paused" : "Subscribed"}<span className="subtle">/ {records.length} events</span></span></div><DataTable data={records} columns={columns} label="System event logs" pageSize={10}/></section><p className="page-footnote">Events are generated by the local event bus. Pausing the feed freezes this view, not the agents. Export respects the current tenant and filters.</p>{selected && <EventDetail event={selected} onClose={() => setSelected(null)}/>} {simulate && <SimulateEvent onClose={() => setSimulate(false)}/>}</>;
}

function SimulateEvent({ onClose }: { onClose: () => void }) {
  const { scope, session, notify } = useAdmin();
  const [tenantId, setTenantId] = useState(scope === "all" ? "" : scope);
  const [agent, setAgent] = useState<AgentId>("tala");
  const [error, setError] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    try { eventsApi.trigger(session, tenantId, agent); notify(`${AGENTS[agent].name} workflow completed. Inspect the new events in the feed.`); onClose(); }
    catch (err) { setError(errorMessage(err)); }
  };
  return <Modal title="Simulate an event" description="Run a real workflow against the local mock database." onClose={onClose}><form onSubmit={submit}><TenantSelect value={tenantId} onChange={setTenantId}/><label className="admin-field"><span>Workflow</span><select value={agent} onChange={(e) => setAgent(e.target.value as AgentId)}><option value="tala">TALA / inbound inquiry and response</option><option value="nyx">NYX / follow-up and lead qualification</option><option value="hermes">HERMES / booking confirmation or record sync</option></select></label><p className="page-footnote">This creates tenant-scoped records and audit events. No external API is called and no real message is sent.</p>{error && <p className="form-error" role="alert">{error}</p>}<div className="dialog-footer"><button className="button secondary" type="button" onClick={onClose}>Cancel</button><button className="button primary" type="submit"><Play size={13}/>Run workflow</button></div></form></Modal>;
}