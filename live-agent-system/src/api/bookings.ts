import { registerDispatcher } from "../core/dispatcher";
import { eventBus } from "../core/eventBus";
import { resolveTenant } from "../core/tenantResolver";
import { db } from "../services/db";
import { makeId } from "../services/seed";
import type { AgentId, BookingStatus, Session } from "../types/database";

export const bookingsApi = {
  list: (session: Session, tenant_id: string) => db.forTenant(resolveTenant(session, tenant_id)).list("bookings"),
  create(
    session: Session,
    tenant_id: string,
    input: {
      guest: string;
      email: string;
      service: string;
      date: string;
      amount: number;
      status?: BookingStatus;
      assigned_agent?: AgentId;
    },
  ) {
    registerDispatcher();
    const context = resolveTenant(session, tenant_id);
    if (!input.guest.trim() || !input.service.trim() || !Number.isFinite(input.amount) || input.amount < 0 || !Number.isFinite(Date.parse(input.date))) {
      throw new Error("Provide a guest, service, valid date, and non-negative amount.");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) throw new Error("Enter a valid guest email address.");
    const now = new Date().toISOString();
    const tenant = db.getTenant(context);
    const booking = db.forTenant(context).insert("bookings", {
      guest: input.guest.trim(),
      email: input.email.trim(),
      service: input.service.trim(),
      date: input.date,
      amount: input.amount,
      id: makeId(),
      reference: `${tenant.name.substring(0, 2).toUpperCase()}-${Date.now().toString().slice(-6)}`,
      status: input.status ?? "pending",
      assigned_agent: input.assigned_agent ?? "hermes",
      created_at: now,
      updated_at: now,
    });
    eventBus.publish(context, {
      type: "booking.created",
      agent: booking.assigned_agent,
      level: "success",
      message: `New booking for ${booking.guest}`,
      entity_id: booking.id,
      payload: { booking_id: booking.id, reference: booking.reference, actor: session.name, tool: "booking_engine" },
    });
    return booking;
  },
  update(
    session: Session,
    tenant_id: string,
    id: string,
    patch: {
      guest?: string;
      email?: string;
      service?: string;
      date?: string;
      amount?: number;
      status?: BookingStatus;
      assigned_agent?: AgentId;
    },
  ) {
    const context = resolveTenant(session, tenant_id);
    if (patch.status && !["pending", "confirmed", "completed", "cancelled"].includes(patch.status)) throw new Error("Invalid booking status.");
    if (patch.assigned_agent && !["tala", "nyx", "hermes"].includes(patch.assigned_agent)) throw new Error("Unknown agent.");
    if (patch.email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patch.email.trim())) throw new Error("Enter a valid email address.");
    const scoped = db.forTenant(context);
    const before = scoped.get("bookings", id);
    const booking = scoped.update("bookings", id, {
      ...patch,
      ...(patch.guest ? { guest: patch.guest.trim() } : {}),
      ...(patch.email ? { email: patch.email.trim() } : {}),
      ...(patch.service ? { service: patch.service.trim() } : {}),
      updated_at: new Date().toISOString(),
    });
    eventBus.publish(context, {
      type: patch.status ? "booking.status_updated" : patch.assigned_agent ? "booking.assigned" : "booking.updated",
      agent: booking.assigned_agent,
      level: "success",
      message: patch.status
        ? `Booking ${booking.reference} ${patch.status}`
        : patch.assigned_agent
          ? `Booking assigned to ${booking.assigned_agent.toUpperCase()}`
          : `Booking ${booking.reference} updated`,
      entity_id: id,
      payload: { booking_id: id, previous: patch.status ? before.status : before.assigned_agent, ...patch, actor: session.name, tool: "booking_engine" },
    });
    return booking;
  },
  remove(session: Session, tenant_id: string, id: string) {
    const context = resolveTenant(session, tenant_id);
    const scoped = db.forTenant(context);
    const booking = scoped.get("bookings", id);
    scoped.remove("bookings", id);
    eventBus.publish(context, {
      type: "booking.deleted",
      level: "warning",
      message: `Booking ${booking.reference} deleted (${booking.guest})`,
      entity_id: id,
      payload: { booking_id: id, reference: booking.reference, guest: booking.guest, actor: session.name },
    });
  },
};
