import { eventBus } from "../core/eventBus";
import { db } from "../services/db";
import { makeId } from "../services/seed";
import type { AgentConfig, SystemEvent, TenantContext } from "../types/database";
import { completeAction } from "./shared";

export function nyx(context: TenantContext, event: SystemEvent, settings: AgentConfig): void {
  const scoped = db.forTenant(context);
  const lead = scoped.get("leads", String(event.payload.lead_id));
  if (event.type === "lead.created" || event.type === "lead.qualify.requested") {
    const score = Math.min(99, 45 + (lead.email ? 15 : 0) + (lead.inquiry.length > 30 ? 15 : 0) + (/book|reserv|quote|install|price/i.test(lead.inquiry) ? 20 : 0));
    const threshold = Number(settings.config.qualification_threshold ?? 65);
    scoped.update("leads", lead.id, { score, updated_at: new Date().toISOString() });
    completeAction(context, "nyx", `Scored ${lead.name}: ${score}/100`);
    eventBus.publish(context, { type: score >= threshold ? "lead.qualified" : "lead.scored", agent: "nyx", level: "success", message: `${score >= threshold ? "Lead qualified" : "Lead scored"}: ${lead.name}`, entity_id: lead.id, payload: { lead_id: lead.id, score, threshold } });
    return;
  }
  if (event.type !== "lead.followup.requested") return;
  const hours = Number(settings.config.follow_up_hours ?? 24);
  const messages = scoped.list("messages").filter((m) => m.lead_id === lead.id && m.direction === "outbound").sort((a, b) => b.created_at.localeCompare(a.created_at));
  const lastTouch = messages[0]?.created_at ?? lead.created_at;
  if (lead.status === "converted" || (event.payload.force !== true && Date.now() - new Date(lastTouch).getTime() < hours * 3_600_000)) {
    eventBus.publish(context, { type: "followup.skipped", agent: "nyx", message: `Follow-up not due for ${lead.name}`, entity_id: lead.id, payload: { lead_id: lead.id, wait_hours: hours, status: lead.status } });
    return;
  }
  const tenant = db.getTenant(context);
  const message = scoped.insert("messages", { id: makeId(), lead_id: lead.id, agent: "nyx", content: `Hello ${lead.name.split(" ")[0]}, following up on your inquiry with ${tenant.name}. Can we help with the next step?`, channel: lead.channel, direction: "outbound", created_at: new Date().toISOString() });
  scoped.update("leads", lead.id, { status: "contacted", updated_at: message.created_at });
  completeAction(context, "nyx", `Followed up with ${lead.name}`);
  eventBus.publish(context, { type: "followup.sent", agent: "nyx", level: "success", message: `Follow-up sent to ${lead.name}`, entity_id: lead.id, payload: { lead_id: lead.id, message_id: message.id, delivery: "mock_outbox" } });
}