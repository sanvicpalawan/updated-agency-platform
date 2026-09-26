import {
  AGENT_IDS,
  createDefaultToolsConfig,
  DEFAULT_AGENT_BEHAVIOR,
  DEFAULT_AGENT_CONFIG,
  DEFAULT_AGENT_OPENROUTER,
  DEFAULT_RULES,
} from "../config/platform";
import { assertTenantRecord, requireAdmin, resolveTenant } from "../core/tenantResolver";
import type { AgentConfig, Booking, Lead, Message, MockDatabase, Session, SystemEvent, Tenant, TenantContext, TenantUser } from "../types/database";
import { createMockDatabase, makeId } from "./seed";

interface Tables { users: TenantUser; leads: Lead; bookings: Booking; messages: Message; events: SystemEvent; agents: AgentConfig }
type Table = keyof Tables;
const STORAGE_KEY = "core.admin.mock.v1";
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function hydrateDatabase(candidate: MockDatabase): MockDatabase {
  candidate.tenants = candidate.tenants.map((tenant) => ({
    ...tenant,
    openrouter_api_key: tenant.openrouter_api_key ?? "",
    tools_config: {
      ...createDefaultToolsConfig(tenant.slug),
      ...(tenant.tools_config ?? {}),
    },
  }));
  candidate.agents = candidate.agents.map((agentConfig) => ({
    ...agentConfig,
    openrouter: {
      ...DEFAULT_AGENT_OPENROUTER[agentConfig.agent],
      ...(agentConfig.openrouter ?? {}),
    },
    behavior: {
      ...DEFAULT_AGENT_BEHAVIOR[agentConfig.agent],
      ...(agentConfig.behavior ?? {}),
      connected_tools: agentConfig.behavior?.connected_tools ?? [...DEFAULT_AGENT_BEHAVIOR[agentConfig.agent].connected_tools],
    },
  }));
  return candidate;
}

function loadDatabase(): MockDatabase {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const candidate = JSON.parse(raw) as MockDatabase;
      const tablesPresent = ["tenants", "users", "leads", "bookings", "messages", "events", "agents"].every((key) => Array.isArray(candidate[key as keyof MockDatabase]));
      if (candidate.version === 1 && tablesPresent && candidate.tenants.every((tenant) => typeof tenant.id === "string" && typeof tenant.name === "string" && typeof tenant.branding_config?.app_name === "string" && /^#[0-9a-f]{6}$/i.test(tenant.branding_config.primary_color) && tenant.rules)) {
        return hydrateDatabase(candidate);
      }
    }
  } catch { /* Storage is optional; the mock remains usable in memory. */ }
  return createMockDatabase();
}

class MockDB {
  private state = loadDatabase();
  private revision = 0;
  private listeners = new Set<() => void>();
  storage: "local" | "memory" = "local";

