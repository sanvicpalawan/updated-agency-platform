import { useEffect, useRef, useState } from "react";
import {
  AGENT_DEFS,
  BUSINESS_TYPES,
  LEDGER_DEFS,
  PIPELINE_DEFS,
  rel,
} from "../system/config";
import { engine } from "../system/useSystemEngine";
import { cn } from "../utils/cn";
import type { AgentId, StageKey, SystemState } from "../system/types";
import { AgentDot, Micro, useNow } from "./ui";

/* ================================================================ wrapper */

export function Hero({ s }: { s: SystemState }) {
  return (
    <section className="relative z-10 border-b border-line/90 px-2 pb-2 pt-2 lg:px-3 lg:pb-3 lg:pt-3">
      <div className="grid gap-px bg-line/70 lg:grid-cols-12">
        <IdentityBlock s={s} />
        <CompletedBlock s={s} />
        <NowBlock s={s} />
        <PipelineBlock s={s} />
      </div>
    </section>
  );
}

function Block({
  index,
  label,
  question,
  accessory,
  children,
  className,
  bodyClass,
}: {
  index: string;
  label: string;
  question: string;
  accessory?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClass?: string;
}) {
  return (
    <div className={cn("relative flex min-w-0 flex-col bg-panel", className)}>
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line/70 px-3 py-2.5 lg:px-4">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="micro-sm text-accent/60">{index}</span>
            <h2 className="micro text-white/55">{label}</h2>
          </div>
          <p className="mt-1.5 text-[11px] leading-none text-white/22">{question}</p>
        </div>
        {accessory}
      </header>
      <div className={cn("min-h-0 flex-1", bodyClass)}>{children}</div>
    </div>
  );
}

/* ====================================================== 01 · identity */

function IdentityBlock({ s }: { s: SystemState }) {
  const connected = s.channels.filter((c) => c.connected).length;
  const live = !s.halted;

  return (
    <Block
      index="01"
      label="SYSTEM IDENTITY"
      question="What is this?"
      className="lg:col-span-4"
      accessory={
        <span className="grid h-6 w-6 shrink-0 place-items-center border border-accent/30 bg-accent-soft">
          <span className="h-1 w-1 bg-accent" />
        </span>
      }
    >
      <div className="flex h-full flex-col justify-between gap-4 px-3 py-3.5 lg:px-4">
        <div>
          <Micro className="text-white/25">SYSTEM NAME / WHITE-LABEL</Micro>
          <input
            value={s.brand.name}
            onChange={(e) => engine.setBrandName(e.target.value.slice(0, 26))}
            spellCheck={false}
            aria-label="System name"
            style={{ width: `${Math.max(8, s.brand.name.length + 1)}ch` }}
            className="mt-2 block max-w-full border-b border-transparent bg-transparent font-mono text-[19px] font-light leading-none tracking-[0.06em] text-white outline-none transition-colors hover:border-white/20 focus:border-accent/60 sm:text-[22px]"
          />

          <div className="mt-5">
            <Micro className="text-white/25">BUSINESS TYPE</Micro>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {BUSINESS_TYPES.slice(0, 3).map((t) => (
                <button
                  key={t}
                  onClick={() => engine.setBrandType(t)}
                  className={cn(
                    "micro-sm border px-2 py-1.5 leading-none transition-colors",
                    s.brand.type === t
                      ? "border-accent/45 bg-accent-soft text-accent"
                      : "border-line/90 text-white/30 hover:border-white/20 hover:text-white/65",
                  )}
                >
                  {t.replace(" System", "")}
                </button>
              ))}
              <input
                value={s.brand.type}
                onChange={(e) => engine.setBrandType(e.target.value.slice(0, 32))}
                spellCheck={false}
                aria-label="Business type"
                className="min-w-0 flex-1 border-b border-transparent bg-transparent font-mono text-[11.5px] text-white/70 outline-none transition-colors placeholder:text-white/20 hover:border-white/20 focus:border-accent/60"
              />
            </div>
          </div>
        </div>

        {/* status rows */}
        <div className="divide-y divide-line/60 border-y border-line/60">
          <StatusRow
            k="STATUS"
            v={
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    live ? "animate-pulse-ring bg-accent" : "bg-amber-400",
                  )}
                />
                <span className={live ? "text-accent text-glow" : "text-amber-300"}>
                  {live ? "LIVE SYSTEM ACTIVE" : "SYSTEM HALTED"}
                </span>
              </span>
            }
          />
          <StatusRow
            k="DEPLOYMENT"
            v={<span className="text-white/80">{live ? "Mock runtime running" : "Mock runtime paused"}</span>}
            sub={`${connected}/${s.channels.length} simulated channels`}
          />
          <StatusRow
            k="AGENTS ASSIGNED"
            v={<span className="text-white/80">3 units + kernel</span>}
            sub="Front desk · acquisition · back office"
          />
        </div>

        <div>
          <div className="grid grid-cols-2 gap-px bg-line/70">
            <div className="bg-panel px-2.5 py-2.5">
              <Micro className="text-white/25">AUTOMATION COVERAGE</Micro>
              <div className="mt-2 font-mono text-[19px] font-light leading-none tnum text-accent">
                {Math.round(s.metrics.automationCoverage)}%
              </div>
              <div className="micro-sm mt-2 leading-snug text-white/25">
                of inquiries with an automated reply
              </div>
            </div>
            <div className="bg-panel px-2.5 py-2.5">
              <Micro className="text-white/25">MANUAL WORKLOAD</Micro>
              <div className="mt-2 font-mono text-[19px] font-light leading-none tnum text-accent">
                −{Math.round(s.metrics.manualWorkloadReduced)}%
              </div>
              <div className="micro-sm mt-2 leading-snug text-white/25">
                {s.metrics.manualWorkloadSaved.toFixed(1)}h estimated handling saved
              </div>
            </div>
          </div>
          <p className="mt-3.5 text-[11.5px] leading-relaxed text-white/40">
            Three agents cover enquiries, bookings and back office for{" "}
            <span className="text-white/70">{s.brand.name}</span>. This tenant-scoped simulation uses
            the same rules, records, and event bus as the admin panel. No external services are connected.
          </p>
        </div>
      </div>
    </Block>
  );
}

