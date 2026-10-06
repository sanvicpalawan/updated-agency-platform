/**
 * Bearer-token sessions.
 *
 * The raw token (32 random bytes, hex) is returned to the client exactly
 * once; only its SHA-256 hash is stored, so a leaked database does not leak
 * credentials. Sessions expire after SESSION_TTL_DAYS (default 7).
 */
import { createHash, randomBytes } from "node:crypto";
import { db } from "../db/connection.ts";
import type { AuthSession, SessionRole } from "../types.ts";

const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS ?? 7);

interface SessionRow {
  token_hash: string;
  user_id: string;
  tenant_id: string | null;
  role: SessionRole;
  created_at: string;
  expires_at: string;
  last_seen_at: string | null;
}

const sha256 = (token: string): string => createHash("sha256").update(token).digest("hex");
const now = (): string => new Date().toISOString();
const inDays = (days: number): string => new Date(Date.now() + days * 86_400_000).toISOString();

interface UserRow {
  id: string;
  tenant_id: string | null;
  name: string;
  email: string;
  role: "admin" | "member";
}

/** Map a users row onto the session role the rest of the system speaks. */
export function roleFor(user: UserRow): SessionRole {
  if (!user.tenant_id) return "platform_admin";
  return user.role === "admin" ? "tenant_admin" : "member";
}

export function createSession(user: UserRow): { token: string; session: AuthSession } {
  const token = randomBytes(32).toString("hex");
  db.prepare(
    `INSERT INTO sessions (token_hash, user_id, tenant_id, role, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(sha256(token), user.id, user.tenant_id ?? null, roleFor(user), now(), inDays(SESSION_TTL_DAYS));
  return {
    token,
    session: {
      user_id: user.id,
      name: user.name,
      email: user.email,
      role: roleFor(user),
      tenant_id: user.tenant_id ?? null,
    },
  };
}

export function getSession(token: string): AuthSession | undefined {
  if (!token) return undefined;
  const row = db.prepare("SELECT * FROM sessions WHERE token_hash = ?").get(sha256(token)) as
    | SessionRow
    | undefined;
  if (!row) return undefined;
  if (row.expires_at <= now()) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(row.token_hash);
    return undefined;
  }
  // Join against users so a deleted user invalidates their sessions even
  // before the FK cascade is observed.
  const user = db.prepare("SELECT id, name, email FROM users WHERE id = ?").get(row.user_id) as
    | { id: string; name: string; email: string }
    | undefined;
  if (!user) return undefined;
  return {
    user_id: row.user_id,
    name: user.name,
    email: user.email,
    role: row.role,
    tenant_id: row.tenant_id,
  };
}

export function destroySession(token: string): void {
  if (!token) return;
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
}
