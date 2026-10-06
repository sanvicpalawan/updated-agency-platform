/**
 * Agent runner — the backend event pipeline.
 *
 *   event claimed from SQLite
 *     → tenant + agent gate
 *     → agent decision (local engine or LLM)
 *     → tool execution
 *     → agent_runs row (full audit)
 *     → event settled
 *
 * Agents enqueue follow-on events rather than calling each other, so a single
 * inbound inquiry fans out across the queue: TALA intake → NYX scoring →
 * TALA reply, each as its own audited run.
 */
import {
  agents as agentsRepo,
  events as eventsRepo,
  leads as leadsRepo,
  messages as messagesRepo,
  runs as runsRepo,
  tenants as tenantsRepo,
} from "../db/repo.ts";
import { execute as hermesExecute, plan as hermesPlan } from "../agents/hermes.ts";
import { buildTalaInput } from "../agents/tala/engine.ts";
import { captureLeadContext, rememberReply, rememberScore } from "../agents/tala/memory.ts";
import { runtime } from "../agents/runtime.ts";
import { executeTool, type ToolInvocation } from "../tools/registry.ts";
import type { AgentId, AgentRun, SystemEvent, TenantContext } from "../types.ts";

export const AGENT_IDS: AgentId[] = ["tala", "nyx", "hermes"];

const ROUTES: Record<string, AgentId[]> = {
  "inquiry.received": ["tala"],
  "lead.created": ["nyx", "tala"],
  "lead.qualify.requested": ["nyx"],
  "lead.followup.requested": ["nyx"],
  "booking.created": ["hermes"],
  "booking.confirm.requested": ["hermes"],
  "system.sync.requested": ["hermes"],
};

/** Hard cap so a self-re-enqueuing agent cannot spin the drain forever. */
const MAX_EVENTS_PER_DRAIN = Number(process.env.RUNNER_MAX_DRAIN ?? 50);

export interface ProcessedRun {
  agent: AgentId;
  run_id: string;
  status: AgentRun["status"];
  summary: string;
  strategy: string;
  tool_calls: number;
  score?: number;
  reply?: string;
  latency_ms: number;
}

export interface DrainResult {
  processed_events: number;
  runs: ProcessedRun[];
  stopped_reason: "queue_empty" | "drain_limit";
}

/* ------------------------------------------------------------------ */
/* gates                                                               */
/* ------------------------------------------------------------------ */

interface GateResult {
  allowed: boolean;
  reason?: string;
}

function gate(ctx: TenantContext, agent: AgentId, event: SystemEvent): GateResult {
  const tenant = tenantsRepo.require(ctx.tenant_id);
  if (tenant.status !== "active") {
    return { allowed: false, reason: `Tenant "${tenant.name}" is ${tenant.status}` };
  }
  const config = agentsRepo.upsert(ctx, agent);
  if (!config.enabled) {
    return { allowed: false, reason: `${agent.toUpperCase()} is disabled for this tenant` };
  }
  const rule = tenant.rules?.[agent];
  const forced = event.payload?.force === true;
  if (rule === "manual" && !forced) {
    return { allowed: false, reason: `${agent.toUpperCase()} is set to manual` };
  }
  if (agent === "nyx" && event.type === "lead.followup.requested" && rule === "score-leads-only") {
    return { allowed: false, reason: "NYX rule 'score-leads-only' suppresses follow-ups" };
  }
  return { allowed: true };
}

/* ------------------------------------------------------------------ */
/* TALA                                                                */
/* ------------------------------------------------------------------ */

