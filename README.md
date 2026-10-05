# CORE — Multi-Tenant Operations Control Center

> **React 19 + Vite + TypeScript + Tailwind CSS v4**
> Three AI agents · Four operational tools · White-label ready · Static deploy anywhere

---

**CORE** is a tenant-scoped business operations platform with a full admin dashboard, live operations console, and three autonomous agents — all in one self-contained React application. No backend required. No database setup. Zero infrastructure to start.

**Built for agencies, operators, and teams who want to white-label a complete operations system and ship it under their own brand.**

---

## ⚠️ Read This Before You Use It

This is a **demonstration application**. It is excellent for previews, pitches and
white-label handoffs. It must not hold real or sensitive data.

- **No backend, no database.** Every record lives in the browser's `localStorage`.
- **The agents are deterministic rule scripts.** They do not call a language model.
- **Tenant isolation is client-side only.** It prevents accidental cross-tenant
  reads in the UI. It does not prevent anyone with devtools from reading every
  tenant's data.
- **OpenRouter API keys entered here are stored in plaintext in the browser.**
  Never use a production key.
- **The WhatsApp panel is a mock.** The QR block is locally generated and is not
  a scannable code. No message is ever sent.

**[SECURITY.md](./SECURITY.md) has the full threat picture and the ordered list of
what a production version needs.**

---

## What It Is

A complete business operations interface with two views in one codebase:

| View | Route | Purpose |
|---|---|---|
| **Admin Dashboard** | `#/admin/*` | Full management: tenants, agents, leads, bookings, logs, branding, rules, settings |
| **Operations Console** | `#/console` | Live Human / Agent dual-mode preview with boot sequence, activity stream, agent panel, control panel |

Both views share the same tenant-scoped mock runtime — what you see in admin is what the console operates on.

---

## Three Agents

The platform ships with three purpose-built agents wired to a typed event bus and dispatcher:

| Agent | Role | What It Does |
|---|---|---|
| **TALA** | Guest experience & intake | Captures inbound inquiries, responds with templated auto-replies, hands off bookings |
| **NYX** | Growth, scoring & outreach | Scores leads (deterministic rules), triggers 24h follow-ups, qualifies prospects |
| **HERMES** | Operations & ledger sync | Confirms pending bookings, dispatches staff notifications, reconciles tenant records |

**Event flow:** `API → eventBus → dispatcher → agent → scoped DB → UI subscription`. Agents never import each other. Every action is an auditable event. The simulator fires a scoped request every 18 seconds while enabled.

| Agent | Trigger Event | Behavior |
|---|---|---|
| **TALA** | `inquiry.received` → `lead.created` | Creates a lead, stores a template response in the mock outbox, changes lead status to contacted |
| **NYX** | `lead.created` | Scores the inquiry with deterministic rules, triggers 24h follow-ups respecting conversion state |
| **HERMES** | Booking events | Confirms pending bookings when configured, creates local staff notifications, reconciles tenant record counts |

CRUD operations write through the same scoped adapter and publish audit events. The dispatcher honors tenant status, agent enablement, and the tenant's stored rule selection. JSON configuration is validated before saving. Disabling an agent skips its automated actions; a manual "Run test" bypasses the delay. Pausing the log feed freezes only that view.

---

## Four Operational Tools

| Tool | Category | Outcome |
|---|---|---|
| **Lead Capture & CRM Intake** | Leads & CRM | Captures inquiries from web, WhatsApp, Instagram, email — scored and stored |
| **Booking & Reservation Scheduler** | Bookings & Revenue | Creates holds, confirms bookings, assigns reference codes, tracks pipeline value |
| **WhatsApp & Multi-Channel Responder** | Messaging & Outreach | Instant first responses + 24h follow-up sequences across channels |
| **Operations & Staff Dispatch Ledger** | Operations & Audit | Staff notifications on confirmed bookings, immutable audit trail, record reconciliation |

---

## Ten Admin Pages

- **Dashboard** — overview with interactive activity chart, today's metrics, recent events
- **Tenants** — create, view, edit, delete tenant workspaces; per-tenant agents, rules, branding
- **Agents & AI** — per-tenant enablement, JSON behavior config, OpenRouter model assignment, workflow tests, activity log
- **Tools & Outcomes** — tool enablement, webhook URL configuration, run counts, last outcome per tool
- **Leads** — filtering, status updates, agent assignment, lead history, mock outbox
- **Bookings** — filtering, status updates, assignment, booking timelines, revenue totals
- **Logs** — searchable event stream, pause/resume view, payload inspection, JSON export
- **Branding** — app name, logo/lettermark, accent color, dark/light theme, live preview
- **Rules** — validated per-agent JSON rules, rule reference, what each agent does
- **Settings** — OpenRouter API key, model catalog sync (live fetch + cache), environment diagnostics

**Navigating:** `Ctrl/Cmd + K` opens workspace/page search. Sidebar tenant switcher filters the entire admin workspace. Help icon opens runtime controls, isolation diagnostics, and guarded demo-data reset.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + TypeScript |
| Build | Vite 7 |
| CSS | Tailwind CSS v4 + custom dark/light design system |
| Icons | Lucide React |
| Routing | Hash-based (`#/admin/...`, `#/console`) — works on any static host |
| Build output | Single self-contained HTML file (`vite-plugin-singlefile`) |
| State | Event bus + dispatcher + React contexts — no Redux, no Zustand |
| Data | Browser localStorage mock (`core.admin.mock.v1`) — zero backend |
| AI integration | OpenRouter model catalog (live fetch, daily cache, key validation, 5 free + 5 paid models pre-configured) |
| Mock runtime | 6 seeded tenant workspaces: BAIA, Azarraga Glass, Marina Terrace, Aurelia Suites, Studio North, The Atrium |

