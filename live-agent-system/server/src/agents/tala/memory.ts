/**
 * TALA — memory layer.
 *
 * Reads and writes the `agent_memory` table. This is the context the LLM
 * strategy receives verbatim, so the phrasing here is prompt-ready, not
 * display-ready.
 */
import { memory as memoryRepo, messages as messagesRepo } from "../../db/repo.ts";
import type { AgentId, Lead, MemoryScope, TenantContext } from "../../types.ts";

export interface MemoryFact {
  kind: string;
  text: string;
  importance: number;
}

export function remember(
  ctx: TenantContext,
  input: {
    scope: MemoryScope;
    subject_id: string;
    agent: AgentId;
    kind: string;
    text: string;
    content?: Record<string, unknown>;
    importance?: number;
  },
): void {
  memoryRepo.write(ctx, input);
}

/**
 * Memory kinds that may be surfaced to the guest.
 *
 * Everything else — NYX's qualification verdict, prior reply transcripts — is
 * internal context for the agents and must never appear in an outbound message.
 */
export const GUEST_SAFE_KINDS = new Set(["profile", "contact", "request", "preference"]);

/** Ranked facts for a lead, newest/most important first. Internal use. */
export function recallLeadFacts(ctx: TenantContext, leadId: string, limit = 6): MemoryFact[] {
  return memoryRepo.recall(ctx, { scope: "lead", subject_id: leadId, limit }).map((m) => ({
    kind: m.kind,
    text: m.text,
    importance: m.importance,
  }));
}

/** Only the subset that is safe to quote back to the guest. */
export function recallGuestFacts(ctx: TenantContext, leadId: string, limit = 6): MemoryFact[] {
  return recallLeadFacts(ctx, leadId, 20)
    .filter((f) => GUEST_SAFE_KINDS.has(f.kind))
    .slice(0, limit);
}

/**
 * Seed durable facts from a freshly captured lead. Called by the intake path so
 * that a later TALA turn has real context rather than a blank slate.
 */
export function captureLeadContext(
  ctx: TenantContext,
  lead: Lead,
  tenantName: string,
): MemoryFact[] {
  const facts: { kind: string; text: string; importance: number }[] = [];

  facts.push({
    kind: "profile",
    text: `Guest ${lead.name} contacted ${tenantName} via ${lead.channel}.`,
    importance: 0.6,
  });

  if (lead.email) {
    facts.push({ kind: "contact", text: `Reachable at ${lead.email}.`, importance: 0.5 });
  }
  if (lead.inquiry) {
    facts.push({
      kind: "request",
      text: `Stated request: "${lead.inquiry.slice(0, 220)}"`,
      importance: 0.9,
    });
  }

  for (const f of facts) {
    remember(ctx, {
      scope: "lead",
      subject_id: lead.id,
      agent: "tala",
      kind: f.kind,
      text: f.text,
      importance: f.importance,
      content: { lead_id: lead.id },
    });
  }
  return facts;
}

/** Record what NYX concluded so TALA can reference the qualification outcome. */
export function rememberScore(
  ctx: TenantContext,
  leadId: string,
  score: number,
  reasoning: string,
  tags: string[],
  strategy: string,
): void {
  remember(ctx, {
    scope: "lead",
    subject_id: leadId,
    agent: "nyx",
    kind: "qualification",
    text: `Scored ${score}/100 by ${strategy}. ${reasoning.slice(0, 240)}`,
    importance: score >= 80 ? 0.95 : score >= 65 ? 0.8 : 0.55,
    content: { score, tags, strategy },
  });
}

/** Record an outbound touch so follow-ups can see conversation history. */
export function rememberReply(
  ctx: TenantContext,
  leadId: string,
  reply: string,
  intent: string,
): void {
  remember(ctx, {
    scope: "lead",
    subject_id: leadId,
    agent: "tala",
    kind: `reply:${intent}`,
    text: `Sent reply (${intent}): "${reply.slice(0, 200)}"`,
    importance: 0.7,
    content: { intent },
  });
}

export function outboundCount(ctx: TenantContext, leadId: string): number {
  return messagesRepo.countFor(ctx, leadId, "outbound");
}
