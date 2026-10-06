import { randomUUID } from "node:crypto";
import { db, transaction } from "./connection.ts";
import type {
  AgentConfigRow,
  AgentId,
  AgentRun,
  Booking,
  Lead,
  MemoryRow,
  MemoryScope,
  Message,
  SystemEvent,
  Tenant,
  TenantContext,
  ToolCallRecord,
} from "../types.ts";

export const newId = (): string => randomUUID();
const now = (): string => new Date().toISOString();

const parse = <T,>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

/* ------------------------------------------------------------------ */
/* row mappers                                                         */
/* ------------------------------------------------------------------ */

const mapTenant = (r: any): Tenant => ({
  ...r,
  branding_config: parse(r.branding_config, {
    app_name: r.name,
    logo: r.name?.[0] ?? "C",
    primary_color: "#bcf58b",
    theme: "dark",
  }),
  rules: parse(r.rules, { tala: "auto-reply-leads", nyx: "follow-up-after-24h", hermes: "log-all-bookings" }),
  tools_config: parse(r.tools_config, {}),
  console_config: parse(r.console_config, {}),
});

const mapLead = (r: any): Lead => ({
  ...r,
  score_tags: parse<string[]>(r.score_tags, []),
  score_run_id: r.score_run_id ?? null,
});

const mapEvent = (r: any): SystemEvent => ({
  ...r,
  agent: r.agent ?? null,
  entity_id: r.entity_id ?? null,
  error: r.error ?? null,
  processed_at: r.processed_at ?? null,
  payload: parse<Record<string, unknown>>(r.payload, {}),
});

const mapRun = (r: any): AgentRun => ({
  ...r,
  event_id: r.event_id ?? null,
  error: r.error ?? null,
  model_id: r.model_id ?? null,
  tokens_in: r.tokens_in ?? null,
  tokens_out: r.tokens_out ?? null,
  cost_usd: r.cost_usd ?? null,
  input: parse(r.input, {}),
  decision: parse(r.decision, {}),
  tags: parse<string[]>(r.tags, []),
  tool_calls: parse<ToolCallRecord[]>(r.tool_calls, []),
});

const mapMemory = (r: any): MemoryRow => ({
  ...r,
  content: parse(r.content, {}),
  last_accessed_at: r.last_accessed_at ?? null,
});

const mapAgent = (r: any): AgentConfigRow => ({
  ...r,
  enabled: Boolean(r.enabled),
  config: parse(r.config, {}),
  behavior: parse(r.behavior, {}),
  last_active_at: r.last_active_at ?? null,
});

/* ------------------------------------------------------------------ */
/* tenants                                                             */
/* ------------------------------------------------------------------ */

