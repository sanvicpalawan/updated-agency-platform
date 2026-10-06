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

## Tool layer

| Tool | Behaviour |
|---|---|
| `whatsapp.send` | Transport stub. Writes a delivery record to `messages`; `transport: "not_connected"`. |
| `email.send` | Transport stub. Same pattern. |
| `booking.create` | Real DB write, returns the reference. |
| `lead.assign` | Real DB write, validates agent + status. |

Only tools mutate outbound state. Each execution returns a record that lands in
`agent_runs.tool_calls`, including failures.

## Tenant scoping

Every route resolves `tenant_id` and rejects `all`. Record reads are
`WHERE id = ? AND tenant_id = ?`; a foreign ID is a 404, not a 403 leak.
`GET /api/snapshot` returns the whole platform for the admin UI, which is
deliberately an admin-only surface — it is not scoped.

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

`npm run verify` in `server/` boots a throwaway SQLite file and drives the real
API over HTTP — 61 assertions covering the pipeline, audit trail, memory, tools,
gates, scoping, and persistence across a restart.

## Swapping SQLite for Postgres

The schema uses only portable column types and `node:sqlite`'s json1, which maps
to `jsonb`. To move to Neon or Supabase: translate `schema.ts` to Postgres DDL,
replace `db/connection.ts` with a `pg` pool, and keep `db/repo.ts` as the only
module that knows the driver. Nothing above the repo layer changes.

## Known limits

- **No authentication.** `MOCK_ADMIN` is still a hardcoded client identity; the
  backend trusts whatever `tenant_id` it is given. Real auth must sit in front
  of `/api` before this is exposed.
- **Transport stubs.** WhatsApp and email write records; they do not deliver.
- **Synchronous pipeline.** `POST /api/events` drains inline so the caller sees
  the result. Long workflows will need a real worker and a 202 response.
- **No transactions across the pipeline.** A failed tool leaves earlier state
  changes applied; the failure is recorded rather than rolled back.
- `node:sqlite` is flagged experimental in Node 22.
