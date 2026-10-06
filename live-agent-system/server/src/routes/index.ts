/**
 * HTTP API surface.
 *
 * Every route is tenant-scoped through `?tenant_id=`. There is deliberately no
 * unscoped record endpoint: a missing tenant_id is a 400, never a global read.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import {
  agents as agentsRepo,
  messages as messagesRepo,
  bookings as bookingsRepo,
  events as eventsRepo,
  leads as leadsRepo,
  memory as memoryRepo,
  runs as runsRepo,
  stats,
  tenants as tenantsRepo,
} from "../db/repo.ts";
import { drain, processEvent, AGENT_IDS } from "../pipeline/runner.ts";
import { runtimeInfo } from "../agents/runtime.ts";
import { executeTool, hasTool, listTools } from "../tools/registry.ts";
import { dbPath, resetDatabase } from "../db/connection.ts";
import { seedIfEmpty } from "../db/seed.ts";
import type { TenantContext } from "../types.ts";

export const router = Router();

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Resolve + validate the tenant scope. Throws 400 when absent. */
function ctx(req: Request): TenantContext {
  const id = String(req.query.tenant_id ?? req.body?.tenant_id ?? "");
  if (!id || id === "all") {
    throw new HttpError(400, "tenant_id is required (a specific tenant, not 'all')");
  }
  tenantsRepo.require(id);
  return { tenant_id: id };
}

const wrap =
  (fn: (req: Request, res: Response) => unknown | Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res))
      .then((result) => {
        if (!res.headersSent) res.json(result ?? {});
      })
      .catch(next);
  };

/* ------------------------------------------------------------------ */
/* meta                                                                */
/* ------------------------------------------------------------------ */

router.get(
  "/health",
  wrap(() => ({
    ok: true,
    db: dbPath,
    runtime: runtimeInfo(),
    queue: eventsRepo.countByStatus(),
    time: new Date().toISOString(),
  })),
);

router.get(
  "/tenants",
  wrap(() => ({ tenants: tenantsRepo.list() })),
);

router.post(
  "/tenants",
  wrap((req) => {
    const { name, slug, industry, status, branding_config, tools_config } = req.body ?? {};
    if (!name || !slug || !branding_config) {
      throw new HttpError(400, "tenants.name, tenants.slug and tenants.branding_config are required");
    }
    const tenant = tenantsRepo.create({ name, slug, industry, status, branding_config, tools_config });
    for (const agent of AGENT_IDS) agentsRepo.upsert({ tenant_id: tenant.id }, agent);
    return { tenant };
  }),
);

router.patch(
  "/tenants/:id",
  wrap((req) => {
    tenantsRepo.require(req.params.id);
    return { tenant: tenantsRepo.update(req.params.id, req.body ?? {}) };
  }),
);

router.delete(
  "/tenants/:id",
  wrap((req) => {
    tenantsRepo.require(req.params.id);
    tenantsRepo.remove(req.params.id);
    return { deleted: req.params.id };
  }),
);

router.patch(
  "/agents/:agent",
  wrap((req) => {
    const c = ctx(req);
    const agent = req.params.agent as (typeof AGENT_IDS)[number];
    if (!AGENT_IDS.includes(agent)) throw new HttpError(400, `Unknown agent: ${req.params.agent}`);
    return { agent: agentsRepo.update(c, agent, req.body ?? {}) };
  }),
);

router.post(
  "/messages",
  wrap((req) => {
    const c = ctx(req);
    const { agent, content, direction } = req.body ?? {};
    if (!agent || !content || !direction) {
      throw new HttpError(400, "messages.agent, messages.content and messages.direction are required");
    }
    if (!AGENT_IDS.includes(agent)) throw new HttpError(400, `Unknown agent: ${agent}`);
    if (!["inbound", "outbound"].includes(direction)) {
      throw new HttpError(400, `Invalid direction: ${direction}`);
    }
    return { message: messagesRepo.create(c, req.body) };
  }),
);

