import { useMemo, useState, type FormEvent } from "react";
import { CalendarDays, Download, History, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { bookingsApi } from "../../../api/bookings";
import { AGENTS, AGENT_IDS } from "../../../config/platform";
import { DataTable, type Column } from "../../../components/tables/DataTable";
import type { AgentId, Booking, BookingStatus } from "../../../types/database";
import { useAdmin } from "../AdminContext";
import { RecordTimeline } from "../components/RecordTimeline";
import { Modal, PageHeader, ScopeFilter, Status, TenantMark, TenantSelect } from "../components/shared";
import { csv, download, errorMessage, money, shortDate } from "../utils";

const statuses: BookingStatus[] = ["pending", "confirmed", "completed", "cancelled"];

export default function BookingsPage() {
  const { data, allTenants, session, act, notify } = useAdmin();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [create, setCreate] = useState(false);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = data.bookings.find((booking) => booking.id === selectedId);
  const records = useMemo(
    () =>
      data.bookings.filter(
        (booking) =>
          (status === "all" || booking.status === status) &&
          `${booking.guest} ${booking.reference} ${booking.service}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [data.bookings, query, status],
  );

  const columns: Column<Booking>[] = [
    {
      key: "guest",
      label: "Booking",
      sortValue: (b) => b.guest,
      render: (b) => (
        <button className="person-cell" onClick={() => setSelectedId(b.id)}>
          <span className="booking-row-icon"><CalendarDays size={16} /></span>
          <span className="table-name">
            {b.guest}
            <span className="table-subtext">{b.reference} / {b.service}</span>
          </span>
        </button>
      ),
    },
    {
      key: "tenant",
      label: "Tenant",
      render: (b) => {
        const tenant = allTenants.find((t) => t.id === b.tenant_id);
        return (
          tenant && (
            <span className="tenant-inline">
              <TenantMark tenant={tenant} size="small" />
              {tenant.name}
            </span>
          )
        );
      },
    },
    {
      key: "date",
      label: "Scheduled for",
      sortValue: (b) => b.date,
      render: (b) => shortDate(b.date),
    },
    {
      key: "amount",
      label: "Value",
      sortValue: (b) => b.amount,
      render: (b) => <span className="table-name">{money(b.amount)}</span>,
    },
    {
      key: "status",
      label: "Status",
      sortValue: (b) => b.status,
      render: (b) => (
        <select
          className="table-cell-select"
          aria-label={`Status of booking ${b.reference}`}
          value={b.status}
          onChange={(e) =>
            act(
              () => bookingsApi.update(session, b.tenant_id, b.id, { status: e.target.value as BookingStatus }),
              "Booking status updated.",
            )
          }
        >
          {statuses.map((value) => (
            <option key={value} value={value}>
              {value.charAt(0).toUpperCase() + value.slice(1)}
            </option>
          ))}
        </select>
      ),
    },
    {
      key: "agent",
      label: "Assigned agent",
      render: (b) => (
        <select
          className="table-cell-select"
          value={b.assigned_agent}
          aria-label={`Agent assigned to ${b.reference}`}
          onChange={(e) =>
            act(
              () => bookingsApi.update(session, b.tenant_id, b.id, { assigned_agent: e.target.value as AgentId }),
              "Booking agent updated.",
            )
          }
        >
          {AGENT_IDS.map((id) => (
            <option key={id} value={id}>
              {AGENTS[id].name}
            </option>
          ))}
        </select>
      ),
    },
    {
      key: "actions",
      label: "",
      className: "align-right",
      render: (b) => (
        <div className="inline-actions">
          <button
            className="icon-button"
            title="View booking timeline"
            aria-label={`View timeline for ${b.reference}`}
            onClick={() => setSelectedId(b.id)}
          >
            <History size={14} />
          </button>
          <button
            className="icon-button"
            title="Edit booking"
            aria-label={`Edit ${b.reference}`}
            onClick={() => setEditingBooking(b)}
          >
            <Pencil size={13} />
          </button>
          <button
            className="icon-button"
            title="Delete booking"
            aria-label={`Delete ${b.reference}`}
            onClick={() =>
              act(
                () => bookingsApi.remove(session, b.tenant_id, b.id),
                `Booking ${b.reference} deleted.`,
              )
            }
          >
            <Trash2 size={13} />
          </button>
        </div>
      ),
    },
  ];

  const exportBookings = () => {
    download(
      csv([
        ["id", "tenant_id", "reference", "guest", "email", "service", "date", "amount_usd", "status", "assigned_agent"],
        ...records.map((b) => [
          b.id,
          b.tenant_id,
          b.reference,
          b.guest,
          b.email,
          b.service,
          b.date,
          b.amount,
          b.status,
          b.assigned_agent,
        ]),
      ]),
      "bookings.csv",
    );
    notify(`Exported ${records.length} scoped bookings.`);
  };

  return (
    <>
      <PageHeader
        eyebrow="TOOL 02 · BOOKING & RESERVATION SCHEDULER"
        title="Bookings management"
        description="Add, edit, confirm, and delete tenant bookings managed by TALA and HERMES."
      >
        <button className="button secondary" onClick={exportBookings}>
          <Download size={14} />
          Export
        </button>
        <button className="button primary" onClick={() => setCreate(true)}>
          <Plus size={15} />
          Add booking
        </button>
      </PageHeader>

      <section className="panel">
        <div className="table-toolbar">
          <div className="filter-tabs" role="group" aria-label="Booking status">
            {["all", ...statuses].map((value) => (
              <button
                key={value}
                aria-pressed={status === value}
                className={status === value ? "active" : ""}
                onClick={() => setStatus(value)}
              >
                {value === "all" ? `All bookings (${data.bookings.length})` : value.charAt(0).toUpperCase() + value.slice(1)}
              </button>
            ))}
          </div>
          <label className="table-search">
            <Search size={14} />
            <input
              placeholder="Search guest, service, or reference..."
              aria-label="Search bookings"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>

        <div className="secondary-toolbar">
          <div className="table-filters">
            <ScopeFilter />
          </div>
          <span>
            {records.length} bookings / {money(records.filter((b) => b.status !== "cancelled").reduce((sum, b) => sum + b.amount, 0))} pipeline value
          </span>
        </div>

        <DataTable data={records} columns={columns} label="Booking management" />
      </section>

      {create && <BookingFormModal onClose={() => setCreate(false)} />}
      {editingBooking && <BookingFormModal booking={editingBooking} onClose={() => setEditingBooking(null)} />}

      {selected && (
        <Modal
          title={`Booking ${selected.reference}`}
          description={`${selected.guest} / ${selected.service}`}
          onClose={() => setSelectedId(null)}
          wide
        >
          <dl className="detail-list">
            <div>
              <dt>Status</dt>
              <dd><Status value={selected.status} /></dd>
            </div>
            <div>
              <dt>Guest email</dt>
              <dd>{selected.email}</dd>
            </div>
            <div>
              <dt>Scheduled date</dt>
              <dd>{shortDate(selected.date)}</dd>
            </div>
            <div>
              <dt>Booking value</dt>
              <dd>{money(selected.amount)}</dd>
            </div>
            <div>
              <dt>Assigned agent</dt>
              <dd>{AGENTS[selected.assigned_agent].name}</dd>
            </div>
          </dl>

          <RecordTimeline tenant_id={selected.tenant_id} id={selected.id} kind="booking" />

          <div className="dialog-footer">
            <button
              className="button danger small"
              onClick={() => {
                void act(
                  () => bookingsApi.remove(session, selected.tenant_id, selected.id),
                  `Booking ${selected.reference} deleted.`,
                ).then((ok) => { if (ok) setSelectedId(null); });
              }}
            >
              <Trash2 size={13} />
              Delete booking
            </button>
            <button
              className="button secondary small"
              onClick={() => {
                setEditingBooking(selected);
                setSelectedId(null);
              }}
            >
              <Pencil size={13} />
              Edit booking
            </button>
            <button className="button primary small" onClick={() => setSelectedId(null)}>
              Done
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

export function BookingFormModal({ booking, onClose }: { booking?: Booking; onClose: () => void }) {
  const { session, scope, notify } = useAdmin();
  const [tenantId, setTenantId] = useState(booking?.tenant_id ?? (scope === "all" ? "" : scope));
  const [guest, setGuest] = useState(booking?.guest ?? "");
  const [email, setEmail] = useState(booking?.email ?? "");
  const [service, setService] = useState(booking?.service ?? "");
  const [date, setDate] = useState(
    booking ? booking.date.slice(0, 10) : new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
  );
  const [amount, setAmount] = useState(String(booking?.amount ?? 250));
  const [status, setStatus] = useState<BookingStatus>(booking?.status ?? "pending");
  const [assignedAgent, setAssignedAgent] = useState<AgentId>(booking?.assigned_agent ?? "hermes");
  const [error, setError] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    try {
      if (booking) {
        bookingsApi.update(session, booking.tenant_id, booking.id, {
          guest,
          email,
          service,
          date: new Date(`${date}T12:00:00`).toISOString(),
          amount: Number(amount),
          status,
          assigned_agent: assignedAgent,
        });
        notify(`Booking ${booking.reference} updated.`);
      } else {
        bookingsApi.create(session, tenantId, {
          guest,
          email,
          service,
          date: new Date(`${date}T12:00:00`).toISOString(),
          amount: Number(amount),
          status,
          assigned_agent: assignedAgent,
        });
        notify("Booking created and routed to HERMES.");
      }
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Modal
      title={booking ? `Edit booking — ${booking.reference}` : "Add a booking"}
      description="Create or edit a tenant reservation record."
      onClose={onClose}
    >
      <form onSubmit={submit}>
        {!booking && <TenantSelect value={tenantId} onChange={setTenantId} />}
        <div className="form-grid">
          <label className="admin-field">
            <span>Guest / customer name</span>
            <input required maxLength={80} value={guest} onChange={(e) => setGuest(e.target.value)} placeholder="Isabella Cruz" />
          </label>
          <label className="admin-field">
            <span>Email</span>
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="isabella@example.com" />
          </label>
          <label className="admin-field full">
            <span>Service or reservation</span>
            <input required maxLength={150} value={service} onChange={(e) => setService(e.target.value)} placeholder="Ocean suite, private dining, consultation..." />
          </label>
          <label className="admin-field">
            <span>Scheduled date</span>
            <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="admin-field">
            <span>Value (USD)</span>
            <input required type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label className="admin-field">
            <span>Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as BookingStatus)}>
              {statuses.map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            <span>Assigned agent</span>
            <select value={assignedAgent} onChange={(e) => setAssignedAgent(e.target.value as AgentId)}>
              {AGENT_IDS.map((id) => (
                <option key={id} value={id}>{AGENTS[id].name}</option>
              ))}
            </select>
          </label>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="dialog-footer">
          <button className="button secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="button primary" type="submit">
            {booking ? <Pencil size={13} /> : <Plus size={14} />}
            {booking ? "Save booking" : "Create booking"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