function StatusRow({ k, v, sub }: { k: string; v: React.ReactNode; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <Micro className="shrink-0 text-white/25">{k}</Micro>
      <div className="min-w-0 text-right">
        <div className="font-mono text-[11.5px] leading-none">{v}</div>
        {sub && <div className="micro-sm mt-1.5 text-white/20">{sub}</div>}
      </div>
    </div>
  );
}

/* ============================================== 02 · completed (proof) */

function CompletedBlock({ s }: { s: SystemState }) {
  const now = useNow(1000);
  const rows = LEDGER_DEFS.map((d) => ({ ...d, entry: s.ledger[d.key] }));
  const total = rows.reduce((sum, r) => sum + r.entry.count, 0);
  const lastAt = Math.max(...rows.map((r) => r.entry.lastAt));

  return (
    <Block
      index="02"
      label="COMPLETED TODAY"
      question="What has it already done?"
      className="lg:col-span-4"
      accessory={
        <div className="text-right">
          <div className="font-mono text-[15px] leading-none tnum text-accent">{total}</div>
          <Micro className="mt-1 text-white/20">ACTIONS</Micro>
        </div>
      }
    >
      <ul className="divide-y divide-line/50">
        {rows.map((r) => {
          const fresh = now - r.entry.lastAt < 6000;
          return (
            <li
              key={r.key}
              className={cn(
                "flex items-center gap-2.5 px-3 py-[7px] transition-colors duration-700 lg:px-4",
                fresh && "bg-accent-soft",
              )}
            >
              <span
                className={cn(
                  "grid h-3.5 w-3.5 shrink-0 place-items-center border text-[8px] transition-colors duration-500",
                  fresh ? "border-accent/60 text-accent" : "border-accent/25 text-accent/70",
                )}
              >
                ✓
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-white/65">{r.label}</span>
              <span className="font-mono text-[12px] tnum text-white/90">{r.entry.count}</span>
              <span className="micro-sm hidden w-12 text-right text-white/18 sm:block">
                {rel(r.entry.lastAt, now)}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="flex shrink-0 items-center justify-between border-t border-line/70 px-3 py-2 lg:px-4">
        <Micro className="text-white/25">LAST COMPLETION</Micro>
        <span className="font-mono text-[10.5px] tnum text-white/55">
          {rel(lastAt, now)} · logged automatically
        </span>
      </div>
    </Block>
  );
}

/* ================================================ 03 · in progress now */

interface NowRow {
  agent: AgentId;
  label: string;
  since: number;
  busy: boolean;
}

const IDLE_DUTY: Record<AgentId, string> = {
  tala: "Monitoring guest channels",
  nyx: "Scanning inbound demand",
  hermes: "Sweeping back-office queue",
  core: "Syncing CRM pipeline",
};

const KERNEL_CYCLE = [
  "Syncing CRM pipeline",
  "Writing state snapshot",
  "Reconciling ledger entries",
  "Re-checking channel sockets",
];

function deriveNow(s: SystemState): NowRow[] {
  const rows: NowRow[] = (["tala", "nyx", "hermes"] as AgentId[]).map((id) => {
    const a = s.agents[id];
    const busy = a.status === "PROCESSING";
    return {
      agent: id,
      label: busy ? a.task : IDLE_DUTY[id],
      since: a.lastActionAt,
      busy,
    };
  });
  const slot = Math.floor(Date.now() / 6000) % KERNEL_CYCLE.length;
  rows.push({
    agent: "core",
    label: KERNEL_CYCLE[slot],
    since: s.events[0]?.ts ?? Date.now(),
    busy: !s.halted,
  });
  return rows;
}

function NowBlock({ s }: { s: SystemState }) {
  const now = useNow(400);
  const rows = deriveNow(s);
  const inFlight = rows.filter((r) => r.busy).length;
  const queue = (["tala", "nyx", "hermes"] as AgentId[]).reduce(
    (sum, id) => sum + s.agents[id].queue,
    0,
  );

  return (
    <Block
      index="03"
      label="IN PROGRESS RIGHT NOW"
      question="What is happening right now?"
      className="lg:col-span-4"
      accessory={
        <span className="micro-sm flex items-center gap-1.5 border border-accent/25 bg-accent-soft px-1.5 py-1 text-accent">
          <span className="h-1 w-1 animate-blink bg-accent" />
          LIVE
        </span>
      }
      bodyClass="flex flex-col"
    >
      <ul className="divide-y divide-line/50">
        {rows.map((r) => (
          <NowItem key={r.agent} r={r} now={now} halted={s.halted} />
        ))}
      </ul>
      <div className="mt-auto flex shrink-0 items-center justify-between border-t border-line/70 px-3 py-2 lg:px-4">
        <Micro className="text-white/25">TASKS IN FLIGHT</Micro>
        <span className="font-mono text-[10.5px] tnum text-white/55">
          {inFlight} active · queue {queue}
        </span>
      </div>
    </Block>
  );
}

function NowItem({ r, now, halted }: { r: NowRow; now: number; halted: boolean }) {
  const def = AGENT_DEFS[r.agent];
  const [dot, setDot] = useState(0);
  useEffect(() => {
    if (!r.busy || halted) return;
    const t = window.setInterval(() => setDot((d) => (d + 1) % 3), 260);
    return () => window.clearInterval(t);
  }, [r.busy, halted]);

  return (
    <li className="relative px-3 py-[9px] lg:px-4">
      {r.busy && !halted && (
        <span className="absolute inset-x-0 bottom-0 h-px overflow-hidden">
          <span
            className="block h-px w-1/3"
            style={{
              background: `linear-gradient(90deg, transparent, ${def.accent}, transparent)`,
              animation: "sweep 1.6s linear infinite",
            }}
          />
        </span>
      )}
      <div className="flex items-center gap-2.5">
        <span className="flex w-3 shrink-0 items-center justify-center">
          {r.busy && !halted ? (
            <span className="flex items-center gap-[2px]">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-[3px] w-[3px] rounded-full transition-colors duration-200"
                  style={{
                    background: dot === i ? def.accent : "rgba(255,255,255,0.16)",
                  }}
                />
              ))}
            </span>
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
          )}
        </span>
        <AgentDot id={r.agent} />
        <span
          className="micro-sm shrink-0 leading-none"
          style={{ color: def.accent, opacity: r.agent === "core" ? 0.7 : 1 }}
        >
          {def.codename}
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[12px] transition-colors duration-500",
            r.busy && !halted ? "text-white/90" : "text-white/45",
          )}
        >
          {halted ? "Paused by operator" : r.label}
        </span>
        <span className="micro-sm shrink-0 text-white/18">
          {halted ? "HELD" : r.busy ? `${Math.max(1, Math.round((now - r.since) / 1000))}s` : "IDLE"}
        </span>
      </div>
    </li>
  );
}

