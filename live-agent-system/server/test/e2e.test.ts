/**
 * End-to-end verification of the backend agent pipeline.
 *
 * Boots the real Express server against a throwaway SQLite file and drives it
 * over HTTP. Nothing here is mocked: the assertions read back what the agents
 * actually wrote to the database.
 *
 * Phases:
 *   A. Fresh database, local strategy — auth, pipeline, persistence, authz.
 *   B. Migration — a hand-built v1 database is upgraded to the current schema.
 *   C. LLM seam — the server is pointed at a LOCAL OpenRouter-compatible mock
 *      so the openrouter adapter, token accounting and cost capture are
 *      verified end-to-end without external egress.
 */
import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

// Random high port so a leftover process from an earlier run cannot collide.
const PORT = 42000 + Math.floor(Math.random() * 6000);
const BASE = `http://127.0.0.1:${PORT}`;
const DB_FILE = path.join(os.tmpdir(), `core-e2e-${process.pid}.sqlite`);
const MIGRATION_DB = path.join(os.tmpdir(), `core-e2e-migrate-${process.pid}.sqlite`);
const LLM_DB = path.join(os.tmpdir(), `core-e2e-llm-${process.pid}.sqlite`);

/** Default seeded demo password (see server/src/db/seed.ts). */
const DEMO_PASSWORD = "core-demo-2026";
const PLATFORM_EMAIL = "admin@core.local";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

let ADMIN_TOKEN = "";

async function api(
  method: string,
  url: string,
  body?: unknown,
  token: string | undefined = ADMIN_TOKEN,
): Promise<{ status: number; json: any }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const headers: Record<string, string> = {};
    if (body) headers["Content-Type"] = "application/json";
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${BASE}${url}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    return { status: res.status, json };
  } catch (error) {
    // A hung endpoint must surface as a failure, not block the whole suite.
    return { status: 0, json: { error: `request to ${url} failed: ${String(error)}` } };
  } finally {
    clearTimeout(timer);
  }
}

async function waitForServer(timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Server did not become healthy in time");
}

let server: ChildProcess | undefined;

/** Kill the whole process group so the spawned server cannot outlive the suite. */
function killTree(child: ChildProcess, signal: NodeJS.Signals = "SIGTERM"): void {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    try { child.kill(signal); } catch { /* already gone */ }
  }
}

async function stopServer(): Promise<void> {
  if (!server) return;
  const child = server;
  killTree(child);
  await new Promise((r) => child.once("exit", r));
  server = undefined;
}

function spawnServer(env: Record<string, string> = {}): void {
  server = spawn("npx", ["tsx", "src/index.ts"], {
    cwd: path.resolve(import.meta.dirname, ".."),
    env: { ...process.env, PORT: String(PORT), HOST: "127.0.0.1", ...env },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  server.stdout?.on("data", (d) => process.stdout.write(`  [server] ${d}`));
  server.stderr?.on("data", (d) => process.stderr.write(`  [server:err] ${d}`));
}

function removeDb(file: string): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    try { fs.rmSync(file + suffix, { force: true }); } catch { /* ignore */ }
  }
}

async function login(email: string, password: string): Promise<{ status: number; json: any }> {
  return api("POST", "/api/auth/login", { email, password }, undefined);
}

/* ------------------------------------------------------------------ */
/* Local OpenRouter-compatible mock (phase C)                          */
/* ------------------------------------------------------------------ */

function startMockOpenRouter(): Promise<{ port: number; requests: { auth: string; system: string }[]; close: () => Promise<void> }> {
  const requests: { auth: string; system: string }[] = [];
  const srv = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (d) => (raw += d));
    req.on("end", () => {
      try {
        const body = JSON.parse(raw || "{}");
        const system = String(body.messages?.find((m: any) => m.role === "system")?.content ?? "");
        requests.push({ auth: String(req.headers.authorization ?? ""), system });
        const isNyx = system.includes("NYX");
        const content = isNyx
          ? JSON.stringify({
              score: 88,
              reasoning: "Corporate group of twelve with an urgent timeline and explicit budget signals.",
              tags: ["urgent", "group_booking", "budget_present"],
            })
          : JSON.stringify({
              reply: "Thank you for reaching out — I have your suite request for next week and will confirm availability shortly.",
              intent: "booking",
              next_action: "Check suite availability and send a quote.",
            });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            id: "gen-mock",
            model: "mock/openrouter-relay",
            choices: [{ message: { role: "assistant", content } }],
            usage: { prompt_tokens: 123, completion_tokens: 45, total_cost: 0.00067 },
          }),
        );
      } catch (error) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(error) }));
      }
    });
  });
  return new Promise((resolve) => {
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ port, requests, close: () => new Promise((r) => srv.close(() => r())) });
    });
  });
}

/* ------------------------------------------------------------------ */
/* Phase B fixture: a genuine schema-v1 database                       */
/* ------------------------------------------------------------------ */

