/**
 * HTTP API surface.
 *
 * Every route is tenant-scoped through `?tenant_id=`. There is deliberately no
 * unscoped record endpoint: a missing tenant_id is a 400, never a global read.
 *
 * Authentication (replaces the old trust-the-client model):
 *   - POST /api/auth/login exchanges email+password for a bearer token.
 *   - Every other route requires `Authorization: Bearer <token>`.
 *   - Platform admins may address any tenant; tenant users are PINNED to the
 *     tenant recorded on their session — a tenant_id pointing anywhere else
 *     is a 403, never trusted.
 *   - GET /api/snapshot returns the whole platform for platform admins only;
 *     tenant users receive a snapshot scoped to their own tenant.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "../db/connection.ts";
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
import { verifyPassword } from "../auth/passwords.ts";
import { createSession, destroySession, getSession } from "../auth/sessions.ts";
import type { AuthSession, TenantContext } from "../types.ts";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthSession;
    }
  }
}

export const router = Router();

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/* ------------------------------------------------------------------ */
/* auth                                                                */
/* ------------------------------------------------------------------ */

interface UserRecord {
  id: string;
  tenant_id: string | null;
  name: string;
  email: string;
  role: "admin" | "member";
  password_hash: string;
}

/** Tiny in-memory brute-force brake: 5 failures per email → 60s lockout. */
const failedLogins = new Map<string, { count: number; lockedUntil: number }>();
const LOGIN_MAX_FAILURES = 5;
const LOGIN_LOCKOUT_MS = 60_000;

function loginLocked(email: string): boolean {
  const entry = failedLogins.get(email);
  return Boolean(entry && entry.count >= LOGIN_MAX_FAILURES && Date.now() < entry.lockedUntil);
}
function recordLoginFailure(email: string): void {
  const entry = failedLogins.get(email) ?? { count: 0, lockedUntil: 0 };
  entry.count += 1;
  entry.lockedUntil = entry.count >= LOGIN_MAX_FAILURES ? Date.now() + LOGIN_LOCKOUT_MS : entry.lockedUntil;
  failedLogins.set(email, entry);
}

router.post("/auth/login", (req: Request, res: Response) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  if (!email || !password) {
    res.status(400).json({ error: "email and password are required" });
    return;
  }
  if (loginLocked(email)) {
    res.status(429).json({ error: "Too many failed attempts. Try again in a minute." });
    return;
  }
  const user = db.prepare("SELECT * FROM users WHERE lower(email) = ?").get(email) as
    | UserRecord
    | undefined;
  if (!user || !verifyPassword(password, user.password_hash)) {
    recordLoginFailure(email);
    // Same response for unknown email and wrong password — no enumeration.
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }
  failedLogins.delete(email);
  const { token, session } = createSession(user);
  res.json({ token, session });
});

/** Public endpoints that do not require a bearer token. */
const PUBLIC_PATHS = new Set(["/health", "/auth/login"]);

router.use((req: Request, res: Response, next: NextFunction) => {
  if (PUBLIC_PATHS.has(req.path)) {
    next();
    return;
  }
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  const session = token ? getSession(token) : undefined;
  if (!session) {
    res.status(401).json({ error: "Authentication required. Sign in to continue." });
    return;
  }
  req.auth = session;
  // Store the raw token on the request for logout without re-parsing headers.
  (req as Request & { bearerToken?: string }).bearerToken = token;
  next();
});

function auth(req: Request): AuthSession {
  if (!req.auth) throw new HttpError(401, "Authentication required.");
  return req.auth;
}

function requirePlatformAdmin(req: Request): AuthSession {
  const session = auth(req);
  if (session.role !== "platform_admin") {
    throw new HttpError(403, "Platform administrator access is required.");
  }
  return session;
}

/**
 * Resolve + validate the tenant scope.
 *
 * Platform admins may name any existing tenant. Everyone else is pinned to
 * the tenant on their session: a mismatched or foreign tenant_id is a 403 —
 * the value supplied by the client is never trusted on its own.
 */
