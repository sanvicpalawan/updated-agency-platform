import { AGENT_DEFS, fmtMoney, rel } from "../system/config";
import { engine } from "../system/useSystemEngine";
import { cn } from "../utils/cn";
import type { SystemEvent, SystemState } from "../system/types";
import { AgentDot, Dot, Micro, useNow } from "./ui";

function humanize(e: SystemEvent): string {
  const t = e.text;
  if (e.severity === "warn") return `Flagged for a human: ${t.charAt(0).toLowerCase() + t.slice(1)}`;
  if (t.includes("responded via WhatsApp")) return "Answered a guest on WhatsApp";
  if (t.includes("Booking confirmed")) return "Confirmed a booking and updated its record";
  if (t.includes("Booking request")) return "Checked availability and held a room";
  if (t.includes("lead captured")) return "Picked up a new enquiry from the website";
  if (t.includes("qualified")) return "Qualified a high-intent enquiry and stored it in CRM";
  if (t.includes("follow-up")) return "Sent a follow-up to someone who went quiet";
  if (t.includes("Invoice") || t.includes("Payment")) return "Handled money in and out, ledger updated";
  if (t.includes("Housekeeping")) return "Sent housekeeping to a room";
  if (t.includes("reconciliation")) return "Reconciled the day's ledger with no mismatches";
  if (t.includes("Table")) return "Reserved a table for guests";
  if (t.includes("transfer")) return "Arranged an airport pickup";
  if (t.includes("Spa")) return "Booked a spa slot";
  if (t.includes("re-engaged")) return "Brought back a lead that went cold";
  return t;
}

