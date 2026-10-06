import type { AgentId } from "../../types.ts";

/**
 * The LLM seam.
 *
 * Every agent decision in this system flows through a `DecisionStrategy`. The
 * default `local` strategy is a deterministic feature/scorer engine. Swapping
 * in an LLM means registering one more strategy — no agent code changes, no
 * schema changes, because `agent_runs.strategy` already records which one ran.
 *
 * This file performs NO network I/O by default. The OpenRouter adapter lives in
 * `openrouter.ts` and is only constructed when explicitly selected via
 * `AGENT_LLM_PROVIDER=openrouter` plus a valid `OPENROUTER_API_KEY`.
 */

export type ProviderId = "local" | "openrouter";

export interface TokenUsage {
  tokens_in: number | null;
  tokens_out: number | null;
  cost_usd: number | null;
  model_id: string | null;
}

export interface NyxDecisionInput {
  lead_id: string;
  tenant_id: string;
  name: string;
  email: string;
  channel: string;
  inquiry: string;
  prior_touches: number;
  lead_age_hours: number;
  tenant_name: string;
}

/** Structured output contract — identical shape for local and LLM strategies. */
export interface NyxDecision extends TokenUsage {
  score: number;
  reasoning: string;
  tags: string[];
  strategy: ProviderId;
  breakdown: { key: string; points: number; weight: number; why: string }[];
}

export interface TalaDecisionInput {
  lead_id: string;
  tenant_id: string;
  lead_name: string;
  channel: string;
  inquiry: string;
  business_name: string;
  tone: string;
  memory: { kind: string; text: string }[];
  prior_outbound_count: number;
}

export interface TalaDecision extends TokenUsage {
  reply: string;
  intent: string;
  next_action: string;
  strategy: ProviderId;
}

export interface NyxScoringStrategy {
  readonly id: ProviderId;
  readonly label: string;
  scoreLead(input: NyxDecisionInput): Promise<NyxDecision>;
}

export interface TalaResponseStrategy {
  readonly id: ProviderId;
  readonly label: string;
  composeReply(input: TalaDecisionInput): Promise<TalaDecision>;
}

export interface AgentRuntimeConfig {
  nyx: NyxScoringStrategy;
  tala: TalaResponseStrategy;
}

export function describeAgent(agent: AgentId): string {
  switch (agent) {
    case "tala":
      return "Guest experience & intake — composes contextual replies from retrieved memory.";
    case "nyx":
      return "Growth & qualification — scores leads through a pluggable decision engine.";
    case "hermes":
      return "Operations orchestrator — routes events, executes tools, writes back state.";
    default: {
      const exhaustive: never = agent;
      return exhaustive;
    }
  }
}
