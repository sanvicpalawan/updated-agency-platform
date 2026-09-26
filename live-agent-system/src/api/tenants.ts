import { eventBus } from "../core/eventBus";
import { resolveTenant } from "../core/tenantResolver";
import { db } from "../services/db";
import type { AdminData, Session, Tenant } from "../types/database";
import { validateRules } from "./agents";

export const tenantsApi = {
  list: (session: Session) => db.listTenants(session),
  get: (session: Session, tenant_id: string) => db.getTenant(resolveTenant(session, tenant_id)),
  create(session: Session, input: Omit<Tenant, "id" | "created_at" | "rules">) {
    const tenant = db.createTenant(session, input);
    eventBus.publish(resolveTenant(session, tenant.id), { type: "tenant.created", level: "success", message: `${tenant.name} workspace created`, payload: { slug: tenant.slug, actor: session.name } });
    return tenant;
  },
  update(session: Session, tenant_id: string, patch: Partial<Omit<Tenant, "id" | "created_at">>) {
    const context = resolveTenant(session, tenant_id);
    if (patch.rules) validateRules(patch.rules);
    if (patch.status && !["active", "paused", "setup"].includes(patch.status)) throw new Error("Invalid tenant status.");
    const tenant = db.updateTenant(context, patch);
    eventBus.publish(context, { type: patch.branding_config ? "branding.updated" : patch.rules ? "rules.updated" : "tenant.updated", level: "success", message: patch.branding_config ? "Branding configuration saved" : patch.rules ? "Automation rules saved" : "Tenant configuration updated", payload: { fields: Object.keys(patch), actor: session.name } });
    return tenant;
  },
  remove(session: Session, tenant_id: string) { db.deleteTenant(resolveTenant(session, tenant_id)); },
};

export function getAdminData(session: Session, scope: string): AdminData {
  if (scope !== "all") resolveTenant(session, scope);
  const allowed = db.listTenants(session);
  if (scope === "all" && session.role !== "platform_admin") throw new Error("Only administrators can view all tenants.");
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