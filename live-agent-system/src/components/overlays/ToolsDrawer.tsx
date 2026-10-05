import { useState } from "react";
import { engine } from "../../system/useSystemEngine";
import { cn } from "../../utils/cn";
import type { SystemState } from "../../system/types";
import { Micro } from "../ui";
import { Head } from "./shared";

/* ------------------------------------------------------ tools & outcomes */

export function ToolsDrawer({ s }: { s: SystemState }) {
  const [copied, setCopied] = useState(false);

  const clientSummary = [
    `${s.brand.name} — Client Outcomes & Connected Tools Summary`,
    `--------------------------------------------------------`,
    ...s.tools.map((t) => `• ${t.name} (${t.assignedAgents.map((a) => a.toUpperCase()).join("+")}): ${t.outcomeText}`),
    `--------------------------------------------------------`,
    `Automation Coverage: ${Math.round(s.metrics.automationCoverage)}% | Avg Response: ${s.metrics.avgResponseSec}s`,
  ].join("\n");

  const copyClientSummary = async () => {
    try {
      await navigator.clipboard.writeText(clientSummary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* ignore */ }
  };

  return (
    <>
      <Head
        title="TOOLS & CLIENT OUTCOMES"
        sub="How Agents → Tools → Client Outcomes connect"
        onClose={() => engine.setOverlay(null)}
      />
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <div className="border border-accent/30 bg-accent-soft p-3">
          <Micro className="text-accent">WHAT ARE THE SYSTEM TOOLS?</Micro>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-white/70">
            Each agent (TALA, NYX, HERMES) is wired to 4 operational tools. When an agent runs, it invokes its connected tool and records a measurable client outcome below.
          </p>
        </div>

        {s.tools.map((tool) => (
          <div key={tool.id} className="border border-line/90 bg-void/40 p-3.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <Micro className="text-white/30">{tool.category}</Micro>
                <h3 className="mt-1 font-mono text-[13px] text-white/90">{tool.name}</h3>
              </div>
              <button
                onClick={() => engine.toggleTool(tool.id, !tool.enabled)}
                className={cn(
                  "micro-sm border px-2 py-1",
                  tool.enabled ? "border-accent/50 bg-accent-soft text-accent" : "border-line text-white/30",
                )}
              >
                {tool.enabled ? "ENABLED" : "DISABLED"}
              </button>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <span className="micro-sm text-white/25">AGENTS:</span>
              {tool.assignedAgents.map((ag) => (
                <span key={ag} className="micro-sm border border-line/80 bg-white/[0.03] px-1.5 py-0.5 text-white/70">
                  {ag.toUpperCase()}
                </span>
              ))}
              <span className="micro-sm ml-auto text-white/30">{tool.webhookUrl}</span>
            </div>

            <div className="mt-3 border-t border-line/60 pt-2.5 flex items-center justify-between gap-2">
              <div>
                <Micro className="text-white/25">CLIENT OUTCOME</Micro>
                <div className="mt-1 font-mono text-[12px] text-accent">{tool.outcomeText}</div>
              </div>
              <button
                onClick={() => engine.runTool(tool.id)}
                disabled={!tool.enabled}
                className="micro border border-line/90 px-2.5 py-1.5 text-white/60 transition-colors hover:border-accent/50 hover:text-accent disabled:opacity-30"
              >
                TEST TOOL ▶
              </button>
            </div>
          </div>
        ))}

        <div className="border border-line/90 p-3.5">
          <div className="flex items-center justify-between">
            <Micro className="text-white/45">SHARE OUTCOMES WITH CLIENT</Micro>
            <button onClick={copyClientSummary} className="micro text-accent hover:underline">
              {copied ? "COPIED TO CLIPBOARD ✓" : "COPY CLIENT REPORT"}
            </button>
          </div>
          <pre className="mt-2.5 overflow-x-auto border border-line/70 bg-void/70 p-2.5 font-mono text-[10.5px] leading-relaxed text-white/65">
            {clientSummary}
          </pre>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-line/90 px-4 py-2.5">
        <a href="#/admin/tools" className="micro text-accent hover:underline">
          OPEN FULL TOOLS STUDIO IN ADMIN →
        </a>
        <button onClick={copyClientSummary} className="micro border border-accent/45 bg-accent-soft px-3 py-1.5 text-accent">
          {copied ? "COPIED ✓" : "SHARE WITH CLIENT"}
        </button>
      </div>
    </>
  );
}