export const tenants = {
  list(): Tenant[] {
    return (db.prepare("SELECT * FROM tenants ORDER BY created_at").all() as any[]).map(mapTenant);
  },
  get(id: string): Tenant | undefined {
    const row = db.prepare("SELECT * FROM tenants WHERE id = ?").get(id) as any;
    return row ? mapTenant(row) : undefined;
  },
  /** Throws when the tenant is missing — the scoping guard for every call. */
  require(id: string): Tenant {
    const tenant = tenants.get(id);
    if (!tenant) throw new Error(`Tenant not found: ${id}`);
    return tenant;
  },
  create(input: {
    name: string;
    slug: string;
    industry?: string;
    status?: Tenant["status"];
    branding_config: Tenant["branding_config"];
    tools_config?: Record<string, unknown>;
  }): Tenant {
    const slug = String(input.slug ?? "").trim();
    if (!input.name?.trim()) throw new Error("Tenant name is required.");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new Error("Use lowercase letters, numbers, and hyphens for the slug.");
    }
    if (tenants.list().some((t) => t.slug === slug)) {
      throw new Error("This tenant slug is already in use.");
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(input.branding_config?.primary_color ?? "")) {
      throw new Error("Choose a valid six-digit hex color.");
    }
    const id = newId();
    db.prepare(
      `INSERT INTO tenants (id, name, slug, industry, status, branding_config, rules,
                            tools_config, console_config, created_at)
       VALUES ($id,$name,$slug,$industry,$status,$branding_config,$rules,$tools_config,$console_config,$created_at)`,
    ).run({
      id,
      name: input.name.trim(),
      slug,
      industry: input.industry ?? "",
      status: input.status ?? "setup",
      branding_config: JSON.stringify(input.branding_config),
      rules: JSON.stringify({ tala: "auto-reply-leads", nyx: "follow-up-after-24h", hermes: "log-all-bookings" }),
      tools_config: JSON.stringify(input.tools_config ?? {}),
      console_config: JSON.stringify({}),
      created_at: now(),
    });
    return tenants.require(id);
  },
  update(id: string, patch: Partial<Omit<Tenant, "id" | "created_at">>): Tenant {
    const current = tenants.require(id);
    const next = { ...current, ...patch, id, created_at: current.created_at };
    if (next.slug !== current.slug && tenants.list().some((t) => t.slug === next.slug)) {
      throw new Error("This tenant slug is already in use.");
    }
    db.prepare(
      `UPDATE tenants SET name=$name, slug=$slug, industry=$industry, status=$status,
              branding_config=$branding_config, rules=$rules, tools_config=$tools_config,
              console_config=$console_config
       WHERE id=$id`,
    ).run({
      id,
      name: next.name,
      slug: next.slug,
      industry: next.industry,
      status: next.status,
      branding_config: JSON.stringify(next.branding_config),
      rules: JSON.stringify(next.rules),
      tools_config: JSON.stringify(next.tools_config ?? {}),
      console_config: JSON.stringify(next.console_config ?? {}),
    });
    return tenants.require(id);
  },
  remove(id: string): void {
    tenants.require(id);
    db.prepare("DELETE FROM tenants WHERE id = ?").run(id);
  },
};

/* ------------------------------------------------------------------ */
/* leads                                                               */
/* ------------------------------------------------------------------ */

export const leads = {
  list(ctx: TenantContext, filter?: { status?: string; assigned_agent?: string }): Lead[] {
    const clauses = ["tenant_id = ?"];
    const params: (string | number | null)[] = [ctx.tenant_id];
    if (filter?.status) {
      clauses.push("status = ?");
      params.push(filter.status);
    }
    if (filter?.assigned_agent) {
      clauses.push("assigned_agent = ?");
      params.push(filter.assigned_agent);
    }
    return (
      db
        .prepare(`SELECT * FROM leads WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC`)
        .all(...params) as any[]
    ).map(mapLead);
  },
  get(ctx: TenantContext, id: string): Lead | undefined {
    const row = db
      .prepare("SELECT * FROM leads WHERE id = ? AND tenant_id = ?")
      .get(id, ctx.tenant_id) as any;
    return row ? mapLead(row) : undefined;
  },
  require(ctx: TenantContext, id: string): Lead {
    const lead = leads.get(ctx, id);
    if (!lead) throw new Error(`Lead not found in tenant: ${id}`);
    return lead;
  },
  create(
    ctx: TenantContext,
    input: {
      name: string;
      email?: string;
      channel?: string;
      inquiry?: string;
      assigned_agent?: AgentId;
      status?: Lead["status"];
      score?: number;
    },
  ): Lead {
    const ts = now();
    const id = newId();
    db.prepare(
      `INSERT INTO leads (id, tenant_id, name, email, channel, status, assigned_agent,
                          score, score_reasoning, score_tags, inquiry, created_at, updated_at)
       VALUES ($id, $tenant_id, $name, $email, $channel, $status, $assigned_agent,
               $score, '', '[]', $inquiry, $created_at, $updated_at)`,
    ).run({
      id,
      tenant_id: ctx.tenant_id,
      name: input.name,
      email: input.email ?? "",
      channel: input.channel ?? "Website",
      status: input.status ?? "new",
      assigned_agent: input.assigned_agent ?? "tala",
      score: input.score ?? 0,
      inquiry: input.inquiry ?? "",
      created_at: ts,
      updated_at: ts,
    });
    return leads.require(ctx, id);
  },
  update(
    ctx: TenantContext,
    id: string,
    patch: Partial<Omit<Lead, "id" | "tenant_id" | "created_at">>,
  ): Lead {
    const current = leads.require(ctx, id);
    const next = { ...current, ...patch, id, tenant_id: ctx.tenant_id };
    // node:sqlite rejects bind keys absent from the statement, so pass exactly
    // the columns this UPDATE references — never a spread of the whole row.
    db.prepare(
      `UPDATE leads SET name=$name, email=$email, channel=$channel, status=$status,
              assigned_agent=$assigned_agent, score=$score, score_reasoning=$score_reasoning,
              score_tags=$score_tags, score_run_id=$score_run_id, inquiry=$inquiry,
              updated_at=$updated_at
       WHERE id=$id AND tenant_id=$tenant_id`,
    ).run({
      id,
      tenant_id: ctx.tenant_id,
      name: next.name,
      email: next.email,
      channel: next.channel,
      status: next.status,
      assigned_agent: next.assigned_agent,
      score: next.score,
      score_reasoning: next.score_reasoning,
      score_tags: JSON.stringify(next.score_tags ?? []),
      score_run_id: next.score_run_id,
      inquiry: next.inquiry,
      updated_at: now(),
    });
    return leads.require(ctx, id);
  },
  remove(ctx: TenantContext, id: string): void {
    db.prepare("DELETE FROM leads WHERE id = ? AND tenant_id = ?").run(id, ctx.tenant_id);
  },
  count(ctx: TenantContext): number {
    return (
      db.prepare("SELECT count(*) c FROM leads WHERE tenant_id = ?").get(ctx.tenant_id) as { c: number }
    ).c;
  },
};

