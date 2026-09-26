import { useEffect, useState } from "react";
import { ActivityStream } from "./components/ActivityStream";
import { AgentPanel } from "./components/AgentPanel";
import { BottomStrip } from "./components/BottomStrip";
import { ControlPanel } from "./components/ControlPanel";
import { Hero } from "./components/Hero";
import { HumanMode } from "./components/HumanMode";
import { Overlay } from "./components/Overlays";
import { TopStatusBar } from "./components/TopStatusBar";
import { Micro } from "./components/ui";
import { ACCENTS, type AccentTheme } from "./system/config";
import { engine, useSystem } from "./system/useSystemEngine";
import { cn } from "./utils/cn";

type Panel = "agents" | "stream" | "control";

const BOOT_LINES = [
  "CORE / TENANT CONSOLE",
  "resolving current workspace",
  "connecting shared mock database",
  "attaching tenant-scoped event bus",
  "loading agent configuration",
  "SYSTEM ACTIVE",
];

export default function OperationsConsole() {
  const s = useSystem();
  const [accent, setAccent] = useState<AccentTheme>(ACCENTS[0]);
  const [panel, setPanel] = useState<Panel>("stream");
  const desktop = useMedia("(min-width: 1024px)");
  const [booting, setBooting] = useState(true);
  const [bootStep, setBootStep] = useState(0);

  useEffect(() => {
    engine.boot();
    return () => engine.stop();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--accent", accent.hex);
    root.style.setProperty("--accent-rgb", accent.rgb);
  }, [accent]);

  useEffect(() => {
    if (bootStep >= BOOT_LINES.length - 1) {
      const t = window.setTimeout(() => setBooting(false), 460);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => setBootStep((v) => v + 1), bootStep === 0 ? 300 : 210);
    return () => window.clearTimeout(t);
  }, [bootStep]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const flip = (o: "leads" | "bookings" | "settings" | "agents_config" | "tools" | "whatsapp" | "export") =>
        engine.setOverlay(engine.getSnapshot().overlay === o ? null : o);
      switch (k) {
        case "t":
          return flip("tools");
        case "a":
          return flip("agents_config");
        case "l":
          return flip("leads");
        case "b":
          return flip("bookings");
        case "w":
          return flip("whatsapp");
        case "e":
          return flip("export");
        case "s":
          return flip("settings");
        case "d":
          return engine.triggerResponse();
        case "h":
          return engine.halt();
        case "m":
          return engine.setMode(engine.getSnapshot().mode === "SYSTEM" ? "HUMAN" : "SYSTEM");
        default:
          return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isHuman = s.mode === "HUMAN";

  return (
    <div className="relative min-h-[100dvh] bg-void">
      <Atmosphere />

      <div className="sticky top-0 z-40">
        <TopStatusBar s={s} />
      </div>

      <main className={cn("relative z-10", !isHuman && "pb-[52px] sm:pb-[58px]")}>
        {isHuman ? (
          <HumanMode s={s} />
        ) : (
          <>
            <Hero s={s} />
            <ConsoleSection
              s={s}
              panel={panel}
              setPanel={setPanel}
              desktop={desktop}
            />
          </>
        )}
      </main>

      {!isHuman && <BottomStrip s={s} />}

      <Overlay s={s} onClose={() => engine.setOverlay(null)} accent={accent} setAccent={setAccent} />

      {booting && <BootSplash step={bootStep} />}
    </div>
  );
}

/* ------------------------------------------------------------ console */

function ConsoleSection({
  s,
  panel,
  setPanel,
  desktop,
}: {
  s: ReturnType<typeof useSystem>;
  panel: Panel;
  setPanel: (p: Panel) => void;
  desktop: boolean;
}) {
  return (
    <section id="console" className="scroll-mt-[57px]">
      {/* section rule */}
      <div className="flex items-center gap-3 border-y border-line/70 bg-shell/60 px-3 py-2 lg:px-4">
        <Micro className="text-accent/70">SECTION 02</Micro>
        <span className="h-px flex-1 bg-line/70" />
        <Micro className="text-white/40">OPERATIONS CONSOLE</Micro>
        <span className="h-px flex-1 bg-line/70" />
        <Micro className="hidden text-white/25 sm:block">TENANT-SCOPED MOCK RUNTIME</Micro>
      </div>

      {/* mobile panel tabs */}
      <nav className="sticky top-[99px] z-20 flex border-b border-line/90 bg-shell/95 backdrop-blur-xl lg:hidden">
        {(
          [
            { id: "agents", label: "AGENTS" },
            { id: "stream", label: "ACTIVITY" },
            { id: "control", label: "CONTROL" },
          ] as { id: Panel; label: string }[]
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setPanel(t.id)}
            className={cn(
              "micro flex-1 border-r border-line/70 py-3 transition-colors last:border-r-0",
              panel === t.id ? "bg-accent-soft text-accent" : "text-white/30",
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="flex h-[calc(100dvh-99px-52px)] min-h-[420px] flex-col gap-px bg-line/60 p-px lg:h-[calc(100dvh-57px-52px)] lg:min-h-[520px] lg:flex-row lg:gap-2 lg:bg-transparent lg:p-3">
        <div
          className={cn(
            "min-h-0 min-w-0 border border-line/90 lg:w-[286px] lg:shrink-0 xl:w-[312px]",
            desktop ? "block" : panel === "agents" ? "block" : "hidden",
          )}
        >
          <AgentPanel s={s} />
        </div>

        <div
          className={cn(
            "min-h-0 min-w-0 flex-1 border border-line/90",
            desktop ? "block" : panel === "stream" ? "block" : "hidden",
          )}
        >
          <ActivityStream s={s} />
        </div>

        <div
          className={cn(
            "min-h-0 min-w-0 border border-line/90 lg:w-[292px] lg:shrink-0 xl:w-[318px]",
            desktop ? "block" : panel === "control" ? "block" : "hidden",
          )}
        >
          <ControlPanel s={s} />
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- chrome */

function BootSplash({ step }: { step: number }) {
  return (
    <div
      className={cn(
        "fixed inset-0 z-[60] grid place-items-center bg-void transition-opacity duration-500",
        step >= BOOT_LINES.length - 1 && "pointer-events-none opacity-0",
      )}
    >
      <div className="w-[min(380px,82vw)]">
        <div className="flex items-center gap-2.5">
          <span className="h-1.5 w-1.5 animate-blink bg-accent" />
          <span className="micro text-accent">OPERATIONS KERNEL</span>
        </div>
        <div className="mt-4 space-y-1.5">
          {BOOT_LINES.slice(0, step + 1).map((l, i) => (
            <div
              key={l}
              className="micro-sm animate-event-in text-white/35"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              {l}
            </div>
          ))}
        </div>
        <div className="mt-5 h-[2px] w-full overflow-hidden bg-white/[0.06]">
          <div
            className="h-full bg-accent transition-[width] duration-300 ease-out"
            style={{ width: `${((step + 1) / BOOT_LINES.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function Atmosphere() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-60" />
      <div
        className="absolute -left-40 -top-40 h-[420px] w-[420px] animate-drift rounded-full opacity-70 blur-3xl"
        style={{
          background: "radial-gradient(circle, rgb(var(--accent-rgb) / 0.10), transparent 68%)",
        }}
      />
      <div
        className="absolute -bottom-52 right-0 h-[460px] w-[460px] animate-drift rounded-full blur-3xl"
        style={{
          background: "radial-gradient(circle, rgb(var(--accent-rgb) / 0.07), transparent 70%)",
          animationDelay: "-6s",
        }}
      />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
    </div>
  );
}

function useMedia(query: string) {
  const [matches, setMatches] = useState(() =>
    typeof window === "undefined" ? true : window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return matches;
}
