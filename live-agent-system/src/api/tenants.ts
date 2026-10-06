import { backend } from "../services/backend";
import { resolveTenant } from "../core/tenantResolver";
import { db } from "../services/db";
import type { AdminData, Session, Tenant } from "../types/database";
import { validateRules } from "./agents";

export const tenantsApi = {
  list: (session: Session) => db.listTenants(session),
  get: (session: Session, tenant_id: string) => db.getTenant(resolveTenant(session, tenant_id)),

  async create(session: Session, input: Omit<Tenant, "id" | "created_at" | "rules">) {
    return db.createTenant(session, input);
  },

  async update(session: Session, tenant_id: string, patch: Partial<Omit<Tenant, "id" | "created_at">>) {
    const context = resolveTenant(session, tenant_id);
    if (patch.rules) validateRules(patch.rules);
    if (patch.status && !["active", "paused", "setup"].includes(patch.status)) {
      throw new Error("Invalid tenant status.");
    }
    return db.updateTenant(context, patch);
  },

  async remove(session: Session, tenant_id: string) {
    await db.deleteTenant(resolveTenant(session, tenant_id));
  },

  /** Per-tenant agent run history from the backend audit table. */
  runs: async (session: Session, tenant_id: string, agent?: string) => {
    resolveTenant(session, tenant_id);
    const { runs } = await backend.agents.runs(tenant_id, agent);
    return runs;
  },
};

/** Read from the synced cache; scope is validated per tenant. */
export function getAdminData(session: Session, scope: string): AdminData {
  if (scope !== "all") resolveTenant(session, scope);
  const allowed = db.listTenants(session);
  if (scope === "all" && session.role !== "platform_admin") {
    throw new Error("Only administrators can view all tenants.");
  }
  const tenants = scope === "all" ? allowed : allowed.filter((t) => t.id === scope);
  const result: AdminData = { tenants, leads: [], bookings: [], messages: [], events: [], agents: [] };
  for (const tenant of tenants) {
    const scoped = db.forTenant(resolveTenant(session, tenant.id));
    result.leads.push(...scoped.list("leads"));
    result.bookings.push(...scoped.list("bookings"));
    result.messages.push(...scoped.list("messages"));
    result.events.push(...scoped.list("events"));
    result.agents.push(...scoped.list("agents"));
  }
  result.events.sort((a, b) => b.created_at.localeCompare(a.created_at));
  result.leads.sort((a, b) => b.created_at.localeCompare(a.created_at));
  result.bookings.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return result;
}