/* ------------------------------------------------------------------ */
/* bookings                                                            */
/* ------------------------------------------------------------------ */

export const bookings = {
  list(ctx: TenantContext, filter?: { status?: string }): Booking[] {
    const clauses = ["tenant_id = ?"];
    const params: (string | number | null)[] = [ctx.tenant_id];
    if (filter?.status) {
      clauses.push("status = ?");
      params.push(filter.status);
    }
    return (
      db
        .prepare(`SELECT * FROM bookings WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC`)
        .all(...params) as any[]
    ).map((r) => r);
  },
  get(ctx: TenantContext, id: string): Booking | undefined {
    return db.prepare("SELECT * FROM bookings WHERE id = ? AND tenant_id = ?").get(id, ctx.tenant_id) as
      | Booking
      | undefined;
  },
  require(ctx: TenantContext, id: string): Booking {
    const b = bookings.get(ctx, id);
    if (!b) throw new Error(`Booking not found in tenant: ${id}`);
    return b;
  },
  create(
    ctx: TenantContext,
    input: {
      guest: string;
      email?: string;
      service?: string;
      date?: string;
      amount?: number;
      reference?: string;
      status?: Booking["status"];
    },
  ): Booking {
    const ts = now();
    const id = newId();
    const tenant = tenants.require(ctx.tenant_id);
    const seq = (
      db.prepare("SELECT count(*) c FROM bookings WHERE tenant_id = ?").get(ctx.tenant_id) as {
        c: number;
      }
    ).c;
    db.prepare(
      `INSERT INTO bookings (id, tenant_id, reference, guest, email, service, date, amount,
                             status, assigned_agent, created_at, updated_at)
       VALUES ($id,$tenant_id,$reference,$guest,$email,$service,$date,$amount,$status,'hermes',$created_at,$updated_at)`,
    ).run({
      id,
      tenant_id: ctx.tenant_id,
      reference: input.reference ?? `${tenant.name.slice(0, 2).toUpperCase()}-${String(2401 + seq).padStart(4, "0")}`,
      guest: input.guest,
      email: input.email ?? "",
      service: input.service ?? "",
      date: input.date ?? "",
      amount: input.amount ?? 0,
      status: input.status ?? "pending",
      created_at: ts,
      updated_at: ts,
    });
    return bookings.require(ctx, id);
  },
  update(
    ctx: TenantContext,
    id: string,
    patch: Partial<Omit<Booking, "id" | "tenant_id" | "created_at">>,
  ): Booking {
    const current = bookings.require(ctx, id);
    const next = { ...current, ...patch, id, tenant_id: ctx.tenant_id };
    db.prepare(
      `UPDATE bookings SET reference=$reference, guest=$guest, email=$email, service=$service,
              date=$date, amount=$amount, status=$status, assigned_agent=$assigned_agent,
              updated_at=$updated_at
       WHERE id=$id AND tenant_id=$tenant_id`,
    ).run({
      id,
      tenant_id: ctx.tenant_id,
      reference: next.reference,
      guest: next.guest,
      email: next.email,
      service: next.service,
      date: next.date,
      amount: next.amount,
      status: next.status,
      assigned_agent: next.assigned_agent,
      updated_at: now(),
    });
    return bookings.require(ctx, id);
  },
  count(ctx: TenantContext): number {
    return (
      db.prepare("SELECT count(*) c FROM bookings WHERE tenant_id = ?").get(ctx.tenant_id) as {
        c: number;
      }
    ).c;
  },
};

