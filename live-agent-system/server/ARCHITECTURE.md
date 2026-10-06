# CORE Agent Runtime — Architecture

The browser-only agent simulation has been replaced by a backend-driven system.
This document describes what actually runs.

```
Frontend (React 19 / Vite)
    │  relative /api URLs only — never names a host
    ▼
Vite dev-server proxy  ──►  Express API (Node 22, port 4100)
                                │
                                ├─ routes/        HTTP surface + tenant scoping
                                ├─ pipeline/      event queue drain + agent dispatch
                                ├─ agents/        NYX · TALA · HERMES
                                │    └─ llm/      pluggable decision strategies
                                ├─ tools/         whatsapp · email · booking · lead
                                └─ db/            node:sqlite (WAL) — schema + repos
```

## What changed

| Before | After |
|---|---|
| Agents were TypeScript functions in the browser | Agents run in the Node process, behind an HTTP API |
| NYX score was `45 + bonuses` inline math | Feature extraction → 8 weighted scorers → structured `{score, reasoning, tags}` |
| TALA replied with one static template | Intent classification → DB memory retrieval → context injection → template rendering |
| HERMES "confirmed" bookings in localStorage | HERMES plans, transitions state, and executes tools, all recorded |
| `localStorage["core.admin.mock.v1"]` | SQLite file (`server/data/core.sqlite`), WAL mode |
| `eventBus` + `dispatcher` in the browser | `events` table as a queue, drained by `pipeline/runner.ts` |
| No audit trail | `agent_runs` — one row per execution with input, decision, reasoning, tags, tool calls, latency, tokens |

Deleted outright: `src/agents/*`, `src/core/eventBus.ts`, `src/core/dispatcher.ts`.

## Request flow

```
POST /api/events?tenant_id=…
  → events table (status=queued)
  → runner.drain() claims the event
  → tenant gate (status=active) + agent gate (enabled, rule≠manual)
  → agent decision (local strategy, or OpenRouter when configured)
  → tool execution (registry)
  → agent_runs row written
  → event settled done|failed|skipped
  → HTTP response carries every run produced
```

Agents never call each other. TALA's intake enqueues `lead.created`, which fans
out to NYX (scoring) and TALA (reply) as separate audited runs.

## The LLM seam

`src/agents/llm/strategy.ts` defines `NyxScoringStrategy` and
`TalaResponseStrategy`. Two implementations exist:

- **`local`** (default) — deterministic engines. No network.
- **`openrouter`** (`src/agents/llm/openrouter.ts`) — real `chat/completions`
  calls with JSON-mode output parsing, timeout, and usage capture.

Selection is by environment, resolved once in `agents/runtime.ts`:

```bash
AGENT_LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-v1-…
OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct:free   # optional
```

`GET /api/agents/runtime` reports which provider is live. `agent_runs.strategy`
records which one produced each result, so a run is always attributable.

No agent code or schema changes are needed to switch — that is the point of the
seam. **Nothing in this build calls an external network endpoint by default.**

### Verification status of the OpenRouter path

The adapter has been exercised end-to-end against a **local
OpenRouter-compatible mock** (`test/e2e.test.ts`, phase C): request shape,
bearer header, JSON-mode parsing, score clamping, and the `usage →
agent_runs.tokens_in / tokens_out / cost_usd / model_id` mapping are all
asserted. It has **not yet run against a live openrouter.ai model** (the build
sandboxes have no egress there); that is the remaining unverified mile.

## Tool layer

| Tool | Behaviour |
|---|---|
| `whatsapp.send` | Transport stub. Writes a delivery record to `messages`; `transport: "not_connected"`. |
| `email.send` | Transport stub. Same pattern. |
| `booking.create` | Real DB write, returns the reference. |
| `lead.assign` | Real DB write, validates agent + status. |

Only tools mutate outbound state. Each execution returns a record that lands in
`agent_runs.tool_calls`, including failures.

## Authentication & tenant scoping

`POST /api/auth/login` (email + scrypt-hashed password) issues a bearer token;
only its SHA-256 hash is stored (`sessions` table, 7-day TTL). Every route
except `/api/health` and `/api/auth/login` requires the token.

