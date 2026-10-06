import type { Session, TenantContext } from "../types/database";

export function requireAdmin(session: Session): void {
  if (!session.user_id || session.role !== "platform_admin") {
    throw new Error("Platform administrator access is required.");
  }
}

export function resolveTenant(session: Session, tenant_id: string): TenantContext {
  if (!session.user_id) throw new Error("An active session is required.");
  if (!["platform_admin", "tenant_admin", "member"].includes(session.role)) {
    throw new Error("Unrecognized session role.");
  }
  if (!tenant_id || tenant_id === "all") throw new Error("Select a specific tenant before performing this action.");
  if (session.role !== "platform_admin" && session.tenant_id !== tenant_id) {
    throw new Error("Access denied: this tenant is outside your workspace.");
  }
  return Object.freeze({ tenant_id, session });
}

export function assertTenantRecord(context: TenantContext, record: { tenant_id: string } | undefined): void {
  resolveTenant(context.session, context.tenant_id);
  if (!record || record.tenant_id !== context.tenant_id) {
    throw new Error("Record not found in the current tenant.");
  }
}