import { eventBus } from "../core/eventBus";
import { registerDispatcher } from "../core/dispatcher";
import { resolveTenant } from "../core/tenantResolver";
import { db } from "../services/db";
import type { AgentId, Session } from "../types/database";

export const eventsApi = {
  list(session: Session, tenant_id: string, entity_id?: string) {
    return db.forTenant(resolveTenant(session, tenant_id)).list("events").filter((e) => !entity_id || e.entity_id === entity_id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  remove(session: Session, tenant_id: string, id: string) {
    const context = resolveTenant(session, tenant_id);
    db.forTenant(context).remove("events", id);
  },
  trigger(session: Session, tenant_id: string, agent: AgentId, automatic = false) {
    registerDispatcher();
    const context = resolveTenant(session, tenant_id);
    const tenant = db.getTenant(context);
    const scoped = db.forTenant(context);
    const settings = scoped.list("agents").find((a) => a.agent === agent);
    if (!settings?.enabled) throw new Error(`${agent.toUpperCase()} is disabled for this tenant.`);
    if (tenant.status !== "active") throw new Error("Activate this tenant before running its agents.");
    if (agent === "tala") {
      return eventBus.publish(context, {
        type: "inquiry.received",
        agent,
        message: "Inbound inquiry received",
        payload: {
          name: ["Sofia Reyes", "Daniel Park", "Isabella Cruz", "Liam Martin"][Math.floor(Math.random() * 4)],
          email: "guest@example.com",
          channel: "Website",
          inquiry: "I would like availability and a quote for next week.",
          force: !automatic,
          source: "mock_simulator",
          tool: "lead_capture",
          model_id: settings.openrouter?.model_id,
        },
      });
    }
    if (agent === "nyx") {
      const lead = scoped.list("leads").filter((l) => l.status !== "converted").sort((a, b) => a.updated_at.localeCompare(b.updated_at))[0];
      if (!lead) throw new Error("Create an unconverted lead before running NYX.");
      return eventBus.publish(context, {
        type: tenant.rules.nyx === "score-leads-only" ? "lead.qualify.requested" : "lead.followup.requested",
        agent,
        message: automatic ? "Scheduled follow-up check" : "Manual follow-up requested",
        entity_id: lead.id,
        payload: { lead_id: lead.id, force: !automatic, tool: "whatsapp_responder", model_id: settings.openrouter?.model_id },
      });
    }
    const booking = scoped.list("bookings").find((b) => b.status === "pending");
    return eventBus.publish(
      context,
      booking
        ? {
            type: "booking.confirm.requested",
            agent,
            message: "Booking confirmation requested",
            entity_id: booking.id,
            payload: { booking_id: booking.id, force: !automatic, tool: "booking_engine", model_id: settings.openrouter?.model_id },
          }
        : {
            type: "system.sync.requested",
            agent,
            message: "Tenant record sync requested",
            payload: { force: !automatic, tool: "ops_ledger", model_id: settings.openrouter?.model_id },
          },
    );
  },
};
