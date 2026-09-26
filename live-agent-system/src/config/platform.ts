import type {
  AgentBehaviorConfig,
  AgentId,
  AgentOpenRouterConfig,
  JsonObject,
  OpenRouterModelOption,
  Session,
  TenantRules,
  ToolId,
  ToolSetting,
} from "../types/database";

export const PLATFORM = {
  name: "CORE",
  subtitle: "Operations platform",
  primary_color: "#bcf58b",
  version: "1.2.0",
};

// This is a mock identity, not an authentication mechanism.
export const MOCK_ADMIN: Session = {
  user_id: "admin-local-001",
  name: "Alex Morgan",
  role: "platform_admin",
  tenant_id: null,
};

export const AGENTS: Record<AgentId, { name: string; role: string; color: string; description: string }> = {
  tala: { name: "TALA", role: "Guest experience & intake", color: "#8ccbee", description: "Inbound inquiries, WhatsApp/web replies, and booking intake" },
  nyx: { name: "NYX", role: "Growth, scoring & outreach", color: "#bfa3ed", description: "Lead qualification, intent scoring, and 24h follow-ups" },
  hermes: { name: "HERMES", role: "Operations & ledger sync", color: "#efc080", description: "Booking confirmations, staff dispatch, and audit logs" },
};

export const AGENT_IDS: AgentId[] = ["tala", "nyx", "hermes"];
export const TOOL_IDS: ToolId[] = ["lead_capture", "booking_engine", "whatsapp_responder", "ops_ledger"];

export const OPENROUTER_MODELS: OpenRouterModelOption[] = [
  // FREE MODELS
  {
    id: "meta-llama/llama-3.3-70b-instruct:free",
    label: "Llama 3.3 70B Instruct (Free)",
    provider: "Meta via OpenRouter",
    tier: "free",
    context_window: "128K",
    cost_label: "$0.00 / 1M tokens",
    recommended_for: ["tala", "nyx", "hermes"],
  },
  {
    id: "deepseek/deepseek-chat-v3-0324:free",
    label: "DeepSeek V3 Chat (Free)",
    provider: "DeepSeek via OpenRouter",
    tier: "free",
    context_window: "128K",
    cost_label: "$0.00 / 1M tokens",
    recommended_for: ["nyx", "hermes"],
  },
  {
    id: "google/gemma-3-27b-it:free",
    label: "Gemma 3 27B Instruct (Free)",
    provider: "Google via OpenRouter",
    tier: "free",
    context_window: "96K",
    cost_label: "$0.00 / 1M tokens",
    recommended_for: ["tala"],
  },
  {
    id: "mistralai/mistral-small-3.1-24b-instruct:free",
    label: "Mistral Small 3.1 24B (Free)",
    provider: "Mistral via OpenRouter",
    tier: "free",
    context_window: "96K",
    cost_label: "$0.00 / 1M tokens",
    recommended_for: ["tala", "hermes"],
  },
  {
    id: "qwen/qwen-2.5-72b-instruct:free",
    label: "Qwen 2.5 72B Instruct (Free)",
    provider: "Qwen via OpenRouter",
    tier: "free",
    context_window: "128K",
    cost_label: "$0.00 / 1M tokens",
    recommended_for: ["nyx", "hermes"],
  },
  // PAID MODELS
  {
    id: "anthropic/claude-3.7-sonnet",
    label: "Claude 3.7 Sonnet (Paid)",
    provider: "Anthropic via OpenRouter",
    tier: "paid",
    context_window: "200K",
    cost_label: "$3.00 / 1M in · $15.00 / 1M out",
    recommended_for: ["tala", "nyx"],
  },
  {
    id: "openai/gpt-4o",
    label: "GPT-4o Omni (Paid)",
    provider: "OpenAI via OpenRouter",
    tier: "paid",
    context_window: "128K",
    cost_label: "$2.50 / 1M in · $10.00 / 1M out",
    recommended_for: ["tala", "nyx", "hermes"],
  },
  {
    id: "openai/gpt-4o-mini",
    label: "GPT-4o Mini (Paid · Low Cost)",
    provider: "OpenAI via OpenRouter",
    tier: "paid",
    context_window: "128K",
    cost_label: "$0.15 / 1M in · $0.60 / 1M out",
    recommended_for: ["tala", "hermes"],
  },
  {
    id: "google/gemini-2.5-pro",
    label: "Gemini 2.5 Pro (Paid)",
    provider: "Google via OpenRouter",
    tier: "paid",
    context_window: "1M",
    cost_label: "$1.25 / 1M in · $10.00 / 1M out",
    recommended_for: ["nyx", "hermes"],
  },
  {
    id: "deepseek/deepseek-r1",
    label: "DeepSeek R1 Reasoning (Paid)",
    provider: "DeepSeek via OpenRouter",
    tier: "paid",
    context_window: "128K",
    cost_label: "$0.55 / 1M in · $2.19 / 1M out",
    recommended_for: ["nyx", "hermes"],
  },
];