async function runTala(ctx: TenantContext, event: SystemEvent): Promise<ProcessedRun | null> {
  const started = performance.now();
  const tenant = tenantsRepo.require(ctx.tenant_id);
  const config = agentsRepo.upsert(ctx, "tala");

  // Intake: a brand-new inquiry becomes a lead row first.
  if (event.type === "inquiry.received") {
    const lead = leadsRepo.create(ctx, {
      name: String(event.payload?.name ?? "New guest"),
      email: event.payload?.email ? String(event.payload.email) : "",
      channel: event.payload?.channel ? String(event.payload.channel) : "Website",
      inquiry: String(event.payload?.inquiry ?? ""),
      assigned_agent: "tala",
      status: "new",
    });
    captureLeadContext(ctx, lead, tenant.name);

    const run = runsRepo.record(ctx, {
      agent: "tala",
      event_id: event.id,
      status: "ok",
      strategy: "local:intake",
      input: { inquiry: event.payload ?? {}, lead_id: lead.id },
      decision: { lead_id: lead.id, channel: lead.channel },
      reasoning: `Captured inbound ${lead.channel} inquiry and persisted lead with memory context`,
      tags: ["intake", lead.channel.toLowerCase()],
      output_text: `Lead ${lead.id} created`,
      latency_ms: Math.round(performance.now() - started),
    });
    agentsRepo.recordAction(ctx, "tala", `Captured inquiry from ${lead.name}`);

    eventsRepo.enqueue(ctx, {
      type: "lead.created",
      agent: "tala",
      level: "success",
      message: `New inquiry captured from ${lead.channel}`,
      entity_id: lead.id,
      payload: { lead_id: lead.id, force: event.payload?.force === true },
    });

    return {
      agent: "tala",
      run_id: run.id,
      status: "ok",
      summary: `Captured inquiry from ${lead.name}`,
      strategy: "local:intake",
      tool_calls: 0,
      latency_ms: run.latency_ms,
    };
  }

  // Reply: only on lead.created (a follow-up is NYX's job to trigger).
  if (event.type !== "lead.created") return null;

  const leadId = String(event.payload?.lead_id ?? "");
  const lead = leadsRepo.get(ctx, leadId);
  if (!lead) {
    const run = runsRepo.record(ctx, {
      agent: "tala",
      event_id: event.id,
      status: "failed",
      strategy: runtime.tala.id,
      input: { lead_id: leadId },
      error: `Lead ${leadId} not found for reply`,
      latency_ms: Math.round(performance.now() - started),
    });
    return {
      agent: "tala",
      run_id: run.id,
      status: "failed",
      summary: `Lead ${leadId} not found`,
      strategy: runtime.tala.id,
      tool_calls: 0,
      latency_ms: run.latency_ms,
    };
  }

  if (config.config.auto_reply !== true) {
    const run = runsRepo.record(ctx, {
      agent: "tala",
      event_id: event.id,
      status: "skipped",
      strategy: runtime.tala.id,
      input: { lead_id: lead.id },
      reasoning: "auto_reply is disabled in this tenant's TALA config",
      latency_ms: Math.round(performance.now() - started),
    });
    return {
      agent: "tala",
      run_id: run.id,
      status: "skipped",
      summary: "auto_reply disabled",
      strategy: runtime.tala.id,
      tool_calls: 0,
      latency_ms: run.latency_ms,
    };
  }

  const input = buildTalaInput({
    ctx,
    lead_id: lead.id,
    lead_name: lead.name,
    channel: lead.channel,
    inquiry: lead.inquiry,
    business_name: tenant.branding_config.app_name || tenant.name,
    tone: String(config.behavior?.tone ?? "hospitality"),
  });

  const tool_calls: { tool: string; ok: boolean; args: Record<string, unknown>; result: Record<string, unknown>; latency_ms: number; at: string }[] = [];
  let decision;
  let errorText: string | null = null;

  try {
    decision = await runtime.tala.composeReply(input);
    const tool: ToolInvocation = {
      tool: lead.channel === "Email" ? "email.send" : "whatsapp.send",
      args:
        lead.channel === "Email"
          ? { lead_id: lead.id, agent: "tala", to: lead.email || "unknown", subject: `Re: your enquiry — ${tenant.name}`, content: decision.reply }
          : { lead_id: lead.id, agent: "tala", content: decision.reply },
    };
    tool_calls.push(await executeTool(ctx, tool));
  } catch (error) {
    errorText = error instanceof Error ? error.message : String(error);
    decision = {
      reply: "",
      intent: "general",
      next_action: "",
      strategy: runtime.tala.id,
      tokens_in: null,
      tokens_out: null,
      cost_usd: null,
      model_id: null,
    };
  }

  const ok = !errorText && tool_calls.every((t) => t.ok);

  if (ok) {
    rememberReply(ctx, lead.id, decision.reply, decision.intent);
    if (lead.status === "new") {
      leadsRepo.update(ctx, lead.id, { status: "contacted" });
    }
    agentsRepo.recordAction(ctx, "tala", `Replied to ${lead.name}`);
  }

  const run = runsRepo.record(ctx, {
    agent: "tala",
    event_id: event.id,
    status: ok ? "ok" : "failed",
    strategy: decision.strategy,
    input: { lead_id: lead.id, memory_facts: input.memory.length, prior_outbound: input.prior_outbound_count },
    decision: { intent: decision.intent, next_action: decision.next_action },
    reasoning: ok
      ? `Composed ${decision.intent} reply using ${input.memory.length} retrieved memory fact(s)`
      : (errorText ?? "Tool execution failed"),
    tags: [decision.intent, runtime.tala.id],
    tool_calls,
    output_text: decision.reply,
    latency_ms: Math.round(performance.now() - started),
    tokens_in: decision.tokens_in,
    tokens_out: decision.tokens_out,
    cost_usd: decision.cost_usd,
    model_id: decision.model_id,
    error: errorText,
  });

  return {
    agent: "tala",
    run_id: run.id,
    status: run.status,
    summary: ok ? `Replied to ${lead.name} (${decision.intent})` : `Reply failed for ${lead.name}`,
    strategy: decision.strategy,
    tool_calls: tool_calls.length,
    reply: decision.reply,
    latency_ms: run.latency_ms,
  };
}

