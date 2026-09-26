import { tala } from "../agents/tala";
import { nyx } from "../agents/nyx";
import { hermes } from "../agents/hermes";
import { db } from "../services/db";
import type { AgentId, SystemEvent, TenantContext } from "../types/database";
import { eventBus } from "./eventBus";

const routes: Record<string, AgentId[]> = {
  "inquiry.received": ["tala"],
  "lead.created": ["tala", "nyx"],
  "lead.qualify.requested": ["nyx"],
  "lead.followup.requested": ["nyx"],
  "booking.created": ["hermes"],
  "booking.confirm.requested": ["hermes"],
  "system.sync.requested": ["hermes"],
};
const agents = { tala, nyx, hermes };

function dispatch(context: TenantContext, event: SystemEvent) {
  const targets = routes[event.type];
  if (!targets) return;
  const tenant = db.getTenant(context);
  const scoped = db.forTenant(context);
  for (const agent of targets) {
    const config = scoped.list("agents").find((a) => a.agent === agent);
    const rule = tenant.rules[agent];
    const manual = event.payload.force === true;
    if (!config?.enabled || tenant.status !== "active" || (rule === "manual" && !manual)) {
      eventBus.publish(context, { type: "agent.skipped", agent, level: "warning", message: `${agent.toUpperCase()} is ${tenant.status !== "active" ? "paused with this tenant" : !config?.enabled ? "disabled" : "set to manual"}`, entity_id: event.entity_id, payload: { trigger: event.type } });
      continue;
    }
    if (agent === "nyx" && event.type === "lead.followup.requested" && rule === "score-leads-only") continue;
    agents[agent](context, event, config);
  }
}

let detach: (() => void) | undefined;
export function registerDispatcher(): void {
  if (!detach) detach = eventBus.subscribe(dispatch);
}

export function unregisterDispatcher(): void {
  detach?.();
  detach = undefined;
}