router.get(
  "/messages",
  wrap((req) => ({
    messages: messagesRepo.list(ctx(req), req.query.lead_id ? String(req.query.lead_id) : undefined),
  })),
);

/**
 * Whole-platform snapshot for the admin UI: one request instead of one per
 * tenant per table. Scoped reads still go through the per-table endpoints.
 */
router.get(
  "/snapshot",
  wrap(() => {
    const all = tenantsRepo.list();
    // Serialisation boundary: rows are heterogeneous across tables.
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const snapshot: {
      tenants: ReturnType<typeof tenantsRepo.list>;
      leads: any[];
      bookings: any[];
      messages: any[];
      events: any[];
      agents: any[];
      runs: any[];
      memory: any[];
    } = {
      tenants: all,
      leads: [],
      bookings: [],
      messages: [],
      events: [],
      agents: [],
      runs: [],
      memory: [],
    };
    for (const tenant of all) {
      const c = { tenant_id: tenant.id };
      snapshot.leads.push(...leadsRepo.list(c));
      snapshot.bookings.push(...bookingsRepo.list(c));
      snapshot.messages.push(...messagesRepo.list(c));
      snapshot.events.push(...eventsRepo.list(c, 300));
      snapshot.agents.push(...agentsRepo.list(c));
      snapshot.runs.push(...runsRepo.list(c, { limit: 200 }));
      snapshot.memory.push(...memoryRepo.list(c, 200));
    }
    const byCreatedDesc = (a: { created_at: string }, b: { created_at: string }) =>
      b.created_at.localeCompare(a.created_at);
    snapshot.events.sort(byCreatedDesc);
    snapshot.runs.sort(byCreatedDesc);
    return snapshot;
  }),
);

router.get(
  "/stats",
  wrap((req) => ({ tenant_id: ctx(req).tenant_id, ...stats(ctx(req)) })),
);

/* ------------------------------------------------------------------ */
/* leads                                                               */
/* ------------------------------------------------------------------ */

router.get(
  "/leads",
  wrap((req) => {
    const c = ctx(req);
    return {
      leads: leadsRepo.list(c, {
        status: req.query.status ? String(req.query.status) : undefined,
        assigned_agent: req.query.assigned_agent ? String(req.query.assigned_agent) : undefined,
      }),
    };
  }),
);

router.post(
  "/leads",
  wrap((req) => {
    const c = ctx(req);
    const { name, email, channel, inquiry } = req.body ?? {};
    if (!name || typeof name !== "string" || !name.trim()) {
      throw new HttpError(400, "leads.name is required");
    }
    return { lead: leadsRepo.create(c, { name: name.trim(), email, channel, inquiry }) };
  }),
);

router.patch(
  "/leads/:id",
  wrap((req) => {
    const c = ctx(req);
    const allowed = ["name", "email", "channel", "status", "assigned_agent", "inquiry"] as const;
    const patch: Record<string, unknown> = {};
    for (const key of allowed) {
      if (req.body?.[key] !== undefined) patch[key] = req.body[key];
    }
    if (patch.status && !["new", "contacted", "qualified", "converted"].includes(String(patch.status))) {
      throw new HttpError(400, `Invalid lead status: ${patch.status}`);
    }
    if (patch.assigned_agent && !AGENT_IDS.includes(patch.assigned_agent as never)) {
      throw new HttpError(400, `Invalid agent: ${patch.assigned_agent}`);
    }
    return { lead: leadsRepo.update(c, req.params.id, patch) };
  }),
);

router.delete(
  "/leads/:id",
  wrap((req) => {
    const c = ctx(req);
    leadsRepo.remove(c, req.params.id);
    return { deleted: req.params.id };
  }),
);

/** Full decision history for one lead, newest first. */
router.get(
  "/leads/:id/runs",
  wrap((req) => {
    const c = ctx(req);
    const lead = leadsRepo.require(c, req.params.id);
    return { lead, runs: runsRepo.forLead(c, lead.id) };
  }),
);

