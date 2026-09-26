import { AUTONOMY_LABELS, fmtClock } from "../system/config";
import { engine } from "../system/useSystemEngine";
import { cn } from "../utils/cn";
import type { SystemState } from "../system/types";
import { Bar, Dot, Micro, OpButton } from "./ui";

export function ControlPanel({ s }: { s: SystemState }) {
  const wa = s.channels.find((c) => c.id === "whatsapp");
  const busy = Object.values(s.agents).some((a) => a.status === "PROCESSING");
  const newLeads = s.leads.filter((l) => l.status === "NEW").length;

  return (
    <div className="scroll-thin flex h-full min-h-0 flex-col overflow-y-auto bg-panel">
      <div className="flex items-center justify-between border-b border-line/80 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-px bg-accent/70" />
          <Micro className="text-white/45">ACTION & TOOL CONTROL</Micro>
        </div>
        <Micro className={cn(busy ? "text-accent" : "text-white/20")}>
          {busy ? "EXECUTING" : "READY"}
        </Micro>
      </div>

      <div className="space-y-1.5 p-3">
        <Micro className="px-0.5 pb-1 text-white/20">TOOLS & CLIENT OUTCOMES</Micro>
        <OpButton
          tone="accent"
          onClick={() => engine.setOverlay("tools")}
          hint="4 connected tools · Share client outcomes"
          trailing={<Badge>{s.tools.filter((t) => t.enabled).length}/4</Badge>}
        >
          TOOLS & CLIENT OUTCOMES
        </OpButton>
        <OpButton
          onClick={() => engine.setOverlay("agents_config")}
          hint="OpenRouter Free/Paid models + Behavior"
          trailing={<span className="micro-sm text-accent">AI CFG</span>}
        >
          AGENT & OPENROUTER SETTINGS
        </OpButton>

        <Micro className="px-0.5 pb-1 pt-3 text-white/20">OPERATIONS & CRUD</Micro>
        <OpButton
          onClick={() => engine.setOverlay("leads")}
          hint={`${s.leads.length} records · ${newLeads} new · Add / Delete`}
          trailing={<Badge>{s.leads.length}</Badge>}
        >
          VIEW & MANAGE LEADS
        </OpButton>
        <OpButton
          onClick={() => engine.setOverlay("bookings")}
          hint={`${s.bookings.length} reservations · Add / Confirm / Delete`}
          trailing={<Badge>{s.bookings.length}</Badge>}
        >
          VIEW & MANAGE BOOKINGS
        </OpButton>
        <OpButton
          onClick={() => engine.triggerResponse()}
          hint="Force immediate agent + tool execution"
          trailing={
            <span className="micro-sm text-accent">
              {busy ? <span className="animate-blink">●●●</span> : "▶"}
            </span>
          }
        >
          TRIGGER AGENT RESPONSE
        </OpButton>

        <Micro className="px-0.5 pb-1 pt-3 text-white/20">CONNECTIONS & SYSTEM</Micro>
        <OpButton
          onClick={() => engine.setOverlay("whatsapp")}
          hint={wa?.connected ? "Linked · inbound queue live" : "Not linked · no inbound queue"}
          trailing={
            wa?.connected ? (
              <span className="flex items-center gap-1.5">
                <Dot tone="accent" size={5} />
                <span className="micro-sm text-accent">LIVE</span>
              </span>
            ) : (
              <span className="micro-sm text-amber-300/70">SETUP</span>
            )
          }
        >
          CONNECT WHATSAPP
        </OpButton>
        <OpButton
          onClick={() => engine.setOverlay("export")}
          hint="Leads · bookings · event log"
          trailing={<span className="micro-sm text-white/25">CSV</span>}
        >
          EXPORT DATA
        </OpButton>
        <OpButton
          onClick={() => engine.setOverlay("settings")}
          hint="White-label · autonomy · channels"
          trailing={<span className="micro-sm text-white/25">CFG</span>}
        >
          TENANT & SYSTEM SETTINGS
        </OpButton>

        <Micro className="px-0.5 pb-1 pt-3 text-white/20">AUTONOMY GATE</Micro>
        <div className="border border-line/90 p-3">
          <div className="flex items-end justify-between">
            <span className="font-mono text-[15px] tracking-[0.1em] text-white/85">
              {AUTONOMY_LABELS[s.autonomy].label}
            </span>
            <span className="micro-sm text-accent">L{s.autonomy}</span>
          </div>
          <p className="micro-sm mt-1.5 leading-relaxed text-white/25">
            {AUTONOMY_LABELS[s.autonomy].note}
          </p>
          <div className="mt-3 flex gap-1">
            {[1, 2, 3].map((lvl) => (
              <button
                key={lvl}
                onClick={() => engine.setAutonomy(lvl as 1 | 2 | 3)}
                className={cn(
                  "h-6 flex-1 border text-[10px] font-mono transition-colors duration-200",
                  s.autonomy === lvl
                    ? "border-accent/50 bg-accent-soft text-accent"
                    : "border-line/90 text-white/25 hover:border-white/25 hover:text-white/60",
                )}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>

        <Micro className="px-0.5 pb-1 pt-3 text-white/20">CHANNEL SURFACE</Micro>
        <div className="divide-y divide-line/60 border border-line/90">
          {s.channels.map((c) => (
            <div key={c.id} className="flex items-center gap-2.5 px-2.5 py-2">
              <Dot tone={c.connected ? "accent" : "idle"} size={5} pulse={c.connected} />
              <span className="micro flex-1 truncate text-white/55">{c.label}</span>
              <span className="w-10">
                <Bar value={c.connected ? Math.min(100, c.volume) : 0} />
              </span>
            </div>
          ))}
        </div>

        <Micro className="px-0.5 pb-1 pt-3 text-white/20">LAST COMMAND</Micro>
        <div className="border border-line/90 bg-white/[0.012] px-3 py-2.5">
          {s.lastCommand ? (
            <>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] text-accent">{s.lastCommand.label}</span>
                <span className="micro-sm text-white/25">{fmtClock(s.lastCommand.ts)}</span>
              </div>
              <div className="micro-sm mt-1.5 text-white/25">
                {s.lastCommand.ok ? "ACK / EXECUTED" : "COMMAND REJECTED / CHECK TENANT SETTINGS"}
              </div>
            </>
          ) : (
            <div className="micro-sm text-white/20">NO COMMANDS ISSUED THIS SESSION</div>
          )}
        </div>

        <button
          onClick={() => engine.halt()}
          className={cn(
            "micro mt-4 w-full border py-2.5 transition-colors duration-200",
            s.halted
              ? "border-accent/50 bg-accent-soft text-accent"
              : "border-line/90 text-white/35 hover:border-red-500/50 hover:bg-red-500/[0.07] hover:text-red-300",
          )}
        >
          {s.halted ? "RESUME SYSTEM EXECUTION" : "HALT ALL AGENTS"}
        </button>

        <div className="mt-5 border-t border-line/70 pt-3">
          <Micro className="text-white/20">CONSOLE BINDINGS</Micro>
          <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5">
            {[
              ["T", "TOOLS"],
              ["A", "AGENT AI"],
              ["L", "LEADS"],
              ["B", "BOOKINGS"],
              ["D", "DISPATCH"],
              ["M", "MODE"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center gap-2">
                <span className="grid h-4 w-4 place-items-center border border-line bg-white/[0.03] font-mono text-[9px] text-white/45">
                  {k}
                </span>
                <span className="micro-sm text-white/25">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="micro-sm border border-white/12 bg-white/[0.05] px-1.5 py-1 leading-none text-white/55">
      {children}
    </span>
  );
}
