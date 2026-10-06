/**
 * Tenant isolation self-test (client-side guards).
 *
 * Runs the app's own `runIsolationChecks()` outside the browser so CI fails if
 * client-side tenant scoping regresses. Server-side enforcement (the real
 * control) is exercised by `server/test/e2e.test.ts` — see SECURITY.md.
 *
 * Setup: an authenticated platform-admin session is staged in the localStorage
 * shim, and `fetch` is stubbed so `db.load()` receives a snapshot containing
 * two tenants — no network, no server needed.
 */

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
  key(index: number) {
    return Array.from(this.map.keys())[index] ?? null;
  }
  get length() {
    return Array.from(this.map.keys()).length;
  }
}

const store = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", { value: store, configurable: true });
Object.defineProperty(globalThis, "window", { value: globalThis, configurable: true });

/* Stage a platform-admin session BEFORE the auth module initializes. */
store.setItem(
  "core.auth.v1",
  JSON.stringify({
    token: "selftest-token",
    session: { user_id: "selftest", name: "Self Test", role: "platform_admin", tenant_id: null },
  }),
);

/* Two fake tenants with one lead each, served by the stubbed fetch. */
const TENANTS = [
  { id: "t-one", name: "One", slug: "one", industry: "", status: "active", branding_config: { app_name: "One", logo: "O", primary_color: "#bcf58b", theme: "dark" }, rules: { tala: "auto-reply-leads", nyx: "follow-up-after-24h", hermes: "log-all-bookings" }, openrouter_api_key: "", created_at: new Date().toISOString() },
  { id: "t-two", name: "Two", slug: "two", industry: "", status: "active", branding_config: { app_name: "Two", logo: "T", primary_color: "#8ccbee", theme: "dark" }, rules: { tala: "auto-reply-leads", nyx: "follow-up-after-24h", hermes: "log-all-bookings" }, openrouter_api_key: "", created_at: new Date().toISOString() },
];
const LEADS = [
  { id: "l-one", tenant_id: "t-one", name: "Lead One", email: "", channel: "Website", status: "new", assigned_agent: "tala", score: 0, inquiry: "", created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: "l-two", tenant_id: "t-two", name: "Lead Two", email: "", channel: "Website", status: "new", assigned_agent: "tala", score: 0, inquiry: "", created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
];

Object.defineProperty(globalThis, "fetch", {
  configurable: true,
  value: async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/snapshot")) {
      return new Response(
        JSON.stringify({ tenants: TENANTS, leads: LEADS, bookings: [], messages: [], events: [], agents: [], runs: [], memory: [] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ error: "unexpected request in self-test" }), { status: 500 });
  },
});

async function main() {
  const { db } = await import("../src/services/db");
  await db.load();

  const { runIsolationChecks } = await import("../src/core/isolationChecks");
  const results = runIsolationChecks();
  let failed = 0;

  for (const check of results) {
    if (check.passed) {
      console.log(`  PASS  ${check.name}`);
    } else {
      failed += 1;
      console.error(`  FAIL  ${check.name}${check.note ? ` — ${check.note}` : ""}`);
    }
  }

  const total = results.length;
  console.log(`\n${total - failed}/${total} tenant isolation checks passed.`);

  if (failed > 0) {
    console.error("\nTenant isolation regression detected.");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Isolation self-test crashed:", error);
  process.exit(1);
});
