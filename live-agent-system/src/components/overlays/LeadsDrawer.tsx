import { useState, type FormEvent } from "react";
import { AGENT_DEFS, rel } from "../../system/config";
import { engine } from "../../system/useSystemEngine";
import { cn } from "../../utils/cn";
import type { Lead, LeadStatus, SystemState } from "../../system/types";
import type { Channel as DbChannel } from "../../types/database";
import { Bar, ChannelTag, Micro } from "../ui";
import { Head } from "./shared";

/* ------------------------------------------------------------------ leads */

const LEAD_TABS: (LeadStatus | "ALL")[] = ["ALL", "NEW", "QUALIFIED", "BOOKED", "NURTURE", "CLOSED"];

export function LeadsDrawer({ s }: { s: SystemState }) {
  const [tab, setTab] = useState<LeadStatus | "ALL">("ALL");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [channel, setChannel] = useState<DbChannel>("Website");
  const [inquiry, setInquiry] = useState("");

  const rows = s.leads.filter((l) => tab === "ALL" || l.status === tab);

  const addLead = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    engine.createLead({ name, email, channel, inquiry: inquiry || "Availability inquiry" });
    setName("");
    setEmail("");
    setInquiry("");
    setAdding(false);
  };

  return (
    <>
      <Head
        title="LEAD RECORDS · CRM (ADD / EDIT / DELETE)"
        sub={`${s.leads.length} records · Tool: Lead Capture & CRM`}
        onClose={() => engine.setOverlay(null)}
      />
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-1 border-b border-line/70 px-4 py-2">
        <div className="flex flex-wrap gap-1">
          {LEAD_TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "micro-sm border px-1.5 py-1 leading-none transition-colors",
                tab === t
                  ? "border-accent/45 bg-accent-soft text-accent"
                  : "border-transparent text-white/25 hover:text-white/60",
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <button
          onClick={() => setAdding(!adding)}
          className="micro-sm border border-accent/45 bg-accent-soft px-2 py-1 text-accent"
        >
          {adding ? "CANCEL" : "+ ADD LEAD"}
        </button>
      </div>

      {adding && (
        <form onSubmit={addLead} className="space-y-2 border-b border-line bg-void/60 px-4 py-3">
          <div className="grid grid-cols-2 gap-2">
            <input
              required
              placeholder="Lead full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border border-line bg-panel px-2.5 py-1.5 text-[12px] text-white outline-none"
            />
            <input
              required
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border border-line bg-panel px-2.5 py-1.5 text-[12px] text-white outline-none"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as DbChannel)}
              className="border border-line bg-panel px-2 py-1.5 text-[11px] text-white/80 outline-none"
            >
              <option value="Website">Website</option>
              <option value="WhatsApp">WhatsApp</option>
              <option value="Instagram">Instagram</option>
              <option value="Email">Email</option>
            </select>
            <input
              placeholder="Inquiry summary..."
              value={inquiry}
              onChange={(e) => setInquiry(e.target.value)}
              className="flex-1 border border-line bg-panel px-2.5 py-1.5 text-[12px] text-white outline-none"
            />
            <button type="submit" className="micro border border-accent/50 bg-accent-soft px-3 py-1.5 text-accent">
              SAVE
            </button>
          </div>
        </form>
      )}

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {rows.map((l) => (
          <LeadRow key={l.id} l={l} now={Date.now()} />
        ))}
        {rows.length === 0 && (
          <div className="grid h-24 place-items-center">
            <Micro className="text-white/20">NO RECORDS IN THIS STATE</Micro>
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center justify-between border-t border-line/90 px-4 py-2.5">
        <a href="#/admin/leads" className="micro text-white/40 hover:text-accent">
          OPEN FULL LEADS CRUD TABLE →
        </a>
        <button
          onClick={() => engine.setOverlay("export")}
          className="micro text-accent hover:underline"
        >
          EXPORT SET →
        </button>
      </div>
    </>
  );
}

const LEAD_TONE: Record<LeadStatus, string> = {
  NEW: "text-accent border-accent/35 bg-accent-soft",
  QUALIFIED: "text-sky-300 border-sky-400/30 bg-sky-400/10",
  BOOKED: "text-emerald-300 border-emerald-400/30 bg-emerald-400/10",
  NURTURE: "text-violet-300 border-violet-400/30 bg-violet-400/10",
  CLOSED: "text-white/30 border-white/12 bg-white/[0.03]",
};

function LeadRow({ l, now }: { l: Lead; now: number }) {
  return (
    <div className="group border-b border-line/50 px-4 py-3 transition-colors hover:bg-white/[0.02]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] text-white/85">{l.name}</span>
            <ChannelTag channel={l.channel} />
          </div>
          <p className="mt-1 truncate text-[11px] text-white/40">{l.intent}</p>
        </div>
        <span className={cn("micro-sm shrink-0 border px-1.5 py-1 leading-none", LEAD_TONE[l.status])}>
          {l.status}
        </span>
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <span className="w-20 shrink-0">
          <Bar value={l.score} tone={l.score > 70 ? "accent" : "warn"} />
        </span>
        <span className="micro-sm text-white/30">SCORE {l.score}</span>
        <span className="micro-sm text-white/20">{AGENT_DEFS[l.owner].codename}</span>
        <span className="micro-sm ml-auto text-white/20">{rel(l.ts, now)}</span>
        {(l.status === "NEW" || l.status === "QUALIFIED" || l.status === "NURTURE") && (
          <button
            onClick={() => engine.qualifyLead(l.id)}
            className="micro-sm border border-line/90 px-1.5 py-1 text-white/50 transition-all hover:border-accent/50 hover:text-accent"
          >
            ADVANCE →
          </button>
        )}
        <button
          onClick={() => engine.deleteLead(l.id)}
          className="micro-sm border border-line/90 px-1.5 py-1 text-white/30 transition-all hover:border-red-500/40 hover:text-red-300"
          title="Delete lead"
        >
          DEL
        </button>
      </div>
    </div>
  );
}