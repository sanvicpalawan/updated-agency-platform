import { backend } from "../services/backend";
import { resolveTenant } from "../core/tenantResolver";
import { db } from "../services/db";
import type { AgentId, Session } from "../types/database";

/**
 * Events are ingested by the backend, which runs the agent pipeline.
 * The response carries every agent_run the pipeline produced.
 */
export const eventsApi = {
  list(session: Session, tenant_id: string, entityId?: string) {
    const all = db.forTenant(resolveTenant(session, tenant_id)).list("events");
    return entityId ? all.filter((event) => event.entity_id === entityId) : all;
  },

  async publish(
    session: Session,
    tenant_id: string,
    input: {
      type: string;
      message: string;
      agent?: AgentId | null;
      level?: "info" | "success" | "warning" | "error";
      entity_id?: string | null;
      payload?: Record<string, unknown>;
    },
  ) {
    resolveTenant(session, tenant_id);
    return backend.events.publish(tenant_id, input);
  },

  /**
   * Fire an agent trigger and let the backend decide what runs.
   * Replaces the old browser-side dispatcher call.
   */
  async trigger(session: Session, tenant_id: string, agent: AgentId, force = false) {
    resolveTenant(session, tenant_id);
    const routes: Record<AgentId, { type: string; message: string }> = {
      tala: { type: "system.sync.requested", message: "Requested a workspace sync" },
      nyx: { type: "system.sync.requested", message: "Requested a workspace sync" },
      hermes: { type: "system.sync.requested", message: "Requested a workspace sync" },
    };
    return backend.events.publish(tenant_id, {
      ...routes[agent],
      payload: { force, requested_by: session.name, agent },
    });
  },
};
