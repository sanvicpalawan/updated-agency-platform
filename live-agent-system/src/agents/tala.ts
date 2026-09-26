import { eventBus } from "../core/eventBus";
import { db } from "../services/db";
import { makeId } from "../services/seed";
import type { AgentConfig, Channel, SystemEvent, TenantContext } from "../types/database";
import { completeAction } from "./shared";

export function tala(context: TenantContext, event: SystemEvent, settings: AgentConfig): void {
  const scoped = db.forTenant(context);
  const tenant = db.getTenant(context);
  if (event.type === "inquiry.received") {
    const now = new Date().toISOString();
    const lead = scoped.insert("leads", {
      id: makeId(), name: String(event.payload.name || "New guest"),
      email: String(event.payload.email || "guest@example.com"),
      inquiry: String(event.payload.inquiry || "Request for availability"),
      channel: (event.payload.channel as Channel) || "Website",
      assigned_agent: "tala", score: 50, status: "new", created_at: now, updated_at: now,
    });
    completeAction(context, "tala", `Captured inquiry from ${lead.name}`);
    eventBus.publish(context, { type: "lead.created", agent: "tala", level: "success", message: `New inquiry captured from ${lead.channel}`, entity_id: lead.id, payload: { lead_id: lead.id, name: lead.name, channel: lead.channel, force: event.payload.force === true } });
    return;
  }
  if (event.type !== "lead.created" || settings.config.auto_reply !== true) return;
  const lead = scoped.get("leads", String(event.payload.lead_id));
  const template = String(settings.config.reply_template || "Thank you for contacting {business}. Your inquiry has been received.");
  const message = scoped.insert("messages", {
    id: makeId(), lead_id: lead.id, agent: "tala", channel: lead.channel,
    direction: "outbound", content: template.replace(/\{business\}/g, tenant.branding_config.app_name),
    created_at: new Date().toISOString(),
  });
  if (lead.status === "new") scoped.update("leads", lead.id, { status: "contacted", updated_at: message.created_at });
  completeAction(context, "tala", `Replied to ${lead.name}`);
  eventBus.publish(context, { type: "message.sent", agent: "tala", level: "success", message: `TALA responded to ${lead.name}`, entity_id: lead.id, payload: { lead_id: lead.id, message_id: message.id, channel: lead.channel, delivery: "mock_outbox" } });
}