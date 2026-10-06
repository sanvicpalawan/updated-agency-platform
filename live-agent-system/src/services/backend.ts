/**
 * Backend HTTP client.
 *
 * The browser no longer owns business state: every read and write goes through
 * the Node/SQLite runtime. Requests use relative URLs so the Vite dev server can
 * proxy them (see vite.config.ts) and the same code works when the API is served
 * from the same origin in production.
 */

export interface ApiError extends Error {
  status: number;
}

const BASE = "/api";

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { error: text };
  }

  if (!res.ok) {
    const message =
      (parsed as { error?: string } | null)?.error ?? `Request failed with status ${res.status}`;
    const error = new Error(message) as ApiError;
    error.status = res.status;
    throw error;
  }
  return parsed as T;
}

const query = (params: Record<string, string | number | undefined>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const string = search.toString();
  return string ? `?${string}` : "";
};

export interface Snapshot {
  tenants: any[];
  leads: any[];
  bookings: any[];
  messages: any[];
  events: any[];
  agents: any[];
  runs: any[];
  memory: any[];
}

export const backend = {
  health: () => request<any>("GET", "/health"),
  snapshot: () => request<Snapshot>("GET", "/snapshot"),

  tenants: {
    create: (input: unknown) => request<{ tenant: any }>("POST", "/tenants", input),
    update: (id: string, patch: unknown) =>
      request<{ tenant: any }>("PATCH", `/tenants/${encodeURIComponent(id)}`, patch),
    remove: (id: string) =>
      request<{ deleted: string }>("DELETE", `/tenants/${encodeURIComponent(id)}`),
  },

  leads: {
    create: (tenant_id: string, input: unknown) =>
      request<{ lead: any }>("POST", `/leads${query({ tenant_id })}`, input),
    update: (tenant_id: string, id: string, patch: unknown) =>
      request<{ lead: any }>("PATCH", `/leads/${encodeURIComponent(id)}${query({ tenant_id })}`, patch),
    remove: (tenant_id: string, id: string) =>
      request<{ deleted: string }>("DELETE", `/leads/${encodeURIComponent(id)}${query({ tenant_id })}`),
  },

  bookings: {
    create: (tenant_id: string, input: unknown) =>
      request<{ booking: any }>("POST", `/bookings${query({ tenant_id })}`, input),
    update: (tenant_id: string, id: string, patch: unknown) =>
      request<{ booking: any }>(
        "PATCH",
        `/bookings/${encodeURIComponent(id)}${query({ tenant_id })}`,
        patch,
      ),
  },

  agents: {
    update: (tenant_id: string, agent: string, patch: unknown) =>
      request<{ agent: any }>("PATCH", `/agents/${agent}${query({ tenant_id })}`, patch),
    runs: (tenant_id: string, agent?: string) =>
      request<{ runs: any[] }>("GET", `/agents/runs${query({ tenant_id, agent })}`),
    runtime: () => request<any>("GET", "/agents/runtime"),
  },

  /** Ingest an event and run the backend agent pipeline. */
  events: {
    publish: (tenant_id: string, input: unknown) =>
      request<{ event: any; pipeline: { runs: any[]; processed_events: number } }>(
        "POST",
        `/events${query({ tenant_id })}`,
        input,
      ),
  },

  memory: {
    recall: (tenant_id: string, subject_id: string) =>
      request<{ facts: any[] }>(
        "GET",
        `/agent-memory/recall${query({ tenant_id, subject_id, scope: "lead" })}`,
      ),
  },

  messages: {
    create: (tenant_id: string, input: unknown) =>
      request<{ message: any }>("POST", `/messages${query({ tenant_id })}`, input),
  },

  admin: {
    reset: () => request<{ ok: boolean; tenants: number }>("POST", "/admin/reset"),
  },

  tools: {
    list: () => request<{ tools: any[] }>("GET", "/tools"),
    execute: (tenant_id: string, name: string, args: unknown) =>
      request<{ invocation: any }>("POST", `/tools/${name}${query({ tenant_id })}`, args),
  },
};