- **platform_admin** — users with no tenant. May address any tenant; sees the
  whole-platform snapshot.
- **tenant_admin / member** — pinned to the tenant on their session. A
  `tenant_id` anywhere else is a 403; the client-supplied value is never
  trusted on its own. Their snapshot is scoped to their own tenant.

Record reads remain `WHERE id = ? AND tenant_id = ?`; a foreign ID is a 404,
not a leak. Tenant creation/deletion and `POST /api/admin/reset` are
platform-admin-only.

## Schema versioning & migrations

`SCHEMA_SQL` always describes the latest shape (fresh installs). Existing
databases are upgraded by the ordered `MIGRATIONS` array in `db/schema.ts`,
applied transactionally by `db/connection.ts`:

| v | Change |
|---|---|
| 2 | `tenants.openrouter_api_key`, `agents.openrouter` (the da39f3c persistence fix) |
| 3 | auth: `users.password_hash`, nullable `users.tenant_id` (table rebuild), `sessions` |

The recorded version lives in `schema_meta`; a newer database than the runtime
refuses to start instead of being half-read.

## Running it

```bash
# terminal 1 — API + agents + SQLite
cd live-agent-system/server
npm install
npm start              # http://localhost:4100, seeds 6 tenants on first boot

# terminal 2 — frontend, proxies /api to :4100
cd live-agent-system
npm install
npm run dev            # http://localhost:5173
```

`npm run verify` in `server/` boots throwaway SQLite files and drives the real
API over HTTP — 119 assertions covering the auth gate, pipeline, audit trail,
memory, tools, gates, scoping/authorization, config persistence (read-back),
the v1→v3 schema migration, a restart, and the LLM seam against a local
OpenRouter-compatible mock. `npm run verify:config` in `live-agent-system/`
covers the frontend agent-profile merge logic.

## Deployment

The runner drains its queue inside the HTTP process and SQLite needs a durable
file, so the deployment unit is **one long-lived Node process serving both the
API and the built frontend** (`src/index.ts` serves `live-agent-system/dist`
with an SPA fallback whenever it exists). Plain serverless functions cannot
host this shape: no durable disk, no process lifetime.

Shipped artifacts: `Dockerfile` (repo root, multi-stage: frontend bundle →
backend compile → slim runtime), `railway.json`, `render.yaml`. Requirements on
the host:

1. Node ≥ 22.5 (for `node:sqlite`).
2. A persistent volume mounted at `/data` (`DB_PATH=/data/core.sqlite`).
   Without it the database resets on every redeploy.
3. Set `SEED_DEMO_PASSWORD` / rotate the seeded demo accounts before exposing
   the service (see SECURITY.md).
4. Optional: `AGENT_LLM_PROVIDER=openrouter` + `OPENROUTER_API_KEY`.

Tradeoff note: a serverless (Vercel-style) host would additionally require
swapping SQLite for a hosted Postgres and a request-scoped/cron runner — the
Postgres swap is designed (see below) but not done. The process-host shape
ships everything that exists today without code changes.

## Swapping SQLite for Postgres

The schema uses only portable column types and `node:sqlite`'s json1, which maps
to `jsonb`. To move to Neon or Supabase: translate `schema.ts` to Postgres DDL,
replace `db/connection.ts` with a `pg` pool, and keep `db/repo.ts` as the only
module that knows the driver. Nothing above the repo layer changes.

## Known limits

- **Demo credentials.** Seeded accounts share a published password (see
  SECURITY.md); there is no change-password flow yet.
- **OpenRouter keys at rest are plaintext** in SQLite.
- **Transport stubs.** WhatsApp and email write records; they do not deliver.
- **Synchronous pipeline.** `POST /api/events` drains inline so the caller sees
  the result. Long workflows will need a real worker and a 202 response.
- **No transactions across the pipeline.** A failed tool leaves earlier state
  changes applied; the failure is recorded rather than rolled back.
- **LLM path verified against a mock endpoint only** — not yet against a live
  openrouter.ai model (no egress from the build sandboxes).
- `node:sqlite` is flagged experimental in Node 22.