---

## Run It

```bash
cd live-agent-system
npm install
npm run dev        # → localhost:5173
npm run build      # → dist/ (single HTML file for any static host)
```

**No environment variables needed.** No `.env` file. No database connection. No API keys. The app runs fully from the browser.

---

## White-Label Ready

Change two config files for clone-time defaults — not UI components, not agents:

- `src/config/platform.ts` — platform name, branding defaults, agent rules, OpenRouter configs, 4 tool webhook stubs
- `src/config/tenants.ts` — initial workspace presets (name, slug, industry, initials, accent, status)

Existing local data is not overwritten by preset changes. Use the guarded reset in the environment panel to reseed the mock.

**Create a workspace in Tenants → edit its brand in Branding.** Unsaved changes update the preview immediately. Saved branding updates the selected workspace, app title, accent, theme, and TALA's `{business}` response template.

---

## Architecture

```
src/
  App.tsx                         Entry point — admin/console routing
  OperationsConsole.tsx           Live Human / Agent console
  app/admin/
    AdminApp.tsx                  Responsive shell, search, notifications, environment dialog
    AdminContext.tsx              Mock session, scope, subscriptions, live simulation
    admin.css                     Scoped dark/light design system
    dashboard/page.tsx            Overview + activity chart
    tenants/page.tsx + TenantDialogs.tsx  Workspace CRUD
    agents/page.tsx              Per-tenant agent config, enablement, tests
    leads/page.tsx               Filtering, status, assignment, history
    bookings/page.tsx            Filtering, status, assignment, timelines
    logs/page.tsx                Searchable event stream, payload inspection, JSON export
    branding/page.tsx            App name, logo, accent, theme, live preview
    rules/page.tsx               Validated tenant JSON rules, rule reference
    tools/page.tsx               Tool enablement, webhook URLs, run counts
    settings/page.tsx            OpenRouter key, model catalog sync, diagnostics
    components/shared.tsx         Shared UI: tables, modals, toggles, empty states
    components/OpenRouterSync.tsx Model catalog sync indicator
    components/RecordTimeline.tsx Audit timeline component
    utils.ts                     Admin utilities
  agents/
    tala.ts                      TALA agent logic
    nyx.ts                       NYX agent logic
    hermes.ts                    HERMES agent logic
    shared.ts                    Shared action-tracking helper
  api/
    tenants.ts                   Tenant CRUD operations
    agents.ts                    Agent config operations
    leads.ts                     Lead operations
    bookings.ts                  Booking operations
    messages.ts                  Message operations
    events.ts                    Event trigger + listing
    tools.ts                     Tool operations
  core/
    eventBus.ts                  Typed event bus — publish/subscribe with recursion guard
    dispatcher.ts                Routes events to agents based on tenant status + rules
    tenantResolver.ts            Session + tenant access checks
    isolationChecks.ts           Read-only environment diagnostics
  services/
    db.ts                        Sole data-access interface — localStorage mock, tenant-scoped
    seed.ts                      Tenant-scoped demonstration records
    openrouter.ts                Live OpenRouter model catalog with daily refresh + caching
  config/
    platform.ts                  Platform identity, mock session, default agent rules
    tenants.ts                   Initial workspace presets
  types/
    database.ts                  All TypeScript types: tenant, user, lead, booking, message, event, agent
  components/
    tables/DataTable.tsx         Sortable, paginated, accessible tables
    sidebar/AdminSidebar.tsx     Navigation + admin-only workspace switcher
    charts/ActivityChart.tsx     Data-derived interactive SVG chart
    ...                          Preserved console UI components (Hero, AgentPanel, ActivityStream, etc.)
  system/
    consoleAdapter.ts            Tenant-scoped adapter for the original console interface
    useSystemEngine.ts           Compatibility re-export: engine + useSystem hook
    types.ts                     Console-specific types + metrics + ledger + pipeline
    config.ts                    Console config: agent defs, ledger defs, pipeline defs, accents, brand defaults
```

---

## Mock Data Model

`tenants` contains UUID `id`, `name`, unique `slug`, `industry`, `status`, `branding_config`, per-agent `rules`, optional console settings, and `created_at`.

`users`, `leads`, `bookings`, `messages`, `events`, and agent configurations each carry `tenant_id`. All records are created or queried through `db.forTenant(resolveTenant(session, tenant_id))`. The adapter filters lists, rejects foreign record IDs, checks message-to-lead references, and returns copies rather than mutable references to its state.

There is no unscoped records query. The platform overview first authorizes the tenant registry, then resolves and combines separately scoped queries. Tenant creation/listing are registry-level admin operations. Deletion requires platform-admin role and cascades only the selected tenant's records.

---

## Production Readiness

The production bundle builds successfully. Before real production use:

1. Replace the mock session with verified authentication
2. Move tenant checks and agent actions to a trusted server
3. Add database constraints and server-enforced row-level authorization
4. Make workflows transactional and idempotent
5. Add durable scheduling, monitoring, and integration tests

Browser role checks and localStorage are **not** security boundaries. No real guest communications, payments, deployments, or provider connections are claimed by this implementation.

When a shared database is connected, retain the tenant-scoped architecture and a single backend. Do not create a backend or database per tenant or agent.

---

## Deployment

Build the project and publish `dist/` to any static host:

- **Cloudflare Pages** — free, global edge, custom domain via Cloudflare Tunnel or CNAME
- **GitHub Pages** — free, simple
- **Netlify** — free tier available
- **Any static host** — S3 + CloudFront, Vercel, etc.

Hash routing means no backend rewrites needed. OpenRouter calls are browser-side fetches — work on static hosting.

---

## License

MIT

---

*Built by SanVicPalawan — Palawan Collective / merQato.digital*
