import { resolveTenant } from "../core/tenantResolver";
import { db } from "../services/db";
import type { BookingStatus, Session } from "../types/database";

export const bookingsApi = {
  list: (session: Session, tenant_id: string) =>
    db.forTenant(resolveTenant(session, tenant_id)).list("bookings"),

  async create(
    session: Session,
    tenant_id: string,
    input: {
      guest: string;
      email: string;
      service: string;
      date: string;
      amount: number;
      status?: BookingStatus;
      assigned_agent?: "tala" | "nyx" | "hermes";
    },
  ) {
    const context = resolveTenant(session, tenant_id);
    if (!input.guest.trim()) throw new Error("Enter a guest name.");
    return db.insertBooking(context, {
      guest: input.guest.trim(),
      email: input.email.trim(),
      service: input.service.trim(),
      date: input.date,
      amount: Number.isFinite(input.amount) ? Math.max(0, input.amount) : 0,
      ...(input.status ? { status: input.status } : {}),
      ...(input.assigned_agent ? { assigned_agent: input.assigned_agent } : {}),
    });
  },

  async update(
    session: Session,
    tenant_id: string,
    id: string,
    patch: {
      status?: BookingStatus;
      guest?: string;
      email?: string;
      service?: string;
      date?: string;
      amount?: number;
      assigned_agent?: "tala" | "nyx" | "hermes";
    },
  ) {
    const context = resolveTenant(session, tenant_id);
    if (patch.status && !["pending", "confirmed", "completed", "cancelled"].includes(patch.status)) {
      throw new Error("Invalid booking status.");
    }
    return db.updateBooking(context, id, patch);
  },

  /** Bookings are not deletable through the backend API; cancel instead. */
  async remove(session: Session, tenant_id: string, id: string) {
    await db.updateBooking(resolveTenant(session, tenant_id), id, { status: "cancelled" });
  },
};