export const DEFAULT_AGENT_OPENROUTER: Record<AgentId, AgentOpenRouterConfig> = {
  tala: {
    enabled: true,
    api_key: "",
    model_tier: "free",
    model_id: "meta-llama/llama-3.3-70b-instruct:free",
    temperature: 0.3,
    max_tokens: 320,
    fallback_to_rules: true,
  },
  nyx: {
    enabled: true,
    api_key: "",
    model_tier: "free",
    model_id: "deepseek/deepseek-chat-v3-0324:free",
    temperature: 0.2,
    max_tokens: 280,
    fallback_to_rules: true,
  },
  hermes: {
    enabled: true,
    api_key: "",
    model_tier: "free",
    model_id: "mistralai/mistral-small-3.1-24b-instruct:free",
    temperature: 0.1,
    max_tokens: 240,
    fallback_to_rules: true,
  },
};

export const DEFAULT_AGENT_BEHAVIOR: Record<AgentId, AgentBehaviorConfig> = {
  tala: {
    persona_title: "TALA — Concierge & Front-Desk Specialist",
    tone: "hospitality",
    system_prompt:
      "You are TALA, the primary concierge agent for {business}. Acknowledge guest inquiries within 30 seconds, answer availability questions clearly, capture contact details into the Lead Capture tool, and hand off booking requests to the Booking Engine.",
    greeting_style: "Warm, immediate, brand-aligned sign-off",
    autonomy_mode: "auto_execute",
    response_sla_seconds: 25,
    escalation_rule: "Escalate to human duty manager if guest mentions billing dispute, refund, or VIP group > 12 guests.",
    connected_tools: ["lead_capture", "whatsapp_responder", "booking_engine"],
  },
  nyx: {
    persona_title: "NYX — Lead Qualification & Follow-Up Strategist",
    tone: "persuasive",
    system_prompt:
      "You are NYX, the growth and qualification agent for {business}. Score every inbound lead from 0-100 based on intent, budget, and timeline. Trigger a polite 24-hour follow-up when a high-intent prospect goes quiet.",
    greeting_style: "Direct, helpful, value-oriented",
    autonomy_mode: "auto_execute",
    response_sla_seconds: 45,
    escalation_rule: "Flag leads scoring >= 85 for priority booking offer; pause outreach if prospect opts out.",
    connected_tools: ["lead_capture", "whatsapp_responder"],
  },
  hermes: {
    persona_title: "HERMES — Operations, Bookings & Ledger Coordinator",
    tone: "executive",
    system_prompt:
      "You are HERMES, the back-office operations agent for {business}. Confirm pending reservations, notify internal staff, log every state transition to the audit trail, and keep booking pipeline totals reconciled.",
    greeting_style: "Structured operational summary",
    autonomy_mode: "auto_execute",
    response_sla_seconds: 15,
    escalation_rule: "Escalate any booking modification < 12h before arrival or high-value reservation > $2,500.",
    connected_tools: ["booking_engine", "ops_ledger"],
  },
};

