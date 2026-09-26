import { eventBus } from "../core/eventBus";
import { resolveTenant } from "../core/tenantResolver";
import { db } from "../services/db";
import { makeId } from "../services/seed";
import type { AgentId, Channel, Session } from "../types/database";

export const messagesApi = {
  list(session: Session, tenant_id: string, lead_id?: string) {
    const scoped = db.forTenant(resolveTenant(session, tenant_id));
    if (lead_id) scoped.get("leads", lead_id);
    return scoped.list("messages").filter((message) => !lead_id || message.lead_id === lead_id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  create(
    session: Session,
    tenant_id: string,
    input: {
      lead_id: string | null;
      agent: AgentId;
      content: string;
      channel: Channel | "Internal";
      direction?: "inbound" | "outbound";
    },
  ) {
    const context = resolveTenant(session, tenant_id);
    if (!input.content.trim()) throw new Error("Message content cannot be empty.");
    const scoped = db.forTenant(context);
    const message = scoped.insert("messages", {
      id: makeId(),
      lead_id: input.lead_id,
      agent: input.agent,
      content: input.content.trim(),
      channel: input.channel,
      direction: input.direction ?? "outbound",
      created_at: new Date().toISOString(),
    });
    eventBus.publish(context, {
      type: "message.sent",
      agent: input.agent,
      level: "success",
      message: `${input.agent.toUpperCase()} logged ${input.channel} message`,
      entity_id: input.lead_id,
      payload: { message_id: message.id, channel: input.channel, tool: "whatsapp_responder" },
    });
    return message;
  },
  remove(session: Session, tenant_id: string, id: string) {
    const context = resolveTenant(session, tenant_id);
    const scoped = db.forTenant(context);
    scoped.remove("messages", id);
  },
};
