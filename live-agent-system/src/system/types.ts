export type AgentId = "tala" | "nyx" | "hermes" | "core";

export type AgentStatus = "ACTIVE" | "PROCESSING" | "IDLE" | "HALTED";

export type Severity = "info" | "action" | "success" | "warn";

export type Channel =
  | "WHATSAPP"
  | "INSTAGRAM"
  | "WEB"
  | "VOICE"
  | "EMAIL"
  | "OTA"
  | "CRM"
  | "POS"
  | "INTERNAL";

/** Completed-work categories surfaced in the historical proof block. */
export type LedgerKey =
  | "leads"
  | "responses"
  | "bookings"
  | "followups"
  | "crm"
  | "invoices"
  | "payments"
  | "staff"
  | "concierge"
  | "escalations";

/** Forward-looking automation pipeline stages. */
export type StageKey = "inbound" | "qualify" | "confirm" | "settle" | "sync";

export interface LedgerEntry {
  count: number;
  lastAt: number;
}

export interface PipelineEntry {
  fired: number;
  lastAt: number;
}

export interface AgentDef {
  id: AgentId;
  codename: string;
  role: string;
  domain: string;
  accent: string;
  accentRgb: string;
  weight: number;
}

export interface AgentState {
  id: AgentId;
  tenant_id: string | null;
  status: AgentStatus;
  task: string;
  lastAction: string;
  lastActionAt: number;
  load: number;
  actions: number;
  resolved: number;
  metricLabel: string;
  metricValue: string;
  metricDelta: number;
  queue: number;
  modelId?: string;
  modelTier?: "free" | "paid";
  tone?: string;
  systemPrompt?: string;
  connectedTools?: string[];
}

export interface SystemEvent {
  id: string;
  tenant_id: string;
  ts: number;
  agent: AgentId;
  code: string;
  text: string;
  channel: Channel;
  severity: Severity;
  ref?: string;
}

export type LeadStatus = "NEW" | "QUALIFIED" | "BOOKED" | "NURTURE" | "CLOSED";

export interface Lead {
  id: string;
  tenant_id: string;
  name: string;
  email?: string;
  channel: Channel;
  intent: string;
  status: LeadStatus;
  score: number;
  ts: number;
  owner: AgentId;
}

export interface Booking {
  id: string;
  tenant_id: string;
  ref: string;
  guest: string;
  email?: string;
  item: string;
  slot: string;
  status: "CONFIRMED" | "PENDING" | "ARRIVING" | "SETTLED" | "CANCELLED";
  value: number;
  ts: number;
  owner: AgentId;
}

export interface Metrics {
  actionsToday: number;
  leadsToday: number;
  bookingsToday: number;
  messagesHandled: number;
  revenueHandled: number;
  avgResponseSec: number;
  manualWorkloadSaved: number;
  /** % of inbound enquiries closed without a human. */
  automationCoverage: number;
  /** % reduction in manual handling vs. unassisted baseline. */
  manualWorkloadReduced: number;
  lastManualTs: number | null;
  bootedAt: number;
  incidents: number;
}

export type OverlayKind =
  | "leads"
  | "bookings"
  | "settings"
  | "agents_config"
  | "tools"
  | "whatsapp"
  | "export"
  | "response"
  | null;

export type Autonomy = 1 | 2 | 3;

export interface ConsoleToolSummary {
  id: "lead_capture" | "booking_engine" | "whatsapp_responder" | "ops_ledger";
  name: string;
  category: string;
  outcomeLabel: string;
  enabled: boolean;
  assignedAgents: string[];
  webhookUrl: string;
  shareWithClient: boolean;
  outcomeText: string;
}

export interface SystemState {
  tenant_id: string | null;
  tenantsList: { id: string; name: string; slug: string; industry: string }[];
  openrouterApiKey: string;
  tools: ConsoleToolSummary[];
  version: number;
  bootedAt: number;
  halted: boolean;
  mode: "SYSTEM" | "HUMAN";
  autonomy: Autonomy;
  brand: {
    name: string;
    type: string;
    property: string;
    timezone: string;
  };
  agents: Record<AgentId, AgentState>;
  events: SystemEvent[];
  leads: Lead[];
  bookings: Booking[];
  metrics: Metrics;
  ledger: Record<LedgerKey, LedgerEntry>;
  pipeline: Record<StageKey, PipelineEntry>;
  channels: { id: string; label: string; connected: boolean; volume: number }[];
  overlay: OverlayKind;
  lastCommand: { label: string; ts: number; ok: boolean } | null;
  tick: number;
}
