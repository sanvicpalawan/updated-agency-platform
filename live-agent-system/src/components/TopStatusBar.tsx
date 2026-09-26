import { AGENT_ORDER, AUTONOMY_LABELS, dur, fmtClock, rel } from "../system/config";
import { engine } from "../system/useSystemEngine";
import { cn } from "../utils/cn";
import type { SystemState } from "../system/types";
import { Micro, useNow } from "./ui";

export function TopStatusBar({ s }: { s: SystemState }) {
  const now = useNow(1000);
  const human = s.mode === "HUMAN";
  const online = AGENT_ORDER.filter((a) => ["ACTIVE", "PROCESSING"].includes(s.agents[a].status)).length;
  const last = s.events[0]?.ts ?? now;
  const live = !s.halted;

  return (
    <header className="relative z-40 shrink-0 border-b border-line/90 bg-shell/95 backdrop-blur-xl lg:flex lg:h-[57px] lg:items-stretch">
      {/* Identity + Tenant Switcher */}
      <div className="flex h-[57px] min-w-0 items-center justify-between gap-2 border-b border-line/70 px-3 lg:h-auto lg:w-[286px] lg:shrink-0 lg:justify-start lg:border-b-0 lg:border-r lg:pr-4 xl:w-[312px]">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="relative grid h-7 w-7 shrink-0 place-items-center border border-accent/30 bg-accent-soft">
            <span className="h-1.5 w-1.5 bg-accent" />
            <span className="absolute -right-px -top-px h-1.5 w-1.5 border-r border-t border-accent/60" />
          </span>
          <div className="min-w-0 flex-1">
            {s.tenantsList.length > 1 ? (
              <select
                aria-label="Switch tenant workspace"
                value={s.tenant_id ?? ""}
                onChange={(e) => engine.switchTenant(e.target.value)}
                className="w-full cursor-pointer truncate bg-transparent font-mono text-[12px] leading-none tracking-[0.08em] text-white/95 outline-none"
              >
                {s.tenantsList.map((t) => (
                  <option key={t.id} value={t.id} className="bg-panel text-white">
                    {t.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="truncate font-mono text-[12px] leading-none tracking-[0.08em] text-white/90">
                {s.brand.name}
              </div>
            )}
            <div className="micro-sm mt-1.5 truncate text-white/25">
              {human ? s.brand.property : s.brand.type}
            </div>
          </div>
        </div>
        <div className="shrink-0 lg:hidden">
          <ModeSwitch mode={s.mode} />
        </div>
      </div>

      {/* System status */}
      <div className={cn("flex min-h-[42px] min-w-0 items-center gap-3 overflow-hidden px-3 py-1.5 lg:min-h-0 lg:flex-1 lg:py-0", human ? "lg:gap-3" : "lg:gap-5")}>
        {human ? (
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                live ? "animate-pulse-ring bg-accent" : "bg-amber-400",
              )}
            />
            <span className={cn("micro", live ? "text-accent" : "text-amber-300")}>
              {live ? "OPERATIONS RUNNING" : "OPERATIONS PAUSED"}
            </span>
          </div>
        ) : (
          <>
            <button onClick={() => engine.halt()} className="group flex shrink-0 items-center gap-2.5 text-left">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  live ? "animate-pulse-ring bg-accent" : "bg-amber-400",
                )}
              />
              <span className={cn("micro hidden text-glow sm:block", live ? "text-accent" : "text-amber-300")}>
                {live ? "LIVE SYSTEM ACTIVE" : "SYSTEM HALTED"}
              </span>
              <span className="micro-sm text-white/35 transition group-hover:text-white/70 sm:text-white/20">
                {live ? "HALT" : "RESUME"}
              </span>
            </button>

            <Sep />
            <div className="hidden sm:block">
              <Stat label="AGENTS ONLINE" value={`${online}/3`} accent={online === 3} />
            </div>
            <Sep className="hidden sm:block" />
            <div className="hidden md:block">
              <Stat
                label="TOOLS ACTIVE"
                value={`${s.tools.filter((t) => t.enabled).length}/4`}
                accent
              />
            </div>
            <Sep className="hidden xl:block" />
            <div className="hidden xl:block">
              <Stat label="LAST ACTIVITY" value={fmtClock(last)} sub={rel(last, now)} />
            </div>
            <Sep className="hidden xl:block" />
            <div className="hidden xl:block">
              <Stat label="UPTIME" value={dur(now - s.bootedAt)} />
            </div>
          </>
        )}

        {!human && (
          <div className="hidden shrink-0 items-center gap-2 border border-line/90 px-2 py-1.5 xl:flex">
            <Micro className="text-white/25">AUTONOMY</Micro>
            <span className="micro text-white/70">L{s.autonomy}</span>
            <span className="micro-sm text-white/25">{AUTONOMY_LABELS[s.autonomy].label}</span>
          </div>
        )}
      </div>

      <div className="ml-auto hidden shrink-0 items-center gap-2 border-l border-line/70 bg-shell px-3 lg:flex">
        <Micro className="text-white/40">VIEW</Micro>
        <ModeSwitch mode={s.mode} />
      </div>
    </header>
  );
}

function ModeSwitch({ mode }: { mode: SystemState["mode"] }) {
  const options = [
    { value: "HUMAN", label: "HUMAN", title: "Simple client outcome summary" },
    { value: "SYSTEM", label: "AGENT / SYSTEM", title: "Live agent operations console" },
  ] as const;

  return (
    <div
      className="flex shrink-0 items-center border border-accent/30 bg-void/70 p-[3px]"
      role="group"
      aria-label="Choose interface"
    >
      {options.map(({ value, label, title }) => (
        <button
          key={value}
          onClick={() => engine.setMode(value)}
          aria-pressed={mode === value}
          title={title}
          className={cn(
            "micro whitespace-nowrap px-2 py-2 text-[8px] transition-colors duration-200 sm:px-2.5 sm:text-[9px]",
            mode === value
              ? "bg-accent text-void shadow-[0_0_12px_-5px_var(--accent)]"
              : "text-white/60 hover:bg-white/[0.06] hover:text-white",
          )}
        >
          {label}
        </button>
      ))}
      <a
        href="#/admin/dashboard"
        title="Open multi-tenant Admin Studio"
        className="micro whitespace-nowrap border-l border-line/80 px-2 py-2 text-[8px] text-white/65 transition-colors hover:bg-white/[0.06] hover:text-accent sm:px-2.5 sm:text-[9px]"
      >
        ADMIN
      </a>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="leading-tight">
      <Micro className="whitespace-nowrap text-white/25">{label}</Micro>
      <div
        className={cn("mt-1 whitespace-nowrap font-mono text-[11px] tnum", accent ? "text-accent" : "text-white/80")}
      >
        {value}
        {sub && <span className="ml-2 text-white/25">{sub}</span>}
      </div>
    </div>
  );
}

function Sep({ className }: { className?: string }) {
  return <span className={cn("hidden h-6 w-px shrink-0 bg-line/80 lg:block", className)} />;
}
