import { useSyncExternalStore } from "react";
import { db, type StoreStatus } from "./db";

/**
 * Reactive view of the backend store's sync status.
 *
 * Pages use this to distinguish the three "nothing to show" states instead of
 * collapsing them all into "No workspaces yet":
 *   - idle / loading → the snapshot fetch is in flight
 *   - error          → the backend is unreachable or rejected the session
 *   - ready          → the data really is empty
 */
export function useDbStatus(): { status: StoreStatus; error: string | null } {
  const status = useSyncExternalStore(db.subscribe, () => db.status, () => db.status);
  const error = useSyncExternalStore(db.subscribe, () => db.lastError, () => db.lastError);
  return { status, error };
}
