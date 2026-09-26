import { AGENT_DEFS, AGENT_ORDER, fmtClock } from "../system/config";
import { engine } from "../system/useSystemEngine";
import { cn } from "../utils/cn";
import type { AgentId, AgentState, SystemState } from "../system/types";
import { Bar, Micro, useNow } from "./ui";

export function AgentPanel({ s }: { s: SystemState }) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-px bg-line/50">
      <div className="flex shrink-0 items-center justify-between bg-panel px-3 py-2">
        <Micro className="text-white/45">REGISTERED AGENT UNITS</Micro>
        <button
          onClick={() => engine.setOverlay("agents_config")}
          className="micro text-accent hover:underline"
        >
          AI & BEHAVIOR CFG →
        </button>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto bg-panel">
        {AGENT_ORDER.map((id) => (
          <AgentCard key={id} id={id} a={s.agents[id]} halted={s.halted} />
        ))}
        <KernelRow s={s} />
      </div>
    </div>
  );
}

function statusTone(status: AgentState["status"]) {
  switch (status) {
    case "ACTIVE":
      return "text-accent border-accent/35 bg-accent-soft";
    case "PROCESSING":
      return "text-accent border-accent/60 bg-accent-soft";
    case "IDLE":
      return "text-white/40 border-white/15 bg-white/[0.03]";
    default:
      return "text-red-300 border-red-500/40 bg-red-500/10";
  }
}

const TOOL_SHORT: Record<string, string> = {
  lead_capture: "LEADS CRM",
  booking_engine: "BOOKINGS",
  whatsapp_responder: "WHATSAPP",
  ops_ledger: "OPS LEDGER",
};

