/**
 * Tool execution layer.
 *
 * A tool is a named, typed, side-effecting capability. Tools are the ONLY place
 * in the system that mutates external-facing state; agents may not touch the
 * repos for outbound actions directly.
 *
 * `whatsapp.send` and `email.send` are transport stubs: they perform no network
 * I/O and instead write a structured delivery record to the outbox table. The
 * interface is the real one — swapping in a live transport means replacing the
 * `execute` body, not the call sites.
 */
import { bookings as bookingsRepo, leads as leadsRepo, messages as messagesRepo } from "../db/repo.ts";
import type { AgentId, TenantContext } from "../types.ts";

export type ToolName = "whatsapp.send" | "booking.create" | "email.send" | "lead.assign";

export interface ToolResult {
  ok: boolean;
  data: Record<string, unknown>;
  error?: string;
}

export interface ToolDefinition {
  name: ToolName;
  description: string;
  /** True when the tool reaches outside the process (none do in this build). */
  external: boolean;
  required: string[];
  execute(ctx: TenantContext, args: Record<string, unknown>): Promise<ToolResult>;
}

function require_(args: Record<string, unknown>, keys: string[]): void {
  const missing = keys.filter((k) => args[k] === undefined || args[k] === null || args[k] === "");
  if (missing.length) throw new Error(`Missing required argument(s): ${missing.join(", ")}`);
}

/* ------------------------------------------------------------------ */
/* transports                                                          */
/* ------------------------------------------------------------------ */

const whatsapp: ToolDefinition = {
  name: "whatsapp.send",
  description:
    "Send a WhatsApp message. Transport stubbed: writes a delivery record to the outbox instead of calling the WhatsApp Cloud API.",
  external: false,
  required: ["lead_id", "content"],
  async execute(ctx, args) {
    require_(args, this.required);
    const lead = leadsRepo.require(ctx, String(args.lead_id));
    const message = messagesRepo.create(ctx, {
      lead_id: lead.id,
      agent: (args.agent as AgentId) ?? "tala",
      content: String(args.content),
      channel: "WhatsApp",
      direction: "outbound",
    });
    return {
      ok: true,
      data: {
        message_id: message.id,
        channel: "WhatsApp",
        to: lead.name,
        delivery: "outbox_stub",
        transport: "not_connected",
        note: "No external API called. Record persisted to messages table.",
      },
    };
  },
};

const email: ToolDefinition = {
  name: "email.send",
  description:
    "Send an email. Transport stubbed: writes a delivery record to the outbox instead of calling an SMTP/ESP provider.",
  external: false,
  required: ["to", "subject", "content"],
  async execute(ctx, args) {
    require_(args, this.required);
    const message = messagesRepo.create(ctx, {
      lead_id: args.lead_id ? String(args.lead_id) : null,
      agent: (args.agent as AgentId) ?? "tala",
      content: `[${String(args.subject)}]\n${String(args.content)}`,
      channel: "Email",
      direction: "outbound",
    });
    return {
      ok: true,
      data: {
        message_id: message.id,
        channel: "Email",
        to: String(args.to),
        subject: String(args.subject),
        delivery: "outbox_stub",
        transport: "not_connected",
        note: "No external API called. Record persisted to messages table.",
      },
    };
  },
};

/* ------------------------------------------------------------------ */
/* state-mutating tools                                                */
/* ------------------------------------------------------------------ */

const bookingCreate: ToolDefinition = {
  name: "booking.create",
  description: "Create a booking record in the database and return the assigned reference.",
  external: false,
  required: ["guest"],
  async execute(ctx, args) {
    require_(args, this.required);
    const booking = bookingsRepo.create(ctx, {
      guest: String(args.guest),
      email: args.email ? String(args.email) : undefined,
      service: args.service ? String(args.service) : undefined,
      date: args.date ? String(args.date) : undefined,
      amount: args.amount !== undefined ? Number(args.amount) : undefined,
      status: "pending",
    });
    return {
      ok: true,
      data: { booking_id: booking.id, reference: booking.reference, status: booking.status },
    };
  },
};

const leadAssign: ToolDefinition = {
  name: "lead.assign",
  description: "Assign a lead to an agent and optionally move its status.",
  external: false,
  required: ["lead_id", "agent"],
  async execute(ctx, args) {
    require_(args, this.required);
    const agent = String(args.agent);
    if (!["tala", "nyx", "hermes"].includes(agent)) {
      throw new Error(`Unknown agent: ${agent}`);
    }
    const status = args.status as "new" | "contacted" | "qualified" | "converted" | undefined;
    if (status && !["new", "contacted", "qualified", "converted"].includes(status)) {
      throw new Error(`Unknown lead status: ${status}`);
    }
    const lead = leadsRepo.update(ctx, String(args.lead_id), {
      assigned_agent: agent as AgentId,
      ...(status ? { status } : {}),
    });
    return {
      ok: true,
      data: { lead_id: lead.id, assigned_agent: lead.assigned_agent, status: lead.status },
    };
  },
};

/* ------------------------------------------------------------------ */
/* registry                                                            */
/* ------------------------------------------------------------------ */

const REGISTRY = new Map<ToolName, ToolDefinition>(
  [whatsapp, email, bookingCreate, leadAssign].map((t) => [t.name, t]),
);

export function listTools(): { name: ToolName; description: string; external: boolean; required: string[] }[] {
  return [...REGISTRY.values()].map(({ name, description, external, required }) => ({
    name,
    description,
    external,
    required,
  }));
}

export function hasTool(name: string): boolean {
  return REGISTRY.has(name as ToolName);
}

export function getTool(name: string): ToolDefinition {
  const tool = REGISTRY.get(name as ToolName);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}. Available: ${[...REGISTRY.keys()].join(", ")}`);
  }
  return tool;
}

export interface ToolInvocation {
  tool: ToolName;
  args: Record<string, unknown>;
}

export interface ToolExecutionRecord {
  tool: string;
  ok: boolean;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
  latency_ms: number;
  at: string;
}

/** Execute a tool and return a record suitable for `agent_runs.tool_calls`. */
export async function executeTool(
  ctx: TenantContext,
  invocation: ToolInvocation,
): Promise<ToolExecutionRecord> {
  const started = performance.now();
  const tool = getTool(invocation.tool);
  try {
    const result = await tool.execute(ctx, invocation.args);
    return {
      tool: tool.name,
      ok: result.ok,
      args: invocation.args,
      result: result.data,
      latency_ms: Math.round(performance.now() - started),
      at: new Date().toISOString(),
    };
  } catch (error) {
    return {
      tool: tool.name,
      ok: false,
      args: invocation.args,
      result: { error: error instanceof Error ? error.message : String(error) },
      latency_ms: Math.round(performance.now() - started),
      at: new Date().toISOString(),
    };
  }
}