/* ------------------------------------------------------------------ */
/* bookings                                                            */
/* ------------------------------------------------------------------ */

router.get(
  "/bookings",
  wrap((req) => ({
    bookings: bookingsRepo.list(ctx(req), {
      status: req.query.status ? String(req.query.status) : undefined,
    }),
  })),
);

router.post(
  "/bookings",
  wrap((req) => {
    const c = ctx(req);
    const { guest } = req.body ?? {};
    if (!guest || typeof guest !== "string" || !guest.trim()) {
      throw new HttpError(400, "bookings.guest is required");
    }
    const booking = bookingsRepo.create(c, req.body);
    return { booking };
  }),
);

router.patch(
  "/bookings/:id",
  wrap((req) => {
    const c = ctx(req);
    if (
      req.body?.status &&
      !["pending", "confirmed", "completed", "cancelled"].includes(String(req.body.status))
    ) {
      throw new HttpError(400, `Invalid booking status: ${req.body.status}`);
    }
    return { booking: bookingsRepo.update(c, req.params.id, req.body ?? {}) };
  }),
);

/* ------------------------------------------------------------------ */
/* events — ingestion + pipeline trigger                               */
/* ------------------------------------------------------------------ */

router.post(
  "/events",
  wrap(async (req) => {
    const c = ctx(req);
    const { type, message, payload, entity_id, level } = req.body ?? {};
    if (!type || typeof type !== "string") throw new HttpError(400, "events.type is required");
    if (!message || typeof message !== "string") {
      throw new HttpError(400, "events.message is required");
    }

    const event = eventsRepo.enqueue(c, {
      type,
      message,
      payload: payload ?? {},
      entity_id: entity_id ?? null,
      level: level ?? "info",
    });

    // Run the pipeline inline so the caller sees what the agents decided.
    const result = await drain();

    return {
      event,
      pipeline: {
        processed_events: result.processed_events,
        stopped_reason: result.stopped_reason,
        runs: result.runs,
      },
    };
  }),
);

router.get(
  "/events",
  wrap((req) => {
    const c = ctx(req);
    const limit = Math.min(500, Number(req.query.limit ?? 200));
    return { events: eventsRepo.list(c, limit) };
  }),
);

/* ------------------------------------------------------------------ */
/* agents                                                              */
/* ------------------------------------------------------------------ */

router.get(
  "/agents/runtime",
  wrap(() => runtimeInfo()),
);

router.get(
  "/agents",
  wrap((req) => ({ agents: agentsRepo.list(ctx(req)) })),
);

router.post(
  "/agents/:agent/enabled",
  wrap((req) => {
    const c = ctx(req);
    const agent = req.params.agent as (typeof AGENT_IDS)[number];
    if (!AGENT_IDS.includes(agent)) throw new HttpError(400, `Unknown agent: ${req.params.agent}`);
    return { agent: agentsRepo.setEnabled(c, agent, Boolean(req.body?.enabled)) };
  }),
);

/**
 * Directly execute an agent against an event. Used by the admin "Run test"
 * control; sets `force: true` so `manual` rules do not suppress the run.
 */
router.post(
  "/agents/run",
  wrap(async (req) => {
    const c = ctx(req);
    const { agent, event_type, payload } = req.body ?? {};
    if (!AGENT_IDS.includes(agent)) {
      throw new HttpError(400, `agent must be one of: ${AGENT_IDS.join(", ")}`);
    }
    if (!event_type || typeof event_type !== "string") {
      throw new HttpError(400, "event_type is required");
    }

    const event = eventsRepo.enqueue(c, {
      type: event_type,
      agent,
      message: `Manual ${agent.toUpperCase()} test run`,
      level: "info",
      entity_id: payload?.lead_id ?? payload?.booking_id ?? null,
      payload: { ...(payload ?? {}), force: true },
    });

    const runs = await processEvent(event);
    return { event, runs };
  }),
);

