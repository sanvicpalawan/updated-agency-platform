import { useEffect, useMemo, useState } from "react";
import { engine } from "../../system/useSystemEngine";
import { cn } from "../../utils/cn";
import type { SystemState } from "../../system/types";
import { Micro } from "../ui";
import { Head } from "./shared";

/* --------------------------------------------------------------- whatsapp */

function QRBlock({ seed }: { seed: number }) {
  const cells = useMemo(() => {
    const n = 21;
    let x = seed || 1;
    const rand = () => {
      x = (x * 1103515245 + 12345) & 0x7fffffff;
      return x / 0x7fffffff;
    };
    const grid: boolean[] = [];
    for (let i = 0; i < n * n; i++) grid.push(rand() > 0.52);
    const finder = (r: number, c: number) => {
      for (let dr = 0; dr < 7; dr++)
        for (let dc = 0; dc < 7; dc++) {
          const edge = dr === 0 || dr === 6 || dc === 0 || dc === 6;
          const core = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
          grid[(r + dr) * n + (c + dc)] = edge || core;
        }
    };
    finder(0, 0);
    finder(0, n - 7);
    finder(n - 7, 0);
    return { grid, n };
  }, [seed]);

  return (
    <div className="grid gap-[1px] bg-void p-3" style={{ gridTemplateColumns: `repeat(${cells.n}, 1fr)` }}>
      {cells.grid.map((on, i) => (
        <span
          key={i}
          className="aspect-square"
          style={{ background: on ? "rgba(255,255,255,0.88)" : "transparent" }}
        />
      ))}
    </div>
  );
}

const WA_STEPS = ["MOCK DEVICE LINK", "SIMULATED HANDSHAKE", "LOCAL QUEUE", "MOCK CHANNEL ENABLED"];

export function WhatsAppConnect({ s, onClose }: { s: SystemState; onClose: () => void }) {
  const wa = s.channels.find((c) => c.id === "whatsapp");
  const [step, setStep] = useState(wa?.connected ? 3 : 0);
  const [seed] = useState(() => Math.floor(Math.random() * 1e6) + 7);

  useEffect(() => {
    if (step === 0 || step >= 3) return;
    const t = window.setTimeout(() => {
      if (step === 2) engine.connectWhatsApp();
      setStep((v) => v + 1);
    }, 1500);
    return () => window.clearTimeout(t);
  }, [step]);

  return (
    <>
      <Head title="WHATSAPP / MOCK CONNECTION" sub="Interface demo only. No WhatsApp account is connected." onClose={onClose} />
      <div className="px-4 py-4">
        {step < 3 ? (
          <>
            <div className="mx-auto w-44 border border-line bg-white/[0.02] p-1">
              <QRBlock seed={seed} />
            </div>
            <p className="mt-3 text-center text-[11px] leading-relaxed text-white/40">
              This is a non-scannable placeholder, not a device-link code.
              Simulate the connection to update this tenant&apos;s local channel settings.
            </p>
            <div className="mt-4 flex items-center justify-center gap-2 border border-line/90 bg-void/60 py-2.5">
              <Micro className="text-white/25">DEMO CODE</Micro>
              <span className="font-mono text-[13px] tracking-[0.28em] text-accent">
                {String(seed).slice(0, 4)}-{String(seed).slice(-4)}
              </span>
            </div>
          </>
        ) : (
          <div className="py-4 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center border border-accent/40 bg-accent-soft">
              <span className="text-2xl text-accent">✓</span>
            </div>
            <h3 className="mt-4 font-mono text-[13px] tracking-[0.14em] text-accent">MOCK CHANNEL ENABLED</h3>
            <p className="mx-auto mt-2 max-w-[300px] text-[11.5px] leading-relaxed text-white/45">
              The channel is enabled in this tenant&apos;s local configuration. Messages remain in
              the mock outbox. No credentials have been exchanged and no real messages are sent.
            </p>
          </div>
        )}

        <div className="mt-5 space-y-0">
          {WA_STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-3 border-t border-line/60 py-2.5 first:border-0">
              <span
                className={cn(
                  "grid h-4 w-4 shrink-0 place-items-center border text-[9px] font-mono",
                  i < step
                    ? "border-accent/50 bg-accent-soft text-accent"
                    : i === step
                      ? "animate-blink border-accent/60 text-accent"
                      : "border-line text-white/20",
                )}
              >
                {i < step ? "✓" : i + 1}
              </span>
              <span className={cn("micro flex-1", i <= step ? "text-white/60" : "text-white/22")}>
                {label}
              </span>
              <span className="micro-sm text-white/20">
                {i < step ? "COMPLETE" : i === step ? "RUNNING" : "QUEUED"}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex shrink-0 gap-2 border-t border-line/90 px-4 py-3">
        {step < 3 ? (
          <>
            <button
              onClick={() => setStep(1)}
              className="micro flex-1 border border-accent/45 bg-accent-soft py-2.5 text-accent transition-colors hover:border-accent"
            >
              SIMULATE DEVICE LINK
            </button>
            <button
              onClick={onClose}
              className="micro border border-line/90 px-4 py-2.5 text-white/35 transition-colors hover:text-white/70"
            >
              CANCEL
            </button>
          </>
        ) : (
          <button
            onClick={onClose}
            className="micro flex-1 border border-accent/45 bg-accent-soft py-2.5 text-accent transition-colors hover:border-accent"
          >
            RETURN TO CONSOLE
          </button>
        )}
      </div>
    </>
  );
}