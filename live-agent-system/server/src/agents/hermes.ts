/**
 * HERMES — orchestration engine.
 *
 * Consumes events, decides which tools must fire, executes them through the
 * tool layer, and writes the resulting state changes back. HERMES deliberately
 * makes no LLM call: orchestration here is a routing and transaction concern,
 * and keeping it deterministic makes the pipeline auditable.
 *
 * `plan()` is strictly pure — it reads state and returns a plan. All mutation
 * happens in `execute()`. That split matters: the runner calls `plan()` once to
 * log intent and `execute()` once to act, so a side effect in `plan()` would
 * run twice and silently skip the tools.
 */
import { bookings as bookingsRepo, leads as leadsRepo, tenants as tenantsRepo } from "../db/repo.ts";
import { executeTool, type ToolExecutionRecord, type ToolInvocation } from "../tools/registry.ts";
import type { Booking, SystemEvent, TenantContext } from "../types.ts";

export interface HermesPlan {
  summary: string;
  invocations: ToolInvocation[];
  /** State transition to apply before running tools, if any. */
  transition: { booking_id: string; status: Booking["status"] } | null;
}

/** Pure: reads state, returns a plan. Performs no writes. */
export function plan(event: SystemEvent, ctx: TenantContext): HermesPlan {
  const tenant = tenantsRepo.require(ctx.tenant_id);
  const payload = event.payload ?? {};

  if (event.type === "system.sync.requested") {
    return {
      summary: `Reconciled records for ${tenant.name}`,
      invocations: [],
      transition: null,
    };
  }

  const bookingId = typeof payload.booking_id === "string" ? payload.booking_id : undefined;
  if (!bookingId) {
    return {
      summary: "No actionable booking reference in event payload",
      invocations: [],
      transition: null,
    };
  }

  const booking = bookingsRepo.require(ctx, bookingId);

  if (booking.status !== "pending") {
    return {
      summary: `Booking ${booking.reference} is already ${booking.status} — logged only`,
      invocations: [],
      transition: null,
    };
  }

  const invocations: ToolInvocation[] = [];

  if (booking.email) {
    invocations.push({
      tool: "email.send",
      args: {
        lead_id: null,
        agent: "hermes",
        to: booking.email,
        subject: `Booking ${booking.reference} confirmed — ${tenant.name}`,
        content:
          `Hello ${booking.guest},\n\n` +
          `Your ${booking.service || "reservation"} (${booking.reference}) is confirmed for ${booking.date || "the requested date"}.\n\n` +
          `— ${tenant.name}`,
      },
    });
  }

  // Internal staff dispatch. Only fires when the guest can be tied back to a
  // lead row — whatsapp.send requires a lead_id to attach the message to.
  const leadId = nearestLeadId(ctx, booking.guest);
  if (leadId) {
    invocations.push({
      tool: "whatsapp.send",
      args: {
        lead_id: leadId,
        agent: "hermes",
        content:
          `Internal: ${booking.reference} confirmed for ${booking.guest} (${booking.service}). ` +
          `Staff dispatch required.`,
      },
    });
  }

  return {
    summary:
      invocations.length > 0
        ? `Confirm ${booking.reference} and dispatch ${invocations.length} tool call(s)`
        : `Confirm ${booking.reference}`,
    invocations,
    transition: { booking_id: booking.id, status: "confirmed" },
  };
}

/** Best-effort link from a booking guest back to a lead row for the internal note. */
function nearestLeadId(ctx: TenantContext, guest: string): string | null {
  const match = leadsRepo
    .list(ctx)
    .find((l) => l.name.toLowerCase() === guest.toLowerCase());
  return match?.id ?? null;
}

export interface HermesOutcome {
  summary: string;
  tool_calls: ToolExecutionRecord[];
}

/** Apply the plan: state transition first, then tool execution. */
export async function execute(event: SystemEvent, ctx: TenantContext): Promise<HermesOutcome> {
  const { summary, invocations, transition } = plan(event, ctx);

  if (transition) {
    bookingsRepo.update(ctx, transition.booking_id, { status: transition.status });
  }

  const tool_calls: ToolExecutionRecord[] = [];
  for (const invocation of invocations) {
    tool_calls.push(await executeTool(ctx, invocation));
  }

  const failed = tool_calls.filter((t) => !t.ok).length;
  const applied = transition ? summary.replace(/^Confirm/, "Confirmed") : summary;

  return {
    summary: failed ? `${applied} (${failed} tool call(s) failed)` : applied,
    tool_calls,
  };
}
