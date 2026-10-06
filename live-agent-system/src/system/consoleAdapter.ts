import { useSyncExternalStore } from "react";
import { agentsApi } from "../api/agents";
import { bookingsApi } from "../api/bookings";
import { eventsApi } from "../api/events";
import { leadsApi } from "../api/leads";
import { getAdminData, tenantsApi } from "../api/tenants";
import { toolsApi } from "../api/tools";
import {
  AGENT_IDS,
  createDefaultToolsConfig,
  DEFAULT_AGENT_BEHAVIOR,
  DEFAULT_AGENT_OPENROUTER,
  DEFAULT_RULES,
  MOCK_ADMIN,
  TOOL_IDS,
} from "../config/platform";
import { resolveTenant } from "../core/tenantResolver";
import { db } from "../services/db";
import type {
  AgentBehaviorConfig,
  AgentId as WorkerId,
  AgentOpenRouterConfig,
  AdminData,
  Channel as DbChannel,
  Tenant,
  ToolId,
} from "../types/database";
import type {
  AgentId,
  AgentState,
  Autonomy,
  Channel,
  ConsoleToolSummary,
  LedgerEntry,
  LedgerKey,
  OverlayKind,
  PipelineEntry,
  StageKey,
  SystemState,
} from "./types";

const channels: Record<string, Channel> = { Website: "WEB", WhatsApp: "WHATSAPP", Instagram: "INSTAGRAM", Email: "EMAIL", Internal: "INTERNAL" };
const defaultConsoleConfig: NonNullable<Tenant["console_config"]> = { autonomy: 3, channels: { whatsapp: true, instagram: true, web: true, voice: false, email: true } };
const channelNames = { whatsapp: "WhatsApp / mock", instagram: "Instagram / mock", web: "Website form", voice: "Voice / not connected", email: "Email / mock outbox" };
const emptyData: AdminData = { tenants: [], agents: [], leads: [], bookings: [], messages: [], events: [] };

class ConsoleAdapter {
  private tenantId: string | null = null;
  private mode: SystemState["mode"] = "SYSTEM";
  private overlay: OverlayKind = null;
  private openedAt = Date.now();
  private tick = 0;
  private lastCommand: SystemState["lastCommand"] = null;
  private state: SystemState;
  private listeners = new Set<() => void>();
  private clock: number | null = null;
  private simulator: number | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor() {
    this.selectStoredTenant();
    this.state = this.derive();
  }

  private selectStoredTenant() {
    const tenants = tenantsApi.list(MOCK_ADMIN);
    let stored = "";
    try { stored = localStorage.getItem("core.admin.scope") ?? ""; } catch { /* fallback */ }
    this.tenantId = tenants.find((tenant) => tenant.id === stored)?.id ?? tenants[0]?.id ?? null;
  }

  private tenant(): Tenant | undefined {
    return tenantsApi.list(MOCK_ADMIN).find((tenant) => tenant.id === this.tenantId);
  }

  private context() {
    if (!this.tenantId) throw new Error("Create a tenant in the admin console first.");
    return resolveTenant(MOCK_ADMIN, this.tenantId);
  }

  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.state;

  private refresh = () => {
    this.tick += 1;
    this.state = this.derive();
    this.listeners.forEach((listener) => listener());
  };

  boot() {
    this.stop();
    this.selectStoredTenant();
    void db.load().catch(() => undefined);
    this.unsubscribe = db.subscribe(this.refresh);
    this.clock = window.setInterval(this.refresh, 1000);
    let turn = 0;
    this.simulator = window.setInterval(() => {
      const tenant = this.tenant();
      if (!tenant || tenant.status !== "active") return;
      try { eventsApi.trigger(MOCK_ADMIN, tenant.id, AGENT_IDS[turn++ % AGENT_IDS.length], true); }
      catch { /* Disabled or manual agents remain idle. */ }
    }, 18_000);
    this.refresh();
  }

  stop() {
    if (this.clock !== null) window.clearInterval(this.clock);
    if (this.simulator !== null) window.clearInterval(this.simulator);
    this.clock = null; this.simulator = null;
    this.unsubscribe?.(); this.unsubscribe = null;
  }