export function createDefaultToolsConfig(slug = "workspace"): Record<ToolId, ToolSetting> {
  return {
    lead_capture: {
      id: "lead_capture",
      name: "Lead Capture & CRM Intake",
      category: "Leads & CRM",
      description: "Captures inbound inquiries from web forms, WhatsApp, Instagram, and email, scores buyer intent, and stores structured lead records.",
      outcome_label: "Qualified leads captured & scored in CRM",
      enabled: true,
      assigned_agents: ["tala", "nyx"],
      webhook_url: `https://api.${slug}.core.app/v1/tools/leads`,
      env_key_name: "TOOL_LEADS_WEBHOOK_KEY",
      share_with_client: true,
      auto_sync: true,
      runs_count: 42,
      last_outcome: "Lead captured, scored 84/100, and routed to pipeline",
      last_run_at: new Date(Date.now() - 180_000).toISOString(),
    },
    booking_engine: {
      id: "booking_engine",
      name: "Booking & Reservation Scheduler",
      category: "Bookings & Revenue",
      description: "Creates reservation holds, confirms pending bookings, assigns reference codes, and tracks confirmed pipeline value.",
      outcome_label: "Confirmed bookings & scheduled revenue value",
      enabled: true,
      assigned_agents: ["tala", "hermes"],
      webhook_url: `https://api.${slug}.core.app/v1/tools/bookings`,
      env_key_name: "TOOL_BOOKINGS_WEBHOOK_KEY",
      share_with_client: true,
      auto_sync: true,
      runs_count: 19,
      last_outcome: "Reservation confirmed and added to client booking calendar",
      last_run_at: new Date(Date.now() - 420_000).toISOString(),
    },
    whatsapp_responder: {
      id: "whatsapp_responder",
      name: "WhatsApp & Multi-Channel Responder",
      category: "Messaging & Outreach",
      description: "Dispatches instant first responses and 24-hour follow-up sequences across WhatsApp, Instagram DM, and Email.",
      outcome_label: "Instant guest replies & follow-ups delivered",
      enabled: true,
      assigned_agents: ["tala", "nyx"],
      webhook_url: `https://api.${slug}.core.app/v1/tools/messages`,
      env_key_name: "WHATSAPP_CLOUD_API_TOKEN",
      share_with_client: true,
      auto_sync: true,
      runs_count: 64,
      last_outcome: "Automated reply delivered in 22s via WhatsApp outbox",
      last_run_at: new Date(Date.now() - 95_000).toISOString(),
    },
    ops_ledger: {
      id: "ops_ledger",
      name: "Operations & Staff Dispatch Ledger",
      category: "Operations & Audit",
      description: "Notifies internal staff on confirmed bookings, reconciles tenant records, and writes an immutable audit log.",
      outcome_label: "Staff dispatches & verified operational audit trail",
      enabled: true,
      assigned_agents: ["hermes"],
      webhook_url: `https://api.${slug}.core.app/v1/tools/ops-ledger`,
      env_key_name: "TOOL_OPS_LEDGER_SECRET",
      share_with_client: true,
      auto_sync: true,
      runs_count: 88,
      last_outcome: "Staff notification logged & daily pipeline reconciled",
      last_run_at: new Date(Date.now() - 60_000).toISOString(),
    },
  };
}

export const DEFAULT_RULES: TenantRules = {
  tala: "auto-reply-leads",
  nyx: "follow-up-after-24h",
  hermes: "log-all-bookings",
};

export const DEFAULT_AGENT_CONFIG: Record<AgentId, JsonObject> = {
  tala: { auto_reply: true, reply_template: "Thank you for contacting {business}. We have received your inquiry and will help you with the next step." },
  nyx: { qualification_threshold: 65, follow_up_hours: 24 },
  hermes: { confirm_bookings: true, notify_staff: true },
};

export const RULE_OPTIONS: Record<AgentId, string[]> = {
  tala: ["auto-reply-leads", "manual"],
  nyx: ["follow-up-after-24h", "score-leads-only", "manual"],
  hermes: ["log-all-bookings", "manual"],
};
