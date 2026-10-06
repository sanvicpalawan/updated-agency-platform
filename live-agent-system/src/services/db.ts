/**
 * Backend-backed store.
 *
 * Replaces the old localStorage MockDB. There is no business state in the
 * browser any more: this module is a read cache over the Node/SQLite runtime,
 * kept fresh by `load()` and by a refresh after every mutation.
 *
 * Reads stay synchronous so the existing UI does not change shape. Writes are
 * optimistic — the cache updates immediately and the server is the source of
 * truth; a failed write reloads the cache and surfaces the server's error.
 */
import { backend } from "./backend";
import type {
  AgentConfig,
  Booking,
  Lead,
  Message,
  MockDatabase,
  Session,
  SystemEvent,
  Tenant,
  TenantContext,
  TenantUser,
} from "../types/database";
import { assertTenantRecord, requireAdmin, resolveTenant } from "../core/tenantResolver";

interface Tables {
  users: TenantUser;
  leads: Lead;
  bookings: Booking;
  messages: Message;
  events: SystemEvent;
  agents: AgentConfig;
}
type Table = keyof Tables;

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const emptyState = (): MockDatabase => ({
  version: 1,
  tenants: [],
  users: [],
  leads: [],
  bookings: [],
  messages: [],
  events: [],
  agents: [],
});

export type StoreStatus = "idle" | "loading" | "ready" | "error";

class BackendStore {
  private state: MockDatabase = emptyState();
  private revision = 0;
  private listeners = new Set<() => void>();
  private loading: Promise<void> | null = null;

  status: StoreStatus = "idle";
  lastError: string | null = null;
  lastSyncedAt: string | null = null;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getRevision = () => this.revision;

  private bump() {
    this.revision += 1;
    this.listeners.forEach((listener) => listener());
  }

  /** Pull the whole platform snapshot. Safe to call concurrently. */
  async load(force = false): Promise<void> {
    if (this.loading && !force) return this.loading;
    this.status = "loading";
    this.loading = (async () => {
      try {
        const snapshot = await backend.snapshot();
        this.state = {
          version: 1,
          tenants: snapshot.tenants as Tenant[],
          // The backend owns users; nothing in the UI reads this table.
          users: [],
          leads: snapshot.leads as Lead[],
          bookings: snapshot.bookings as Booking[],
          messages: snapshot.messages as Message[],
          events: snapshot.events as SystemEvent[],
          agents: snapshot.agents as AgentConfig[],
        };
        this.status = "ready";
        this.lastError = null;
        this.lastSyncedAt = new Date().toISOString();
        this.bump();
      } catch (error) {
        this.status = "error";
        this.lastError = error instanceof Error ? error.message : String(error);
        this.bump();
        throw error;
      } finally {
        this.loading = null;
      }
    })();
    return this.loading;
  }

  /** Run a mutation, then resync so backend-driven agent changes appear. */
  private async commit<T>(operation: () => Promise<T>): Promise<T> {
    try {
      const result = await operation();
      await this.load(true).catch(() => undefined);
      return result;
    } catch (error) {
      await this.load(true).catch(() => undefined);
      throw error;
    }
  }

  listTenants(session: Session): Tenant[] {
    if (!session.user_id) throw new Error("An active session is required.");
    if (!["platform_admin", "tenant_admin"].includes(session.role)) {
      throw new Error("Unrecognized session role.");
    }
    if (session.role !== "platform_admin" && !session.tenant_id) {
      throw new Error("No tenant is assigned to this session.");
    }
    return clone(
      this.state.tenants.filter(
        (tenant) => session.role === "platform_admin" || tenant.id === session.tenant_id,
      ),
    );
  }

  getTenant(context: TenantContext): Tenant {
    resolveTenant(context.session, context.tenant_id);
    const tenant = this.state.tenants.find((t) => t.id === context.tenant_id);
    if (!tenant) throw new Error("The selected tenant no longer exists.");
    return clone(tenant);
  }

  async createTenant(
    session: Session,
    input: Omit<Tenant, "id" | "created_at" | "rules">,
  ): Promise<Tenant> {
    requireAdmin(session);
    const { tenant } = await this.commit(() => backend.tenants.create(input));
    return tenant as Tenant;
  }

  async updateTenant(
    context: TenantContext,
    patch: Partial<Omit<Tenant, "id" | "created_at">>,
  ): Promise<Tenant> {
    this.getTenant(context);
    const { tenant } = await this.commit(() => backend.tenants.update(context.tenant_id, patch));
    return tenant as Tenant;
  }

  async deleteTenant(context: TenantContext): Promise<void> {
    requireAdmin(context.session);
    this.getTenant(context);
    await this.commit(() => backend.tenants.remove(context.tenant_id));
  }

  /**
   * Scoped reads. There is deliberately no unscoped accessor — every call
   * revalidates the tenant and returns deep clones.
   */
  forTenant(context: TenantContext) {
    this.getTenant(context);

    const list = <K extends Table>(table: K): Tables[K][] => {
      this.getTenant(context);
      return clone(
        this.state[table].filter((row) => row.tenant_id === context.tenant_id),
      ) as Tables[K][];
    };

    const get = <K extends Table>(table: K, id: string): Tables[K] => {
      this.getTenant(context);
      const record = this.state[table].find((row) => row.id === id);
      assertTenantRecord(context, record);
      return clone(record) as Tables[K];
    };

    return { list, get };
  }

  /* ---------------------------------------------------------------- */
  /* mutations — all async, all server-authoritative                   */
  /* ---------------------------------------------------------------- */

  async insertLead(context: TenantContext, input: Record<string, unknown>): Promise<Lead> {
    this.getTenant(context);
    const { lead } = await this.commit(() => backend.leads.create(context.tenant_id, input));
    return lead as Lead;
  }

  async updateLead(
    context: TenantContext,
    id: string,
    patch: Record<string, unknown>,
  ): Promise<Lead> {
    this.getTenant(context);
    const { lead } = await this.commit(() => backend.leads.update(context.tenant_id, id, patch));
    return lead as Lead;
  }

  async removeLead(context: TenantContext, id: string): Promise<void> {
    this.getTenant(context);
    await this.commit(() => backend.leads.remove(context.tenant_id, id));
  }

  async insertBooking(context: TenantContext, input: Record<string, unknown>): Promise<Booking> {
    this.getTenant(context);
    const { booking } = await this.commit(() => backend.bookings.create(context.tenant_id, input));
    return booking as Booking;
  }

  async updateBooking(
    context: TenantContext,
    id: string,
    patch: Record<string, unknown>,
  ): Promise<Booking> {
    this.getTenant(context);
    const { booking } = await this.commit(() => backend.bookings.update(context.tenant_id, id, patch));
    return booking as Booking;
  }

  /** Rebuild demo data server-side, then resync. */
  async reset(session: Session): Promise<void> {
    requireAdmin(session);
    await this.commit(() => backend.admin.reset());
  }

  async updateAgent(
    context: TenantContext,
    agent: string,
    patch: Record<string, unknown>,
  ): Promise<AgentConfig> {
    this.getTenant(context);
    const { agent: updated } = await this.commit(() =>
      backend.agents.update(context.tenant_id, agent, patch),
    );
    return updated as AgentConfig;
  }
}

export const db = new BackendStore();