  constructor() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state)); }
    catch { this.storage = "memory"; }
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  getRevision = () => this.revision;

  private commit() {
    this.revision += 1;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      this.storage = "local";
    } catch { this.storage = "memory"; }
    this.listeners.forEach((listener) => listener());
  }

  listTenants(session: Session): Tenant[] {
    if (!session.user_id) throw new Error("An active session is required.");
    if (!["platform_admin", "tenant_admin"].includes(session.role)) throw new Error("Unrecognized session role.");
    if (session.role !== "platform_admin" && !session.tenant_id) throw new Error("No tenant is assigned to this session.");
    return clone(this.state.tenants.filter((tenant) => session.role === "platform_admin" || tenant.id === session.tenant_id));
  }

  getTenant(context: TenantContext): Tenant {
    resolveTenant(context.session, context.tenant_id);
    const tenant = this.state.tenants.find((t) => t.id === context.tenant_id);
    if (!tenant) throw new Error("The selected tenant no longer exists.");
    return clone(tenant);
  }

  createTenant(session: Session, input: Omit<Tenant, "id" | "created_at" | "rules">): Tenant {
    requireAdmin(session);
    this.validateTenant(input);
    const tenant: Tenant = {
      ...clone(input),
      id: makeId(),
      created_at: new Date().toISOString(),
      rules: { ...DEFAULT_RULES },
      openrouter_api_key: input.openrouter_api_key ?? "",
      tools_config: input.tools_config ?? createDefaultToolsConfig(input.slug),
    };
    this.state.tenants.push(tenant);
    AGENT_IDS.forEach((agent) => this.state.agents.push({
      id: `${tenant.id}:${agent}`,
      tenant_id: tenant.id,
      agent,
      enabled: true,
      config: { ...DEFAULT_AGENT_CONFIG[agent] },
      openrouter: { ...DEFAULT_AGENT_OPENROUTER[agent] },
      behavior: {
        ...DEFAULT_AGENT_BEHAVIOR[agent],
        connected_tools: [...DEFAULT_AGENT_BEHAVIOR[agent].connected_tools],
      },
      actions_completed: 0,
      last_action: "Awaiting first request",
      last_active_at: null,
    }));
    this.commit();
    return clone(tenant);
  }

  updateTenant(context: TenantContext, patch: Partial<Omit<Tenant, "id" | "created_at">>): Tenant {
    const current = this.getTenant(context);
    const next = { ...current, ...clone(patch), id: current.id, created_at: current.created_at };
    this.validateTenant(next, current.id);
    this.state.tenants = this.state.tenants.map((t) => t.id === current.id ? next : t);
    this.commit();
    return clone(next);
  }

  deleteTenant(context: TenantContext): void {
    requireAdmin(context.session);
    this.getTenant(context);
    this.state.tenants = this.state.tenants.filter((t) => t.id !== context.tenant_id);
    for (const table of ["users", "leads", "bookings", "messages", "events", "agents"] as Table[]) {
      this.state = { ...this.state, [table]: this.state[table].filter((row) => row.tenant_id !== context.tenant_id) };
    }
    this.commit();
  }

  private validateTenant(input: Pick<Tenant, "name" | "slug" | "status" | "branding_config">, except?: string) {
    if (!input.name.trim()) throw new Error("Tenant name is required.");
    if (!["active", "paused", "setup"].includes(input.status)) throw new Error("Invalid tenant status.");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug)) throw new Error("Use lowercase letters, numbers, and hyphens for the slug.");
    if (this.state.tenants.some((t) => t.slug === input.slug && t.id !== except)) throw new Error("This tenant slug is already in use.");
    if (!/^#[0-9a-fA-F]{6}$/.test(input.branding_config.primary_color)) throw new Error("Choose a valid six-digit hex color.");
    if (!input.branding_config.app_name.trim()) throw new Error("App name is required.");
    if (!["dark", "light"].includes(input.branding_config.theme)) throw new Error("Theme must be dark or light.");
  }

  // There is deliberately no unscoped records API. Revalidate on every call.
  forTenant(context: TenantContext) {
    this.getTenant(context);
    const list = <K extends Table>(table: K): Tables[K][] => {
      this.getTenant(context);
      return clone(this.state[table].filter((row) => row.tenant_id === context.tenant_id)) as Tables[K][];
    };
    const get = <K extends Table>(table: K, id: string): Tables[K] => {
      this.getTenant(context);
      const record = this.state[table].find((row) => row.id === id);
      assertTenantRecord(context, record);
      return clone(record) as Tables[K];
    };
    const insert = <K extends Table>(table: K, input: Omit<Tables[K], "tenant_id">): Tables[K] => {
      this.getTenant(context);
      if (this.state[table].some((r) => r.id === input.id)) throw new Error("This record already exists.");
      const record = { ...clone(input), tenant_id: context.tenant_id } as Tables[K];
      if (table === "messages") {
        const message = record as Message;
        if (message.lead_id) get("leads", message.lead_id);
      }
      this.state = { ...this.state, [table]: [...this.state[table], record] };
      this.commit();
      return clone(record);
    };
    const update = <K extends Table>(table: K, id: string, patch: Partial<Omit<Tables[K], "id" | "tenant_id">>): Tables[K] => {
      const current = get(table, id);
      const record = { ...current, ...clone(patch), id, tenant_id: context.tenant_id } as Tables[K];
      if (table === "messages" && (record as Message).lead_id) get("leads", (record as Message).lead_id!);
      this.state = { ...this.state, [table]: this.state[table].map((r) => r.id === id && r.tenant_id === context.tenant_id ? record : r) };
      this.commit();
      return clone(record);
    };
    const remove = <K extends Table>(table: K, id: string): void => {
      get(table, id);
      if (table === "leads") {
        this.state.messages = this.state.messages.filter((m) => !(m.tenant_id === context.tenant_id && m.lead_id === id));
      }
      this.state = {
        ...this.state,
        [table]: this.state[table].filter((r) => !(r.id === id && r.tenant_id === context.tenant_id)),
      };
      this.commit();
    };
    return { list, get, insert, update, remove };
  }

  reset(session: Session): void {
    requireAdmin(session);
    this.state = createMockDatabase();
    this.commit();
  }
}

export const db = new MockDB();
