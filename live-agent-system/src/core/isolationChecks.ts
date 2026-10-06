import { requireSession } from "../services/auth";
import { db } from "../services/db";
import { resolveTenant } from "./tenantResolver";

export interface IsolationCheck { name: string; passed: boolean; note?: string }

// Read-only diagnostics for the mock adapter. These are not a security audit.
export function runIsolationChecks(): IsolationCheck[] {
  const checks: IsolationCheck[] = [];
  const check = (name: string, test: () => boolean) => {
    try { checks.push({ name, passed: test() }); }
    catch (error) { checks.push({ name, passed: false, note: error instanceof Error ? error.message : "Check failed" }); }
  };
  const denied = (action: () => unknown) => { try { action(); return false; } catch { return true; } };
  check("Unscoped requests are rejected", () => denied(() => resolveTenant(requireSession(), "")));
  check("Global scope cannot write tenant records", () => denied(() => resolveTenant(requireSession(), "all")));
  const tenants = db.listTenants(requireSession());
  if (tenants.length) {
    const own = tenants[0];
    const context = resolveTenant(requireSession(), own.id);
    check("Every record table is tenant-filtered", () => (["leads", "bookings", "messages", "users", "events", "agents"] as const).every((table) => db.forTenant(context).list(table).every((row) => row.tenant_id === own.id)));
    check("Read results cannot mutate stored branding", () => {
      const snapshot = db.getTenant(context);
      snapshot.branding_config.app_name = "isolation-check";
      return db.getTenant(context).branding_config.app_name === own.branding_config.app_name;
    });
    const other = tenants.find((tenant) => tenant.id !== own.id);
    if (other) {
      check("Tenant members cannot switch workspaces", () => denied(() => resolveTenant({ user_id: "mock-member", name: "Member", role: "tenant_admin", tenant_id: own.id }, other.id)));
      const foreign = db.forTenant(resolveTenant(requireSession(), other.id)).list("leads")[0];
      if (foreign) check("Foreign record IDs cannot be read", () => denied(() => db.forTenant(context).get("leads", foreign.id)));
    }
  }
  return checks;
}