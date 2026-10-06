/**
 * End-to-end verification of the backend agent pipeline.
 *
 * Boots the real Express server against a throwaway SQLite file and drives it
 * over HTTP. Nothing here is mocked: the assertions read back what the agents
 * actually wrote to the database.
 */
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Random high port so a leftover process from an earlier run cannot collide.
const PORT = 42000 + Math.floor(Math.random() * 6000);
const BASE = `http://127.0.0.1:${PORT}`;
const DB_FILE = path.join(os.tmpdir(), `core-e2e-${process.pid}.sqlite`);

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

async function api(
  method: string,
  url: string,
  body?: unknown,
): Promise<{ status: number; json: any }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`${BASE}${url}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
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

async function main(): Promise<void> {
  for (const suffix of ["", "-wal", "-shm"]) {
    try { fs.rmSync(DB_FILE + suffix, { force: true }); } catch { /* ignore */ }
  }

  server = spawn("npx", ["tsx", "src/index.ts"], {
    cwd: path.resolve(import.meta.dirname, ".."),
    env: { ...process.env, PORT: String(PORT), DB_PATH: DB_FILE, HOST: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  server.stdout?.on("data", (d) => process.stdout.write(`  [server] ${d}`));
  server.stderr?.on("data", (d) => process.stderr.write(`  [server:err] ${d}`));

  await waitForServer();
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
  check("missing tenant_id is a 400", noTenant.status === 400, `status ${noTenant.status}`);
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

  console.log("\n── 9. persistence across restart ────────────────────");
  const beforeRestart = await api("GET", `/api/agents/runs?tenant_id=${baia.id}&limit=500`);
  // Re-read: section 8 re-scored this lead, so the value captured in section 2
  // is stale. We are testing persistence, not immutability.
  const scoreBeforeRestart = (await api("GET", `/api/leads?tenant_id=${baia.id}`)).json.leads
    .find((l: any) => l.id === lead.id)?.score;

  if (server) killTree(server);
  await new Promise((r) => server?.once("exit", r));

  server = spawn("npx", ["tsx", "src/index.ts"], {
    cwd: path.resolve(import.meta.dirname, ".."),
    env: { ...process.env, PORT: String(PORT), DB_PATH: DB_FILE, HOST: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  server.stdout?.on("data", () => {});
  server.stderr?.on("data", (d) => process.stderr.write(`  [server:err] ${d}`));
  await waitForServer();

  const afterRestart = await api("GET", `/api/agents/runs?tenant_id=${baia.id}&limit=500`);
  check("agent_runs survive a restart",
    afterRestart.json.runs.length === beforeRestart.json.runs.length,
    `${beforeRestart.json.runs.length} -> ${afterRestart.json.runs.length}`);
  const persistedLead = (await api("GET", `/api/leads?tenant_id=${baia.id}`)).json.leads
    .find((l: any) => l.id === lead.id);
  check("lead + score survive a restart", persistedLead?.score === scoreBeforeRestart,
    `${scoreBeforeRestart} -> ${persistedLead?.score}`);

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
    for (const suffix of ["", "-wal", "-shm"]) {
      try { fs.rmSync(DB_FILE + suffix, { force: true }); } catch { /* ignore */ }
    }
    process.exit(failed > 0 ? 1 : 0);
  });