/* ------------------------------------------------------------------ */
/* messages                                                            */
/* ------------------------------------------------------------------ */

export const messages = {
  list(ctx: TenantContext, leadId?: string): Message[] {
    if (leadId) {
      return db
        .prepare("SELECT * FROM messages WHERE tenant_id = ? AND lead_id = ? ORDER BY created_at")
        .all(ctx.tenant_id, leadId) as unknown as Message[];
    }
    return db
      .prepare("SELECT * FROM messages WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 500")
      .all(ctx.tenant_id) as unknown as Message[];
  },
  create(
    ctx: TenantContext,
    input: {
      lead_id?: string | null;
      agent: AgentId;
      content: string;
      channel?: string;
      direction: "inbound" | "outbound";
    },
  ): Message {
    const id = newId();
    db.prepare(
      `INSERT INTO messages (id, tenant_id, lead_id, agent, content, channel, direction, created_at)
       VALUES ($id,$tenant_id,$lead_id,$agent,$content,$channel,$direction,$created_at)`,
    ).run({
      id,
      tenant_id: ctx.tenant_id,
      lead_id: input.lead_id ?? null,
      agent: input.agent,
      content: input.content,
      channel: input.channel ?? "Website",
      direction: input.direction,
      created_at: now(),
    });
    return db.prepare("SELECT * FROM messages WHERE id = ?").get(id) as unknown as Message;
  },
  countFor(ctx: TenantContext, leadId: string, direction: "inbound" | "outbound"): number {
    return (
      db
        .prepare(
          "SELECT count(*) c FROM messages WHERE tenant_id = ? AND lead_id = ? AND direction = ?",
        )
        .get(ctx.tenant_id, leadId, direction) as { c: number }
    ).c;
  },
};

/* ------------------------------------------------------------------ */
/* events (ingestion log + runner queue)                               */
/* ------------------------------------------------------------------ */

