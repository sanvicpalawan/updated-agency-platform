import { registerDispatcher } from "../core/dispatcher";
import { eventBus } from "../core/eventBus";
import { resolveTenant } from "../core/tenantResolver";
import { db } from "../services/db";
import { makeId } from "../services/seed";
import type { AgentId, Channel, LeadStatus, Session } from "../types/database";

export const leadsApi = {
  list: (session: Session, tenant_id: string) => db.forTenant(resolveTenant(session, tenant_id)).list("leads"),
  create(
    session: Session,
    tenant_id: string,
    input: {
      name: string;
      email: string;
      channel: Channel;
      inquiry: string;
      status?: LeadStatus;
      assigned_agent?: AgentId;
      score?: number;
    },
  ) {
    registerDispatcher();
    const context = resolveTenant(session, tenant_id);
    if (!input.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) throw new Error("Enter a name and a valid email address.");
    const now = new Date().toISOString();
    const lead = db.forTenant(context).insert("leads", {
      name: input.name.trim(),
      email: input.email.trim(),
      channel: input.channel,
      inquiry: input.inquiry.trim() || "General inquiry",
      id: makeId(),
      status: input.status ?? "new",
      score: typeof input.score === "number" ? Math.max(0, Math.min(100, input.score)) : 50,
      assigned_agent: input.assigned_agent ?? "tala",
      created_at: now,
      updated_at: now,
    });
    eventBus.publish(context, {
      type: "lead.created",
      agent: lead.assigned_agent,
      level: "success",
      message: `New lead captured: ${lead.name}`,
      entity_id: lead.id,
      payload: { lead_id: lead.id, channel: lead.channel, actor: session.name, tool: "lead_capture" },
    });
    return lead;
  },
  update(
    session: Session,
    tenant_id: string,
    id: string,
    patch: {
      name?: string;
      email?: string;
      channel?: Channel;
      inquiry?: string;
      score?: number;
      status?: LeadStatus;
      assigned_agent?: AgentId;
    },
  ) {
    const context = resolveTenant(session, tenant_id);
    if (patch.status && !["new", "contacted", "converted"].includes(patch.status)) throw new Error("Invalid lead status.");
    if (patch.assigned_agent && !["tala", "nyx", "hermes"].includes(patch.assigned_agent)) throw new Error("Unknown agent.");
    if (patch.email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patch.email.trim())) throw new Error("Enter a valid email address.");
    const scoped = db.forTenant(context);
    const before = scoped.get("leads", id);
    const lead = scoped.update("leads", id, {
      ...patch,
      ...(patch.name ? { name: patch.name.trim() } : {}),
      ...(patch.email ? { email: patch.email.trim() } : {}),
      ...(patch.inquiry ? { inquiry: patch.inquiry.trim() } : {}),
      ...(typeof patch.score === "number" ? { score: Math.max(0, Math.min(100, patch.score)) } : {}),
      updated_at: new Date().toISOString(),
    });
    eventBus.publish(context, {
      type: patch.status ? "lead.status_updated" : patch.assigned_agent ? "lead.assigned" : "lead.updated",
      agent: lead.assigned_agent,
      level: "success",
      message: patch.status
        ? `${lead.name} marked as ${patch.status}`
        : patch.assigned_agent
          ? `${lead.name} assigned to ${lead.assigned_agent.toUpperCase()}`
          : `Lead record updated: ${lead.name}`,
      entity_id: id,
      payload: { lead_id: id, previous: patch.status ? before.status : before.assigned_agent, ...patch, actor: session.name, tool: "lead_capture" },
    });
    return lead;
  },
  remove(session: Session, tenant_id: string, id: string) {
    const context = resolveTenant(session, tenant_id);
    const scoped = db.forTenant(context);
    const lead = scoped.get("leads", id);
    scoped.remove("leads", id);
    eventBus.publish(context, {
      type: "lead.deleted",
      level: "warning",
      message: `Lead deleted: ${lead.name}`,
      entity_id: id,
      payload: { lead_id: id, name: lead.name, email: lead.email, actor: session.name },
    });
  },
};
