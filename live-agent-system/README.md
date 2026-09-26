# CORE Admin

A tenant-scoped business operations control panel, built into the existing React/Vite project. The original Human / Agent console is preserved and now reads the same mock database as the admin interface.

## Runtime And Scope

- React 19, TypeScript, Vite, Tailwind CSS v4, Lucide icons.
- The existing Vite entry point remains `src/App.tsx`. The `src/app/admin/*/page.tsx` files are modular React pages, not Next.js server routes. There was no Next.js migration.
- One mock data adapter: `src/services/db.ts`. There is no Supabase project, external backend, real database connection, AI service, or Cloudflare integration.
- Browser-local persistence uses `core.admin.mock.v1`; unavailable or full storage falls back to the current in-memory session.
- The default identity is an explicitly mocked platform administrator. This is not authentication, server authorization, or a production security boundary.
- A clone or deployment has its own browser-origin localStorage. Separate deployments do not share real data until a shared server adapter is implemented.

## Run And Deploy

Install the project dependencies and start the existing Vite development task. The build task produces `dist/`, which can be published to a static host. No environment variables or service credentials are required.

Navigation uses hash routes so client-side links work on static hosting without custom backend rewrites:

- `#/admin/dashboard`: overview and interactive activity chart
- `#/admin/tenants`: create, view, edit, and delete tenant workspaces
- `#/admin/agents`: per-tenant enablement, JSON behavior, workflow tests, activity
- `#/admin/leads`: filtering, status updates, assignment, lead history, mock outbox
- `#/admin/bookings`: filtering, status updates, assignment, booking timelines
- `#/admin/logs`: searchable event stream, pause/resume view, payload inspection, JSON export
- `#/admin/branding`: app name, logo/lettermark, accent, dark/light theme, live preview
- `#/admin/rules`: validated tenant JSON rules and rule reference
- `#/console`: original Human / Agent interface for the selected tenant (first tenant if All tenants is selected)

`Ctrl/Cmd + K` opens workspace/page search. The sidebar tenant switcher filters the entire admin workspace. The help icon opens runtime controls, read-only isolation diagnostics, and a guarded demo-data reset.

## Updated Code Tree

```text
src/
  App.tsx                         Existing entry point; admin/console routing
  OperationsConsole.tsx           Preserved Human / Agent console
  app/admin/
    AdminApp.tsx                  Responsive shell, search, notifications, environment
    AdminContext.tsx              Mock session, scope, subscriptions, live simulation
    admin.css                     Scoped dark/light design system
    dashboard/page.tsx
    tenants/page.tsx
    tenants/TenantDialogs.tsx
    agents/page.tsx
    leads/page.tsx
    bookings/page.tsx
    logs/page.tsx
    branding/page.tsx
    rules/page.tsx
    components/shared.tsx
    components/RecordTimeline.tsx
    utils.ts
  agents/
    tala.ts
    nyx.ts
    hermes.ts
    shared.ts
  api/
    tenants.ts
    agents.ts
    leads.ts
    bookings.ts
    messages.ts
    events.ts
  core/
    eventBus.ts
    dispatcher.ts
    tenantResolver.ts
    isolationChecks.ts
  services/
    db.ts                         Sole data-access interface; mock only
    seed.ts                       Tenant-scoped demonstration records
  config/
    platform.ts                   Platform identity, mock session, default agent rules
    tenants.ts                    Initial BAIA / Azarraga / Marina / other presets
  types/
    database.ts                   Tenant, user, lead, booking, message, event, agent types
  components/
    tables/DataTable.tsx          Sortable, paginated, accessible tables
    sidebar/AdminSidebar.tsx      Navigation and admin-only workspace switcher
    charts/ActivityChart.tsx      Data-derived interactive SVG chart
    ...                           Preserved console UI components
  system/
    consoleAdapter.ts             Tenant-scoped adapter for the original interface
    useSystemEngine.ts            Compatibility exports, not another database
    types.ts
    config.ts
```

## Mock Data Model

`tenants` contains UUID `id`, `name`, unique `slug`, `industry`, `status`, `branding_config`, per-agent `rules`, optional console settings, and `created_at`.

`users`, `leads`, `bookings`, `messages`, `events`, and agent configurations each carry `tenant_id`. All records are created or queried through `db.forTenant(resolveTenant(session, tenant_id))`. The adapter filters lists, rejects foreign record IDs, checks message-to-lead references, and returns copies rather than mutable references to its state.

There is no unscoped records query. The platform overview first authorizes the tenant registry, then resolves and combines separately scoped queries. Tenant creation/listing are registry-level admin operations. Deletion requires platform-admin role and cascades only the selected tenant's records.

## Event Flow

Agent actions use `API -> eventBus -> dispatcher -> agent -> scoped DB -> UI subscription`. Agents never import or call one another. Emitted result events are audit entries and do not recursively trigger unrelated agents.

- TALA: `inquiry.received` creates a lead. `lead.created` stores a template response in the mock outbox and changes a new lead to contacted.
- NYX: `lead.created` scores the inquiry with deterministic rules. Follow-up requests respect conversion state and configured delay; an explicit test can bypass the delay.
- HERMES: booking events confirm pending reservations when configured, optionally create a local staff notification, and log the result. A sync request reconciles tenant record counts.
- CRUD operations write through the same scoped adapter and publish audit events.
- The simulator emits a scoped request every 18 seconds while enabled. Disabling it does not disable manual actions. Pausing the log feed freezes only that view.

The dispatcher honors tenant status, agent enablement, and the tenant's stored rule selection. JSON configuration is validated before saving. No LLM calls or multi-model routing are present.

## White-Label Reuse

Create a workspace in Tenants, then edit its brand in Branding. Unsaved changes update the preview immediately; saved branding updates the selected workspace, app title, accent, theme, and TALA's `{business}` response template.

For clone-time defaults, change `src/config/platform.ts` and `src/config/tenants.ts`, not UI components or agents. Existing local data is not overwritten by preset changes; use the guarded reset in the environment panel to reseed the mock.

Select a tenant before using Client console. Its lead updates, pause/resume commands, agent dispatches, and identity edits are reflected in the admin interface because both use the same adapter. The original independent random event generator has been removed. The **HUMAN** and **AGENT / SYSTEM** buttons remain in the client console header, in a reserved slot that cannot be displaced by telemetry.

## Verification And Production Readiness

The production bundle has been built successfully. Read-only diagnostics are available under Help / System environment / Run checks. A manual interaction checklist is in `docs/QA.md`. Automated browser interaction tests and deployment were not performed in this environment.

Before real production use, replace the mock session with verified authentication, execute tenant checks and agent actions on a trusted server, add database constraints and server-enforced row-level authorization, make workflows transactional/idempotent, and add durable scheduling, monitoring, and integration tests. Browser role checks and localStorage are not security boundaries. No real guest communications, payments, deployments, or provider connections are claimed by this implementation.

If a future shared database is connected, retain this tenant-scoped architecture and a single backend. Do not create a backend or database per tenant or agent.