export const events = {
  enqueue(
    ctx: TenantContext,
    input: {
      type: string;
      message: string;
      agent?: AgentId | null;
      level?: SystemEvent["level"];
      entity_id?: string | null;
      payload?: Record<string, unknown>;
    },
  ): SystemEvent {
    const id = newId();
    db.prepare(
      `INSERT INTO events (id, tenant_id, type, agent, level, message, entity_id, payload,
                           processing_status, created_at)
       VALUES ($id,$tenant_id,$type,$agent,$level,$message,$entity_id,$payload,'queued',$created_at)`,
    ).run({
      id,
      tenant_id: ctx.tenant_id,
      type: input.type,
      agent: input.agent ?? null,
      level: input.level ?? "info",
      message: input.message,
      entity_id: input.entity_id ?? null,
      payload: JSON.stringify(input.payload ?? {}),
      created_at: now(),
    });
    return events.require(ctx, id);
  },
  require(ctx: TenantContext, id: string): SystemEvent {
    const row = db.prepare("SELECT * FROM events WHERE id = ? AND tenant_id = ?").get(id, ctx.tenant_id) as any;
    if (!row) throw new Error(`Event not found in tenant: ${id}`);
    return mapEvent(row);
  },
  list(ctx: TenantContext, limit = 200): SystemEvent[] {
    return (
      db
        .prepare("SELECT * FROM events WHERE tenant_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?")
        .all(ctx.tenant_id, limit) as any[]
    ).map(mapEvent);
  },
  /** Claim the oldest queued event atomically-ish for this single-threaded runner. */
  claimNext(): SystemEvent | undefined {
    const row = db
      .prepare(
        `SELECT * FROM events WHERE processing_status = 'queued'
         ORDER BY rowid ASC LIMIT 1`,
      )
      .get() as any;
    if (!row) return undefined;
    db.prepare("UPDATE events SET processing_status = 'processing' WHERE id = ?").run(row.id);
    return mapEvent(row);
  },
  settle(id: string, status: SystemEvent["processing_status"], error?: string): void {
    db.prepare(
      "UPDATE events SET processing_status = ?, processed_at = ?, error = ? WHERE id = ?",
    ).run(status, now(), error ?? null, id);
  },
  countByStatus(): Record<string, number> {
    const rows = db
      .prepare("SELECT processing_status s, count(*) c FROM events GROUP BY processing_status")
      .all() as { s: string; c: number }[];
    return Object.fromEntries(rows.map((r) => [r.s, r.c]));
  },
};

/* ------------------------------------------------------------------ */
/* agents (per-tenant config + counters)                               */
/* ------------------------------------------------------------------ */

export const agents = {
  list(ctx: TenantContext): AgentConfigRow[] {
    return (
      db.prepare("SELECT * FROM agents WHERE tenant_id = ? ORDER BY agent").all(ctx.tenant_id) as any[]
    ).map(mapAgent);
  },
  get(ctx: TenantContext, agent: AgentId): AgentConfigRow | undefined {
    const row = db
      .prepare("SELECT * FROM agents WHERE tenant_id = ? AND agent = ?")
      .get(ctx.tenant_id, agent) as any;
    return row ? mapAgent(row) : undefined;
  },
  upsert(ctx: TenantContext, agent: AgentId, defaults: Partial<AgentConfigRow> = {}): AgentConfigRow {
    const existing = agents.get(ctx, agent);
    if (existing) return existing;
    const id = `${ctx.tenant_id}:${agent}`;
    db.prepare(
      `INSERT INTO agents (id, tenant_id, agent, enabled, config, behavior, actions_completed,
                           last_action, last_active_at)
       VALUES ($id,$tenant_id,$agent,$enabled,$config,$behavior,0,'Awaiting first request',NULL)`,
    ).run({
      id,
      tenant_id: ctx.tenant_id,
      agent,
      enabled: defaults.enabled === undefined ? 1 : defaults.enabled ? 1 : 0,
      config: JSON.stringify(defaults.config ?? {}),
      behavior: JSON.stringify(defaults.behavior ?? {}),
    });
    return agents.get(ctx, agent)!;
  },
  update(
    ctx: TenantContext,
    agent: AgentId,
    patch: Partial<Pick<AgentConfigRow, "enabled" | "config" | "behavior">>,
  ): AgentConfigRow {
    const current = agents.upsert(ctx, agent);
    db.prepare(
      "UPDATE agents SET enabled = ?, config = ?, behavior = ? WHERE tenant_id = ? AND agent = ?",
    ).run(
      patch.enabled === undefined ? (current.enabled ? 1 : 0) : patch.enabled ? 1 : 0,
      JSON.stringify(patch.config ?? current.config),
      JSON.stringify(patch.behavior ?? current.behavior),
      ctx.tenant_id,
      agent,
    );
    return agents.get(ctx, agent)!;
  },
  setEnabled(ctx: TenantContext, agent: AgentId, enabled: boolean): AgentConfigRow {
    db.prepare("UPDATE agents SET enabled = ? WHERE tenant_id = ? AND agent = ?").run(
      enabled ? 1 : 0,
      ctx.tenant_id,
      agent,
    );
    return agents.get(ctx, agent)!;
  },
  recordAction(ctx: TenantContext, agent: AgentId, description: string): void {
    db.prepare(
      `UPDATE agents SET actions_completed = actions_completed + 1,
              last_action = ?, last_active_at = ?
       WHERE tenant_id = ? AND agent = ?`,
    ).run(description, now(), ctx.tenant_id, agent);
  },
};

