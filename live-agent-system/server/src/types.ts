export type AgentId = "tala" | "nyx" | "hermes";
export type TenantStatus = "active" | "paused" | "setup";
export type LeadStatus = "new" | "contacted" | "qualified" | "converted";
export type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled";
export type Channel = "Website" | "WhatsApp" | "Instagram" | "Email";
export type EventLevel = "info" | "success" | "warning" | "error";
export type RunStatus = "ok" | "skipped" | "failed";
export type MemoryScope = "lead" | "booking" | "tenant" | "agent";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  industry: string;
  status: TenantStatus;
  branding_config: {
    app_name: string;
    logo: string;
    primary_color: string;
    theme: "dark" | "light";
  };
  rules: Record<AgentId, string>;
  tools_config: Record<string, unknown>;
  console_config: Record<string, unknown>;
  created_at: string;
}

export interface Lead {
  id: string;
  tenant_id: string;
  name: string;
  email: string;
  channel: Channel;
  status: LeadStatus;
  assigned_agent: AgentId;
  score: number;
  score_reasoning: string;
  score_tags: string[];
  score_run_id: string | null;
  inquiry: string;
  created_at: string;
  updated_at: string;
}

export interface Booking {
  id: string;
  tenant_id: string;
  reference: string;
  guest: string;
  email: string;
  service: string;
  date: string;
  amount: number;
  status: BookingStatus;
  assigned_agent: AgentId;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  tenant_id: string;
  lead_id: string | null;
  agent: AgentId;
  content: string;
  channel: string;
  direction: "inbound" | "outbound";
  created_at: string;
}

export interface SystemEvent {
  id: string;
  tenant_id: string;
  type: string;
  agent: AgentId | null;
  level: EventLevel;
  message: string;
  entity_id: string | null;
  payload: Record<string, unknown>;
  processing_status: "queued" | "processing" | "done" | "failed" | "skipped";
  processed_at: string | null;
  error: string | null;
  created_at: string;
}

export interface AgentConfigRow {
  id: string;
  tenant_id: string;
  agent: AgentId;
  enabled: boolean;
  config: Record<string, unknown>;
  behavior: Record<string, unknown>;
  actions_completed: number;
  last_action: string;
  last_active_at: string | null;
}

export interface ToolCallRecord {
  tool: string;
  ok: boolean;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
  latency_ms: number;
  at: string;
}

export interface AgentRun {
  id: string;
  tenant_id: string;
  agent: AgentId;
  event_id: string | null;
  status: RunStatus;
  strategy: string;
  input: Record<string, unknown>;
  decision: Record<string, unknown>;
  reasoning: string;
  tags: string[];
  tool_calls: ToolCallRecord[];
  output_text: string;
  latency_ms: number;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_usd: number | null;
  model_id: string | null;
  error: string | null;
  created_at: string;
}

export interface MemoryRow {
  id: string;
  tenant_id: string;
  scope: MemoryScope;
  subject_id: string;
  agent: AgentId;
  kind: string;
  content: Record<string, unknown>;
  text: string;
  importance: number;
  access_count: number;
  last_accessed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Tenant-scoped request context. Every repo + agent call requires one. */
export interface TenantContext {
  tenant_id: string;
}
