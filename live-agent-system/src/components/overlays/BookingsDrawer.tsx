import { useState, type FormEvent } from "react";
import { AGENT_DEFS, fmtMoney, rel } from "../../system/config";
import { engine } from "../../system/useSystemEngine";
import type { SystemState } from "../../system/types";
import { Micro } from "../ui";
import { Head } from "./shared";

/* --------------------------------------------------------------- bookings */

export function BookingsDrawer({ s }: { s: SystemState }) {
  const [adding, setAdding] = useState(false);
  const [guest, setGuest] = useState("");
  const [email, setEmail] = useState("");
  const [service, setService] = useState("");
  const [amount, setAmount] = useState("320");
  const total = s.bookings.reduce((sum, b) => sum + b.value, 0);

  const addBooking = (e: FormEvent) => {
    e.preventDefault();
    if (!guest.trim() || !email.trim() || !service.trim()) return;
    engine.createBooking({
      guest,
      email,
      service,
      date: new Date(Date.now() + 86_400_000).toISOString(),
      amount: Number(amount) || 250,
    });
    setGuest("");
    setEmail("");
    setService("");
    setAdding(false);
  };

  return (
    <>
      <Head
        title="BOOKINGS · RESERVATIONS (ADD / CONFIRM / DELETE)"
        sub={`${s.bookings.length} active · Tool: Booking & Reservation Scheduler`}
        onClose={() => engine.setOverlay(null)}
      />
      <div className="flex shrink-0 items-center justify-between border-b border-line/70 px-4 py-2">
        <Micro className="text-white/35">RESERVATION PIPELINE</Micro>
        <button
          onClick={() => setAdding(!adding)}
          className="micro-sm border border-accent/45 bg-accent-soft px-2 py-1 text-accent"
        >
          {adding ? "CANCEL" : "+ ADD BOOKING"}
        </button>
      </div>

      {adding && (
        <form onSubmit={addBooking} className="space-y-2 border-b border-line bg-void/60 px-4 py-3">
          <div className="grid grid-cols-2 gap-2">
            <input
              required
              placeholder="Guest full name"
              value={guest}
              onChange={(e) => setGuest(e.target.value)}
              className="border border-line bg-panel px-2.5 py-1.5 text-[12px] text-white outline-none"
            />
            <input
              required
              type="email"
              placeholder="Guest email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border border-line bg-panel px-2.5 py-1.5 text-[12px] text-white outline-none"
            />
          </div>
          <div className="flex gap-2">
            <input
              required
              placeholder="Service / room / table"
              value={service}
              onChange={(e) => setService(e.target.value)}
              className="flex-1 border border-line bg-panel px-2.5 py-1.5 text-[12px] text-white outline-none"
            />
            <input
              required
              type="number"
              min="0"
              placeholder="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-24 border border-line bg-panel px-2.5 py-1.5 text-[12px] text-white outline-none"
            />
            <button type="submit" className="micro border border-accent/50 bg-accent-soft px-3 py-1.5 text-accent">
              SAVE
            </button>
          </div>
        </form>
      )}

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {s.bookings.map((b) => (
          <div key={b.id} className="border-b border-line/50 px-4 py-3 transition-colors hover:bg-white/[0.02]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-accent/80">{b.ref}</span>
                  <span className="truncate text-[13px] text-white/85">{b.guest}</span>
                </div>
                <p className="mt-1 truncate text-[11px] text-white/45">{b.item}</p>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-mono text-[12px] tnum text-white/80">{fmtMoney(b.value)}</div>
                <div className="micro-sm mt-1 text-white/25">{b.status}</div>
              </div>
            </div>
            <div className="mt-2.5 flex items-center gap-2">
              <span className="micro-sm text-white/30">{b.slot}</span>
              <span className="micro-sm ml-auto text-white/20">
                {AGENT_DEFS[b.owner].codename} · {rel(b.ts, Date.now())}
              </span>
              {b.status === "PENDING" && (
                <button
                  onClick={() => engine.confirmBooking(b.id)}
                  className="micro-sm border border-accent/40 bg-accent-soft px-1.5 py-1 text-accent"
                >
                  CONFIRM ✓
                </button>
              )}
              <button
                onClick={() => engine.deleteBooking(b.id)}
                className="micro-sm border border-line/90 px-1.5 py-1 text-white/30 hover:border-red-500/40 hover:text-red-300"
                title="Delete booking"
              >
                DEL
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex shrink-0 items-center justify-between border-t border-line/90 px-4 py-2.5">
        <a href="#/admin/bookings" className="micro text-white/40 hover:text-accent">
          OPEN FULL BOOKINGS CRUD TABLE →
        </a>
        <span className="font-mono text-[13px] tnum text-accent">{fmtMoney(total)}</span>
      </div>
    </>
  );
}