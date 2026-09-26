import { useMemo, useRef, useState } from "react";
import { AGENT_DEFS, fmtClock, rel } from "../system/config";
import { engine } from "../system/useSystemEngine";
import { cn } from "../utils/cn";
import type { SystemEvent, SystemState } from "../system/types";
import { AgentDot, ChannelTag, Micro, severityTone, useNow } from "./ui";

type Filter = "ALL" | "TALA" | "NYX" | "HERMES" | "ALERTS";

const FILTERS: Filter[] = ["ALL", "TALA", "NYX", "HERMES", "ALERTS"];

export function ActivityStream({ s }: { s: SystemState }) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const now = useNow(1000);
  const seen = useRef<Set<string>>(new Set(s.events.map((e) => e.id)));

  const events = useMemo(() => {
    if (filter === "ALL") return s.events;
    if (filter === "ALERTS") return s.events.filter((e) => e.severity === "warn");
    return s.events.filter((e) => AGENT_DEFS[e.agent].codename === filter);
  }, [s.events, filter]);

  const perMin = useMemo(() => {
    const cutoff = now - 60_000;
    return s.events.filter((e) => e.ts > cutoff).length;
  }, [s.events, now]);

  const selectFilter = (f: Filter) => {
    setFilter(f);
    seen.current = new Set(s.events.map((e) => e.id));
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-panel">
      {/* header */}
      <div className="relative flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line/80 px-3 py-2">
        <div className="flex items-center gap-2.5">
          <span className="h-2.5 w-px bg-accent/70" />
          <Micro className="text-white/50">LIVE ACTIVITY STREAM</Micro>
          <span className="micro-sm flex items-center gap-1.5 border border-accent/25 bg-accent-soft px-1.5 py-1 text-accent">
            <span className="h-1 w-1 animate-blink bg-accent" />
            SUBSCRIBED
          </span>
        </div>
        <div className="flex items-center gap-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => selectFilter(f)}
              className={cn(
                "micro-sm border px-1.5 py-1 leading-none transition-colors duration-200",
                filter === f
                  ? "border-accent/45 bg-accent-soft text-accent"
                  : "border-transparent text-white/25 hover:border-line hover:text-white/60",
              )}
            >
              {f}
            </button>
          ))}
        </div>
        {/* scanline */}
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px overflow-hidden">
          <span className="block h-px w-1/4 animate-sweep bg-gradient-to-r from-transparent via-accent/70 to-transparent" />
        </span>
      </div>

      {/* rows */}
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {events.length === 0 && (
          <div className="grid h-32 place-items-center">
            <Micro className="text-white/20">NO EVENTS MATCH FILTER</Micro>
          </div>
        )}
        {events.map((e, i) => {
          const isNew = !seen.current.has(e.id);
          if (isNew) seen.current.add(e.id);
          const prev = events[i + 1];
          const gap = prev ? e.ts - prev.ts : 0;
          return (
            <div key={e.id}>
              {gap > 95_000 && (
                <div className="flex items-center gap-3 px-3 py-2">
                  <span className="h-px flex-1 bg-line/60" />
                  <Micro className="text-white/15"> quiet period {Math.round(gap / 1000)}s </Micro>
                  <span className="h-px flex-1 bg-line/60" />
                </div>
              )}
              <Row e={e} now={now} isNew={isNew} />
            </div>
          );
        })}
        <div className="flex items-center justify-center gap-2 py-6">
          <span className="h-1 w-1 animate-blink bg-white/20" />
          <Micro className="text-white/15">STREAM TRUNCATED · LAST 70 EVENTS IN BUFFER</Micro>
        </div>
      </div>

      {/* footer */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line/80 bg-white/[0.012] px-3 py-2">
        <div className="flex items-center gap-4">
          <FooterStat label="EVENTS / MIN" value={String(perMin).padStart(2, "0")} />
          <FooterStat label="BUFFER" value={`${s.events.length}/70`} />
          <FooterStat
            label="OLDEST"
            value={s.events.length ? rel(s.events[s.events.length - 1].ts, now) : "—"}
          />
        </div>
        <div className="flex items-center gap-2">
          <Micro className="hidden text-white/20 sm:block">FEED ID {s.events[0]?.id.slice(-6).toUpperCase()}</Micro>
          <button
            onClick={() => engine.triggerResponse()}
            className="micro border border-line/80 px-2 py-1 text-white/40 transition-colors hover:border-accent/50 hover:bg-accent-soft hover:text-accent"
          >
            INJECT TEST EVENT
          </button>
        </div>
      </div>
    </div>
  );
}

function FooterStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Micro className="text-white/20">{label}</Micro>
      <span className="font-mono text-[10px] tnum text-white/55">{value}</span>
    </div>
  );
}

function Row({ e, now, isNew }: { e: SystemEvent; now: number; isNew: boolean }) {
  const tone = severityTone(e.severity);
  const agent = AGENT_DEFS[e.agent];
  return (
    <div
      className={cn(
        "group relative flex items-start gap-3 border-b border-line/40 px-3 py-2.5 transition-colors duration-200 hover:bg-white/[0.025]",
        isNew && "animate-flash",
      )}
    >
      <span className={cn("absolute left-0 top-0 h-full w-[2px]", tone.bar, e.severity === "action" && "opacity-25")} />

      <div className="w-[62px] shrink-0 pt-[2px]">
        <div className="font-mono text-[10.5px] tnum text-white/40">{fmtClock(e.ts)}</div>
        <div className="micro-sm mt-1 text-white/20">{rel(e.ts, now).replace(" ago", "")}</div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="flex items-center gap-1.5">
            <AgentDot id={e.agent} />
            <span
              className="micro-sm leading-none"
              style={{ color: agent.accent, opacity: e.agent === "core" ? 0.7 : 1 }}
            >
              {agent.codename}
            </span>
          </span>
          <span className="micro-sm text-white/20">{e.code}</span>
          {e.severity === "warn" && <span className="micro-sm text-amber-300/80">⚠ ATTENTION</span>}
          {e.severity === "success" && <span className="micro-sm text-accent/80">✓ DONE</span>}
        </div>
        <p
          className={cn(
            "mt-1.5 text-[12.5px] leading-snug transition-colors duration-500",
            e.severity === "warn" ? "text-amber-100/85" : "text-white/75",
            isNew && "text-white",
          )}
        >
          {e.text}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2 pt-[2px]">
        <ChannelTag channel={e.channel} />
        <span className="micro-sm hidden w-10 text-right text-white/15 transition-colors group-hover:text-accent/60 lg:block">
          ↳{String(e.id.length).padStart(2, "0")}
        </span>
      </div>
    </div>
  );
}
