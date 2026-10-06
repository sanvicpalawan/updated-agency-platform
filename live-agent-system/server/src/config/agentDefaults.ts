/**
 * Server-side canonical agent profiles.
 *
 * These mirror the frontend's DEFAULT_AGENT_BEHAVIOR / DEFAULT_AGENT_OPENROUTER
 * in `live-agent-system/src/config/platform.ts`, but the server is the source
 * of truth: every newly created agent row is seeded with the COMPLETE profile
 * (seed data and `agents.upsert` both read from here), and `mapAgent` merges
 * these defaults over any legacy row that predates them. That guarantees the
 * API never returns `{}` for `behavior`/`openrouter`, which is what used to
 * crash the admin Agents page (`behavior.system_prompt.replace(...)`).
 */
import type { AgentId } from "../types.ts";

export const DEFAULT_AGENT_CONFIG: Record<AgentId, Record<string, unknown>> = {
  tala: { auto_reply: true },
  nyx: { qualification_threshold: 65, follow_up_hours: 24 },
  hermes: { confirm_bookings: true, notify_staff: true },
};

export const DEFAULT_AGENT_BEHAVIOR: Record<AgentId, Record<string, unknown>> = {
  tala: {
    persona_title: "TALA — Concierge & Front-Desk Specialist",
    tone: "hospitality",
    system_prompt:
      "You are TALA, the primary concierge agent for {business}. Acknowledge guest inquiries within 30 seconds, answer availability questions clearly, capture contact details into the Lead Capture tool, and hand off booking requests to the Booking Engine.",
    greeting_style: "Warm, immediate, brand-aligned sign-off",
    autonomy_mode: "auto_execute",
    response_sla_seconds: 25,
    escalation_rule:
      "Escalate to human duty manager if guest mentions billing dispute, refund, or VIP group > 12 guests.",
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
    escalation_rule:
      "Flag leads scoring >= 85 for priority booking offer; pause outreach if prospect opts out.",
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
    escalation_rule:
      "Escalate any booking modification < 12h before arrival or high-value reservation > $2,500.",
    connected_tools: ["booking_engine", "ops_ledger"],
  },
};

export const DEFAULT_AGENT_OPENROUTER: Record<AgentId, Record<string, unknown>> = {
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

/**
 * Merge a stored (possibly empty / legacy / partial) profile over the full
 * defaults. Every key the admin UI dereferences is guaranteed to exist.
 */
export function mergedBehavior(agent: AgentId, stored: Record<string, unknown>): Record<string, unknown> {
  const base = DEFAULT_AGENT_BEHAVIOR[agent];
  const next = { ...base, ...(stored ?? {}) };
  const connected = (next as { connected_tools?: unknown }).connected_tools;
  if (!Array.isArray(connected) || connected.length === 0) {
    next.connected_tools = [...(base.connected_tools as string[])];
  }
  return next;
}

export function mergedOpenRouter(agent: AgentId, stored: Record<string, unknown>): Record<string, unknown> {
  return { ...DEFAULT_AGENT_OPENROUTER[agent], ...(stored ?? {}) };
}
