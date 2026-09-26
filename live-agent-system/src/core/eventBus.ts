import { db } from "../services/db";
import { makeId } from "../services/seed";
import type { EventInput, SystemEvent, TenantContext } from "../types/database";
import { resolveTenant } from "./tenantResolver";

type Handler = (context: TenantContext, event: SystemEvent) => void;

class EventBus {
  private handlers = new Set<Handler>();
  private depth = 0;

  subscribe(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => { this.handlers.delete(handler); };
  }

  publish(context: TenantContext, input: EventInput): SystemEvent {
    resolveTenant(context.session, context.tenant_id);
    if (this.depth >= 10) throw new Error("Event recursion limit reached.");
    const scoped = db.forTenant(context);
    if (typeof input.payload?.lead_id === "string") scoped.get("leads", input.payload.lead_id);
    if (typeof input.payload?.booking_id === "string") scoped.get("bookings", input.payload.booking_id);
    const event = scoped.insert("events", {
      id: makeId(), type: input.type, agent: input.agent ?? null,
      level: input.level ?? "info", message: input.message,
      entity_id: input.entity_id ?? null, payload: input.payload ?? {},
      created_at: new Date().toISOString(),
    });
    this.depth += 1;
    try { this.handlers.forEach((handler) => handler(context, event)); }
    finally { this.depth -= 1; }
    return event;
  }
}

export const eventBus = new EventBus();