function AgentCard({ id, a, halted }: { id: AgentId; a: AgentState; halted: boolean }) {
  const now = useNow(1000);
  const def = AGENT_DEFS[id];
  const busy = a.status === "PROCESSING";
  const status: AgentState["status"] = halted && a.status !== "PROCESSING" ? "HALTED" : a.status;
  const shortModel = a.modelId ? a.modelId.split("/").pop()?.replace(":free", "") : "rule-engine";

  return (
    <article className="group relative border-b border-line/70 px-3 py-3.5 transition-colors duration-300 hover:bg-white/[0.02]">
      <span
        className="absolute left-0 top-0 h-full w-[2px] transition-all duration-500"
        style={{
          background: busy ? def.accent : "transparent",
          opacity: busy ? 1 : 0,
          boxShadow: busy ? `0 0 14px ${def.accent}` : undefined,
        }}
      />

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <h3 className="font-mono text-[15px] font-medium tracking-[0.14em]" style={{ color: def.accent }}>
              {def.codename}
            </h3>
            <Micro className="text-white/20">{def.domain}</Micro>
          </div>
          <p className="mt-1 text-[11px] leading-tight text-white/45">{def.role}</p>
        </div>
        <span
          className={cn(
            "micro-sm shrink-0 border px-1.5 py-1 leading-none",
            statusTone(status),
            busy && "animate-pulse",
          )}
        >
          {status}
        </span>
      </div>

      {/* OpenRouter Model & Tone Pill */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            "micro-sm border px-1.5 py-0.5 leading-none",
            a.modelTier === "paid"
              ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
              : "border-accent/35 bg-accent-soft text-accent",
          )}
        >
          {a.modelTier === "paid" ? "PAID" : "FREE"} · {shortModel}
        </span>
        {a.tone && (
          <span className="micro-sm border border-line/80 bg-white/[0.02] px-1.5 py-0.5 text-white/45">
            TONE: {a.tone}
          </span>
        )}
      </div>

      {/* Connected Tools */}
      {a.connectedTools && a.connectedTools.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <span className="micro-sm text-white/25">TOOLS:</span>
          {a.connectedTools.map((tId) => (
            <button
              key={tId}
              onClick={() => engine.setOverlay("tools")}
              className="micro-sm border border-line/70 bg-void/50 px-1.5 py-0.5 text-white/55 transition-colors hover:border-accent/40 hover:text-accent"
            >
              {TOOL_SHORT[tId] ?? tId}
            </button>
          ))}
        </div>
      )}

      {/* current task */}
      <div className="mt-2.5 border border-line/70 bg-white/[0.012] px-2.5 py-2">
        <div className="flex items-center justify-between">
          <Micro className="text-white/25">{busy ? "PROCESSING" : "CURRENT TASK"}</Micro>
          {busy && (
            <span className="flex items-center gap-[3px]">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-[3px] w-[3px] animate-blink rounded-full bg-accent"
                  style={{ animationDelay: `${i * 0.18}s` }}
                />
              ))}
            </span>
          )}
        </div>
        <p
          className={cn(
            "mt-1.5 text-[11.5px] leading-snug transition-colors duration-500",
            busy ? "text-white/85" : "text-white/55",
          )}
        >
          {a.task}
        </p>
      </div>

      {/* load */}
      <div className="mt-2.5 space-y-1.5">
        <div className="flex items-center justify-between">
          <Micro className="text-white/25">LOAD</Micro>
          <span className="font-mono text-[10px] tnum text-white/55">{Math.round(a.load)}%</span>
        </div>
        <Bar value={a.load} tone={a.load > 82 ? "warn" : "accent"} />
      </div>

      {/* last action */}
      <div className="mt-2.5">
        <Micro className="text-white/25">LAST ACTION</Micro>
        <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-white/60">{a.lastAction}</p>
        <div className="micro-sm mt-1 text-white/25">
          {fmtClock(a.lastActionAt)} · {Math.max(0, Math.round((now - a.lastActionAt) / 1000))}s ago
        </div>
      </div>

      {/* metrics */}
      <div className="mt-2.5 grid grid-cols-3 divide-x divide-line/70 border-t border-line/70 pt-2.5">
        <Cell label="CYCLES" value={a.actions.toLocaleString()} />
        <Cell label={a.metricLabel} value={a.metricValue} accent={a.metricDelta >= 0} />
        <Cell label="QUEUE" value={String(a.queue)} />
      </div>

      <div className="mt-3 flex gap-1.5">
        <button
          onClick={() => engine.triggerResponse(id)}
          className="micro flex-1 border border-line/80 py-2 text-white/50 transition-all duration-200 hover:border-accent/50 hover:bg-accent-soft hover:text-accent"
        >
          DISPATCH →
        </button>
        <button
          onClick={() => engine.setOverlay("agents_config")}
          className="micro border border-line/80 px-2.5 py-2 text-white/40 transition-all duration-200 hover:border-white/30 hover:text-white"
          title="Configure OpenRouter model & behavior"
        >
          AI CFG
        </button>
      </div>
    </article>
  );
}

function Cell({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="px-1.5 first:pl-0 last:pr-0">
      <Micro className="text-white/20">{label}</Micro>
      <div
        className={cn(
          "mt-1 font-mono text-[11px] tnum transition-colors duration-500",
          accent ? "text-accent" : "text-white/70",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function KernelRow({ s }: { s: SystemState }) {
  const core = s.agents.core;
  return (
    <div className="shrink-0 bg-white/[0.012] px-3 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 animate-blink bg-accent" />
          <span className="font-mono text-[11px] tracking-[0.18em] text-white/50">CORE / KERNEL</span>
        </div>
        <Micro className="text-white/25">{s.halted ? "PAUSED" : "RUNNING"}</Micro>
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-2">
        {[
          ["ORCH", `${s.agents.tala.actions + s.agents.nyx.actions + s.agents.hermes.actions}`],
          ["TOOLS", `${s.tools.filter((t) => t.enabled).length}/4`],
          ["LOAD", `${Math.round(core.load)}%`],
        ].map(([k, v]) => (
          <div key={k} className="border border-line/70 bg-void/40 px-2 py-1.5">
            <Micro className="text-white/20">{k}</Micro>
            <div className="mt-1 font-mono text-[10.5px] tnum text-white/65">{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
