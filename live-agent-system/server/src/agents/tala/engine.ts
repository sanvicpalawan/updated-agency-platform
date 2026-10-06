/**
 * TALA — response builder.
 *
 * Flow: retrieve memory → classify intent → assemble context → render.
 * The `TalaResponseStrategy` contract is shared with the OpenRouter adapter, so
 * the LLM path receives the same retrieved memory and returns the same shape.
 */
import { recallGuestFacts, outboundCount } from "./memory.ts";
import { buildReply, classifyIntent, NEXT_ACTIONS, type GuestIntent } from "./templates.ts";
import type { TalaDecision, TalaDecisionInput, TalaResponseStrategy } from "../llm/strategy.ts";
import type { TenantContext } from "../../types.ts";

export interface ComposeInput {
  ctx: TenantContext;
  lead_id: string;
  lead_name: string;
  channel: string;
  inquiry: string;
  business_name: string;
  tone?: string;
}

export class LocalTalaStrategy implements TalaResponseStrategy {
  readonly id = "local" as const;
  readonly label = "Local response engine (memory-aware templates)";

  async composeReply(input: TalaDecisionInput): Promise<TalaDecision> {
    const intent = classifyIntent(input.inquiry) as GuestIntent;
    const is_followup = input.prior_outbound_count > 0;

    const reply = buildReply({
      business: input.business_name,
      first_name: input.lead_name.split(" ")[0] || "there",
      channel: input.channel,
      greeting_style: input.tone,
      memory_lines: input.memory.map((m) => m.text),
      intent,
      next_action: NEXT_ACTIONS[intent],
      is_followup,
    });

    return {
      reply,
      intent,
      next_action: NEXT_ACTIONS[intent],
      strategy: "local",
      tokens_in: null,
      tokens_out: null,
      cost_usd: null,
      model_id: null,
    };
  }
}

export const localTala = new LocalTalaStrategy();

/**
 * Assemble the strategy input from live database state. Both the local and LLM
 * strategies are fed through this, which is why memory retrieval cannot drift
 * between providers.
 */
export function buildTalaInput(input: ComposeInput): TalaDecisionInput {
  const facts = recallGuestFacts(input.ctx, input.lead_id, 4);
  return {
    lead_id: input.lead_id,
    tenant_id: input.ctx.tenant_id,
    lead_name: input.lead_name,
    channel: input.channel,
    inquiry: input.inquiry,
    business_name: input.business_name,
    tone: input.tone ?? "hospitality",
    memory: facts.map((f) => ({ kind: f.kind, text: f.text })),
    prior_outbound_count: outboundCount(input.ctx, input.lead_id),
  };
}