router.get(
  "/agents/runs",
  wrap((req) => {
    const c = ctx(req);
    const agent = req.query.agent ? (String(req.query.agent) as (typeof AGENT_IDS)[number]) : undefined;
    if (agent && !AGENT_IDS.includes(agent)) {
      throw new HttpError(400, `Unknown agent: ${agent}`);
    }
    return {
      runs: runsRepo.list(c, { agent, limit: Math.min(500, Number(req.query.limit ?? 100)) }),
    };
  }),
);

router.get(
  "/agents/runs/:id",
  wrap((req) => {
    const run = runsRepo.get(req.params.id);
    if (!run) throw new HttpError(404, `Agent run not found: ${req.params.id}`);
    return { run };
  }),
);

/* ------------------------------------------------------------------ */
/* agent memory                                                        */
/* ------------------------------------------------------------------ */

router.get(
  "/agent-memory",
  wrap((req) => ({ memory: memoryRepo.list(ctx(req), Math.min(500, Number(req.query.limit ?? 100))) })),
);

router.post(
  "/agent-memory",
  wrap((req) => {
    const c = ctx(req);
    const { scope, subject_id, agent, kind, text, content, importance } = req.body ?? {};
    for (const [field, value] of Object.entries({ scope, subject_id, agent, kind, text })) {
      if (!value || typeof value !== "string") throw new HttpError(400, `${field} is required`);
    }
    if (!["lead", "booking", "tenant", "agent"].includes(scope)) {
      throw new HttpError(400, `Invalid scope: ${scope}`);
    }
    if (!AGENT_IDS.includes(agent)) throw new HttpError(400, `Invalid agent: ${agent}`);
    return {
      memory: memoryRepo.write(c, { scope, subject_id, agent, kind, text, content, importance }),
    };
  }),
);

/** Ranked retrieval — the same call TALA makes internally. */
router.get(
  "/agent-memory/recall",
  wrap((req) => {
    const c = ctx(req);
    const scope = String(req.query.scope ?? "lead");
    const subject_id = String(req.query.subject_id ?? "");
    if (!subject_id) throw new HttpError(400, "subject_id is required");
    return {
      scope,
      subject_id,
      facts: memoryRepo.recall(c, {
        scope: scope as "lead",
        subject_id,
        limit: Math.min(50, Number(req.query.limit ?? 12)),
      }),
    };
  }),
);

/* ------------------------------------------------------------------ */
/* tools                                                               */
/* ------------------------------------------------------------------ */

/** Rebuild demo data. Admin-only maintenance route. */
router.post(
  "/admin/reset",
  wrap(() => {
    resetDatabase();
    seedIfEmpty();
    return { ok: true, tenants: tenantsRepo.list().length };
  }),
);

router.get(
  "/tools",
  wrap(() => ({ tools: listTools() })),
);

router.post(
  "/tools/:name",
  wrap(async (req) => {
    const c = ctx(req);
    if (!hasTool(req.params.name)) {
      throw new HttpError(
        422,
        `Unknown tool: ${req.params.name}. Available: ${listTools().map((t) => t.name).join(", ")}`,
      );
    }
    const record = await executeTool(c, {
      tool: req.params.name as never,
      args: { ...(req.body ?? {}) },
    });
    if (!record.ok) {
      throw new HttpError(
        422,
        `Tool ${req.params.name} failed: ${String(record.result.error ?? "unknown error")}`,
      );
    }
    return { invocation: record };
  }),
);

/* ------------------------------------------------------------------ */
/* error handling                                                      */
/* ------------------------------------------------------------------ */

router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  // Tenant/record scoping failures are client errors, not 500s.
  const isScopeError = /not found|not found in tenant|required/i.test(message);
  res.status(isScopeError ? 404 : 500).json({ error: message });
});
