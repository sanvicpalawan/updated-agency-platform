# Security

## What this application is

CORE is a multi-tenant operations platform: a React frontend and an
Express + SQLite (`node:sqlite`) backend in `live-agent-system/server`. Three
agents (TALA, NYX, HERMES) run server-side against a persistent database; every
execution is audited in `agent_runs`. WhatsApp/email tools are stubs — they
write records but transmit nothing.

## Authentication & authorization model

- `POST /api/auth/login` exchanges email + password for a bearer token.
  Passwords are hashed with scrypt (salted, constant-time compare). Only the
  SHA-256 hash of a session token is stored; tokens expire after 7 days.
  A small in-memory lockout throttles repeated failed logins per email.
- Every other `/api` route requires `Authorization: Bearer <token>`
  (`/api/health` and `/api/auth/login` are the only public endpoints).
- Roles: **platform_admin** (users with no tenant), **tenant_admin** and
  **member** (bound to one tenant). Non-admin sessions are *pinned* to their
  tenant server-side — a `tenant_id` pointing anywhere else is a 403, never
  trusted. `GET /api/snapshot` returns the whole platform for platform admins
  only; tenant users receive a snapshot scoped to their own tenant.
- Writes: tenants can only be created/deleted by platform admins; agent
  configuration requires tenant_admin or platform_admin.

The hardcoded `MOCK_ADMIN` client identity was deleted. The e2e suite asserts
all of the above (401s, cross-tenant 403s, scoped snapshots).

## Demo credentials — the known weak point

First boot seeds:

| Account | Email | Password |
|---|---|---|
| Platform admin | `admin@core.local` | `core-demo-2026` |
| Per-tenant admin | `admin@<slug>.example` | `core-demo-2026` |

The password is published in this document, printed to the server log, and
shown on the login screen. That is a deliberate demo trade-off. Before any
non-local exposure: set `SEED_DEMO_PASSWORD`, rotate/delete the seeded
accounts, and enforce your own password policy. There is currently no
change-password endpoint.

## Data protection status

- **OpenRouter API keys are stored in SQLite in plaintext**
  (`tenants.openrouter_api_key`, `agents.openrouter.api_key`). They are only
  readable with an authenticated admin session for that tenant, but anyone with
  the database file can read them. Use scoped, low-limit keys you can rotate.
- Session tokens are stored hashed; a leaked database does not leak sessions.
- The SQLite file must live on a persistent volume in production; it is the
  entire system of record.

## Known gaps (in priority order)

1. **No per-user password management** (change/reset) beyond re-seeding.
2. **OpenRouter keys at rest are unencrypted** — consider envelope encryption
   or a secret manager before real customer keys.
3. **Login throttling is per-process memory** — resets on restart and does not
   span multiple instances.
4. **No CSP/security headers** on the served frontend yet.
5. **whatsapp.send / email.send are stubs** — wiring real transports must
   include per-tenant credential isolation.
6. `node:sqlite` is experimental in Node 22 (works, but pin the Node version).

## The WhatsApp panel is a mock

`src/components/overlays/WhatsAppConnect.tsx` renders a QR-like block that is
**generated locally from a PRNG and is not a scannable device-link code**. No
WhatsApp credentials are exchanged and no message ever leaves the system.

## Isolation checks are a regression guard, not a control

`src/core/isolationChecks.ts` verifies client-side scoping conveniences. The
actual enforcement is server-side (see model above) and exercised by
`live-agent-system/server/test/e2e.test.ts`.

## Open dependency advisory

`npm audit` reports 3 high-severity advisories in the transitive chain
`vite-plugin-singlefile → micromatch → braces` (stack-exhaustion DoS via deeply
nested glob patterns). This is **build-time only**. The app performs no glob
processing on user-supplied input at runtime. We accept the advisory
deliberately rather than break the single-file build output.

## Reporting

Report suspected vulnerabilities privately to the repository owner rather than
in a public issue.
