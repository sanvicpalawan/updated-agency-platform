import { backend } from "../services/backend";
import { resolveTenant } from "../core/tenantResolver";
import { db } from "../services/db";
import { AGENT_IDS, RULE_OPTIONS } from "../config/platform";
import type {
  AgentBehaviorConfig,
  AgentId,
  AgentOpenRouterConfig,
  JsonObject,
  Session,
  TenantRules,
} from "../types/database";

/* ---------------- validators (unchanged, still client-side) ---------------- */

export function validateAgentConfig(agent: AgentId, value: unknown): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Agent configuration must be a JSON object.");
  }
  const record = value as JsonObject;
  if (agent === "tala" && "auto_reply" in record && typeof record.auto_reply !== "boolean") {
    throw new Error("tala.auto_reply must be a boolean.");
  }
  if (agent === "nyx") {
    if ("qualification_threshold" in record && !Number.isFinite(Number(record.qualification_threshold))) {
      throw new Error("nyx.qualification_threshold must be a number.");
    }
    if ("follow_up_hours" in record && !Number.isFinite(Number(record.follow_up_hours))) {
      throw new Error("nyx.follow_up_hours must be a number.");
    }
  }
  if (agent === "hermes") {
    for (const key of ["confirm_bookings", "notify_staff"] as const) {
      if (key in record && typeof record[key] !== "boolean") {
        throw new Error(`hermes.${key} must be a boolean.`);
      }
    }
  }
  return record;
}

export function validateOpenRouterConfig(
  agent: AgentId,
  value: Partial<AgentOpenRouterConfig>,
): Partial<AgentOpenRouterConfig> {
  void agent;
  const next: Partial<AgentOpenRouterConfig> = { ...value };
  if (next.model_tier !== undefined && !["free", "paid"].includes(next.model_tier)) {
    throw new Error("model_tier must be 'free' or 'paid'.");
  }
  if (next.temperature !== undefined && !Number.isFinite(next.temperature)) {
    throw new Error("temperature must be a number.");
  }
  if (next.max_tokens !== undefined && (!Number.isFinite(next.max_tokens) || next.max_tokens <= 0)) {
    throw new Error("max_tokens must be a positive number.");
  }
  if (next.api_key !== undefined && typeof next.api_key !== "string") {
    throw new Error("api_key must be a string.");
  }
  return next;
}

export function validateBehaviorConfig(
  agent: AgentId,
  value: Partial<AgentBehaviorConfig>,
): Partial<AgentBehaviorConfig> {
  void agent;
  const next: Partial<AgentBehaviorConfig> = { ...value };
  if (next.response_sla_seconds !== undefined && !Number.isFinite(next.response_sla_seconds)) {
    throw new Error("response_sla_seconds must be a number.");
  }
  if (next.autonomy_mode !== undefined &&
      !["auto_execute", "draft_only", "manual_approval"].includes(next.autonomy_mode)) {
    throw new Error("autonomy_mode must be auto_execute, draft_only or manual_approval.");
  }
  return next;
}

export function validateRules(value: unknown): TenantRules {
  if (typeof value !== "object" || value === null) throw new Error("Rules must be a JSON object.");
  const rules = value as TenantRules;
  for (const agent of AGENT_IDS) {
    const selected = rules[agent];
    if (typeof selected !== "string" || !RULE_OPTIONS[agent].includes(selected)) {
      throw new Error(`${agent.toUpperCase()} rule must be one of: ${RULE_OPTIONS[agent].join(", ")}.`);
    }
  }
  return rules;
}

/* ------------------------------ agent API ------------------------------ */

export const agentsApi = {
  list: (session: Session, tenant_id: string) =>
    db.forTenant(resolveTenant(session, tenant_id)).list("agents"),

  async update(
    session: Session,
    tenant_id: string,
    agent: AgentId,
    patch: {
      enabled?: boolean;
      config?: JsonObject;
      behavior?: Partial<AgentBehaviorConfig>;
      openrouter?: Partial<AgentOpenRouterConfig>;
    },
  ) {
    const context = resolveTenant(session, tenant_id);
    if (patch.config) validateAgentConfig(agent, patch.config);
    if (patch.behavior) validateBehaviorConfig(agent, patch.behavior);
    if (patch.openrouter) validateOpenRouterConfig(agent, patch.openrouter);
    return db.updateAgent(context, agent, patch as Record<string, unknown>);
  },

  async setEnabled(session: Session, tenant_id: string, agent: AgentId, enabled: boolean) {
    const context = resolveTenant(session, tenant_id);
    return db.updateAgent(context, agent, { enabled });
  },

  /** Audit trail straight from the backend agent_runs table. */
  async runs(session: Session, tenant_id: string, agent?: AgentId) {
    resolveTenant(session, tenant_id);
    const { runs } = await backend.agents.runs(tenant_id, agent);
    return runs;
  },

  async run(session: Session, tenant_id: string, agent: AgentId, event_type: string, payload: JsonObject) {
    resolveTenant(session, tenant_id);
    return backend.events.publish(tenant_id, {
      type: event_type,
      agent,
      message: `Manual ${agent.toUpperCase()} test run`,
      payload: { ...payload, force: true },
    });
  },

  runtime: () => backend.agents.runtime(),
};