export function HumanMode({ s }: { s: SystemState }) {
  const now = useNow(1000);
  const m = s.metrics;
  const coverage = Math.round(m.automationCoverage);
  const attention = s.events.filter((e) => e.severity === "warn" && (!m.lastManualTs || e.ts > m.lastManualTs)).slice(0, 3);
  const recent = s.events.slice(0, 5);
  const answered = Math.min(30, m.avgResponseSec);
  const bookingValue = s.bookings.reduce((a, b) => a + b.value, 0);

  return (
    <div className="bg-gradient-to-b from-panel to-void">
      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-12">
        <div className="flex items-center gap-2.5">
          <Dot tone="accent" size={6} pulse={!s.halted} />
          <Micro className="text-white/40">
            {s.halted ? "SYSTEM PAUSED · NOTHING IS BEING HANDLED" : "SYSTEM RUNNING · EVERYTHING IS BEING HANDLED"}
          </Micro>
        </div>

        <h1 className="mt-5 text-[26px] font-light leading-[1.15] tracking-tight text-white sm:text-[38px]">
          {s.halted ? (
            <>Agents are stopped.<br /><span className="text-amber-300">Enquiries are waiting.</span></>
          ) : (
            <>
              {m.actionsToday} things handled at {s.brand.name} today.
              <br />
              <span className="text-white/40">You didn't have to touch any of them.</span>
            </>
          )}
        </h1>

        <p className="mt-5 max-w-xl text-[13.5px] leading-relaxed text-white/45">
          Three agents are covering enquiries, bookings and back office. Guests get an answer in
          about {answered} seconds, day or night. {coverage}% of everything that came in was
          handled without a person.
        </p>

        {/* headline numbers */}
        <div className="mt-9 grid gap-px border border-line/90 bg-line/60 sm:grid-cols-2">
          <Big
            label="Enquiries answered"
            value={String(m.messagesHandled)}
            note={`Average reply ${answered}s · target 30s`}
            good={answered < 30}
          />
          <Big
            label="Bookings confirmed"
            value={String(m.bookingsToday)}
            note={`${m.leadsToday} new enquiries captured`}
            good
          />
          <Big
            label="Booking value"
            value={fmtMoney(m.revenueHandled)}
            note="Active booking pipeline. No real payments processed."
            good
          />
          <Big
            label="Needs your decision"
            value={attention.length === 0 ? "Nothing" : `${attention.length} item${attention.length > 1 ? "s" : ""}`}
            note={
              attention.length === 0
                ? `Last manual intervention ${rel(m.lastManualTs, now)}`
                : "Listed below"
            }
            good={attention.length === 0}
          />
        </div>

        {/* attention */}
        <div className="mt-9">
          <div className="flex items-center justify-between border-b border-line/80 pb-2">
            <Micro className="text-white/45">WHAT ACTUALLY NEEDS YOU</Micro>
            <button
              onClick={() => engine.logManual()}
              className="micro-sm text-white/25 transition-colors hover:text-accent"
            >
              MARK REVIEWED
            </button>
          </div>
          {attention.length === 0 ? (
            <p className="py-5 text-[13px] text-white/50">
              Nothing. The agents resolved everything that came in
              {m.lastManualTs ? ` — you last stepped in ${rel(m.lastManualTs, now)}` : ""}.
            </p>
          ) : (
            <ul className="divide-y divide-line/60">
              {attention.map((e) => (
                <li key={e.id} className="flex items-start gap-3 py-3.5">
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                  <div className="min-w-0">
                    <p className="text-[13px] leading-snug text-amber-100/85">{humanize(e)}</p>
                    <p className="micro-sm mt-1.5 text-white/25">
                      {AGENT_DEFS[e.agent].codename} · {rel(e.ts, now)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* organized tool outcomes */}
        <div className="mt-9">
          <div className="flex items-center justify-between border-b border-line/80 pb-2">
            <Micro className="text-white/45">OUTCOMES BY CONNECTED TOOL</Micro>
            <button
              onClick={() => engine.setOverlay("tools")}
              className="micro-sm text-accent transition-colors hover:underline"
            >
              SHARE WITH CLIENT / TOOL SETTINGS →
            </button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {s.tools.map((tool) => (
              <div key={tool.id} className="border border-line/80 bg-panel px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] font-medium text-white/85">{tool.name}</span>
                  <span className="micro-sm text-accent">
                    {tool.assignedAgents.map((a) => a.toUpperCase()).join(" + ")}
                  </span>
                </div>
                <p className="mt-1.5 font-mono text-[11.5px] text-white/70">{tool.outcomeText}</p>
                <p className="micro-sm mt-1 text-white/25">{tool.outcomeLabel}</p>
              </div>
            ))}
          </div>
        </div>

        {/* what happened */}
        <div className="mt-9">
          <div className="flex items-center justify-between border-b border-line/80 pb-2">
            <Micro className="text-white/45">WHAT THE AGENTS JUST DID</Micro>
            <button
              onClick={() => engine.setMode("SYSTEM")}
              className="micro-sm text-accent transition-colors hover:underline"
            >
              OPEN AGENT MODE →
            </button>
          </div>
          <ul className="divide-y divide-line/60">
            {recent.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-3">
                <AgentDot id={e.agent} />
                <span className="text-[13px] leading-snug text-white/70">{humanize(e)}</span>
                <span className="micro-sm ml-auto shrink-0 text-white/20">{rel(e.ts, now)}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* workload */}
        <div className="mt-9 border border-line/90 p-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <Micro className="text-white/35">MANUAL WORKLOAD REMOVED</Micro>
              <div className="mt-2 font-mono text-[30px] font-light leading-none tnum text-accent">
                {m.manualWorkloadSaved.toFixed(1)}h
              </div>
            </div>
            <div className="text-right">
              <Micro className="text-white/25">BOOKING PIPELINE</Micro>
              <div className="mt-2 font-mono text-[15px] tnum text-white/70">
                {fmtMoney(bookingValue)}
              </div>
            </div>
          </div>
          <p className="mt-4 text-[12.5px] leading-relaxed text-white/40">
            Estimated at three minutes of handling per completed automated action.
            These figures describe the local simulation, not measured production savings.
          </p>
        </div>

        <p className="mt-8 text-center text-[11.5px] text-white/25">
          Human view shows outcomes.{" "}
          <button
            onClick={() => engine.setMode("SYSTEM")}
            className="text-accent underline decoration-accent/40 underline-offset-4 transition-colors hover:decoration-accent"
          >
            Agent view
          </button>{" "}
          shows the live operations console.
        </p>
      </div>
    </div>
  );
}

function Big({
  label,
  value,
  note,
  good,
}: {
  label: string;
  value: string;
  note: string;
  good?: boolean;
}) {
  return (
    <div className="bg-panel px-4 py-4 sm:px-5 sm:py-5">
      <Micro className="text-white/30">{label}</Micro>
      <div
        className={cn(
          "mt-2.5 font-mono text-[22px] font-light leading-none tnum sm:text-[26px]",
          good ? "text-white" : "text-amber-300",
        )}
      >
        {value}
      </div>
      <div className="mt-2.5 text-[11.5px] leading-snug text-white/35">{note}</div>
    </div>
  );
}