/* ------------------------------------------------------------------ */
/* agent_runs (audit spine)                                            */
/* ------------------------------------------------------------------ */

export const runs = {
  record(
    ctx: TenantContext,
    input: {
      agent: AgentId;
      event_id?: string | null;
      status: AgentRun["status"];
      strategy: string;
      input?: Record<string, unknown>;
      decision?: Record<string, unknown>;
      reasoning?: string;
      tags?: string[];
      tool_calls?: ToolCallRecord[];
      output_text?: string;
      latency_ms: number;
      tokens_in?: number | null;
      tokens_out?: number | null;
      cost_usd?: number | null;
      model_id?: string | null;
      error?: string | null;
    },
  ): AgentRun {
    const id = newId();
    db.prepare(
      `INSERT INTO agent_runs (id, tenant_id, agent, event_id, status, strategy, input, decision,
                               reasoning, tags, tool_calls, output_text, latency_ms,
                               tokens_in, tokens_out, cost_usd, model_id, error, created_at)
       VALUES ($id,$tenant_id,$agent,$event_id,$status,$strategy,$input,$decision,$reasoning,
               $tags,$tool_calls,$output_text,$latency_ms,$tokens_in,$tokens_out,$cost_usd,
               $model_id,$error,$created_at)`,
    ).run({
      id,
      tenant_id: ctx.tenant_id,
      agent: input.agent,
      event_id: input.event_id ?? null,
      status: input.status,
      strategy: input.strategy,
      input: JSON.stringify(input.input ?? {}),
      decision: JSON.stringify(input.decision ?? {}),
      reasoning: input.reasoning ?? "",
      tags: JSON.stringify(input.tags ?? []),
      tool_calls: JSON.stringify(input.tool_calls ?? []),
      output_text: input.output_text ?? "",
      latency_ms: input.latency_ms,
      tokens_in: input.tokens_in ?? null,
      tokens_out: input.tokens_out ?? null,
      cost_usd: input.cost_usd ?? null,
      model_id: input.model_id ?? null,
      error: input.error ?? null,
      created_at: now(),
    });
    return db.prepare("SELECT * FROM agent_runs WHERE id = ?").get(id) as any as AgentRun;
  },
  get(id: string): AgentRun | undefined {
    const row = db.prepare("SELECT * FROM agent_runs WHERE id = ?").get(id) as any;
    return row ? mapRun(row) : undefined;
  },
  list(ctx: TenantContext, opts?: { agent?: AgentId; limit?: number }): AgentRun[] {
    const clauses = ["tenant_id = ?"];
    const params: (string | number | null)[] = [ctx.tenant_id];
    if (opts?.agent) {
      clauses.push("agent = ?");
      params.push(opts.agent);
    }
    params.push(opts?.limit ?? 100);
    return (
      db
        .prepare(
          `SELECT * FROM agent_runs WHERE ${clauses.join(" AND ")}
           ORDER BY created_at DESC, rowid DESC LIMIT ?`,
        )
        .all(...params) as any[]
    ).map(mapRun);
  },
  forLead(ctx: TenantContext, leadId: string): AgentRun[] {
    return (
      db
        .prepare(
          `SELECT * FROM agent_runs WHERE tenant_id = ? AND agent = 'nyx'
             AND json_extract(input, '$.lead_id') = ?
           ORDER BY created_at DESC`,
        )
        .all(ctx.tenant_id, leadId) as any[]
    ).map(mapRun);
  },
  count(ctx: TenantContext): number {
    return (
      db.prepare("SELECT count(*) c FROM agent_runs WHERE tenant_id = ?").get(ctx.tenant_id) as {
        c: number;
      }
    ).c;
  },
};

