import { useEffect, useState } from "react";
import { AGENT_DEFS, fmtClock, fmtMoney } from "../../system/config";
import { engine } from "../../system/useSystemEngine";
import { csv } from "../../app/admin/utils";
import { cn } from "../../utils/cn";
import type { SystemState } from "../../system/types";
import { KeyVal, Micro } from "../ui";
import { Head } from "./shared";

/* ----------------------------------------------------------------- export */

const EXPORT_STEPS = ["COLLECTING RECORDS", "SERIALISING EVENTS", "PACKAGING BUNDLE", "BUNDLE READY"];

function csvFor(s: SystemState) {
  const leadRows = [
    ["lead_id", "tenant_id", "name", "channel", "intent", "status", "score", "captured_at", "owner"],
    ...s.leads.map((l) => [
      l.id,
      l.tenant_id,
      l.name,
      l.channel,
      l.intent,
      l.status,
      String(l.score),
      new Date(l.ts).toISOString(),
      AGENT_DEFS[l.owner].codename,
    ]),
  ];
  const bookingRows = [
    ["ref", "tenant_id", "guest", "item", "slot", "status", "value_usd", "created_at", "owner"],
    ...s.bookings.map((b) => [
      b.ref,
      b.tenant_id,
      b.guest,
      b.item,
      b.slot,
      b.status,
      String(b.value),
      new Date(b.ts).toISOString(),
      AGENT_DEFS[b.owner].codename,
    ]),
  ];
  const eventRows = [
    ["ts", "tenant_id", "agent", "code", "channel", "severity", "text"],
    ...s.events.map((e) => [
      new Date(e.ts).toISOString(),
      e.tenant_id,
      AGENT_DEFS[e.agent].codename,
      e.code,
      e.channel,
      e.severity,
      e.text,
    ]),
  ];
  return [leadRows, bookingRows, eventRows].map(csv).join("\r\n\r\n");
}

export function ExportBundle({ s, onClose }: { s: SystemState; onClose: () => void }) {
  const [step, setStep] = useState(-1);

  useEffect(() => {
    if (step >= EXPORT_STEPS.length - 1) {
      engine.exportBundle();
      return;
    }
    const t = window.setTimeout(() => setStep((v) => v + 1), 620);
    return () => window.clearTimeout(t);
  }, [step]);

  useEffect(() => {
    setStep(0);
  }, []);

  const ready = step >= EXPORT_STEPS.length - 1;

  const download = () => {
    const blob = new Blob([csvFor(s)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${s.brand.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-operational-bundle.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  return (
    <>
      <Head title="EXPORT · OPERATIONAL BUNDLE" sub="CSV · unencrypted · local only" onClose={onClose} />
      <div className="px-4 py-4">
        <div className="space-y-0">
          {EXPORT_STEPS.map((label, i) => (
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
              <span className={cn("micro flex-1", i <= step ? "text-white/60" : "text-white/22")}>{label}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-px border border-line/90 bg-line/60">
          {[
            ["LEADS", s.leads.length],
            ["BOOKINGS", s.bookings.length],
            ["EVENTS", s.events.length],
          ].map(([k, v]) => (
            <div key={k as string} className="bg-panel px-3 py-2.5">
              <Micro className="text-white/25">{k as string}</Micro>
              <div className="mt-1 font-mono text-[13px] tnum text-white/80">{v as number}</div>
            </div>
          ))}
        </div>

        <div className="mt-4">
          <KeyVal k="RANGE" v={`${fmtClock(s.bootedAt)} → NOW`} />
          <KeyVal k="REVENUE TOUCHED" v={fmtMoney(s.metrics.revenueHandled)} />
          <KeyVal k="FORMAT" v="CSV / UTF-8 / COMMA" />
        </div>
      </div>
      <div className="flex shrink-0 gap-2 border-t border-line/90 px-4 py-3">
        <button
          onClick={download}
          disabled={!ready}
          className={cn(
            "micro flex-1 border py-2.5 transition-colors",
            ready
              ? "border-accent/45 bg-accent-soft text-accent hover:border-accent"
              : "pointer-events-none border-line/90 text-white/20",
          )}
        >
          {ready ? "DOWNLOAD BUNDLE" : "PREPARING…"}
        </button>
        <button
          onClick={onClose}
          className="micro border border-line/90 px-4 py-2.5 text-white/35 transition-colors hover:text-white/70"
        >
          CLOSE
        </button>
      </div>
    </>
  );
}