/* ------------------------------------------------------------------ */
/* NYX                                                                 */
/* ------------------------------------------------------------------ */

async function runNyx(ctx: TenantContext, event: SystemEvent): Promise<ProcessedRun | null> {
  const started = performance.now();
  const leadId = String(event.payload?.lead_id ?? "");
  const lead = leadsRepo.get(ctx, leadId);
  if (!lead) return null;

  const config = agentsRepo.upsert(ctx, "nyx");
  const tenant = tenantsRepo.require(ctx.tenant_id);

  // Follow-up path: NYX decides whether a nudge is due, then sends it.
  if (event.type === "lead.followup.requested") {
    const hours = Number(config.config.follow_up_hours ?? 24);
    const lastOutbound = messagesRepo
      .list(ctx, lead.id)
      .filter((m) => m.direction === "outbound")
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const lastTouch = lastOutbound?.created_at ?? lead.created_at;
    const dueHours = (Date.now() - Date.parse(lastTouch)) / 3_600_000;
    const due = event.payload?.force === true || dueHours >= hours;

    if (lead.status === "converted" || !due) {
      const run = runsRepo.record(ctx, {
        agent: "nyx",
        event_id: event.id,
        status: "skipped",
        strategy: runtime.nyx.id,
        input: { lead_id: lead.id, hours_since_last_touch: Math.round(dueHours * 10) / 10 },
        reasoning:
          lead.status === "converted"
            ? "Lead already converted — no follow-up sent"
            : `Only ${Math.round(dueHours * 10) / 10}h since last touch (threshold ${hours}h)`,
        tags: ["followup_suppressed"],
        latency_ms: Math.round(performance.now() - started),
      });
      return {
        agent: "nyx",
        run_id: run.id,
        status: "skipped",
        summary: `Follow-up not due for ${lead.name}`,
        strategy: runtime.nyx.id,
        tool_calls: 0,
        latency_ms: run.latency_ms,
      };
    }

    const text =
      `Hello ${lead.name.split(" ")[0]}, following up on your enquiry with ${tenant.name}. ` +
      `Is there anything else you need from us to move ahead?`;
    const call = await executeTool(ctx, {
      tool: lead.channel === "Email" ? "email.send" : "whatsapp.send",
      args:
        lead.channel === "Email"
          ? { lead_id: lead.id, agent: "nyx", to: lead.email || "unknown", subject: `Following up — ${tenant.name}`, content: text }
          : { lead_id: lead.id, agent: "nyx", content: text },
    });
    leadsRepo.update(ctx, lead.id, { status: lead.status === "new" ? "contacted" : lead.status });
    agentsRepo.recordAction(ctx, "nyx", `Followed up with ${lead.name}`);

    const run = runsRepo.record(ctx, {
      agent: "nyx",
      event_id: event.id,
      status: call.ok ? "ok" : "failed",
      strategy: runtime.nyx.id,
      input: { lead_id: lead.id, hours_since_last_touch: Math.round(dueHours * 10) / 10 },
      decision: { threshold_hours: hours, sent: call.ok },
      reasoning: `${Math.round(dueHours * 10) / 10}h since last touch, threshold ${hours}h — follow-up sent`,
      tags: ["followup_sent"],
      tool_calls: [call],
      output_text: text,
      latency_ms: Math.round(performance.now() - started),
    });
    return {
      agent: "nyx",
      run_id: run.id,
      status: run.status,
      summary: `Followed up with ${lead.name}`,
      strategy: runtime.nyx.id,
      tool_calls: 1,
      latency_ms: run.latency_ms,
    };
  }

  // Scoring path — the LLM-swappable decision.
  const prior = messagesRepo.list(ctx, lead.id).length;
  const ageHours = (Date.now() - Date.parse(lead.created_at)) / 3_600_000;

  let result;
  try {
    result = await runtime.nyx.scoreLead({
      lead_id: lead.id,
      tenant_id: ctx.tenant_id,
      name: lead.name,
      email: lead.email,
      channel: lead.channel,
      inquiry: lead.inquiry,
      prior_touches: prior,
      lead_age_hours: ageHours,
      tenant_name: tenant.name,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const run = runsRepo.record(ctx, {
      agent: "nyx",
      event_id: event.id,
      status: "failed",
      strategy: runtime.nyx.id,
      input: { lead_id: lead.id },
      reasoning: message,
      error: message,
      latency_ms: Math.round(performance.now() - started),
    });
    return {
      agent: "nyx",
      run_id: run.id,
      status: "failed",
      summary: `Scoring failed for ${lead.name}: ${message}`,
      strategy: runtime.nyx.id,
      tool_calls: 0,
      latency_ms: run.latency_ms,
    };
  }

  const threshold = Number(config.config.qualification_threshold ?? 65);
  const qualified = result.score >= threshold;

  leadsRepo.update(ctx, lead.id, {
    score: result.score,
    score_reasoning: result.reasoning,
    score_tags: result.tags,
    ...(qualified && lead.status !== "converted" ? { status: "qualified" as const } : {}),
  });
  rememberScore(ctx, lead.id, result.score, result.reasoning, result.tags, result.strategy);
  agentsRepo.recordAction(ctx, "nyx", `Scored ${lead.name}: ${result.score}/100`);

  const run = runsRepo.record(ctx, {
    agent: "nyx",
    event_id: event.id,
    status: "ok",
    strategy: result.strategy,
    input: {
      lead_id: lead.id,
      inquiry: lead.inquiry,
      channel: lead.channel,
      prior_touches: prior,
      lead_age_hours: Math.round(ageHours * 10) / 10,
    },
    decision: {
      score: result.score,
      threshold,
      qualified,
      breakdown: (result as { breakdown?: unknown }).breakdown ?? [],
    },
    reasoning: result.reasoning,
    tags: result.tags,
    output_text: `${result.score}/100`,
    latency_ms: Math.round(performance.now() - started),
    tokens_in: result.tokens_in,
    tokens_out: result.tokens_out,
    cost_usd: result.cost_usd,
    model_id: result.model_id,
  });

  return {
    agent: "nyx",
    run_id: run.id,
    status: "ok",
    summary: `Scored ${lead.name}: ${result.score}/100 (${qualified ? "qualified" : "not qualified"})`,
    strategy: result.strategy,
    tool_calls: 0,
    score: result.score,
    latency_ms: run.latency_ms,
  };
}

/* ------------------------------------------------------------------ */
/* HERMES                                                              */
/* ------------------------------------------------------------------ */

async function runHermes(ctx: TenantContext, event: SystemEvent): Promise<ProcessedRun> {
  const started = performance.now();
  const { summary: planned } = hermesPlan(event, ctx);
  const { summary, tool_calls } = await hermesExecute(event, ctx);
  const failed = tool_calls.filter((t) => !t.ok).length;

  agentsRepo.recordAction(ctx, "hermes", summary);
  const run = runsRepo.record(ctx, {
    agent: "hermes",
    event_id: event.id,
    status: failed ? "failed" : "ok",
    strategy: "local:orchestrator",
    input: { event_type: event.type, payload: event.payload, plan: planned },
    decision: { summary, tool_count: tool_calls.length },
    reasoning: planned,
    tags: ["orchestration", event.type],
    tool_calls,
    output_text: summary,
    latency_ms: Math.round(performance.now() - started),
    error: failed ? `${failed} tool call(s) failed` : null,
  });

  return {
    agent: "hermes",
    run_id: run.id,
    status: run.status,
    summary,
    strategy: "local:orchestrator",
    tool_calls: tool_calls.length,
    latency_ms: run.latency_ms,
  };
}

/* ------------------------------------------------------------------ */
/* dispatch + drain                                                    */
/* ------------------------------------------------------------------ */

export async function processEvent(event: SystemEvent): Promise<ProcessedRun[]> {
  const ctx: TenantContext = { tenant_id: event.tenant_id };
  const targets = ROUTES[event.type];

  if (!targets) {
    eventsRepo.settle(event.id, "skipped", `No route for event type "${event.type}"`);
    return [];
  }

  const results: ProcessedRun[] = [];

  for (const agent of targets) {
    const gateResult = gate(ctx, agent, event);
    if (!gateResult.allowed) {
      runsRepo.record(ctx, {
        agent,
        event_id: event.id,
        status: "skipped",
        strategy: "gate",
        input: { event_type: event.type },
        reasoning: gateResult.reason ?? "Blocked by gate",
        tags: ["skipped"],
        latency_ms: 0,
      });
      results.push({
        agent,
        run_id: "",
        status: "skipped",
        summary: gateResult.reason ?? "Skipped",
        strategy: "gate",
        tool_calls: 0,
        latency_ms: 0,
      });
      continue;
    }

    try {
      const result =
        agent === "tala" ? await runTala(ctx, event)
        : agent === "nyx" ? await runNyx(ctx, event)
        : await runHermes(ctx, event);
      if (result) results.push(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const run = runsRepo.record(ctx, {
        agent,
        event_id: event.id,
        status: "failed",
        strategy: "error",
        input: { event_type: event.type },
        error: message,
        reasoning: message,
        latency_ms: 0,
      });
      results.push({
        agent,
        run_id: run.id,
        status: "failed",
        summary: `${agent.toUpperCase()} failed: ${message}`,
        strategy: "error",
        tool_calls: 0,
        latency_ms: 0,
      });
    }
  }

  const anyFailed = results.some((r) => r.status === "failed");
  eventsRepo.settle(event.id, anyFailed ? "failed" : "done");
  return results;
}

/**
 * Drain the queue. Returns every run produced so the HTTP response can show the
 * caller exactly what the agents did.
 */
export async function drain(limit = MAX_EVENTS_PER_DRAIN): Promise<DrainResult> {
  const runs: ProcessedRun[] = [];
  let processed = 0;

  while (processed < limit) {
    const event = eventsRepo.claimNext();
    if (!event) return { processed_events: processed, runs, stopped_reason: "queue_empty" };
    processed += 1;
    const produced = await processEvent(event);
    runs.push(...produced);
  }

  return { processed_events: processed, runs, stopped_reason: "drain_limit" };
}
