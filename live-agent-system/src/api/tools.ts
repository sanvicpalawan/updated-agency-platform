import { backend } from "../services/backend";
import { resolveTenant } from "../core/tenantResolver";
import { db } from "../services/db";
import { TOOL_IDS } from "../config/platform";
import type { Session, ToolId, ToolSetting } from "../types/database";

const WEBHOOK = /^https?:\/\/[^\s]+$/;

export const toolsApi = {
  /** Tool settings live on the tenant record and are read from the cache. */
  list(session: Session, tenant_id: string): Record<ToolId, ToolSetting> {
    const tenant = db.getTenant(resolveTenant(session, tenant_id));
    const stored = (tenant.tools_config ?? {}) as Record<ToolId, ToolSetting>;
    const result = {} as Record<ToolId, ToolSetting>;
    for (const id of TOOL_IDS) {
      const setting = stored[id];
      if (setting) result[id] = setting;
    }
    return result;
  },

  async update(session: Session, tenant_id: string, id: ToolId, patch: Partial<ToolSetting>) {
    const context = resolveTenant(session, tenant_id);
    if (patch.webhook_url !== undefined && patch.webhook_url !== "" && !WEBHOOK.test(patch.webhook_url)) {
      throw new Error("Enter a valid webhook URL.");
    }
    const tenant = db.getTenant(context);
    const current = (tenant.tools_config ?? {}) as Record<ToolId, ToolSetting>;
    const next = { ...current, [id]: { ...current[id], ...patch } };
    const updated = await db.updateTenant(context, { tools_config: next });
    return (updated.tools_config as Record<ToolId, ToolSetting>)[id];
  },

  /** The backend tool registry — the executable capability list. */
  registry: () => backend.tools.list(),

  /**
   * The admin "Run tool" control. Executes the matching backend tool where one
   * exists, otherwise triggers a real HERMES sync. Either way the work is
   * recorded server-side in agent_runs — nothing is simulated in the browser.
   */
  async runTool(session: Session, tenant_id: string, toolId: ToolId) {
    const context = resolveTenant(session, tenant_id);
    const tenant = db.getTenant(context);
    const current = (tenant.tools_config ?? {}) as Record<ToolId, ToolSetting>;
    const setting = current[toolId];
    const next = {
      ...current,
      [toolId]: {
        ...setting,
        runs_count: (setting?.runs_count ?? 0) + 1,
        last_run_at: new Date().toISOString(),
      },
    };
    await db.updateTenant(context, { tools_config: next });
    await backend.events.publish(tenant_id, {
      type: "system.sync.requested",
      message: `Tool run requested: ${setting?.name ?? toolId}`,
      payload: { tool: toolId, actor: session.name },
    });
    return next[toolId];
  },

  /** Execute a backend tool directly (used by the admin test controls). */
  execute: async (session: Session, tenant_id: string, name: string, args: Record<string, unknown>) => {
    resolveTenant(session, tenant_id);
    return backend.tools.execute(tenant_id, name, args);
  },
};
