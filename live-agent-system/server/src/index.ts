import express from "express";
import fs from "node:fs";
import path from "node:path";
import { router } from "./routes/index.ts";
import { dbPath } from "./db/connection.ts";
import { runtimeInfo } from "./agents/runtime.ts";
import { tenants as tenantsRepo, leads as leadsRepo } from "./db/repo.ts";
import { DEMO_PASSWORD, DEMO_PLATFORM_EMAIL, seedIfEmpty } from "./db/seed.ts";

const app = express();
const PORT = Number(process.env.PORT ?? 4100);
const HOST = process.env.HOST ?? "0.0.0.0";

app.use(express.json({ limit: "1mb" }));

// Permissive CORS: this backend is a local dev service fronted by the Vite
// proxy. Tighten before exposing it publicly.
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (_req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use("/api", router);

/**
 * Deployment shape: one long-lived process serves BOTH the API and the built
 * frontend (see live-agent-system/dist). That is what makes a process host
 * (Railway/Render/Fly) work with the queue-draining runner — no separate
 * static host, same origin, relative /api URLs.
 */
const DIST_DIR = path.resolve(import.meta.dirname, "..", "..", "dist");
const SPA_INDEX = path.join(DIST_DIR, "index.html");

if (fs.existsSync(SPA_INDEX)) {
  app.use(express.static(DIST_DIR));
  // SPA fallback for every non-API GET (hash routing mostly, deep links too).
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api/")) {
      res.sendFile(SPA_INDEX);
      return;
    }
    next();
  });
} else {
  app.get("/", (_req, res) => {
    res.json({
      service: "core-agent-runtime",
      version: "1.0.0",
      db: dbPath,
      runtime: runtimeInfo(),
      endpoints: [
        "POST /api/auth/login        (email + password → bearer token)",
        "GET  /api/auth/me",
        "POST /api/auth/logout",
        "GET  /api/health",
        "GET  /api/tenants",
        "GET  /api/snapshot          (platform admins: whole platform; tenant users: own tenant)",
        "GET  /api/stats?tenant_id=",
        "GET  /api/leads?tenant_id=",
        "POST /api/leads",
        "PATCH /api/leads/:id",
        "GET  /api/leads/:id/runs",
        "GET  /api/bookings?tenant_id=",
        "POST /api/bookings",
        "POST /api/events            (ingest + run pipeline)",
        "GET  /api/events?tenant_id=",
        "POST /api/agents/run        (direct agent execution)",
        "GET  /api/agents/runs?tenant_id=",
        "GET  /api/agents/runtime",
        "GET  /api/agent-memory?tenant_id=",
        "GET  /api/agent-memory/recall?tenant_id=&subject_id=",
        "GET  /api/tools",
        "POST /api/tools/:name",
      ],
    });
  });
}

// Fail loudly on unhandled rejections rather than silently corrupting the queue.
process.on("unhandledRejection", (reason) => {
  console.error("[runner] unhandled rejection:", reason);
});

const seeded = seedIfEmpty();

const server = app.listen(PORT, HOST, () => {
  const tenants = tenantsRepo.list();
  const first = tenants[0];
  console.log(`\n  CORE agent runtime listening on http://${HOST}:${PORT}`);
  console.log(`  sqlite      : ${dbPath}`);
  console.log(`  decisioning : ${runtimeInfo().provider}${runtimeInfo().llm_configured ? "" : " (no LLM configured — set AGENT_LLM_PROVIDER=openrouter + OPENROUTER_API_KEY)"}`);
  console.log(`  tenants     : ${tenants.length}${seeded ? " (freshly seeded)" : ""}`);
  if (seeded) {
    console.log(`  demo login  : ${DEMO_PLATFORM_EMAIL} / ${DEMO_PASSWORD} (platform admin)`);
    console.log(`                admin@<slug>.example / ${DEMO_PASSWORD} (per-tenant admin)`);
  }
  if (first) {
    console.log(
      `  leads       : ${leadsRepo.list({ tenant_id: first.id }).length} in ${first.name}\n`,
    );
  }
});

function shutdown(signal: string): void {
  console.log(`\n[${signal}] shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