  /**
   * Publish an event to the backend pipeline. Fire-and-forget from the console's
   * synchronous command wrapper; the cache refresh picks up the result.
   */
  private publish(type: string, message: string, payload: Record<string, unknown> = {}, level?: "info" | "success" | "warning" | "error") {
    void eventsApi
      .publish(MOCK_ADMIN, this.context().tenant_id, { type, message, payload, level })
      .catch(() => undefined);
  }

  private command(label: string, action: () => void) {
    try { action(); this.lastCommand = { label, ts: Date.now(), ok: true }; }
    catch (error) { this.lastCommand = { label: error instanceof Error ? error.message : "Command failed", ts: Date.now(), ok: false }; }
    this.refresh();
  }

  switchTenant(id: string) {
    const found = tenantsApi.list(MOCK_ADMIN).find((t) => t.id === id);
    if (!found) return;
    this.tenantId = found.id;
    try { localStorage.setItem("core.admin.scope", found.id); } catch { /* ignore */ }
    this.command(`Switched to ${found.name}`, () => {});
  }

  setMode(mode: SystemState["mode"]) { this.mode = mode; this.refresh(); }
  setOverlay(overlay: OverlayKind) { this.overlay = overlay; this.refresh(); }

  setBrandName(name: string) {
    if (!name.trim()) return;
    this.command("Brand identity saved", () => {
      const tenant = db.getTenant(this.context());
      tenantsApi.update(MOCK_ADMIN, tenant.id, { branding_config: { ...tenant.branding_config, app_name: name } });
    });
  }

  setBrandType(type: string) {
    this.command("Business type saved", () => { tenantsApi.update(MOCK_ADMIN, this.context().tenant_id, { industry: type }); });
  }

  setOpenRouterKey(apiKey: string) {
    this.command("OpenRouter API key saved", () => {
      const tenant = db.getTenant(this.context());
      tenantsApi.update(MOCK_ADMIN, tenant.id, { openrouter_api_key: apiKey.trim() });
    });
  }

  updateAgentSettings(
    agent: WorkerId,
    patch: {
      openrouter?: Partial<AgentOpenRouterConfig>;
      behavior?: Partial<AgentBehaviorConfig>;
      enabled?: boolean;
    },
  ) {
    this.command(`${agent.toUpperCase()} settings saved`, () => {
      agentsApi.update(MOCK_ADMIN, this.context().tenant_id, agent, patch);
    });
  }

  runTool(toolId: ToolId) {
    this.command(`Executed tool ${toolId}`, () => {
      toolsApi.runTool(MOCK_ADMIN, this.context().tenant_id, toolId);
    });
  }

  toggleTool(toolId: ToolId, enabled: boolean) {
    this.command(`${toolId} ${enabled ? "enabled" : "disabled"}`, () => {
      toolsApi.update(MOCK_ADMIN, this.context().tenant_id, toolId, { enabled });
    });
  }

  createLead(input: { name: string; email: string; channel: DbChannel; inquiry: string }) {
    this.command(`Lead added: ${input.name}`, () => {
      leadsApi.create(MOCK_ADMIN, this.context().tenant_id, input);
    });
  }

  deleteLead(id: string) {
    this.command("Lead deleted", () => {
      leadsApi.remove(MOCK_ADMIN, this.context().tenant_id, id);
    });
  }

  createBooking(input: { guest: string; email: string; service: string; date: string; amount: number }) {
    this.command(`Booking added: ${input.guest}`, () => {
      bookingsApi.create(MOCK_ADMIN, this.context().tenant_id, input);
    });
  }

  confirmBooking(id: string) {
    this.command("Booking confirmed", () => {
      bookingsApi.update(MOCK_ADMIN, this.context().tenant_id, id, { status: "confirmed" });
    });
  }

  deleteBooking(id: string) {
    this.command("Booking deleted", () => {
      bookingsApi.remove(MOCK_ADMIN, this.context().tenant_id, id);
    });
  }