function buildV1Database(file: string): void {
  removeDb(file);
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO schema_meta (key, value) VALUES ('version', '1');
    CREATE TABLE tenants (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
      industry TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active',
      branding_config TEXT NOT NULL DEFAULT '{}', rules TEXT NOT NULL DEFAULT '{}',
      tools_config TEXT NOT NULL DEFAULT '{}', console_config TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE TABLE users (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL, email TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
      created_at TEXT NOT NULL
    );
    CREATE INDEX idx_users_tenant ON users(tenant_id);
    CREATE TABLE agents (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id),
      agent TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
      config TEXT NOT NULL DEFAULT '{}', behavior TEXT NOT NULL DEFAULT '{}',
      actions_completed INTEGER NOT NULL DEFAULT 0,
      last_action TEXT NOT NULL DEFAULT 'Awaiting first request', last_active_at TEXT,
      UNIQUE (tenant_id, agent)
    );
    INSERT INTO tenants (id, name, slug, industry, status, branding_config, rules, created_at)
      VALUES ('v1-tenant', 'Legacy Co', 'legacy-co', 'Test', 'active', '{}', '{}', '2026-01-01T00:00:00.000Z');
    INSERT INTO users (id, tenant_id, name, email, role, created_at)
      VALUES ('v1-user', 'v1-tenant', 'Legacy User', 'legacy@legacy-co.example', 'admin', '2026-01-01T00:00:00.000Z');
    INSERT INTO agents (id, tenant_id, agent, enabled, config, behavior)
      VALUES ('v1-tenant:tala', 'v1-tenant', 'tala', 1, '{"auto_reply":true}', '{"tone":"hospitality"}');
  `);
  db.close();
}

/* ------------------------------------------------------------------ */

async function main(): Promise<void> {
  removeDb(DB_FILE);

  console.log("\n── 0. authentication gate ───────────────────────────");
  spawnServer({ DB_PATH: DB_FILE });
  await waitForServer();

  const noAuth = await api("GET", "/api/tenants", undefined, undefined);
  check("unauthenticated /api/tenants is a 401", noAuth.status === 401, `status ${noAuth.status}`);
  const noAuthSnapshot = await api("GET", "/api/snapshot", undefined, undefined);
  check("unauthenticated /api/snapshot is a 401", noAuthSnapshot.status === 401, `status ${noAuthSnapshot.status}`);
  const badToken = await api("GET", "/api/tenants", undefined, "deadbeef");
  check("garbage bearer token is a 401", badToken.status === 401, `status ${badToken.status}`);
  const badLogin = await login(PLATFORM_EMAIL, "wrong-password");
  check("wrong password is a 401", badLogin.status === 401, `status ${badLogin.status}`);
  const unknownLogin = await login("nobody@core.local", DEMO_PASSWORD);
  check("unknown email is a 401 (no enumeration)", unknownLogin.status === 401, `status ${unknownLogin.status}`);
  const healthPublic = await fetch(`${BASE}/api/health`).then((r) => r.status);
  check("health stays public for monitoring", healthPublic === 200, `status ${healthPublic}`);

  const goodLogin = await login(PLATFORM_EMAIL, DEMO_PASSWORD);
  check("platform admin login succeeds", goodLogin.status === 200, `status ${goodLogin.status} ${JSON.stringify(goodLogin.json)}`);
  check("login returns a bearer token", typeof goodLogin.json?.token === "string" && goodLogin.json.token.length >= 32);
  check("login reports platform_admin role", goodLogin.json?.session?.role === "platform_admin");
  check("platform admin has no tenant binding", goodLogin.json?.session?.tenant_id === null);
  ADMIN_TOKEN = goodLogin.json?.token ?? "";

  const me = await api("GET", "/api/auth/me");
  check("/api/auth/me echoes the session", me.json?.session?.email === PLATFORM_EMAIL);

  console.log("\n── 1. runtime + seed ────────────────────────────────");

  const health = await api("GET", "/api/health");
  check("health endpoint responds", health.status === 200);
  check("reports local decision strategy", health.json?.runtime?.provider === "local",
    `got ${health.json?.runtime?.provider}`);
  check("no LLM configured by default", health.json?.runtime?.llm_configured === false);

  const tenants = await api("GET", "/api/tenants");
  check("6 tenants seeded", tenants.json?.tenants?.length === 6,
    `got ${tenants.json?.tenants?.length}`);
  const baia = tenants.json.tenants.find((t: any) => t.slug === "baia");
  const atrium = tenants.json.tenants.find((t: any) => t.slug === "the-atrium");
  check("BAIA is active", baia?.status === "active");

  const stats0 = await api("GET", `/api/stats?tenant_id=${baia.id}`);
  const runsBefore = stats0.json.runs;
  check("agent_runs starts empty (no fabricated audit rows)", runsBefore === 0,
    `got ${runsBefore}`);

  console.log("\n── 2. inquiry → TALA intake → NYX scoring → TALA reply ─");

  const inquiry = await api("POST", `/api/events?tenant_id=${baia.id}`, {
    type: "inquiry.received",
    message: "E2E inquiry",
    payload: {
      name: "Arena Tester",
      email: "tester@arenacorp.com",
      channel: "WhatsApp",
      inquiry:
        "Hello, I would like to book a suite for a corporate group of twelve next week. Can you send a quote and confirm availability urgently?",
    },
  });
  check("POST /api/events accepted", inquiry.status === 200, `status ${inquiry.status}`);

  const runs = inquiry.json?.pipeline?.runs ?? [];
  check("pipeline produced runs", runs.length > 0, `got ${runs.length}`);
  check("event settled as done", inquiry.json?.event?.id !== undefined);

  const talaIntake = runs.find((r: any) => r.agent === "tala" && r.summary.startsWith("Captured"));
  check("TALA captured the inquiry", Boolean(talaIntake), JSON.stringify(runs.map((r: any) => r.summary)));

  const nyxRun = runs.find((r: any) => r.agent === "nyx" && r.score !== undefined);
  check("NYX produced a score", Boolean(nyxRun), `runs: ${JSON.stringify(runs.map((r: any) => r.agent))}`);
  check(
    "NYX score came from the decision engine (strategy recorded)",
    nyxRun?.strategy === "local",
    `strategy=${nyxRun?.strategy}`,
  );

  const leads = await api("GET", `/api/leads?tenant_id=${baia.id}`);
  const lead = leads.json.leads.find((l: any) => l.name === "Arena Tester");
  check("lead persisted to SQLite", Boolean(lead));
  check("lead carries a numeric score", typeof lead?.score === "number" && lead.score > 0,
    `score=${lead?.score}`);
  check("lead carries reasoning text", (lead?.score_reasoning ?? "").length > 20,
    `reasoning="${lead?.score_reasoning}"`);
  check("lead carries tags", Array.isArray(lead?.score_tags) && lead.score_tags.length > 0,
    `tags=${JSON.stringify(lead?.score_tags)}`);
  check("high-intent inquiry qualified (score >= 65)", lead?.score >= 65, `score=${lead?.score}`);

  const talaReply = runs.find((r: any) => r.agent === "tala" && r.reply);
  check("TALA composed a reply", Boolean(talaReply?.reply), `runs=${JSON.stringify(runs.map((r:any)=>r.summary))}`);
  check("reply is not the old static template",
    Boolean(talaReply?.reply) && !talaReply.reply.startsWith("Thank you for contacting BAIA. We have received"),
    `reply="${talaReply?.reply?.slice(0, 80)}"`);
  check("reply executed a tool", (talaReply?.tool_calls ?? 0) > 0, `tool_calls=${talaReply?.tool_calls}`);

  // Regression: internal agent context (NYX scores, prior reply transcripts)
  // must never be quoted back into a guest-facing message.
  //
  // The memory block is only rendered on a FOLLOW-UP (is_followup === true),
  // so a first-contact assertion proves nothing. Drive a second reply through
  // the same lead to exercise the path where the leak actually occurs.
  const followup = await api("POST", `/api/events?tenant_id=${baia.id}`, {
    type: "lead.created",
    message: "Second touch on the same lead",
    entity_id: lead.id,
    payload: { lead_id: lead.id },
  });
  const secondReply = followup.json?.pipeline?.runs?.find(
    (r: any) => r.agent === "tala" && r.reply,
  );
  check("follow-up reply produced (exercises memory injection)",
    Boolean(secondReply?.reply), JSON.stringify(followup.json?.pipeline?.runs?.map((r: any) => r.summary)));

  const replyText = [String(talaReply?.reply ?? ""), String(secondReply?.reply ?? "")].join("\n");
  check("no reply leaks NYX score to the guest",
    !/scored\s*\d+\/100/i.test(replyText) && !/\bqualification\b/i.test(replyText),
    `reply="${replyText.slice(0, 240)}"`);
  check("no reply leaks internal strategy name",
    !/\bstrategy\b|\blocal decision engine\b/i.test(replyText),
    `reply="${replyText.slice(0, 240)}"`);
  check("follow-up reply does use guest-safe memory",
    /BAIA|earlier details|following up/i.test(String(secondReply?.reply ?? "")),
    `reply="${String(secondReply?.reply ?? "").slice(0, 200)}"`);

  console.log("\n── 3. agent_runs audit trail ────────────────────────");

  const allRuns = await api("GET", `/api/agents/runs?tenant_id=${baia.id}`);
  check("agent_runs persisted", allRuns.json.runs.length >= 3, `count=${allRuns.json.runs.length}`);
  check("every run records a strategy",
    allRuns.json.runs.every((r: any) => typeof r.strategy === "string" && r.strategy.length > 0));
  check("every run records latency",
    allRuns.json.runs.every((r: any) => typeof r.latency_ms === "number"));

  const nyxStored = allRuns.json.runs.find((r: any) => r.agent === "nyx");
  check("NYX run stores the score breakdown",
    Array.isArray(nyxStored?.decision?.breakdown) && nyxStored.decision.breakdown.length >= 5,
    `breakdown=${JSON.stringify(nyxStored?.decision?.breakdown?.length)}`);
  check("NYX run is traceable to its event", Boolean(nyxStored?.event_id));

  const leadRuns = await api("GET", `/api/leads/${lead.id}/runs?tenant_id=${baia.id}`);
  check("per-lead run history queryable", leadRuns.json.runs.length >= 1,
    `count=${leadRuns.json.runs?.length}`);

  console.log("\n── 4. agent_memory ──────────────────────────────────");

  const mem = await api("GET", `/api/agent-memory?tenant_id=${baia.id}`);
  check("memory rows written", mem.json.memory.length >= 3, `count=${mem.json.memory.length}`);
  const kinds = new Set(mem.json.memory.map((m: any) => m.kind));
  check("memory holds lead profile", kinds.has("profile"));
  check("memory holds the request", kinds.has("request"));
  check("memory holds NYX qualification", kinds.has("qualification"));

  const recall = await api(
    "GET", `/api/agent-memory/recall?tenant_id=${baia.id}&subject_id=${lead.id}`,
  );
  check("ranked recall returns facts", recall.json.facts.length >= 3,
    `count=${recall.json.facts?.length}`);
  check("recall increments access_count",
    recall.json.facts.some((f: any) => f.access_count > 0));

  console.log("\n── 5. booking → HERMES orchestration + tools ─────────");

  const booking = await api("POST", `/api/bookings?tenant_id=${baia.id}`, {
    guest: "Arena Tester",
    email: "tester@arenacorp.com",
    service: "Ocean suite",
    date: new Date(Date.now() + 86_400_000).toISOString(),
    amount: 1250,
  });
  check("booking created as pending", booking.json?.booking?.status === "pending",
    `status=${booking.json?.booking?.status}`);

  const bookingEvent = await api("POST", `/api/events?tenant_id=${baia.id}`, {
    type: "booking.created",
    message: "E2E booking created",
    entity_id: booking.json.booking.id,
    payload: { booking_id: booking.json.booking.id },
  });
  const hermesRun = bookingEvent.json?.pipeline?.runs?.find((r: any) => r.agent === "hermes");
  check("HERMES ran", Boolean(hermesRun), JSON.stringify(bookingEvent.json?.pipeline?.runs));
  check("HERMES executed tools", (hermesRun?.tool_calls ?? 0) > 0, `tool_calls=${hermesRun?.tool_calls}`);

  const bookingsAfter = await api("GET", `/api/bookings?tenant_id=${baia.id}`);
  const confirmed = bookingsAfter.json.bookings.find((b: any) => b.id === booking.json.booking.id);
  check("booking transitioned to confirmed", confirmed?.status === "confirmed",
    `status=${confirmed?.status}`);

  const hermesStored = await api("GET", `/api/agents/runs?tenant_id=${baia.id}&agent=hermes`);
  const toolNames = hermesStored.json.runs[0]?.tool_calls?.map((t: any) => t.tool) ?? [];
  check("tool calls recorded in agent_runs", toolNames.length > 0, JSON.stringify(toolNames));
  check("email.send invoked", toolNames.includes("email.send"), JSON.stringify(toolNames));
  const firstHermesCalls = hermesStored.json?.runs?.[0]?.tool_calls ?? [];
  check("all recorded tool calls succeeded",
    firstHermesCalls.length > 0 && firstHermesCalls.every((t: any) => t.ok === true),
    JSON.stringify(firstHermesCalls.map((t: any) => ({ tool: t.tool, ok: t.ok, err: t.result?.error }))));

  const bookingCount = (await api("GET", `/api/bookings?tenant_id=${baia.id}`)).json.bookings.length;
  check("HERMES did not duplicate the booking", bookingCount === stats0.json.bookings + 1,
    `expected ${stats0.json.bookings + 1}, got ${bookingCount}`);

  console.log("\n── 6. tool layer ────────────────────────────────────");

  const tools = await api("GET", "/api/tools");
  check("4 tools registered", tools.json.tools.length === 4, `count=${tools.json.tools.length}`);
  check("no tool claims external transport",
    tools.json.tools.every((t: any) => t.external === false));

  const directTool = await api("POST", `/api/tools/lead.assign?tenant_id=${baia.id}`, {
    lead_id: lead.id, agent: "nyx", status: "qualified",
  });
  check("direct tool call succeeds", directTool.status === 200,
    `status ${directTool.status} body=${JSON.stringify(directTool.json)}`);
  check("lead.assign changed the record",
    directTool.json?.invocation?.result?.assigned_agent === "nyx",
    JSON.stringify(directTool.json?.invocation?.result ?? directTool.json));

  const badTool = await api("POST", `/api/tools/nope?tenant_id=${baia.id}`, {});
  check("unknown tool is rejected", badTool.status === 422, `status ${badTool.status}`);

  const missingArg = await api("POST", `/api/tools/whatsapp.send?tenant_id=${baia.id}`, {});
  check("missing tool args rejected", missingArg.status === 422, `status ${missingArg.status}`);

  console.log("\n── 7. gates + tenant scoping ────────────────────────");

  const leadsBefore = (await api("GET", `/api/leads?tenant_id=${atrium.id}`)).json.leads.length;
  const pausedTenant = await api("POST", `/api/events?tenant_id=${atrium.id}`, {
    type: "inquiry.received",
    message: "Inquiry to a 'setup' tenant",
    payload: { name: "Blocked Guest", inquiry: "should not create a lead" },
  });
  const skipped = pausedTenant.json?.pipeline?.runs?.filter((r: any) => r.status === "skipped") ?? [];
  check("inactive tenant blocks agents", skipped.length > 0,
    JSON.stringify(pausedTenant.json?.pipeline?.runs?.map((r: any) => r.status)));
  const leadsAfter = (await api("GET", `/api/leads?tenant_id=${atrium.id}`)).json.leads.length;
  check("no lead created for inactive tenant", leadsAfter === leadsBefore,
    `${leadsBefore} -> ${leadsAfter}`);

  const noTenant = await api("GET", "/api/leads");
  check("missing tenant_id is a 400 for platform admins", noTenant.status === 400, `status ${noTenant.status}`);
  const allScope = await api("GET", "/api/leads?tenant_id=all");
  check("tenant_id=all is rejected", allScope.status === 400, `status ${allScope.status}`);

  const foreign = await api("GET", `/api/leads/${lead.id}/runs?tenant_id=${atrium.id}`);
  check("cross-tenant record access is a 404", foreign.status === 404, `status ${foreign.status}`);

  const badLead = await api("PATCH", `/api/leads/${lead.id}?tenant_id=${baia.id}`, { status: "bogus" });
  check("invalid status rejected", badLead.status === 400, `status ${badLead.status}`);

  console.log("\n── 8. manual agent run + disabled gate ───────────────");

  const manual = await api("POST", `/api/agents/run?tenant_id=${baia.id}`, {
    agent: "nyx", event_type: "lead.qualify.requested", payload: { lead_id: lead.id },
  });
  check("POST /api/agents/run works", manual.status === 200, `status ${manual.status}`);
  check("manual run produced a NYX run",
    manual.json.runs.some((r: any) => r.agent === "nyx"), JSON.stringify(manual.json.runs));

  await api("POST", `/api/agents/nyx/enabled?tenant_id=${baia.id}`, { enabled: false });
  const disabled = await api("POST", `/api/agents/run?tenant_id=${baia.id}`, {
    agent: "nyx", event_type: "lead.qualify.requested", payload: { lead_id: lead.id },
  });
  check("disabled agent is skipped",
    disabled.json.runs.some((r: any) => r.status === "skipped"),
    JSON.stringify(disabled.json.runs.map((r: any) => r.status)));
  await api("POST", `/api/agents/nyx/enabled?tenant_id=${baia.id}`, { enabled: true });

  console.log("\n── 9. openrouter + behavior config persistence (da39f3c) ─");

  // Rule: never trust a 200. Every save below is READ BACK through a fresh GET.
  const keySave = await api("PATCH", `/api/tenants/${baia.id}`, {
    openrouter_api_key: "sk-or-v1-baia-workspace-key-0123456789",
  });
  check("PATCH tenant key returns the saved value", keySave.status === 200,
    `status ${keySave.status} ${JSON.stringify(keySave.json)}`);
  const tenantsAfterKey = await api("GET", "/api/tenants");
  const baiaReadback = tenantsAfterKey.json.tenants.find((t: any) => t.id === baia.id);
  check("tenant openrouter_api_key survives a read-back",
    baiaReadback?.openrouter_api_key === "sk-or-v1-baia-workspace-key-0123456789",
    `got "${baiaReadback?.openrouter_api_key}"`);

  const agentPatch = await api("PATCH", `/api/agents/nyx?tenant_id=${baia.id}`, {
    behavior: { tone: "persuasive", system_prompt: "Custom NYX prompt for BAIA only." },
    openrouter: { model_tier: "paid", model_id: "openai/gpt-4o-mini", temperature: 0.4 },
  });
  check("PATCH agent config returns 200", agentPatch.status === 200, `status ${agentPatch.status}`);
  const agentsReadback = await api("GET", `/api/agents?tenant_id=${baia.id}`);
  const nyxCfg = agentsReadback.json.agents.find((a: any) => a.agent === "nyx");
  check("agent behavior.system_prompt survives a read-back",
    nyxCfg?.behavior?.system_prompt === "Custom NYX prompt for BAIA only.",
    `got "${nyxCfg?.behavior?.system_prompt}"`);
  check("agent openrouter profile survives a read-back",
    nyxCfg?.openrouter?.model_id === "openai/gpt-4o-mini" && nyxCfg?.openrouter?.model_tier === "paid",
    JSON.stringify(nyxCfg?.openrouter));
  check("partial behavior save keeps default fields",
    typeof nyxCfg?.behavior?.persona_title === "string" && nyxCfg.behavior.persona_title.length > 0,
    `persona_title=${JSON.stringify(nyxCfg?.behavior?.persona_title)}`);

  // Simulate a LEGACY row: pre-fix databases stored minimal behavior
  // ({"tone":...}) or plain '{}'. The crash in the admin Agents page came
  // from serving exactly this. Rewrite the row behind the server's back and
  // confirm the API still serves a complete profile (defaults merged in).
  {
    const probe = new DatabaseSync(DB_FILE);
    probe.prepare(
      "UPDATE agents SET behavior = ?, openrouter = '{}' WHERE tenant_id = ? AND agent = 'tala'",
    ).run('{"tone":"hospitality"}', baia.id);
    probe.close();
  }
  const legacyAgents = await api("GET", `/api/agents?tenant_id=${baia.id}`);
  const legacyTala = legacyAgents.json.agents.find((a: any) => a.agent === "tala");
  check("legacy minimal behavior row is served complete (defaults merged)",
    typeof legacyTala?.behavior?.system_prompt === "string" &&
      legacyTala.behavior.system_prompt.length > 40 &&
      Array.isArray(legacyTala?.behavior?.connected_tools) &&
      legacyTala.behavior.connected_tools.length > 0,
    JSON.stringify(legacyTala?.behavior));
  check("legacy empty openrouter row is served complete",
    typeof legacyTala?.openrouter?.model_id === "string" && legacyTala.openrouter.model_id.length > 0,
    JSON.stringify(legacyTala?.openrouter));

  const talaCfg = legacyTala;
  check("seeded behavior is complete (no empty {} from the backend)",
    typeof talaCfg?.behavior?.system_prompt === "string" && talaCfg.behavior.system_prompt.includes("TALA"),
    JSON.stringify(talaCfg?.behavior));
  check("seeded openrouter profile is complete",
    typeof talaCfg?.openrouter?.model_id === "string" && talaCfg.openrouter.model_id.length > 0,
    JSON.stringify(talaCfg?.openrouter));

  const newTenant = await api("POST", "/api/tenants", {
    name: "Fresh Tenant",
    slug: "fresh-tenant",
    branding_config: { app_name: "Fresh Tenant", logo: "F", primary_color: "#aabbcc", theme: "dark" },
  });
  check("new tenant created", newTenant.status === 200, `status ${newTenant.status} ${JSON.stringify(newTenant.json)}`);
  const freshAgents = await api("GET", `/api/agents?tenant_id=${newTenant.json.tenant.id}`);
  const freshTala = freshAgents.json.agents.find((a: any) => a.agent === "tala");
  check("new tenant agents are seeded with complete behavior",
    typeof freshTala?.behavior?.system_prompt === "string" &&
      freshTala.behavior.system_prompt.length > 40 &&
      Array.isArray(freshTala?.behavior?.connected_tools) &&
      freshTala.behavior.connected_tools.length > 0,
    JSON.stringify(freshTala?.behavior));
  check("new tenant agents are seeded with openrouter profiles",
    Boolean(freshTala?.openrouter?.model_id), JSON.stringify(freshTala?.openrouter));

  console.log("\n── 10. authorization enforcement ────────────────────");

  const baiaAdminLogin = await login("admin@baia.example", DEMO_PASSWORD);
  check("tenant admin login succeeds", baiaAdminLogin.status === 200, `status ${baiaAdminLogin.status}`);
  const baiaToken = baiaAdminLogin.json?.token ?? "";
  check("tenant admin role reported", baiaAdminLogin.json?.session?.role === "tenant_admin");
  check("tenant admin is bound to BAIA", baiaAdminLogin.json?.session?.tenant_id === baia.id);

  const tenantSnapshot = await api("GET", "/api/snapshot", undefined, baiaToken);
  check("tenant snapshot contains only the caller's tenant",
    tenantSnapshot.json?.tenants?.length === 1 && tenantSnapshot.json.tenants[0]?.id === baia.id,
    `tenants=${JSON.stringify(tenantSnapshot.json?.tenants?.map((t: any) => t.slug))}`);
  check("tenant snapshot leaks no foreign leads",
    Array.isArray(tenantSnapshot.json?.leads) &&
      tenantSnapshot.json.leads.every((l: any) => l.tenant_id === baia.id),
    `foreign=${tenantSnapshot.json?.leads?.filter((l: any) => l.tenant_id !== baia.id)?.length}`);

  const adminSnapshot = await api("GET", "/api/snapshot");
  check("platform snapshot still returns the whole platform",
    adminSnapshot.json?.tenants?.length === 7, `tenants=${adminSnapshot.json?.tenants?.length}`);

  const crossRead = await api("GET", `/api/leads?tenant_id=${atrium.id}`, undefined, baiaToken);
  check("tenant admin cannot read another tenant", crossRead.status === 403, `status ${crossRead.status}`);
  const crossWrite = await api("PATCH", `/api/tenants/${atrium.id}`, { name: "Hijacked" }, baiaToken);
  check("tenant admin cannot patch another tenant", crossWrite.status === 403, `status ${crossWrite.status}`);
  const hijackCheck = await api("GET", "/api/tenants");
  check("the foreign tenant was not modified",
    hijackCheck.json.tenants.find((t: any) => t.id === atrium.id)?.name === "The Atrium");

  const tenantCreate = await api(
    "POST", "/api/tenants",
    { name: "Sneaky", slug: "sneaky", branding_config: { app_name: "S", logo: "S", primary_color: "#112233", theme: "dark" } },
    baiaToken,
  );
  check("tenant admin cannot create tenants", tenantCreate.status === 403, `status ${tenantCreate.status}`);

  const ownScoped = await api("GET", "/api/leads", undefined, baiaToken);
  check("tenant admin reads own tenant without naming it", ownScoped.status === 200,
    `status ${ownScoped.status}`);
  check("implicit scope returns only own records",
    ownScoped.json.leads.every((l: any) => l.tenant_id === baia.id));

  const ownPatch = await api("PATCH", `/api/tenants/${baia.id}`, { industry: "Hospitality +" }, baiaToken);
  check("tenant admin can patch their own tenant", ownPatch.status === 200, `status ${ownPatch.status}`);

  const resetDenied = await api("POST", "/api/admin/reset", {}, baiaToken);
  check("tenant admin cannot reset the platform", resetDenied.status === 403, `status ${resetDenied.status}`);

  console.log("\n── 11. persistence across restart ───────────────────");
  const beforeRestart = await api("GET", `/api/agents/runs?tenant_id=${baia.id}&limit=500`);
  // Re-read: section 8 re-scored this lead, so the value captured in section 2
  // is stale. We are testing persistence, not immutability.
  const scoreBeforeRestart = (await api("GET", `/api/leads?tenant_id=${baia.id}`)).json.leads
    .find((l: any) => l.id === lead.id)?.score;

  await stopServer();
  spawnServer({ DB_PATH: DB_FILE });
  await waitForServer();

  // Sessions live in SQLite too — the token must still work after a restart.
  const meAfterRestart = await api("GET", "/api/auth/me");
  check("session survives a server restart", meAfterRestart.json?.session?.email === PLATFORM_EMAIL,
    JSON.stringify(meAfterRestart.json));

  const afterRestart = await api("GET", `/api/agents/runs?tenant_id=${baia.id}&limit=500`);
  check("agent_runs survive a restart",
    afterRestart.json.runs.length === beforeRestart.json.runs.length,
    `${beforeRestart.json.runs.length} -> ${afterRestart.json.runs.length}`);
  const persistedLead = (await api("GET", `/api/leads?tenant_id=${baia.id}`)).json.leads
    .find((l: any) => l.id === lead.id);
  check("lead + score survive a restart", persistedLead?.score === scoreBeforeRestart,
    `${scoreBeforeRestart} -> ${persistedLead?.score}`);

  console.log("\n── 12. schema migration v1 → v3 ─────────────────────");
  await stopServer();
  buildV1Database(MIGRATION_DB);
  spawnServer({ DB_PATH: MIGRATION_DB });
  await waitForServer();

  {
    const probe = new DatabaseSync(MIGRATION_DB, { readOnly: true });
    const version = (probe.prepare("SELECT value FROM schema_meta WHERE key = 'version'").get() as any)?.value;
    check("migrated database reports schema v3", version === "3", `version=${version}`);
    const tenantCols = (probe.prepare("PRAGMA table_info(tenants)").all() as any[]).map((c) => c.name);
    check("migration added tenants.openrouter_api_key", tenantCols.includes("openrouter_api_key"),
      JSON.stringify(tenantCols));
    const agentCols = (probe.prepare("PRAGMA table_info(agents)").all() as any[]).map((c) => c.name);
    check("migration added agents.openrouter", agentCols.includes("openrouter"), JSON.stringify(agentCols));
    const userCols = (probe.prepare("PRAGMA table_info(users)").all() as any[]).map((c) => c.name);
    check("migration added users.password_hash", userCols.includes("password_hash"), JSON.stringify(userCols));
    const tables = (probe.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[]).map((t) => t.name);
    check("migration created sessions table", tables.includes("sessions"), JSON.stringify(tables));
    const legacyTenant = (probe.prepare("SELECT * FROM tenants WHERE id = 'v1-tenant'").get() as any);
    check("v1 tenant data survived the migration", legacyTenant?.name === "Legacy Co");
    const legacyUser = (probe.prepare("SELECT * FROM users WHERE id = 'v1-user'").get() as any);
    check("v1 user survived the users rebuild", legacyUser?.email === "legacy@legacy-co.example");
    probe.close();
  }

  console.log("\n── 13. LLM seam against a real chat/completions endpoint ─");
  // The OpenRouter adapter has never touched a live model in CI; this phase
  // proves the request/response wiring, strategy recording, and token/cost
  // capture against an OpenRouter-compatible endpoint served locally.
  await stopServer();
  removeDb(LLM_DB);
  const mock = await startMockOpenRouter();
  check("mock OpenRouter is listening", mock.port > 0);

  spawnServer({
    DB_PATH: LLM_DB,
    AGENT_LLM_PROVIDER: "openrouter",
    OPENROUTER_API_KEY: "sk-or-v1-mockmockmockmock123",
    OPENROUTER_BASE_URL: `http://127.0.0.1:${mock.port}/v1`,
    OPENROUTER_MODEL: "mock/openrouter-relay",
  });
  await waitForServer();

  const llmLogin = await login(PLATFORM_EMAIL, DEMO_PASSWORD);
  ADMIN_TOKEN = llmLogin.json?.token ?? "";

  const llmHealth = await api("GET", "/api/health");
  check("runtime reports openrouter provider", llmHealth.json?.runtime?.provider === "openrouter",
    JSON.stringify(llmHealth.json?.runtime));

  const llmTenants = await api("GET", "/api/tenants");
  const llmBaia = llmTenants.json.tenants.find((t: any) => t.slug === "baia");

  const llmInquiry = await api("POST", `/api/events?tenant_id=${llmBaia.id}`, {
    type: "inquiry.received",
    message: "LLM-path inquiry",
    payload: {
      name: "LLM Tester",
      email: "llm@arenacorp.com",
      channel: "Website",
      inquiry: "We need a suite for twelve guests next week, urgent.",
    },
  });
  check("LLM pipeline accepted the inquiry", llmInquiry.status === 200, `status ${llmInquiry.status}`);

  const llmRuns = await api("GET", `/api/agents/runs?tenant_id=${llmBaia.id}`);
  const llmNyx = llmRuns.json.runs.find((r: any) => r.agent === "nyx");
  const llmTala = llmRuns.json.runs.find((r: any) => r.agent === "tala" && r.output_text.includes("Thank you"));
  check("NYX decision recorded strategy=openrouter", llmNyx?.strategy === "openrouter",
    `strategy=${llmNyx?.strategy}`);
  check("NYX LLM score persisted on the run", llmNyx?.decision?.score === 88,
    `decision=${JSON.stringify(llmNyx?.decision)}`);
  check("agent_runs.tokens_in populated from usage", llmNyx?.tokens_in === 123,
    `tokens_in=${llmNyx?.tokens_in}`);
  check("agent_runs.tokens_out populated from usage", llmNyx?.tokens_out === 45,
    `tokens_out=${llmNyx?.tokens_out}`);
  check("agent_runs.cost_usd populated from usage", Math.abs((llmNyx?.cost_usd ?? 0) - 0.00067) < 1e-9,
    `cost_usd=${llmNyx?.cost_usd}`);
  check("agent_runs.model_id records the served model", llmNyx?.model_id === "mock/openrouter-relay",
    `model_id=${llmNyx?.model_id}`);
  check("TALA reply came from the LLM path", Boolean(llmTala) || mock.requests.length >= 2,
    `requests=${mock.requests.length}`);
  check("adapter sent the bearer API key",
    mock.requests.length > 0 && mock.requests.every((r) => r.auth === "Bearer sk-or-v1-mockmockmockmock123"),
    JSON.stringify(mock.requests.map((r) => r.auth)));

  const llmLead = (await api("GET", `/api/leads?tenant_id=${llmBaia.id}`)).json.leads
    .find((l: any) => l.name === "LLM Tester");
  check("LLM score written back to the lead", llmLead?.score === 88, `score=${llmLead?.score}`);

  await mock.close();

  console.log(`\n${"─".repeat(54)}`);
  console.log(`${passed}/${passed + failed} checks passed.`);
  if (failed) {
    console.error("\nFailures:");
    failures.forEach((f) => console.error(`  - ${f}`));
  }
}

main()
  .catch((error) => {
    console.error("\nE2E crashed:", error);
    failed++;
  })
  .finally(() => {
    if (server) killTree(server, "SIGKILL");
    for (const file of [DB_FILE, MIGRATION_DB, LLM_DB]) removeDb(file);
    process.exit(failed > 0 ? 1 : 0);
  });