/* ============================================= 04 · what happens next */

function PipelineBlock({ s }: { s: SystemState }) {
  const now = useNow(1000);
  const [pulse, setPulse] = useState<StageKey | null>(null);
  const prev = useRef<Record<string, number>>({});
  const signal = Object.values(s.pipeline).map((entry) => `${entry.fired}:${entry.lastAt}`).join("/");

  useEffect(() => {
    let latest: StageKey | null = null;
    let latestTs = 0;
    (Object.keys(s.pipeline) as StageKey[]).forEach((k) => {
      const e = s.pipeline[k];
      if (prev.current[k] !== undefined && e.fired > prev.current[k]! && e.lastAt > latestTs) {
        latest = k;
        latestTs = e.lastAt;
      }
      prev.current[k] = e.fired;
    });
    if (!latest) return;
    setPulse(latest);
    const t = window.setTimeout(() => setPulse(null), 2200);
    return () => window.clearTimeout(t);
  }, [signal]);

  const activeIndex = PIPELINE_DEFS.findIndex((p) => p.key === pulse);

  return (
    <Block
      index="04"
      label="WHAT HAPPENS NEXT"
      question="What will it do for me?"
      className="lg:col-span-12"
      accessory={
        <Micro className="hidden text-white/25 sm:block">
          AUTOMATION PIPELINE · FORWARD VIEW
        </Micro>
      }
      bodyClass="flex flex-col"
    >
      <div className="grid divide-y divide-line/50 sm:grid-cols-5 sm:divide-x sm:divide-y-0">
        {PIPELINE_DEFS.map((p, i) => {
          const entry = s.pipeline[p.key];
          const def = AGENT_DEFS[p.agent];
          const hot = pulse === p.key;
          const armed = activeIndex >= 0 && i > activeIndex && i <= activeIndex + 1;
          return (
            <div
              key={p.key}
              className={cn(
                "relative px-3 py-3 transition-colors duration-700 lg:px-4",
                hot && "bg-accent-soft",
              )}
            >
              {hot && (
                <span className="pointer-events-none absolute inset-x-0 top-0 h-px overflow-hidden">
                  <span
                    className="block h-px w-1/3 bg-accent"
                    style={{ animation: "sweep 1.3s linear infinite" }}
                  />
                </span>
              )}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="micro-sm text-white/20">STEP {i + 1}</span>
                  {hot ? (
                    <span className="h-1 w-1 animate-blink rounded-full bg-accent" />
                  ) : (
                    <span
                      className="h-1 w-1 rounded-full"
                      style={{ background: armed ? def.accent : "rgba(255,255,255,0.14)" }}
                    />
                  )}
                </div>
                <span
                  className="micro-sm leading-none"
                  style={{ color: def.accent, opacity: 0.75 }}
                >
                  {def.codename}
                </span>
              </div>

              <p className="mt-2.5 text-[11.5px] leading-snug text-white/40">{p.trigger}</p>
              <div className="mt-1.5 flex items-start gap-1.5">
                <span className="mt-[3px] text-accent/50">↓</span>
                <p
                  className={cn(
                    "text-[13px] font-medium leading-snug transition-colors duration-500",
                    hot ? "text-accent" : "text-white/85",
                  )}
                >
                  {p.action}
                </p>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2">
                <Micro className="text-white/22">TARGET</Micro>
                <span className="font-mono text-[10.5px] text-white/60">{p.target}</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between">
                <Micro className="text-white/22">FIRED TODAY</Micro>
                <span
                  className={cn(
                    "font-mono text-[10.5px] tnum transition-colors duration-500",
                    hot ? "text-accent" : "text-white/60",
                  )}
                >
                  {entry.fired}
                </span>
              </div>
              <div className="micro-sm mt-1.5 text-white/18">{rel(entry.lastAt, now)}</div>
            </div>
          );
        })}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-line/70 px-3 py-2 lg:px-4">
        <Micro className="text-white/25">
          {s.autonomy === 1 ? "AUTOMATIC ACTIONS PAUSED / MANUAL DISPATCH AVAILABLE" : "AGENTS FOLLOW THE WORKSPACE AUTOMATION RULES"}
        </Micro>
        <a
          href="#console"
          className="micro-sm text-accent/70 transition-colors hover:text-accent"
        >
          OPEN LIVE CONSOLE ↓
        </a>
      </div>
    </Block>
  );
}
