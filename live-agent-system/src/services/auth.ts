/**
 * Client session store.
 *
 * Replaces the old hardcoded MOCK_ADMIN identity. The backend issues bearer
 * tokens via POST /api/auth/login; the token is kept in localStorage so a
 * refresh keeps the session, and every API request in services/backend.ts
 * attaches it. A 401 anywhere clears the store, which re-renders the app
 * into the login screen.
 */
import type { Session } from "../types/database";

interface StoredAuth {
  token: string;
  session: Session;
}

const STORAGE_KEY = "core.auth.v1";

function read(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAuth;
    if (!parsed?.token || !parsed?.session?.user_id) return null;
    return parsed;
  } catch {
    return null;
  }
}

let state: StoredAuth | null = read();
const listeners = new Set<() => void>();

function commit(next: StoredAuth | null): void {
  state = next;
  try {
    if (state) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* Memory-only environments still work; the session just won't survive reloads. */
  }
  listeners.forEach((listener) => listener());
}

export const authStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  get(): StoredAuth | null {
    return state;
  },
  getToken(): string | null {
    return state?.token ?? null;
  },
};

export async function login(email: string, password: string): Promise<Session> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const text = await res.text();
  let json: { token?: string; session?: Session; error?: string } | null = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { error: text };
  }
  if (!res.ok || !json?.token || !json?.session) {
    throw new Error(json?.error ?? `Login failed (${res.status}).`);
  }
  commit({ token: json.token, session: json.session });
  return json.session;
}

export function logout(): void {
  const token = state?.token;
  commit(null);
  if (token) {
    // Best effort: even if the server is unreachable the client is signed out.
    fetch("/api/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${token}` } }).catch(
      () => undefined,
    );
  }
}

/** Drop the local session without telling the server (used on 401 responses). */
export function clearAuth(): void {
  if (state) commit(null);
}

/**
 * Synchronous accessor for non-React code (console adapter, isolation
 * checks). Throws when signed out — callers are rendered behind the login
 * gate, so a throw surfaces as the error boundary rather than silent misuse.
 */
export function requireSession(): Session {
  const session = state?.session;
  if (!session) throw new Error("An active session is required. Sign in to continue.");
  return session;
}
