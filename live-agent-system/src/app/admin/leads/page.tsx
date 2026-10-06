import { useMemo, useState, type FormEvent } from "react";
import { Camera, Download, Globe, History, Mail, MessageCircle, Pencil, Plus, Search, Send, Trash2 } from "lucide-react";
import { leadsApi } from "../../../api/leads";
import { messagesApi } from "../../../api/messages";
import { AGENTS, AGENT_IDS } from "../../../config/platform";
import { DataTable, type Column } from "../../../components/tables/DataTable";
import type { AgentId, Channel, Lead, LeadStatus } from "../../../types/database";
import { useAdmin } from "../AdminContext";
import { RecordTimeline } from "../components/RecordTimeline";
import { Modal, PageHeader, ScopeFilter, Status, TenantMark, TenantSelect } from "../components/shared";
import { csv, download, errorMessage, fullDate, shortDate } from "../utils";

const statuses: LeadStatus[] = ["new", "contacted", "converted"];
const channelIcons = { Website: Globe, WhatsApp: MessageCircle, Instagram: Camera, Email: Mail };

export default function LeadsPage() {
  const { data, allTenants, session, act, notify } = useAdmin();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [agent, setAgent] = useState("all");
  const [create, setCreate] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const selected = data.leads.find((lead) => lead.id === selectedId);
  const records = useMemo(
    () =>
      data.leads.filter(
        (lead) =>
          (status === "all" || lead.status === status) &&
          (agent === "all" || lead.assigned_agent === agent) &&
          `${lead.name} ${lead.email} ${lead.inquiry}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [data.leads, query, status, agent],
  );

  const columns: Column<Lead>[] = [
    {
      key: "name",
      label: "Lead",
      sortValue: (lead) => lead.name,
      render: (lead) => (
        <button className="person-cell" onClick={() => setSelectedId(lead.id)}>
          <span className="person-initials">
            {lead.name.split(" ").slice(0, 2).map((p) => p[0]).join("")}
          </span>
          <span className="table-name">
            {lead.name}
            <span className="table-subtext">{lead.email}</span>
          </span>
        </button>
      ),
    },
    {
      key: "tenant",
      label: "Tenant",
      render: (lead) => {
        const tenant = allTenants.find((t) => t.id === lead.tenant_id);
        return (
          tenant && (
            <span className="tenant-inline">
              <TenantMark tenant={tenant} size="small" />
              {tenant.name}
            </span>
          )
        );
      },
    },
    {
      key: "source",
      label: "Source",
      render: (lead) => {
        const Icon = channelIcons[lead.channel];
        return (
          <span className="source-cell">
            <Icon size={12} />
            {lead.channel}
          </span>
        );
      },
    },
    {
      key: "status",
      label: "Status",
      sortValue: (lead) => lead.status,
      render: (lead) => (
        <select
          className="table-cell-select"
          aria-label={`Status of ${lead.name}`}
          value={lead.status}
          onChange={(e) =>
            act(
              () => leadsApi.update(session, lead.tenant_id, lead.id, { status: e.target.value as LeadStatus }),
              "Lead status updated.",
            )
          }
        >
          {statuses.map((value) => (
            <option key={value} value={value}>
              {value.charAt(0).toUpperCase() + value.slice(1)}
            </option>
          ))}
        </select>
      ),
    },
    {
      key: "agent",
      label: "Assigned agent",
      render: (lead) => (
        <select
          className="table-cell-select"
          value={lead.assigned_agent}
          aria-label={`Agent assigned to ${lead.name}`}
          onChange={(e) =>
            act(
              () => leadsApi.update(session, lead.tenant_id, lead.id, { assigned_agent: e.target.value as AgentId }),
              "Agent assignment updated.",
            )
          }
        >
          {AGENT_IDS.map((id) => (
            <option key={id} value={id}>
              {AGENTS[id].name}
            </option>
          ))}
        </select>
      ),
    },
    {
      key: "score",
      label: "Score",
      sortValue: (lead) => lead.score,
      render: (lead) => (
        <span className="score-cell">
          <span>
            <i style={{ width: `${lead.score}%` }} />
          </span>
          {lead.score}
        </span>
      ),
    },
    {
      key: "created",
      label: "Created",
      sortValue: (lead) => lead.created_at,
      render: (lead) => shortDate(lead.created_at),
    },
    {
      key: "actions",
      label: "",
      className: "align-right",
      render: (lead) => (
        <div className="inline-actions">
          <button
            className="icon-button"
            title="View lead history & messages"
            aria-label={`View history for ${lead.name}`}
            onClick={() => setSelectedId(lead.id)}
          >
            <History size={14} />
          </button>
          <button
            className="icon-button"
            title="Edit lead"
            aria-label={`Edit ${lead.name}`}
            onClick={() => setEditingLead(lead)}
          >
            <Pencil size={13} />
          </button>
          <button
            className="icon-button"
            title="Delete lead"
            aria-label={`Delete ${lead.name}`}
            onClick={() =>
              act(() => leadsApi.remove(session, lead.tenant_id, lead.id), `Lead ${lead.name} deleted.`)
            }
          >
            <Trash2 size={13} />
          </button>
        </div>
      ),
    },
  ];

  const exportLeads = () => {
    download(
      csv([
        ["id", "tenant_id", "name", "email", "channel", "status", "agent", "score", "inquiry", "created_at"],
        ...records.map((lead) => [
          lead.id,
          lead.tenant_id,
          lead.name,
          lead.email,
          lead.channel,
          lead.status,
          lead.assigned_agent,
          lead.score,
          lead.inquiry,
          lead.created_at,
        ]),
      ]),
      "leads.csv",
    );
    notify(`Exported ${records.length} scoped leads.`);
  };

  const sendManualReply = (e: FormEvent) => {
    e.preventDefault();
    if (!selected || !replyText.trim()) return;
    act(() => {
      messagesApi.create(session, selected.tenant_id, {
        lead_id: selected.id,
        agent: selected.assigned_agent,
        content: replyText.trim(),
        channel: selected.channel,
        direction: "outbound",
      });
      if (selected.status === "new") {
        leadsApi.update(session, selected.tenant_id, selected.id, { status: "contacted" });
      }
      setReplyText("");
    }, `Outbox reply logged for ${selected.name}.`);
  };

  return (
    <>
      <PageHeader
        eyebrow="TOOL 01 · LEAD CAPTURE & CRM"
        title="Leads management"
        description="Add, edit, score, and delete tenant leads captured by TALA and NYX."
      >
        <button className="button secondary" onClick={exportLeads}>
          <Download size={14} />
          Export
        </button>
        <button className="button primary" onClick={() => setCreate(true)}>
          <Plus size={15} />
          Add lead
        </button>
      </PageHeader>

      <section className="panel">
        <div className="table-toolbar">
          <div className="filter-tabs" role="group" aria-label="Lead status">
            {["all", ...statuses].map((value) => (
              <button
                key={value}
                aria-pressed={status === value}
                className={status === value ? "active" : ""}
                onClick={() => setStatus(value)}
              >
                {value === "all" ? `All leads (${data.leads.length})` : value.charAt(0).toUpperCase() + value.slice(1)}
              </button>
            ))}
          </div>
          <label className="table-search">
            <Search size={14} />
            <input
              placeholder="Search name, email, or inquiry..."
              aria-label="Search leads"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>

        <div className="secondary-toolbar">
          <div className="table-filters">
            <ScopeFilter />
            <select value={agent} aria-label="Filter assigned agent" onChange={(e) => setAgent(e.target.value)}>
              <option value="all">All agents</option>
              {AGENT_IDS.map((id) => (
                <option key={id} value={id}>
                  {AGENTS[id].name}
                </option>
              ))}
            </select>
          </div>
          <span>{records.length} matching leads</span>
        </div>

        <DataTable data={records} columns={columns} label="Lead management" />
      </section>

      {create && <LeadFormModal onClose={() => setCreate(false)} />}
      {editingLead && <LeadFormModal lead={editingLead} onClose={() => setEditingLead(null)} />}

      {selected && (
        <Modal
          title={selected.name}
          description={`${selected.email} · ${selected.channel}`}
          onClose={() => setSelectedId(null)}
          wide
        >
          <dl className="detail-list">
            <div>
              <dt>Status</dt>
              <dd><Status value={selected.status} /></dd>
            </div>
            <div>
              <dt>Assigned agent</dt>
              <dd>{AGENTS[selected.assigned_agent].name}</dd>
            </div>
            <div>
              <dt>Qualification score</dt>
              <dd>{selected.score}/100</dd>
            </div>
            <div>
              <dt>Received</dt>
              <dd>{fullDate(selected.created_at)}</dd>
            </div>
          </dl>

          <div className="inquiry-block">
            <span>INQUIRY</span>
            <p>{selected.inquiry}</p>
          </div>

          <form onSubmit={sendManualReply} style={{ display: "flex", gap: 8, marginBottom: 18 }}>
            <input
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder={`Send or log a ${selected.channel} reply as ${AGENTS[selected.assigned_agent].name}...`}
              style={{
                flex: 1,
                border: "1px solid var(--admin-line)",
                borderRadius: 5,
                background: "var(--admin-bg)",
                color: "var(--admin-text)",
                padding: "8px 11px",
                fontSize: 12,
              }}
            />
            <button type="submit" className="button primary small">
              <Send size={12} />
              Log reply
            </button>
          </form>

          <RecordTimeline tenant_id={selected.tenant_id} id={selected.id} kind="lead" />

          <div className="dialog-footer">
            <button
              className="button danger small"
              onClick={() => {
                if (act(() => leadsApi.remove(session, selected.tenant_id, selected.id), `Lead ${selected.name} deleted.`)) {
                  setSelectedId(null);
                }
              }}
            >
              <Trash2 size={13} />
              Delete lead
            </button>
            <button
              className="button secondary small"
              onClick={() => {
                setEditingLead(selected);
                setSelectedId(null);
              }}
            >
              <Pencil size={13} />
              Edit lead
            </button>
            <button className="button primary small" onClick={() => setSelectedId(null)}>
              Done
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

export function LeadFormModal({ lead, onClose }: { lead?: Lead; onClose: () => void }) {
  const { session, scope, notify } = useAdmin();
  const [tenantId, setTenantId] = useState(lead?.tenant_id ?? (scope === "all" ? "" : scope));
  const [name, setName] = useState(lead?.name ?? "");
  const [email, setEmail] = useState(lead?.email ?? "");
  const [channel, setChannel] = useState<Channel>(lead?.channel ?? "Website");
  const [status, setStatus] = useState<LeadStatus>(lead?.status ?? "new");
  const [assignedAgent, setAssignedAgent] = useState<AgentId>(lead?.assigned_agent ?? "tala");
  const [score, setScore] = useState(String(lead?.score ?? 65));
  const [inquiry, setInquiry] = useState(lead?.inquiry ?? "");
  const [error, setError] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    try {
      if (lead) {
        leadsApi.update(session, lead.tenant_id, lead.id, {
          name,
          email,
          channel,
          status,
          assigned_agent: assignedAgent,
          inquiry,
        });
        notify(`Lead ${name} updated.`);
      } else {
        leadsApi.create(session, tenantId, {
          name,
          email,
          channel,
          status,
          assigned_agent: assignedAgent,
          inquiry,
        });
        notify("Lead created. NYX will score it on the backend.");
      }
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Modal
      title={lead ? `Edit lead — ${lead.name}` : "Add a lead"}
      description="Create or edit a tenant-scoped lead record."
      onClose={onClose}
    >
      <form onSubmit={submit}>
        {!lead && <TenantSelect value={tenantId} onChange={setTenantId} />}
        <div className="form-grid">
          <label className="admin-field">
            <span>Full name</span>
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Isabella Cruz" maxLength={80} />
          </label>
          <label className="admin-field">
            <span>Email address</span>
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="isabella@example.com" />
          </label>
          <label className="admin-field">
            <span>Source channel</span>
            <select value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
              {Object.keys(channelIcons).map((source) => (
                <option key={source}>{source}</option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            <span>Lead status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as LeadStatus)}>
              {statuses.map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            <span>Assigned agent</span>
            <select value={assignedAgent} onChange={(e) => setAssignedAgent(e.target.value as AgentId)}>
              {AGENT_IDS.map((id) => (
                <option key={id} value={id}>{AGENTS[id].name}</option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            <span>Qualification score (0–100)</span>
            <input type="number" min="0" max="100" value={score} onChange={(e) => setScore(e.target.value)} />
          </label>
        </div>
        <label className="admin-field">
          <span>Inquiry details</span>
          <textarea required value={inquiry} onChange={(e) => setInquiry(e.target.value)} placeholder="What can we help this lead with?" maxLength={2000} />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="dialog-footer">
          <button className="button secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="button primary" type="submit">
            {lead ? <Pencil size={13} /> : <Plus size={14} />}
            {lead ? "Save lead" : "Create lead"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
