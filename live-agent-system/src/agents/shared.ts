import { db } from "../services/db";
import type { AgentId, TenantContext } from "../types/database";

export function completeAction(context: TenantContext, agent: AgentId, description: string): void {
  const scoped = db.forTenant(context);
  const settings = scoped.list("agents").find((a) => a.agent === agent);
  if (!settings) throw new Error("Agent configuration not found.");
  scoped.update("agents", settings.id, { actions_completed: settings.actions_completed + 1, last_active_at: new Date().toISOString(), last_action: description });
}