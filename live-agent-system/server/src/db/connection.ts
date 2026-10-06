import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { SCHEMA_SQL, SCHEMA_VERSION } from "./schema.ts";

/**
 * Single shared SQLite handle.
 *
 * `node:sqlite` is synchronous, which is a good fit here: the agent runner is
 * a single-threaded queue drainer and we never want two writers interleaving.
 * Set DB_PATH=":memory:" for tests.
 */
const DB_PATH = process.env.DB_PATH ?? path.resolve(process.cwd(), "data", "core.sqlite");

function open(): DatabaseSync {
  if (DB_PATH !== ":memory:") {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  }
  const db = new DatabaseSync(DB_PATH);
  db.exec(SCHEMA_SQL);
  const current = db
    .prepare("SELECT value FROM schema_meta WHERE key = 'version'")
    .get() as { value: string } | undefined;
  if (!current) {
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', ?)").run(
      String(SCHEMA_VERSION),
    );
  } else if (current.value !== String(SCHEMA_VERSION)) {
    throw new Error(
      `Schema version mismatch: database is ${current.value}, runtime expects ${SCHEMA_VERSION}. ` +
        `Run \`npm run reset\` to rebuild, or write a migration.`,
    );
  }
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