  setAutonomy(autonomy: Autonomy) {
    this.command(`Autonomy level ${autonomy}`, () => {
      const tenant = db.getTenant(this.context());
      tenantsApi.update(MOCK_ADMIN, tenant.id, { console_config: { ...(tenant.console_config ?? defaultConsoleConfig), autonomy }, rules: autonomy === 1 ? { tala: "manual", nyx: "manual", hermes: "manual" } : { ...DEFAULT_RULES } });
    });
  }

  setChannel(id: string, connected: boolean) {
    this.command(`Mock channel ${connected ? "enabled" : "disabled"}`, () => {
      const context = this.context();
      const tenant = db.getTenant(context);
      const config = tenant.console_config ?? defaultConsoleConfig;
      tenantsApi.update(MOCK_ADMIN, tenant.id, { console_config: { ...config, channels: { ...config.channels, [id]: connected } } });
      this.publish("channel.mock_updated", `${id} mock channel ${connected ? "enabled" : "disabled"}`, { channel: id, connected, provider: "mock_only" });
    });
  }

  halt() {
    this.command("Tenant execution updated", () => {
      const tenant = db.getTenant(this.context());
      tenantsApi.update(MOCK_ADMIN, tenant.id, { status: tenant.status === "active" ? "paused" : "active" });
    });
  }

  triggerResponse(agent?: AgentId) {
    const worker: WorkerId = agent && agent !== "core" ? agent : "tala";
    this.command(`Dispatch ${worker.toUpperCase()}`, () => { eventsApi.trigger(MOCK_ADMIN, this.context().tenant_id, worker); });
  }

  qualifyLead(id: string) {
    this.command("Lead status updated", () => {
      const context = this.context();
      const lead = db.forTenant(context).get("leads", id);
      leadsApi.update(MOCK_ADMIN, context.tenant_id, id, { status: lead.status === "new" ? "contacted" : "converted" });
    });
  }

  logManual() {
    this.command("Attention queue reviewed", () => {
      const context = this.context();
      const tenant = db.getTenant(context);
      tenantsApi.update(MOCK_ADMIN, tenant.id, { console_config: { ...(tenant.console_config ?? defaultConsoleConfig), last_reviewed_at: new Date().toISOString() } });
      this.publish("review.completed", "Operator reviewed the attention queue", { actor: MOCK_ADMIN.name }, "success");
    });
  }

  exportBundle() {
    this.command("Tenant data export prepared", () => { this.publish("data.exported", "Tenant data export prepared", { actor: MOCK_ADMIN.name }, "success"); });
  }

  connectWhatsApp() { this.setChannel("whatsapp", true); }

  resetAll() {
    this.openedAt = Date.now(); this.tick = 0; this.overlay = null;
    this.command("Console runtime reset; tenant data retained", () => { this.publish("console.reset", "Console view reset. Tenant records retained."); });
  }

