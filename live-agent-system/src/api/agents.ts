import {
  DEFAULT_AGENT_BEHAVIOR,
  DEFAULT_AGENT_CONFIG,
  DEFAULT_AGENT_OPENROUTER,
  OPENROUTER_MODELS,
  RULE_OPTIONS,
} from "../config/platform";
import { eventBus } from "../core/eventBus";
import { resolveTenant } from "../core/tenantResolver";
import { db } from "../services/db";
import type {
  AgentBehaviorConfig,
  AgentId,
  AgentOpenRouterConfig,
  JsonObject,
  Session,
  TenantRules,
} from "../types/database";

export function validateAgentConfig(agent: AgentId, value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Agent configuration must be a JSON object.");
  const config = { ...DEFAULT_AGENT_CONFIG[agent], ...value };
  if (agent === "tala" && (typeof config.auto_reply !== "boolean" || typeof config.reply_template !== "string" || !config.reply_template.trim())) throw new Error("TALA requires auto_reply (boolean) and a non-empty reply_template.");
  if (agent === "nyx" && (typeof config.qualification_threshold !== "number" || config.qualification_threshold < 0 || config.qualification_threshold > 100 || typeof config.follow_up_hours !== "number" || config.follow_up_hours < 1 || config.follow_up_hours > 720)) throw new Error("Score threshold must be 0-100; follow-up delay must be 1-720 hours.");
  if (agent === "hermes" && (typeof config.confirm_bookings !== "boolean" || typeof config.notify_staff !== "boolean")) throw new Error("HERMES settings must be boolean values.");
  return config;
}

export function validateOpenRouterConfig(agent: AgentId, value: Partial<AgentOpenRouterConfig>): AgentOpenRouterConfig {
  const base = { ...DEFAULT_AGENT_OPENROUTER[agent], ...value };
  const model = OPENROUTER_MODELS.find((m) => m.id === base.model_id);
  const tier = model ? model.tier : base.model_tier;
  const temp = Math.max(0, Math.min(1, Number(base.temperature ?? 0.3)));
  const maxTokens = Math.max(64, Math.min(4096, Number(base.max_tokens ?? 300)));
  return {
    enabled: Boolean(base.enabled),
    api_key: String(base.api_key ?? "").trim(),
    model_tier: tier,
    model_id: String(base.model_id || DEFAULT_AGENT_OPENROUTER[agent].model_id),
    temperature: Number.isFinite(temp) ? temp : 0.3,
    max_tokens: Number.isFinite(maxTokens) ? maxTokens : 300,
    fallback_to_rules: Boolean(base.fallback_to_rules),
  };
}

export function validateBehaviorConfig(agent: AgentId, value: Partial<AgentBehaviorConfig>): AgentBehaviorConfig {
  const base = { ...DEFAULT_AGENT_BEHAVIOR[agent], ...value };
  if (!base.system_prompt?.trim()) throw new Error("System behavioral prompt cannot be empty.");
  return {
    persona_title: String(base.persona_title || DEFAULT_AGENT_BEHAVIOR[agent].persona_title).trim(),
    tone: base.tone || "hospitality",
    system_prompt: base.system_prompt.trim(),
    greeting_style: String(base.greeting_style || "Warm and concise").trim(),
    autonomy_mode: base.autonomy_mode || "auto_execute",
    response_sla_seconds: Math.max(5, Math.min(3600, Number(base.response_sla_seconds || 30))),
    escalation_rule: String(base.escalation_rule || DEFAULT_AGENT_BEHAVIOR[agent].escalation_rule).trim(),
    connected_tools: Array.isArray(base.connected_tools) ? base.connected_tools : [...DEFAULT_AGENT_BEHAVIOR[agent].connected_tools],
  };
}

export function validateRules(value: unknown): TenantRules {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Rules must be a JSON object.");
  const rules = value as TenantRules;
  if (Object.keys(rules).length !== 3 || !Object.entries(RULE_OPTIONS).every(([agent, options]) => options.includes(rules[agent as AgentId]))) throw new Error("Include tala, nyx, and hermes with a supported rule listed below.");
  return rules;
}

export const agentsApi = {
  update(
    session: Session,
    tenant_id: string,
    agent: AgentId,
    patch: {
      enabled?: boolean;
      config?: JsonObject;
      openrouter?: Partial<AgentOpenRouterConfig>;
      behavior?: Partial<AgentBehaviorConfig>;
    },
  ) {
    const context = resolveTenant(session, tenant_id);
    const scoped = db.forTenant(context);
    const current = scoped.list("agents").find((a) => a.agent === agent);
    if (!current) throw new Error("Agent not found in this tenant.");
    const nextPatch: Record<string, unknown> = {};
    if (patch.enabled !== undefined) nextPatch.enabled = patch.enabled;
    if (patch.config) nextPatch.config = validateAgentConfig(agent, patch.config);
    if (patch.openrouter) nextPatch.openrouter = validateOpenRouterConfig(agent, { ...current.openrouter, ...patch.openrouter });
    if (patch.behavior) nextPatch.behavior = validateBehaviorConfig(agent, { ...current.behavior, ...patch.behavior });
    const config = scoped.update("agents", current.id, nextPatch);
    const summary =
      patch.openrouter
        ? `${agent.toUpperCase()} OpenRouter model updated (${config.openrouter?.model_tier.toUpperCase()}: ${config.openrouter?.model_id})`
        : patch.behavior
          ? `${agent.toUpperCase()} behavioral settings & tool bindings updated`
          : patch.enabled !== undefined
            ? `${agent.toUpperCase()} ${patch.enabled ? "enabled" : "disabled"}`
            : `${agent.toUpperCase()} configuration updated`;
    eventBus.publish(context, {
      type: "agent.config_updated",
      agent,
      level: "success",
      message: summary,
      payload: {
        model_id: config.openrouter?.model_id,
        model_tier: config.openrouter?.model_tier,
        tone: config.behavior?.tone,
        autonomy_mode: config.behavior?.autonomy_mode,
        connected_tools: config.behavior?.connected_tools,
        actor: session.name,
      },
    });
    return config;
  },
};
