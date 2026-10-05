/**
 * Tenant isolation self-test.
 *
 * Runs the app's own `runIsolationChecks()` outside the browser so CI fails if
 * tenant scoping ever regresses. `db.ts` persists to localStorage, so we shim
 * a minimal in-memory implementation before importing.
 *
 * NOTE: these checks assert *client-side* scoping only. They are a regression
 * guard, not a security control — see SECURITY.md.
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
    return this.map.size;
  }
}

const store = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", { value: store, configurable: true });
Object.defineProperty(globalThis, "window", { value: globalThis, configurable: true });

async function main() {
  const { runIsolationChecks } = await import("../src/core/isolationChecks");
  const { MOCK_ADMIN } = await import("../src/config/platform");
  const { db } = await import("../src/services/db");

  // Ensure there is at least one tenant to scope against.
  const tenants = db.listTenants(MOCK_ADMIN);
  if (!tenants.length) {
    console.error("FAIL: no tenants seeded — isolation checks cannot run.");
    process.exit(1);
  }

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