  private derive(): SystemState {
    const allTenants = tenantsApi.list(MOCK_ADMIN);
    const tenant = this.tenant();
    const data = tenant ? getAdminData(MOCK_ADMIN, tenant.id) : emptyData;
    const now = Date.now();
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const today = data.events.filter((event) => Date.parse(event.created_at) >= start.getTime());
    const automatic = today.filter((event) => event.agent && event.level === "success");
    const halted = tenant?.status !== "active";
    const agents = {} as Record<AgentId, AgentState>;
    for (const id of [...AGENT_IDS, "core"] as AgentId[]) {
      const config = data.agents.find((item) => item.agent === id);
      const active = id === "core" || Boolean(config?.enabled);
      const lastAt = config?.last_active_at ? Date.parse(config.last_active_at) : this.openedAt;
      const busy = active && !halted && now - lastAt < 1800;
      const actions = config?.actions_completed ?? data.events.length;
      const orCfg = id !== "core" ? (config?.openrouter ?? DEFAULT_AGENT_OPENROUTER[id]) : undefined;
      const behCfg = id !== "core" ? (config?.behavior ?? DEFAULT_AGENT_BEHAVIOR[id]) : undefined;
      agents[id] = {
        id,
        tenant_id: tenant?.id ?? null,
        status: halted ? "HALTED" : !active ? "IDLE" : busy ? "PROCESSING" : "ACTIVE",
        task: halted ? "Paused by operator" : !active ? "Disabled for this tenant" : busy ? config?.last_action ?? "Updating event stream" : id === "tala" ? "Monitoring inbound inquiries" : id === "nyx" ? "Monitoring follow-up schedule" : id === "hermes" ? "Monitoring booking queue" : "Subscribing to tenant event bus",
        lastAction: config?.last_action ?? "Tenant-scoped event stream connected",
        lastActionAt: lastAt,
        load: busy ? 65 : active && !halted ? 12 : 0,
        actions,
        resolved: actions,
        metricLabel: "COMPLETED",
        metricValue: String(actions),
        metricDelta: 0,
        queue: id === "hermes" ? data.bookings.filter((b) => b.status === "pending").length : data.leads.filter((l) => l.assigned_agent === id && l.status === "new").length,
        modelId: orCfg?.model_id,
        modelTier: orCfg?.model_tier,
        tone: behCfg?.tone,
        systemPrompt: behCfg?.system_prompt,
        connectedTools: behCfg?.connected_tools,
      };
    }

    const rawTools = tenant ? (tenant.tools_config ?? createDefaultToolsConfig(tenant.slug)) : createDefaultToolsConfig("workspace");
    const convertedCount = data.leads.filter((l) => l.status === "converted").length;
    const confirmedBookings = data.bookings.filter((b) => b.status === "confirmed" || b.status === "completed");
    const confirmedRev = confirmedBookings.reduce((s, b) => s + b.amount, 0);
    const messages = data.messages.filter((message) => message.direction === "outbound");

    const toolsSummary: ConsoleToolSummary[] = TOOL_IDS.map((tId) => {
      const t = rawTools[tId];
      const outcomeText =
        tId === "lead_capture"
          ? `${data.leads.length} leads captured · ${convertedCount} converted`
          : tId === "booking_engine"
            ? `${confirmedBookings.length} confirmed bookings · $${confirmedRev.toLocaleString()}`
            : tId === "whatsapp_responder"
              ? `${messages.length} automated replies & follow-ups sent`
              : `${data.events.length} verified audit & staff actions logged`;
      return {
        id: tId,
        name: t.name,
        category: t.category,
        outcomeLabel: t.outcome_label,
        enabled: t.enabled,
        assignedAgents: t.assigned_agents,
        webhookUrl: t.webhook_url,
        shareWithClient: t.share_with_client,
        outcomeText,
      };
    });

    const ledger = {} as Record<LedgerKey, LedgerEntry>;
    const categories: Record<LedgerKey, (type: string) => boolean> = {
      leads: (type) => type === "lead.created", responses: (type) => type === "message.sent",
      bookings: (type) => type === "booking.confirmed", followups: (type) => type === "followup.sent",
      crm: (type) => type.startsWith("lead.") || type === "system.synced", invoices: (type) => type === "invoice.issued",
      payments: (type) => type === "payment.settled", staff: (type) => type === "booking.confirmed",
      concierge: (type) => type === "booking.created", escalations: (type) => type === "agent.skipped",
    };
    (Object.keys(categories) as LedgerKey[]).forEach((key) => {
      const events = today.filter((event) => categories[key](event.type));
      ledger[key] = { count: events.length, lastAt: events[0] ? Date.parse(events[0].created_at) : start.getTime() };
    });
    const pipeline = {} as Record<StageKey, PipelineEntry>;
    const stages: Record<StageKey, string[]> = { inbound: ["message.sent"], qualify: ["lead.qualified", "followup.sent"], confirm: ["booking.confirmed"], settle: ["booking.logged", "system.synced"], sync: [] };
    (Object.keys(stages) as StageKey[]).forEach((key) => {
      const events = key === "sync" ? today : today.filter((event) => stages[key].includes(event.type));
      pipeline[key] = { fired: events.length, lastAt: events[0] ? Date.parse(events[0].created_at) : start.getTime() };
    });
    const responseTimes = messages.filter((message) => message.agent === "tala" && message.lead_id).map((message) => {
      const lead = data.leads.find((item) => item.id === message.lead_id);
      return lead ? Math.max(0, (Date.parse(message.created_at) - Date.parse(lead.created_at)) / 1000) : 0;
    });
    const responseSeconds = responseTimes.length ? Math.round(responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length) : 0;
    const handledLeadIds = new Set(messages.filter((message) => message.lead_id).map((message) => message.lead_id));
    const coverage = data.leads.length ? Math.round(handledLeadIds.size / data.leads.length * 100) : 0;
    const reviewedAt = tenant?.console_config?.last_reviewed_at;
    const config = tenant?.console_config ?? defaultConsoleConfig;
    return {
      tenant_id: tenant?.id ?? null,
      tenantsList: allTenants.map((t) => ({ id: t.id, name: t.name, slug: t.slug, industry: t.industry })),
      openrouterApiKey: tenant?.openrouter_api_key ?? "",
      tools: toolsSummary,
      version: 1,
      bootedAt: this.openedAt,
      halted,
      mode: this.mode,
      autonomy: config.autonomy,
      brand: { name: tenant?.branding_config.app_name ?? "NO WORKSPACE", type: tenant?.industry ?? "Create a tenant in admin", property: tenant?.slug ?? "local", timezone: "LOCAL MOCK" },
      agents,
      events: data.events.slice(0, 70).map((event) => ({ id: event.id, tenant_id: event.tenant_id, ts: Date.parse(event.created_at), agent: event.agent ?? "core", code: event.type.toUpperCase(), text: event.message, severity: event.level === "error" || event.level === "warning" ? "warn" : event.level, channel: channels[String(event.payload.channel)] ?? (event.type.startsWith("lead.") ? "CRM" : "INTERNAL") })),
      leads: data.leads.map((lead) => ({ id: lead.id, tenant_id: lead.tenant_id, name: lead.name, email: lead.email, channel: channels[lead.channel], intent: lead.inquiry, status: lead.status === "new" ? "NEW" : lead.status === "contacted" ? "QUALIFIED" : "BOOKED", score: lead.score, ts: Date.parse(lead.created_at), owner: lead.assigned_agent })),
      bookings: data.bookings.map((booking) => ({ id: booking.id, tenant_id: booking.tenant_id, ref: booking.reference, guest: booking.guest, email: booking.email, item: booking.service, slot: new Date(booking.date).toLocaleDateString(), status: booking.status === "confirmed" ? "CONFIRMED" : booking.status === "pending" ? "PENDING" : booking.status === "cancelled" ? "CANCELLED" : "SETTLED", value: booking.amount, ts: Date.parse(booking.created_at), owner: booking.assigned_agent })),
      metrics: {
        actionsToday: automatic.length,
        leadsToday: data.leads.filter((lead) => Date.parse(lead.created_at) >= start.getTime()).length,
        bookingsToday: data.bookings.filter((booking) => Date.parse(booking.created_at) >= start.getTime()).length,
        messagesHandled: messages.length,
        revenueHandled: data.bookings.filter((booking) => booking.status !== "cancelled").reduce((sum, booking) => sum + booking.amount, 0),
        avgResponseSec: responseSeconds,
        manualWorkloadSaved: Math.round(automatic.length * 0.5) / 10,
        automationCoverage: coverage,
        manualWorkloadReduced: coverage,
        lastManualTs: reviewedAt ? Date.parse(reviewedAt) : null,
        bootedAt: this.openedAt,
        incidents: data.events.filter((event) => (event.level === "warning" || event.level === "error") && (!reviewedAt || event.created_at > reviewedAt)).length,
      },
      ledger,
      pipeline,
      channels: Object.entries(channelNames).map(([id, label]) => ({ id, label, connected: config.channels[id] ?? false, volume: messages.filter((message) => message.channel.toLowerCase() === id).length })),
      overlay: this.overlay,
      lastCommand: this.lastCommand,
      tick: this.tick,
    };
  }
}

export const engine = new ConsoleAdapter();
export function useSystem(): SystemState { return useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot); }
