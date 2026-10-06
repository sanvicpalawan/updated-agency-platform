/**
 * SQLite schema for the CORE agent runtime.
 *
 * Deliberately portable: every column type here has a direct PostgreSQL
 * equivalent, so migrating to Neon/Supabase is a DDL translation, not a
 * redesign. `node:sqlite` stores JSON as TEXT and exposes it through the
 * json1 extension, which mirrors `jsonb` closely enough for our access
 * patterns.
 */
export const SCHEMA_VERSION = 1;

export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tenants (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  industry        TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','paused','setup')),
  branding_config TEXT NOT NULL DEFAULT '{}',
  rules           TEXT NOT NULL DEFAULT '{}',
  tools_config    TEXT NOT NULL DEFAULT '{}',
  console_config  TEXT NOT NULL DEFAULT '{}',
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);

CREATE TABLE IF NOT EXISTS leads (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL DEFAULT '',
  channel         TEXT NOT NULL DEFAULT 'Website',
  status          TEXT NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new','contacted','qualified','converted')),
  assigned_agent  TEXT NOT NULL DEFAULT 'tala',
  score           INTEGER NOT NULL DEFAULT 0,
  score_reasoning TEXT NOT NULL DEFAULT '',
  score_tags      TEXT NOT NULL DEFAULT '[]',
  score_run_id    TEXT,
  inquiry         TEXT NOT NULL DEFAULT '',
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leads_tenant ON leads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(tenant_id, status);

CREATE TABLE IF NOT EXISTS bookings (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reference      TEXT NOT NULL,
  guest          TEXT NOT NULL,
  email          TEXT NOT NULL DEFAULT '',
  service        TEXT NOT NULL DEFAULT '',
  date           TEXT NOT NULL DEFAULT '',
  amount         REAL NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','confirmed','completed','cancelled')),
  assigned_agent TEXT NOT NULL DEFAULT 'hermes',
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bookings_tenant ON bookings(tenant_id);

CREATE TABLE IF NOT EXISTS messages (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id    TEXT REFERENCES leads(id) ON DELETE SET NULL,
  agent      TEXT NOT NULL,
  content    TEXT NOT NULL,
  channel    TEXT NOT NULL DEFAULT 'Website',
  direction  TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_lead ON messages(tenant_id, lead_id);

CREATE TABLE IF NOT EXISTS agents (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent             TEXT NOT NULL,
  enabled           INTEGER NOT NULL DEFAULT 1,
  config            TEXT NOT NULL DEFAULT '{}',
  behavior          TEXT NOT NULL DEFAULT '{}',
  actions_completed INTEGER NOT NULL DEFAULT 0,
  last_action       TEXT NOT NULL DEFAULT 'Awaiting first request',
  last_active_at    TEXT,
  UNIQUE (tenant_id, agent)
);

-- Append-only ingestion log AND the runner's work queue.
-- A row is enqueued on insert and claimed by the runner via processing_status.
CREATE TABLE IF NOT EXISTS events (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type              TEXT NOT NULL,
  agent             TEXT,
  level             TEXT NOT NULL DEFAULT 'info'
                      CHECK (level IN ('info','success','warning','error')),
  message           TEXT NOT NULL,
  entity_id         TEXT,
  payload           TEXT NOT NULL DEFAULT '{}',
  processing_status TEXT NOT NULL DEFAULT 'queued'
                      CHECK (processing_status IN ('queued','processing','done','failed','skipped')),
  processed_at      TEXT,
  error             TEXT,
  created_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_queue
  ON events(processing_status, created_at);
CREATE INDEX IF NOT EXISTS idx_events_tenant ON events(tenant_id, created_at);

-- One row per agent execution. This is the audit spine: every decision,
-- every tool call, and every LLM token count lands here.
CREATE TABLE IF NOT EXISTS agent_runs (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent       TEXT NOT NULL,
  event_id    TEXT REFERENCES events(id) ON DELETE SET NULL,
  status      TEXT NOT NULL CHECK (status IN ('ok','skipped','failed')),
  strategy    TEXT NOT NULL,
  input       TEXT NOT NULL DEFAULT '{}',
  decision    TEXT NOT NULL DEFAULT '{}',
  reasoning   TEXT NOT NULL DEFAULT '',
  tags        TEXT NOT NULL DEFAULT '[]',
  tool_calls  TEXT NOT NULL DEFAULT '[]',
  output_text TEXT NOT NULL DEFAULT '',
  latency_ms  INTEGER NOT NULL DEFAULT 0,
  tokens_in   INTEGER,
  tokens_out  INTEGER,
  cost_usd    REAL,
  model_id    TEXT,
  error       TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_runs_tenant ON agent_runs(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_runs_agent ON agent_runs(agent, created_at);

-- Durable context the agents read back on later turns.
-- 'embedding' is reserved for vector retrieval once an embedding provider is
-- wired; retrieval currently falls back to recency + importance ranking.
CREATE TABLE IF NOT EXISTS agent_memory (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  scope             TEXT NOT NULL CHECK (scope IN ('lead','booking','tenant','agent')),
  subject_id        TEXT NOT NULL,
  agent             TEXT NOT NULL,
  kind              TEXT NOT NULL,
  content           TEXT NOT NULL DEFAULT '{}',
  text              TEXT NOT NULL DEFAULT '',
  importance        REAL NOT NULL DEFAULT 0.5,
  embedding         TEXT,
  access_count      INTEGER NOT NULL DEFAULT 0,
  last_accessed_at  TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memory_lookup
  ON agent_memory(tenant_id, scope, subject_id);
`;
