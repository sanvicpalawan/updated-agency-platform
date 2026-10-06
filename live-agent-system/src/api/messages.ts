import { resolveTenant } from "../core/tenantResolver";
import { db } from "../services/db";
import { backend } from "../services/backend";
import type { AgentId, Session } from "../types/database";

/**
 * Outbound messages are produced by backend tools. A human operator can still
 * send one, which is persisted through the API rather than the browser.
 */
export const messagesApi = {
  list(session: Session, tenant_id: string, leadId?: string) {
    const all = db.forTenant(resolveTenant(session, tenant_id)).list("messages");
    return leadId ? all.filter((message) => message.lead_id === leadId) : all;
  },
  forLead(session: Session, tenant_id: string, leadId: string) {
    return messagesApi.list(session, tenant_id, leadId);
  },
  async create(
    session: Session,
    tenant_id: string,
    input: { lead_id: string | null; agent: AgentId; content: string; channel: string; direction?: "inbound" | "outbound" },
  ) {
    resolveTenant(session, tenant_id);
    const { message } = await backend.messages.create(tenant_id, {
      ...input,
      direction: input.direction ?? "outbound",
    });
    await db.load(true).catch(() => undefined);
    return message;
  },
};