/* ------------------------------------------------------------------ */
/* agent_memory                                                        */
/* ------------------------------------------------------------------ */

export const memory = {
  write(
    ctx: TenantContext,
    input: {
      scope: MemoryScope;
      subject_id: string;
      agent: AgentId;
      kind: string;
      text: string;
      content?: Record<string, unknown>;
      importance?: number;
    },
  ): MemoryRow {
    const existing = db
      .prepare(
        `SELECT * FROM agent_memory WHERE tenant_id = ? AND scope = ? AND subject_id = ?
           AND agent = ? AND kind = ?`,
      )
      .get(ctx.tenant_id, input.scope, input.subject_id, input.agent, input.kind) as any;
    const ts = now();
    if (existing) {
      db.prepare(
        `UPDATE agent_memory SET text = ?, content = ?, importance = ?, updated_at = ? WHERE id = ?`,
      ).run(
        input.text,
        JSON.stringify(input.content ?? {}),
        input.importance ?? existing.importance,
        ts,
        existing.id,
      );
      return mapMemory(
        db.prepare("SELECT * FROM agent_memory WHERE id = ?").get(existing.id),
      );
    }
    const id = newId();
    db.prepare(
      `INSERT INTO agent_memory (id, tenant_id, scope, subject_id, agent, kind, content, text,
                                 importance, created_at, updated_at)
       VALUES ($id,$tenant_id,$scope,$subject_id,$agent,$kind,$content,$text,$importance,$created_at,$updated_at)`,
    ).run({
      id,
      tenant_id: ctx.tenant_id,
      scope: input.scope,
      subject_id: input.subject_id,
      agent: input.agent,
      kind: input.kind,
      content: JSON.stringify(input.content ?? {}),
      text: input.text,
      importance: input.importance ?? 0.5,
      created_at: ts,
      updated_at: ts,
    });
    return mapMemory(db.prepare("SELECT * FROM agent_memory WHERE id = ?").get(id));
  },
  /** Recency + importance ranked retrieval. Embedding column is reserved for later. */
  recall(
    ctx: TenantContext,
    query: { scope: MemoryScope; subject_id: string; limit?: number },
  ): MemoryRow[] {
    const rows = (
      db
        .prepare(
          `SELECT *,
                  (importance * 0.6) + (0.4 * (1.0 / (1.0 + (julianday('now') - julianday(created_at))))) AS rank
             FROM agent_memory
            WHERE tenant_id = ? AND scope = ? AND subject_id = ?
            ORDER BY rank DESC
            LIMIT ?`,
        )
        .all(ctx.tenant_id, query.scope, query.subject_id, query.limit ?? 12) as any[]
    ).map(mapMemory);
    if (rows.length) {
      const ids = rows.map((r) => r.id);
      db.prepare(
        `UPDATE agent_memory SET access_count = access_count + 1, last_accessed_at = ?
          WHERE id IN (${ids.map(() => "?").join(",")})`,
      ).run(now(), ...ids);
    }
    return rows;
  },
  list(ctx: TenantContext, limit = 100): MemoryRow[] {
    return (
      db
        .prepare("SELECT * FROM agent_memory WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT ?")
        .all(ctx.tenant_id, limit) as any[]
    ).map(mapMemory);
  },
  count(ctx: TenantContext): number {
    return (
      db.prepare("SELECT count(*) c FROM agent_memory WHERE tenant_id = ?").get(ctx.tenant_id) as {
        c: number;
      }
    ).c;
  },
};

/* ------------------------------------------------------------------ */
/* stats                                                               */
/* ------------------------------------------------------------------ */

export function stats(ctx: TenantContext) {
  return transaction(() => ({
    leads: leads.count(ctx),
    bookings: bookings.count(ctx),
    events: events.list(ctx, 1000).length,
    runs: runs.count(ctx),
    memory: memory.count(ctx),
    queue: events.countByStatus(),
  }));
}
