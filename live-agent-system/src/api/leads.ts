import { resolveTenant } from "../core/tenantResolver";
import { db } from "../services/db";
import type { AgentId, Channel, LeadStatus, Session } from "../types/database";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const leadsApi = {
  list: (session: Session, tenant_id: string) =>
    db.forTenant(resolveTenant(session, tenant_id)).list("leads"),

  async create(
    session: Session,
    tenant_id: string,
    input: {
      name: string;
      email: string;
      channel: Channel;
      inquiry: string;
      status?: LeadStatus;
      assigned_agent?: AgentId;
    },
  ) {
    const context = resolveTenant(session, tenant_id);
    if (!input.name.trim() || !EMAIL.test(input.email)) {
      throw new Error("Enter a name and a valid email address.");
    }
    return db.insertLead(context, {
      name: input.name.trim(),
      email: input.email.trim(),
      channel: input.channel,
      inquiry: input.inquiry.trim() || "General inquiry",
      status: input.status ?? "new",
      assigned_agent: input.assigned_agent ?? "tala",
    });
  },

  async update(
    session: Session,
    tenant_id: string,
    id: string,
    patch: {
      name?: string;
      email?: string;
      channel?: Channel;
      inquiry?: string;
      status?: LeadStatus;
      assigned_agent?: AgentId;
    },
  ) {
    const context = resolveTenant(session, tenant_id);
    if (patch.status && !["new", "contacted", "qualified", "converted"].includes(patch.status)) {
      throw new Error("Invalid lead status.");
    }
    if (patch.assigned_agent && !["tala", "nyx", "hermes"].includes(patch.assigned_agent)) {
      throw new Error("Unknown agent.");
    }
    if (patch.email !== undefined && !EMAIL.test(patch.email.trim())) {
      throw new Error("Enter a valid email address.");
    }
    return db.updateLead(context, id, {
      ...patch,
      ...(patch.name ? { name: patch.name.trim() } : {}),
      ...(patch.email ? { email: patch.email.trim() } : {}),
      ...(patch.inquiry ? { inquiry: patch.inquiry.trim() } : {}),
    });
  },

  async remove(session: Session, tenant_id: string, id: string) {
    await db.removeLead(resolveTenant(session, tenant_id), id);
  },
};