function ctx(req: Request): TenantContext {
  const session = auth(req);
  const requested = String(req.query.tenant_id ?? req.body?.tenant_id ?? "");

  if (session.role === "platform_admin") {
    if (!requested || requested === "all") {
      throw new HttpError(400, "tenant_id is required (a specific tenant, not 'all')");
    }
    tenantsRepo.require(requested);
    return { tenant_id: requested };
  }

  if (!session.tenant_id) throw new HttpError(403, "This account has no tenant workspace.");
  tenantsRepo.require(session.tenant_id);
  if (requested && requested !== "all" && requested !== session.tenant_id) {
    throw new HttpError(403, "Access denied: that tenant is outside your workspace.");
  }
  return { tenant_id: session.tenant_id };
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
  "/auth/me",
  wrap((req) => ({ session: auth(req) })),
);

router.post(
  "/auth/logout",
  wrap((req) => {
    destroySession((req as Request & { bearerToken?: string }).bearerToken ?? "");
    return { ok: true };
  }),
);

router.get(
  "/tenants",
  wrap((req) => {
    const session = auth(req);
    const all = tenantsRepo.list();
    return {
      tenants:
        session.role === "platform_admin"
          ? all
          : all.filter((t) => t.id === session.tenant_id),
    };
  }),
);

router.post(
  "/tenants",
  wrap((req) => {
    requirePlatformAdmin(req);
    const { name, slug, industry, status, branding_config, tools_config, openrouter_api_key } =
      req.body ?? {};
    if (!name || !slug || !branding_config) {
      throw new HttpError(400, "tenants.name, tenants.slug and tenants.branding_config are required");
    }
    const tenant = tenantsRepo.create({
      name,
      slug,
      industry,
      status,
      branding_config,
      tools_config,
      openrouter_api_key: typeof openrouter_api_key === "string" ? openrouter_api_key : "",
    });
    // upsert seeds the complete config/behavior/openrouter profiles.
    for (const agent of AGENT_IDS) agentsRepo.upsert({ tenant_id: tenant.id }, agent);
    return { tenant };
  }),
);

/** Fields a tenant update may touch — unknown keys are dropped, never applied. */
const TENANT_PATCH_KEYS = [
  "name",
  "slug",
  "industry",
  "status",
  "branding_config",
  "rules",
  "tools_config",
  "console_config",
  "openrouter_api_key",
] as const;

router.patch(
  "/tenants/:id",
  wrap((req) => {
    const session = auth(req);
    const id = req.params.id;
    tenantsRepo.require(id);
    if (session.role !== "platform_admin" && session.tenant_id !== id) {
      throw new HttpError(403, "Access denied: that tenant is outside your workspace.");
    }
    const patch: Record<string, unknown> = {};
    for (const key of TENANT_PATCH_KEYS) {
      if (req.body?.[key] !== undefined) patch[key] = req.body[key];
    }
    return { tenant: tenantsRepo.update(id, patch) };
  }),
);

router.delete(
  "/tenants/:id",
  wrap((req) => {
    requirePlatformAdmin(req);
    tenantsRepo.require(req.params.id);
    tenantsRepo.remove(req.params.id);
    return { deleted: req.params.id };
  }),
);

router.patch(
  "/agents/:agent",
  wrap((req) => {
    const c = ctx(req);
    const session = auth(req);
    if (session.role === "member") {
      throw new HttpError(403, "Members cannot change agent configuration.");
    }
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
 * tenant per table. Platform admins see every tenant; tenant users get a
 * snapshot scoped to their own tenant — the full-platform view is admin-only.
 */
router.get(
  "/snapshot",
  wrap((req) => {
    const session = auth(req);
    const all = tenantsRepo.list();
    const visible =
      session.role === "platform_admin" ? all : all.filter((t) => t.id === session.tenant_id);
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
      tenants: visible,
      leads: [],
      bookings: [],
      messages: [],
      events: [],
      agents: [],
      runs: [],
      memory: [],
    };
    for (const tenant of visible) {
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
    const session = auth(req);
    if (session.role === "member") {
      throw new HttpError(403, "Members cannot change agent configuration.");
    }
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
    const session = auth(req);
    const run = runsRepo.get(req.params.id);
    if (!run) throw new HttpError(404, `Agent run not found: ${req.params.id}`);
    if (session.role !== "platform_admin" && run.tenant_id !== session.tenant_id) {
      throw new HttpError(404, `Agent run not found: ${req.params.id}`);
    }
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

/** Rebuild demo data. Platform-admin-only maintenance route. */
router.post(
  "/admin/reset",
  wrap((req) => {
    requirePlatformAdmin(req);
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
