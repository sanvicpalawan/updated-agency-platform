import { dur, rel } from "../system/config";
import { cn } from "../utils/cn";
import type { SystemState } from "../system/types";
import { Micro, useNow } from "./ui";

export function BottomStrip({ s }: { s: SystemState }) {
  const now = useNow(1000);
  const m = s.metrics;
  const sla = m.avgResponseSec < 30;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30">
      <div className="pointer-events-auto border-t border-line/90 bg-shell/95 backdrop-blur-xl">
        <div className="flex items-stretch">
          <div className="hidden shrink-0 items-center gap-2 border-r border-line/80 px-3 lg:flex">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                s.halted ? "bg-amber-400" : "animate-pulse-ring bg-accent",
              )}
            />
            <Micro className="text-white/35">VALUE OUTPUT</Micro>
          </div>

          <div className="no-scrollbar flex flex-1 items-stretch overflow-x-auto">
            <Cell
              k="AUTOMATION COVERAGE"
              v={`${Math.round(m.automationCoverage)}%`}
              note="of enquiries handled automatically"
              tone="accent"
            />
            <Cell
              k="AVG RESPONSE TIME"
              v={`${m.avgResponseSec}s`}
              note={sla ? "within 30 s target" : "above 30 s target"}
              tone={sla ? "accent" : "warn"}
            />
            <Cell
              k="MANUAL WORKLOAD REDUCED"
              v={`${Math.round(m.manualWorkloadReduced)}%`}
              note={`${m.manualWorkloadSaved.toFixed(1)}h removed today`}
              tone="accent"
            />
            <Cell
              k="SYSTEM UPTIME"
              v={s.halted ? "HELD" : "LIVE"}
              note={dur(now - s.bootedAt)}
              tone={s.halted ? "warn" : "accent"}
            />
            <Cell
              k="ACTIONS TODAY"
              v={String(m.actionsToday)}
              note={`${m.leadsToday} leads · ${m.bookingsToday} bookings`}
            />
            <Cell
              k="HUMAN TOUCH REQUIRED"
              v={m.incidents === 0 ? "NONE" : `${m.incidents}`}
              note={`last intervention ${rel(m.lastManualTs, now)}`}
              tone={m.incidents === 0 ? "accent" : "warn"}
            />
          </div>

          <div className="hidden shrink-0 items-center gap-3 border-l border-line/80 px-3 xl:flex">
            <Micro className="text-white/22">MODE</Micro>
            <span className="font-mono text-[10.5px] text-accent">
              {s.mode === "SYSTEM" ? "AGENT" : "HUMAN"}
            </span>
            <span className="h-3 w-px bg-line" />
            <span className="font-mono text-[10.5px] text-white/40">
              L{s.autonomy} · {s.channels.filter((c) => c.connected).length} CH
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Cell({
  k,
  v,
  note,
  tone,
}: {
  k: string;
  v: string;
  note: string;
  tone?: "accent" | "warn";
}) {
  return (
    <div className="flex shrink-0 items-center gap-2.5 border-r border-line/60 px-3 py-2 lg:px-4">
      <Micro className="whitespace-nowrap text-white/25">{k}</Micro>
      <div className="leading-none">
        <span
          className={cn(
            "whitespace-nowrap font-mono text-[13px] tnum",
            tone === "accent" ? "text-accent" : tone === "warn" ? "text-amber-300" : "text-white/80",
          )}
        >
          {v}
        </span>
        <div className="micro-sm mt-1 whitespace-nowrap text-white/22">{note}</div>
      </div>
    </div>
  );
}
