import { eventBus } from "../core/eventBus";
import { db } from "../services/db";
import { makeId } from "../services/seed";
import type { AgentConfig, SystemEvent, TenantContext } from "../types/database";
import { completeAction } from "./shared";

export function hermes(context: TenantContext, event: SystemEvent, settings: AgentConfig): void {
  const scoped = db.forTenant(context);
  if (event.type === "system.sync.requested") {
    completeAction(context, "hermes", "Tenant records reconciled");
    eventBus.publish(context, { type: "system.synced", agent: "hermes", level: "success", message: "Tenant records reconciled", payload: { leads: scoped.list("leads").length, bookings: scoped.list("bookings").length, tenant_isolation: true } });
    return;
  }
  const booking = scoped.get("bookings", String(event.payload.booking_id));
  if (settings.config.confirm_bookings === true && booking.status === "pending") {
    scoped.update("bookings", booking.id, { status: "confirmed", updated_at: new Date().toISOString() });
    if (settings.config.notify_staff === true) scoped.insert("messages", { id: makeId(), lead_id: null, agent: "hermes", channel: "Internal", direction: "outbound", content: `Booking ${booking.reference} confirmed for ${booking.guest}. ${booking.service}.`, created_at: new Date().toISOString() });
    completeAction(context, "hermes", `Confirmed booking ${booking.reference}`);
    eventBus.publish(context, { type: "booking.confirmed", agent: "hermes", level: "success", message: `Booking ${booking.reference} confirmed`, entity_id: booking.id, payload: { booking_id: booking.id, guest: booking.guest, staff_notified: settings.config.notify_staff === true } });
  } else {
    completeAction(context, "hermes", `Logged booking ${booking.reference}`);
    eventBus.publish(context, { type: "booking.logged", agent: "hermes", level: "info", message: `Booking ${booking.reference} logged`, entity_id: booking.id, payload: { booking_id: booking.id, status: booking.status } });
  }
}