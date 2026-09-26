# Admin Interaction Checklist

Build verification is complete. The following browser checks are provided for review; they were not run by an automated browser in this environment.

## Navigation And Scope

1. Open the default page and confirm the overview renders six seeded workspaces.
2. Open the sidebar switcher, choose BAIA, and confirm the header, data, activity, branding accent, leads, and bookings use that tenant.
3. Select All tenants and confirm aggregates return. Press Ctrl/Cmd + K to search a tenant or page.
4. At mobile width, open and close sidebar navigation; ensure tables scroll horizontally without pushing the page offscreen.

## Tenant CRUD

1. Create a tenant with a unique slug. Confirm it has three configurable agents and empty lead/booking collections.
2. Attempt a duplicate slug and an invalid hex color. Confirm inline validation and no duplicate workspace.
3. Edit the tenant's name, status, and branding; reload and check persistence.
4. Pause it and attempt an agent test. Confirm the action is blocked.
5. Type its exact name in the delete dialog. Confirm deletion removes only that tenant and its records.

## Workflows

1. Add a lead to an active workspace. Inspect the lead history and mock outbox for TALA's response and NYX's scoring event.
2. Change lead status and assigned agent; inspect the audit history and CSV export.
3. Add a pending booking with HERMES enabled and automatic confirmation enabled. Confirm the booking becomes confirmed and has a timeline.
4. Disable an agent, submit its trigger, and verify that it does not perform work.
5. Edit agent JSON with invalid types, then valid types. Verify invalid configuration is rejected and valid behavior is used.
6. Set a rule to manual and verify automated actions are skipped. Use Run test for an explicit manual dispatch.

## Logs And Branding

1. Filter logs by tenant, agent, severity, and search. Inspect and copy an event payload.
2. Pause the feed, generate an event, and confirm the visible snapshot remains stable. Resume and confirm it appears.
3. Edit app name, logo, accent, and theme. Verify the live preview changes before save.
4. Save and open the branded workspace. Verify the selected workspace uses the saved brand; other workspaces remain unchanged.
5. Upload an oversized or unsupported logo file and confirm validation.

## Existing Console

1. Select a tenant and open Client console. Confirm HUMAN and AGENT / SYSTEM remain available.
2. Open leads, change a status, and return to admin. Confirm the same record changed in the selected tenant.
3. Pause this workspace from the client console and return to admin. Confirm its tenant status is paused, without affecting others.

## Isolation Diagnostics

Open System environment and run the read-only checks. They cover missing scope, global-write scope, filtering across every record table, immutable read copies, foreign-workspace denial for tenant members, and foreign record IDs. These checks do not constitute a server security audit.

## Known Mock Limits

- Sessions and role checks are local, not authenticated.
- Data persists per browser origin, not across deployed clones or users.
- Mock outbox messages do not leave the browser.
- Whitespace, duplicate slug, required fields, supported rule values, and basic configuration types are validated. Production data contracts need additional server validation.
- Event delivery and persistence are synchronous in-browser operations, without server transactions or durable background jobs.
- The client console labels workload savings as estimates, not measured financial results.
- The package manager reports one remaining low-severity dependency advisory after updating Vite within its existing major version. Review the dependency audit before production deployment.