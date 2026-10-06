import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { MIGRATIONS, SCHEMA_SQL, SCHEMA_VERSION } from "./schema.ts";

/**
 * Single shared SQLite handle.
 *
 * `node:sqlite` is synchronous, which is a good fit here: the agent runner is
 * a single-threaded queue drainer and we never want two writers interleaving.
 * Set DB_PATH=":memory:" for tests.
 */
const DB_PATH = process.env.DB_PATH ?? path.resolve(process.cwd(), "data", "core.sqlite");

function recordedVersion(db: DatabaseSync): number | null {
  const row = db.prepare("SELECT value FROM schema_meta WHERE key = 'version'").get() as
    | { value: string }
    | undefined;
  return row ? Number(row.value) : null;
}

/**
 * Bring an existing database up to SCHEMA_VERSION by applying every migration
 * newer than the recorded version, in one transaction. Fresh databases get the
 * full SCHEMA_SQL (already at the latest shape) and are stamped directly.
 */
function migrate(db: DatabaseSync): void {
  db.exec(SCHEMA_SQL);

  const current = recordedVersion(db);
  if (current === null) {
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', ?)").run(
      String(SCHEMA_VERSION),
    );
    return;
  }
  if (current > SCHEMA_VERSION) {
    throw new Error(
      `Schema version mismatch: database is ${current}, runtime expects ${SCHEMA_VERSION}. ` +
        `This database was written by a newer release; refusing to start.`,
    );
  }
  if (current === SCHEMA_VERSION) return;

  const pending = MIGRATIONS.filter((m) => m.version > current && m.version <= SCHEMA_VERSION).sort(
    (a, b) => a.version - b.version,
  );
  const highest = pending[pending.length - 1]?.version ?? current;
  if (highest !== SCHEMA_VERSION) {
    throw new Error(
      `No migration path from schema ${current} to ${SCHEMA_VERSION}. ` +
        `Run \`npm run reset\` to rebuild the demo database.`,
    );
  }

  db.exec("BEGIN");
  try {
    for (const migration of pending) {
      migration.up(db);
      db.prepare("INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', ?)").run(
        String(migration.version),
      );
      console.log(`[db] migrated schema to v${migration.version}: ${migration.description}`);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function open(): DatabaseSync {
  if (DB_PATH !== ":memory:") {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  }
  const db = new DatabaseSync(DB_PATH);
  migrate(db);
  return db;
}

export const db = open();
export const dbPath = DB_PATH;

/** Run `fn` inside a transaction; rolls back on throw. */
export function transaction<T>(fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function resetDatabase(): void {
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )
    .all() as { name: string }[];
  db.exec("PRAGMA foreign_keys = OFF");
  transaction(() => {
    for (const { name } of tables) {
      if (name === "schema_meta") continue;
      db.exec(`DELETE FROM ${name}`);
    }
  });
  db.exec("PRAGMA foreign_keys = ON");
}
