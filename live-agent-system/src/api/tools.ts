import { createDefaultToolsConfig } from "../config/platform";
import { eventBus } from "../core/eventBus";
import { resolveTenant } from "../core/tenantResolver";
import { db } from "../services/db";
import type { Session, ToolId, ToolSetting } from "../types/database";
import { eventsApi } from "./events";

export const toolsApi = {
  getTools(session: Session, tenant_id: string): Record<ToolId, ToolSetting> {
    const context = resolveTenant(session, tenant_id);
    const tenant = db.getTenant(context);
    return tenant.tools_config ?? createDefaultToolsConfig(tenant.slug);
  },
  updateTool(session: Session, tenant_id: string, tool_id: ToolId, patch: Partial<ToolSetting>): ToolSetting {
    const context = resolveTenant(session, tenant_id);
    const tenant = db.getTenant(context);
    const currentTools = tenant.tools_config ?? createDefaultToolsConfig(tenant.slug);
    const current = currentTools[tool_id];
    if (!current) throw new Error("Tool not found.");
    const updated: ToolSetting = {
      ...current,
      ...patch,
      id: tool_id,
    };
    db.updateTenant(context, {
      tools_config: {
        ...currentTools,
        [tool_id]: updated,
      },
    });
    eventBus.publish(context, {
      type: "tool.config_updated",
      agent: updated.assigned_agents[0] ?? null,
      level: "success",
      message: `Tool updated: ${updated.name}`,
      payload: {
        tool_id,
        enabled: updated.enabled,
        assigned_agents: updated.assigned_agents,
        webhook_url: updated.webhook_url,
        share_with_client: updated.share_with_client,
        actor: session.name,
      },
    });
    return updated;
  },
  runTool(session: Session, tenant_id: string, tool_id: ToolId) {
    const context = resolveTenant(session, tenant_id);
    const tenant = db.getTenant(context);
    const tools = tenant.tools_config ?? createDefaultToolsConfig(tenant.slug);
    const tool = tools[tool_id];
    if (!tool?.enabled) throw new Error(`${tool?.name ?? tool_id} is currently disabled for ${tenant.name}.`);
    const agent =
      tool_id === "lead_capture"
        ? "tala"
        : tool_id === "whatsapp_responder"
          ? "nyx"
          : "hermes";
    const ev = eventsApi.trigger(session, tenant_id, agent, false);
    const updatedTool: ToolSetting = {
      ...tool,
      runs_count: (tool.runs_count ?? 0) + 1,
      last_outcome: ev.message,
      last_run_at: new Date().toISOString(),
    };
    db.updateTenant(context, {
      tools_config: {
        ...tools,
        [tool_id]: updatedTool,
      },
    });
    return updatedTool;
  },
};
