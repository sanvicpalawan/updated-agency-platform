import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  Copy,
  Download,
  FileCode2,
  MessageSquare,
  Play,
  Plus,
  Settings2,
  Share2,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Wrench,
} from "lucide-react";
import { getAdminData } from "../../../api/tenants";
import { toolsApi } from "../../../api/tools";
import {
  AGENTS,
  AGENT_IDS,
  createDefaultToolsConfig,
  mergeBehavior,
  mergeOpenRouter,
  TOOL_IDS,
} from "../../../config/platform";
import { db } from "../../../services/db";
import type { AgentId, Tenant, ToolId, ToolSetting } from "../../../types/database";
import { useAdmin, useTenantTarget } from "../AdminContext";
import {
  AgentMark,
  Modal,
  PageHeader,
  SectionHeading,
  Status,
  TenantMark,
  TenantSelect,
  Toggle,
  WorkspaceGate,
} from "../components/shared";
import { csv, download, errorMessage, fullDate, money, number, relative } from "../utils";

const TOOL_ICONS: Record<ToolId, typeof UsersRound> = {
  lead_capture: UsersRound,
  booking_engine: CalendarDays,
  whatsapp_responder: MessageSquare,
  ops_ledger: ShieldCheck,
};

export default function ToolsPage() {
  const { session, act, navigate, setScope, setTenantDialog, notify } = useAdmin();
  const { target, selectTarget } = useTenantTarget();
  const [editingTool, setEditingTool] = useState<ToolId | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const scoped = target ? getAdminData(session, target.id) : null;
  const tools = target ? (target.tools_config ?? createDefaultToolsConfig(target.slug)) : null;

  const exportGitHubConfig = () => {
    if (!target || !scoped || !tools) return;
    const bundle = {
      schema_version: "1.2.0",
      exported_at: new Date().toISOString(),
      tenant: {
        id: target.id,
        name: target.name,
        slug: target.slug,
        industry: target.industry,
        branding: target.branding_config,
        openrouter_env_var: "OPENROUTER_API_KEY",
        openrouter_key_configured: Boolean(target.openrouter_api_key),
      },
      agents: scoped.agents.map((a) => ({
        agent: a.agent,
        enabled: a.enabled,
        rule: target.rules[a.agent],
        openrouter: mergeOpenRouter(a.agent, a.openrouter),
        behavior: mergeBehavior(a.agent, a.behavior),
        parameters: a.config,
      })),
      tools: Object.values(tools),
    };
    download(JSON.stringify(bundle, null, 2), `${target.slug}-github-agent-tools.config.json`, "application/json");
    notify(`Exported GitHub-ready agent & tool config for ${target.name}.`);
  };

  return (
    <>
      <PageHeader
        eyebrow="AGENT TOOLS & CLIENT OUTCOMES"
        title="Tools & client outcomes"
        description="See what each tool does, how agents connect to tools, configure tool webhooks, and share organized outcomes with clients."
      >
        <button className="button secondary" onClick={exportGitHubConfig} disabled={!target}>
          <FileCode2 size={14} />
          Export GitHub config
        </button>
        <button className="button primary" onClick={() => setShareOpen(true)} disabled={!target}>
          <Share2 size={14} />
          Share outcomes with client
        </button>
      </PageHeader>

      {!target || !scoped || !tools ? (
        <WorkspaceGate
          onRetry={() => void db.load(true).catch(() => undefined)}
          title="No workspace selected"
          description="Create a tenant to configure its tools and share client outcomes."
          action={
            <button className="button primary" onClick={() => setTenantDialog({ kind: "create" })}>
              <Plus size={14} />
              Create tenant
            </button>
          }
        />
      ) : (
        <>
          <div className="context-toolbar">
            <div className="context-picker">
              <TenantSelect
                value={target.id}
                onChange={(id) => {
                  selectTarget(id);
                  setEditingTool(null);
                }}
                label="WORKSPACE TOOLS & OUTCOMES"
              />
            </div>
            <div className="context-note">
              <Wrench size={15} />
              <span>
                Showing connected tools and client outcomes for <strong>{target.name}</strong>.
              </span>
              <Status value={target.status} />
            </div>
          </div>

          {/* Clear Pipeline Architecture Diagram: Agent -> Tool -> Client Outcome */}
          <section className="panel" style={{ marginBottom: 22, padding: "18px 22px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
              <div>
                <span className="eyebrow" style={{ display: "block", marginBottom: 4 }}>HOW TOOLS WORK</span>
                <h2 style={{ fontSize: 14, fontWeight: 500 }}>Connected Pipeline: Agents → Tools → Client Outcomes</h2>
              </div>
              <button className="text-button" onClick={() => navigate("agents")}>
                Configure Agent AI & Behavior
                <ArrowRight size={12} />
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
              <div style={{ padding: 14, border: "1px solid var(--admin-line)", borderRadius: 6, background: "var(--admin-bg)" }}>
                <span className="eyebrow">01 · AUTONOMOUS AGENTS</span>
                <strong style={{ display: "block", fontSize: 12.5, marginTop: 4 }}>TALA · NYX · HERMES</strong>
                <p className="subtle" style={{ fontSize: 11, marginTop: 4 }}>
                  Powered by OpenRouter (Free or Paid models) + Behavioral prompts. Agents decide when to invoke a tool.
                </p>
              </div>
              <div style={{ padding: 14, border: "1px solid var(--admin-line)", borderRadius: 6, background: "var(--admin-bg)" }}>
                <span className="eyebrow">02 · OPERATIONAL TOOLS</span>
                <strong style={{ display: "block", fontSize: 12.5, marginTop: 4 }}>4 Connected System Tools</strong>
                <p className="subtle" style={{ fontSize: 11, marginTop: 4 }}>
                  Lead Capture CRM, Booking Scheduler, WhatsApp/Multi-Channel Responder, and Operations Ledger.
                </p>
              </div>
              <div style={{ padding: 14, border: "1px solid var(--admin-line)", borderRadius: 6, background: "var(--admin-bg)" }}>
                <span className="eyebrow">03 · CLIENT OUTCOMES</span>
                <strong style={{ display: "block", fontSize: 12.5, marginTop: 4 }}>Organized & Shareable Proof</strong>
                <p className="subtle" style={{ fontSize: 11, marginTop: 4 }}>
                  Every tool run produces measurable client outcomes (Leads, Bookings, Replies, Audit Logs) ready to share.
                </p>
              </div>
            </div>
          </section>

          {/* 4 Structured Tool Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 20, marginBottom: 24 }}>
            {TOOL_IDS.map((toolId) => {
              const tool = tools[toolId];
              const Icon = TOOL_ICONS[toolId];
              const convertedLeads = scoped.leads.filter((l) => l.status === "converted").length;
              const confirmedBookings = scoped.bookings.filter((b) => b.status === "confirmed");
              const confirmedRevenue = confirmedBookings.reduce((sum, b) => sum + b.amount, 0);
              const outboundMessages = scoped.messages.filter((m) => m.direction === "outbound").length;

              const outcomeSummary =
                toolId === "lead_capture"
                  ? `${scoped.leads.length} leads captured · ${convertedLeads} converted`
                  : toolId === "booking_engine"
                    ? `${scoped.bookings.length} bookings · ${money(confirmedRevenue)} confirmed value`
                    : toolId === "whatsapp_responder"
                      ? `${outboundMessages} automated replies & follow-ups sent`
                      : `${scoped.events.length} verified audit events & staff notices`;

              const outcomeItems =
                toolId === "lead_capture"
                  ? scoped.leads.slice(0, 3).map((l) => ({
                      id: l.id,
                      title: l.name,
                      sub: `${l.channel} · Score ${l.score}/100`,
                      badge: l.status,
                    }))
                  : toolId === "booking_engine"
                    ? scoped.bookings.slice(0, 3).map((b) => ({
                        id: b.id,
                        title: `${b.guest} (${b.reference})`,
                        sub: `${b.service} · ${money(b.amount)}`,
                        badge: b.status,
                      }))
                    : toolId === "whatsapp_responder"
                      ? scoped.messages.slice(0, 3).map((m) => ({
                          id: m.id,
                          title: `${m.agent.toUpperCase()} via ${m.channel}`,
                          sub: m.content.slice(0, 60) + (m.content.length > 60 ? "…" : ""),
                          badge: m.direction,
                        }))
                      : scoped.events.slice(0, 3).map((e) => ({
                          id: e.id,
                          title: e.message,
                          sub: `${e.type} · ${relative(e.created_at)}`,
                          badge: e.level,
                        }));

              return (
                <section key={toolId} className="panel" style={{ display: "flex", flexDirection: "column", padding: "20px 22px 0" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span className="workspace-icon">
                        <Icon size={18} />
                      </span>
                      <div>
                        <span className="eyebrow" style={{ display: "block", marginBottom: 2 }}>{tool.category}</span>
                        <h3 style={{ fontSize: 15, fontWeight: 500 }}>{tool.name}</h3>
                      </div>
                    </div>
                    <Toggle
                      checked={tool.enabled}
                      label={`Enable ${tool.name}`}
                      onChange={(enabled) =>
                        act(
                          () => toolsApi.update(session, target.id, toolId, { enabled }),
                          `${tool.name} ${enabled ? "enabled" : "disabled"}.`,
                        )
                      }
                    />
                  </div>

                  <p className="subtle" style={{ fontSize: 11.5, marginTop: 10, lineHeight: 1.6 }}>
                    {tool.description}
                  </p>

                  {/* Connected Agents */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginTop: 14, paddingBlock: 10, borderBlock: "1px solid var(--admin-line)" }}>
                    <span style={{ fontSize: 9, letterSpacing: "0.12em", color: "var(--admin-faint)" }}>USED BY AGENTS</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      {tool.assigned_agents.map((ag) => (
                        <span key={ag} className="live-indicator" style={{ color: AGENTS[ag].color }}>
                          <AgentMark agent={ag} size="small" />
                          {AGENTS[ag].name}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Tool Outcome Proof */}
                  <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 6, background: "var(--admin-bg)", border: "1px solid var(--admin-line)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="eyebrow" style={{ margin: 0 }}>CLIENT OUTCOME PRODUCED</span>
                      <span className="live-indicator">
                        {tool.share_with_client ? "Shared with client ✓" : "Internal only"}
                      </span>
                    </div>
                    <strong style={{ display: "block", fontSize: 14, marginTop: 6, color: "var(--admin-accent)" }}>
                      {outcomeSummary}
                    </strong>
                    <small className="subtle" style={{ display: "block", marginTop: 4, fontSize: 10 }}>
                      Webhook: <code>{tool.webhook_url}</code> · Env: <code>{tool.env_key_name}</code>
                    </small>
                  </div>

                  {/* Recent Outcome Items */}
                  <div style={{ marginTop: 14, flex: 1 }}>
                    <span style={{ display: "block", fontSize: 9, letterSpacing: "0.12em", color: "var(--admin-faint)", marginBottom: 8 }}>
                      RECENT OUTCOME RECORDS
                    </span>
                    {outcomeItems.length === 0 ? (
                      <p className="subtle" style={{ fontSize: 11, paddingBlock: 10 }}>No records yet. Run the tool to generate an outcome.</p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {outcomeItems.map((item) => (
                          <div
                            key={item.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 8,
                              padding: "7px 10px",
                              borderRadius: 4,
                              background: "var(--admin-surface-2)",
                              fontSize: 11,
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <strong style={{ display: "block", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {item.title}
                              </strong>
                              <small className="subtle" style={{ fontSize: 9.5 }}>{item.sub}</small>
                            </div>
                            <Status value={item.badge} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="agent-control-actions" style={{ marginTop: 14 }}>
                    <button className="button secondary small" onClick={() => setEditingTool(toolId)}>
                      <Settings2 size={12} />
                      Tool settings
                    </button>
                    <button
                      className="button primary small"
                      disabled={!tool.enabled}
                      onClick={() =>
                        act(
                          () => toolsApi.runTool(session, target.id, toolId),
                          `${tool.name} executed and recorded a new client outcome.`,
                        )
                      }
                    >
                      <Play size={12} />
                      Test tool
                    </button>
                  </div>

                  <button
                    className="agent-log-link"
                    onClick={() => {
                      setScope(target.id);
                      navigate(
                        toolId === "lead_capture"
                          ? "leads"
                          : toolId === "booking_engine"
                            ? "bookings"
                            : "logs",
                      );
                    }}
                  >
                    Manage all {tool.category.toLowerCase()} records
                    <ArrowRight size={12} />
                  </button>
                </section>
              );
            })}
          </div>

          {editingTool && (
            <ToolSettingsModal
              tenant={target}
              tool={tools[editingTool]}
              onClose={() => setEditingTool(null)}
              onSaved={(msg) => notify(msg)}
            />
          )}

          {shareOpen && (
            <ShareClientOutcomesModal
              tenant={target}
              onClose={() => setShareOpen(false)}
              onNotified={(msg) => notify(msg)}
            />
          )}
        </>
      )}
    </>
  );
}

function ToolSettingsModal({
  tenant,
  tool,
  onClose,
  onSaved,
}: {
  tenant: Tenant;
  tool: ToolSetting;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const { session } = useAdmin();
  const [draft, setDraft] = useState<ToolSetting>({ ...tool, assigned_agents: [...tool.assigned_agents] });
  const [error, setError] = useState("");

  const toggleAgent = (ag: AgentId) => {
    setDraft((prev) => ({
      ...prev,
      assigned_agents: prev.assigned_agents.includes(ag)
        ? prev.assigned_agents.filter((a) => a !== ag)
        : [...prev.assigned_agents, ag],
    }));
  };

  const save = () => {
    setError("");
    if (!draft.name.trim() || !draft.webhook_url.trim()) {
      setError("Tool name and webhook endpoint URL are required.");
      return;
    }
    if (draft.assigned_agents.length === 0) {
      setError("Assign at least one agent to this tool.");
      return;
    }
    try {
      toolsApi.update(session, tenant.id, tool.id, draft);
      onSaved(`${draft.name} settings saved for ${tenant.name}.`);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Modal
      title={`${tool.name} — Tool Settings`}
      description={`Configure agent permissions, webhook endpoints, and client outcome visibility for ${tenant.name}.`}
      onClose={onClose}
      wide
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", border: "1px solid var(--admin-line)", borderRadius: 6, background: "var(--admin-bg)", marginBottom: 16 }}>
        <div>
          <strong style={{ fontSize: 12, display: "block" }}>Enable {draft.name}</strong>
          <span className="subtle" style={{ fontSize: 11 }}>Allow assigned agents to invoke this tool during automated workflows.</span>
        </div>
        <Toggle checked={draft.enabled} label="Enable tool" onChange={(enabled) => setDraft({ ...draft, enabled })} />
      </div>

      <div className="form-grid">
        <label className="admin-field">
          <span>Tool Display Name</span>
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </label>
        <label className="admin-field">
          <span>Client Outcome Label</span>
          <input value={draft.outcome_label} onChange={(e) => setDraft({ ...draft, outcome_label: e.target.value })} />
        </label>
        <label className="admin-field full">
          <span>Tool Description</span>
          <textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} rows={2} />
        </label>
        <label className="admin-field">
          <span>Backend Webhook / Endpoint URL</span>
          <input
            className="mono"
            value={draft.webhook_url}
            onChange={(e) => setDraft({ ...draft, webhook_url: e.target.value })}
            placeholder="https://api.yourdomain.com/v1/tools/..."
          />
          <small>Ready to connect when deployed from GitHub.</small>
        </label>
        <label className="admin-field">
          <span>Environment Secret Variable Name</span>
          <input
            className="mono"
            value={draft.env_key_name}
            onChange={(e) => setDraft({ ...draft, env_key_name: e.target.value })}
            placeholder="TOOL_WEBHOOK_SECRET"
          />
          <small>Referenced in your backend environment config.</small>
        </label>
      </div>

      <div className="admin-field">
        <span>Agents Allowed to Use This Tool</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {AGENT_IDS.map((ag) => {
            const checked = draft.assigned_agents.includes(ag);
            return (
              <label
                key={ag}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 12px",
                  border: checked ? "1px solid var(--admin-accent)" : "1px solid var(--admin-line)",
                  borderRadius: 5,
                  background: checked ? "var(--admin-soft)" : "var(--admin-bg)",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleAgent(ag)}
                  style={{ width: "auto" }}
                />
                <AgentMark agent={ag} size="small" />
                <div>
                  <strong style={{ display: "block", fontSize: 11 }}>{AGENTS[ag].name}</strong>
                  <small className="subtle" style={{ fontSize: 9.5 }}>{AGENTS[ag].role}</small>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", border: "1px solid var(--admin-line)", borderRadius: 6, background: "var(--admin-bg)" }}>
        <div>
          <strong style={{ fontSize: 12, display: "block" }}>Include in Client Outcome Report</strong>
          <span className="subtle" style={{ fontSize: 11 }}>Show this tool's results when sharing outcomes with {tenant.name}.</span>
        </div>
        <Toggle
          checked={draft.share_with_client}
          label="Share with client"
          onChange={(share_with_client) => setDraft({ ...draft, share_with_client })}
        />
      </div>

      {error && <div className="form-error" role="alert">{error}</div>}

      <div className="dialog-footer">
        <button className="button secondary" onClick={onClose}>Cancel</button>
        <button className="button primary" onClick={save}>
          <Check size={14} />
          Save tool settings
        </button>
      </div>
    </Modal>
  );
}

export function ShareClientOutcomesModal({
  tenant,
  onClose,
  onNotified,
}: {
  tenant: Tenant;
  onClose: () => void;
  onNotified: (msg: string) => void;
}) {
  const { session } = useAdmin();
  const scoped = getAdminData(session, tenant.id);
  const tools = tenant.tools_config ?? createDefaultToolsConfig(tenant.slug);
  const sharedTools = TOOL_IDS.map((id) => tools[id]).filter((t) => t.share_with_client);

  const qualifiedLeads = scoped.leads.filter((l) => l.status !== "new").length;
  const convertedLeads = scoped.leads.filter((l) => l.status === "converted").length;
  const confirmedBookings = scoped.bookings.filter((b) => b.status === "confirmed" || b.status === "completed");
  const totalRevenue = confirmedBookings.reduce((sum, b) => sum + b.amount, 0);
  const repliesSent = scoped.messages.filter((m) => m.direction === "outbound").length;

  const summaryText = [
    `${tenant.branding_config.app_name} — Automated Operations & Tool Outcomes Report`,
    `Workspace: ${tenant.name} (${tenant.slug}.core.app) | Status: ${tenant.status.toUpperCase()}`,
    `------------------------------------------------------------`,
    `• Lead Capture & CRM Tool (TALA + NYX): ${scoped.leads.length} inquiries captured, ${qualifiedLeads} qualified, ${convertedLeads} converted.`,
    `• Booking & Reservation Engine (TALA + HERMES): ${confirmedBookings.length} confirmed bookings (${money(totalRevenue)} pipeline value).`,
    `• WhatsApp & Multi-Channel Responder (TALA + NYX): ${repliesSent} automated replies and follow-ups delivered.`,
    `• Operations & Audit Ledger (HERMES): ${scoped.events.length} verified system actions logged.`,
    `------------------------------------------------------------`,
    `Active Agents: ${scoped.agents.filter((a) => a.enabled).map((a) => `${a.agent.toUpperCase()} (${a.openrouter?.model_tier ?? "free"} model)`).join(", ")}`,
  ].join("\n");

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(summaryText);
      onNotified(`Client outcome summary copied for ${tenant.name}.`);
    } catch {
      onNotified("Select and copy the summary text below.");
    }
  };

  const downloadClientCsv = () => {
    const rows = [
      ["tool_id", "tool_name", "assigned_agents", "outcome_label", "records_count", "latest_outcome"],
      [
        "lead_capture",
        tools.lead_capture.name,
        tools.lead_capture.assigned_agents.join("+"),
        tools.lead_capture.outcome_label,
        scoped.leads.length,
        `${convertedLeads} converted leads`,
      ],
      [
        "booking_engine",
        tools.booking_engine.name,
        tools.booking_engine.assigned_agents.join("+"),
        tools.booking_engine.outcome_label,
        confirmedBookings.length,
        `${money(totalRevenue)} confirmed booking value`,
      ],
      [
        "whatsapp_responder",
        tools.whatsapp_responder.name,
        tools.whatsapp_responder.assigned_agents.join("+"),
        tools.whatsapp_responder.outcome_label,
        repliesSent,
        `${repliesSent} automated guest responses`,
      ],
      [
        "ops_ledger",
        tools.ops_ledger.name,
        tools.ops_ledger.assigned_agents.join("+"),
        tools.ops_ledger.outcome_label,
        scoped.events.length,
        `${scoped.events.length} verified audit events`,
      ],
    ];
    download(csv(rows), `${tenant.slug}-client-outcomes.csv`);
    onNotified(`Downloaded client outcome report CSV for ${tenant.name}.`);
  };

  return (
    <Modal
      title={`Client Outcomes Report — ${tenant.name}`}
      description="Organized outcomes from all connected tools and agents, ready to share with your client."
      onClose={onClose}
      wide
    >
      <div className="detail-tenant" style={{ marginBottom: 16 }}>
        <TenantMark tenant={tenant} size="large" />
        <div>
          <h3>{tenant.branding_config.app_name}</h3>
          <p>Client Outcome Summary · {sharedTools.length} tools shared with client</p>
        </div>
        <button
          className="button secondary small"
          style={{ marginLeft: "auto" }}
          onClick={() => {
            try { localStorage.setItem("core.admin.scope", tenant.id); } catch { /* ignore */ }
            window.location.hash = "#/console";
            onClose();
          }}
        >
          Open Client Live View
          <ArrowUpRight size={13} />
        </button>
      </div>

      <div className="detail-metrics" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div>
          <span>Leads Captured</span>
          <strong>{number(scoped.leads.length)}</strong>
          <small className="subtle" style={{ fontSize: 10 }}>{convertedLeads} converted</small>
        </div>
        <div>
          <span>Confirmed Bookings</span>
          <strong>{number(confirmedBookings.length)}</strong>
          <small className="subtle" style={{ fontSize: 10 }}>{money(totalRevenue)} value</small>
        </div>
        <div>
          <span>Automated Replies</span>
          <strong>{number(repliesSent)}</strong>
          <small className="subtle" style={{ fontSize: 10 }}>&lt;30s avg SLA</small>
        </div>
        <div>
          <span>Audit Actions</span>
          <strong>{number(scoped.events.length)}</strong>
          <small className="subtle" style={{ fontSize: 10 }}>100% logged</small>
        </div>
      </div>

      <SectionHeading
        title="Outcomes by Connected Tool"
        description="Each outcome is mapped to the tool and agent that produced it."
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
        {sharedTools.map((tool) => (
          <div key={tool.id} style={{ padding: 12, border: "1px solid var(--admin-line)", borderRadius: 6, background: "var(--admin-bg)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontSize: 12 }}>{tool.name}</strong>
              <span className="mono" style={{ fontSize: 10, color: "var(--admin-accent)" }}>
                {tool.assigned_agents.map((a) => a.toUpperCase()).join(" + ")}
              </span>
            </div>
            <p className="subtle" style={{ fontSize: 10.5, marginTop: 4 }}>{tool.outcome_label}</p>
            <small className="subtle" style={{ display: "block", marginTop: 6, fontSize: 9.5 }}>
              Last outcome: {tool.last_outcome} ({tool.last_run_at ? fullDate(tool.last_run_at) : "Ready"})
            </small>
          </div>
        ))}
      </div>

      <div className="code-heading">
        <span>SHAREABLE CLIENT SUMMARY (WHATSAPP / EMAIL / PORTAL)</span>
        <button type="button" className="text-button" onClick={copySummary}>
          <Copy size={13} /> Copy summary
        </button>
      </div>
      <pre className="json-preview" style={{ fontSize: 11 }}>{summaryText}</pre>

      <div className="dialog-footer">
        <button className="button secondary" onClick={downloadClientCsv}>
          <Download size={14} />
          Download Client CSV
        </button>
        <button className="button primary" onClick={copySummary}>
          <Sparkles size={14} />
          Copy Report for Client
        </button>
      </div>
    </Modal>
  );
}
