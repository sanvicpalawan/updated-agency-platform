export type AgentId = "tala" | "nyx" | "hermes";
export type ToolId = "lead_capture" | "booking_engine" | "whatsapp_responder" | "ops_ledger";
export type TenantStatus = "active" | "paused" | "setup";
export type LeadStatus = "new" | "contacted" | "converted";
export type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled";
export type Channel = "Website" | "WhatsApp" | "Instagram" | "Email";
export type EventLevel = "info" | "success" | "warning" | "error";
export type JsonObject = Record<string, unknown>;

export interface BrandingConfig {
  app_name: string;
  logo: string;
  primary_color: string;
  theme: "dark" | "light";
}

export type TenantRules = Record<AgentId, string>;

export type ModelTier = "free" | "paid";

export interface OpenRouterModelOption {
  id: string;
  label: string;
  provider: string;
  tier: ModelTier;
  context_window: string;
  cost_label: string;
  recommended_for: AgentId[];
}

export interface AgentOpenRouterConfig {
  enabled: boolean;
  api_key: string;
  model_tier: ModelTier;
  model_id: string;
  temperature: number;
  max_tokens: number;
  fallback_to_rules: boolean;
}

export type BehaviorTone = "hospitality" | "concise" | "executive" | "persuasive" | "custom";
export type AutonomyMode = "auto_execute" | "draft_only" | "manual_approval";

export interface AgentBehaviorConfig {
  persona_title: string;
  tone: BehaviorTone;
  system_prompt: string;
  greeting_style: string;
  autonomy_mode: AutonomyMode;
  response_sla_seconds: number;
  escalation_rule: string;
  connected_tools: ToolId[];
}

export interface ToolSetting {
  id: ToolId;
  name: string;
  category: "Leads & CRM" | "Bookings & Revenue" | "Messaging & Outreach" | "Operations & Audit";
  description: string;
  outcome_label: string;
  enabled: boolean;
  assigned_agents: AgentId[];
  webhook_url: string;
  env_key_name: string;
  share_with_client: boolean;
  auto_sync: boolean;
  runs_count: number;
  last_outcome: string;
  last_run_at: string | null;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  industry: string;
  status: TenantStatus;
  branding_config: BrandingConfig;
  rules: TenantRules;
  openrouter_api_key?: string;
  tools_config?: Record<ToolId, ToolSetting>;
  console_config?: {
    autonomy: 1 | 2 | 3;
    channels: Record<string, boolean>;
    last_reviewed_at?: string;
  };
  created_at: string;
}

export interface Session {
  user_id: string;
  name: string;
  role: "platform_admin" | "tenant_admin";
  tenant_id: string | null;
}

export interface TenantContext {
  tenant_id: string;
  session: Session;
}

export interface TenantUser {
  id: string;
  tenant_id: string;
  name: string;
  email: string;
  role: "admin" | "member";
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
  channel: Channel | "Internal";
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
  payload: JsonObject;
  created_at: string;
}

export interface AgentConfig {
  id: string;
  tenant_id: string;
  agent: AgentId;
  enabled: boolean;
  config: JsonObject;
  openrouter?: AgentOpenRouterConfig;
  behavior?: AgentBehaviorConfig;
  actions_completed: number;
  last_action: string;
  last_active_at: string | null;
}

export interface MockDatabase {
  version: 1;
  tenants: Tenant[];
  users: TenantUser[];
  leads: Lead[];
  bookings: Booking[];
  messages: Message[];
  events: SystemEvent[];
  agents: AgentConfig[];
}

export interface EventInput {
  type: string;
  agent?: AgentId | null;
  level?: EventLevel;
  message: string;
  entity_id?: string | null;
  payload?: JsonObject;
}

export interface AdminData {
  tenants: Tenant[];
  leads: Lead[];
  bookings: Booking[];
  messages: Message[];
  events: SystemEvent[];
  agents: AgentConfig[];
}
