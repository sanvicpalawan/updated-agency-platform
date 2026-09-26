import { useEffect, useState, type ReactNode } from "react";
import { cn } from "../utils/cn";
import type { AgentId, Severity } from "../system/types";
import { AGENT_DEFS } from "../system/config";

export function useNow(interval = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), interval);
    return () => window.clearInterval(t);
  }, [interval]);
  return now;
}

export function Micro({
  children,
  className,
  as: As = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "span";
}) {
  return <As className={cn("micro text-white/35", className)}>{children}</As>;
}

export function Dot({
  tone = "accent",
  pulse = false,
  size = 6,
  className,
}: {
  tone?: "accent" | "warn" | "idle" | "dead";
  pulse?: boolean;
  size?: number;
  className?: string;
}) {
  const color =
    tone === "accent"
      ? "bg-accent"
      : tone === "warn"
        ? "bg-amber-400"
        : tone === "idle"
          ? "bg-white/25"
          : "bg-red-500/70";
  return (
    <span
      style={{ width: size, height: size }}
      className={cn(
        "relative inline-block shrink-0 rounded-full",
        color,
        pulse && "animate-pulse-ring",
        className,
      )}
    />
  );
}

export function AgentDot({ id, pulse }: { id: AgentId; pulse?: boolean }) {
  const def = AGENT_DEFS[id];
  return (
    <span
      style={{
        width: 6,
        height: 6,
        background: def.accent,
        boxShadow: `0 0 10px -1px ${def.accent}`,
      }}
      className={cn("inline-block shrink-0 rounded-full", pulse && "animate-pulse-ring")}
    />
  );
}

export function severityTone(s: Severity) {
  switch (s) {
    case "success":
      return { text: "text-accent", bar: "bg-accent", label: "OK" };
    case "warn":
      return { text: "text-amber-300", bar: "bg-amber-400", label: "ATTN" };
    case "info":
      return { text: "text-sky-300/90", bar: "bg-sky-400/80", label: "SYS" };
    default:
      return { text: "text-white/70", bar: "bg-white/35", label: "ACT" };
  }
}

export function Panel({
  label,
  accessory,
  children,
  className,
  bodyClass,
  flush = false,
}: {
  label: string;
  accessory?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClass?: string;
  flush?: boolean;
}) {
  return (
    <section
      className={cn(
        "panel-surface relative flex min-h-0 flex-col overflow-hidden border border-line/90",
        className,
      )}
    >
      <header className="relative z-10 flex h-9 shrink-0 items-center justify-between border-b border-line/80 bg-white/[0.015] px-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-px bg-accent/70" />
          <Micro className="text-white/45">{label}</Micro>
        </div>
        {accessory}
      </header>
      <div className={cn("relative min-h-0 flex-1", !flush && "p-3", bodyClass)}>{children}</div>
      <Corners />
    </section>
  );
}

export function Corners() {
  const c = "pointer-events-none absolute h-2 w-2 border-accent/30";
  return (
    <>
      <span className={cn(c, "left-0 top-0 border-l border-t")} />
      <span className={cn(c, "right-0 top-0 border-r border-t")} />
      <span className={cn(c, "bottom-0 left-0 border-b border-l")} />
      <span className={cn(c, "bottom-0 right-0 border-b border-r")} />
    </>
  );
}

export function Bar({ value, tone = "accent" }: { value: number; tone?: "accent" | "warn" }) {
  return (
    <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/[0.07]">
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-700 ease-out",
          tone === "accent" ? "bg-accent" : "bg-amber-400",
        )}
        style={{ width: `${Math.max(2, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export function OpButton({
  children,
  hint,
  onClick,
  active,
  tone = "default",
  disabled,
  trailing,
}: {
  children: ReactNode;
  hint?: string;
  onClick?: () => void;
  active?: boolean;
  tone?: "default" | "accent" | "danger";
  disabled?: boolean;
  trailing?: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group relative flex w-full items-center gap-3 border px-3 py-2.5 text-left transition-all duration-200",
        "border-line/90 bg-white/[0.015] hover:border-white/20 hover:bg-white/[0.05]",
        active && "border-accent/50 bg-accent-soft",
        tone === "accent" && "border-accent/40 bg-accent-soft hover:border-accent/70",
        tone === "danger" && "hover:border-red-500/50 hover:bg-red-500/[0.07]",
        disabled && "pointer-events-none opacity-35",
      )}
    >
      <span
        className={cn(
          "h-6 w-px shrink-0 bg-white/10 transition-colors duration-200 group-hover:bg-accent",
          active && "bg-accent",
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="micro block text-white/70 transition-colors group-hover:text-white">
          {children}
        </span>
        {hint && <span className="micro-sm mt-1 block text-white/25">{hint}</span>}
      </span>
      {trailing ?? (
        <span className="micro-sm text-white/20 transition-colors group-hover:text-accent">↵</span>
      )}
    </button>
  );
}

export function Toggle({
  on,
  onChange,
  label,
  sub,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
  sub?: string;
}) {
  return (
    <button
      onClick={() => onChange(!on)}
      className="flex w-full items-center gap-3 border-b border-line/60 py-2.5 text-left last:border-0"
    >
      <span className="min-w-0 flex-1">
        <span className="micro block text-white/65">{label}</span>
        {sub && <span className="micro-sm mt-1 block text-white/25">{sub}</span>}
      </span>
      <span
        className={cn(
          "relative h-4 w-8 shrink-0 rounded-full border transition-colors duration-300",
          on ? "border-accent/50 bg-accent/25" : "border-line bg-white/[0.05]",
        )}
      >
        <span
          className={cn(
            "absolute top-[1px] h-3 w-3 rounded-full transition-all duration-300",
            on ? "left-[17px] bg-accent" : "left-[1px] bg-white/30",
          )}
        />
      </span>
    </button>
  );
}

export function Metric({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="border-l border-line/80 pl-3">
      <Micro className="text-white/30">{label}</Micro>
      <div
        className={cn(
          "mt-1.5 font-mono text-[15px] leading-none tnum",
          accent ? "text-accent" : "text-white/90",
        )}
      >
        {value}
      </div>
      {sub && <div className="micro-sm mt-1.5 text-white/25">{sub}</div>}
    </div>
  );
}

export function ChannelTag({ channel }: { channel: string }) {
  const tone: Record<string, string> = {
    WHATSAPP: "text-emerald-300/80 border-emerald-400/25",
    INSTAGRAM: "text-fuchsia-300/75 border-fuchsia-400/25",
    WEB: "text-sky-300/80 border-sky-400/25",
    VOICE: "text-orange-300/75 border-orange-400/25",
    EMAIL: "text-indigo-300/75 border-indigo-400/25",
    OTA: "text-cyan-300/75 border-cyan-400/25",
    CRM: "text-white/50 border-white/15",
    POS: "text-amber-300/75 border-amber-400/25",
    INTERNAL: "text-white/35 border-white/10",
  };
  return (
    <span
      className={cn(
        "micro-sm shrink-0 border px-1.5 py-[3px] leading-none",
        tone[channel] ?? "text-white/40 border-white/10",
      )}
    >
      {channel}
    </span>
  );
}

export function KeyVal({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/50 py-2 last:border-0">
      <span className="micro-sm text-white/30">{k}</span>
      <span className="font-mono text-[11px] tnum text-white/70">{v}</span>
    </div>
  );
}
