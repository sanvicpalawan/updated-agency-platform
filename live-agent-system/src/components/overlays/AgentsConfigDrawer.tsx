import { useEffect, useMemo, useState } from "react";
import { AGENT_DEFS } from "../../system/config";
import { findModel, timeAgo, useOpenRouterCatalog } from "../../services/openrouter";
import { engine } from "../../system/useSystemEngine";
import { cn } from "../../utils/cn";
import type { SystemState } from "../../system/types";
import type { BehaviorTone } from "../../types/database";
import { Micro } from "../ui";
import { Head, Section } from "./shared";

/* --------------------------------------------- agent & openrouter cfg */

export function AgentsConfigDrawer({ s }: { s: SystemState }) {
  const catalog = useOpenRouterCatalog();
  const [selectedAgent, setSelectedAgent] = useState<"tala" | "nyx" | "hermes">("tala");
  const [apiKey, setApiKey] = useState(s.openrouterApiKey);
  const [query, setQuery] = useState("");
  const agentState = s.agents[selectedAgent];
  const [modelTier, setModelTier] = useState<"free" | "paid">(agentState.modelTier ?? "free");
  const [modelId, setModelId] = useState(agentState.modelId ?? catalog.models[0]?.id ?? "");
  const [tone, setTone] = useState<BehaviorTone>((agentState.tone as BehaviorTone) ?? "hospitality");
  const [prompt, setPrompt] = useState(agentState.systemPrompt ?? "");

  useEffect(() => {
    const cur = s.agents[selectedAgent];
    setModelTier(cur.modelTier ?? "free");
    setModelId(cur.modelId ?? catalog.models[0]?.id ?? "");
    setTone((cur.tone as BehaviorTone) ?? "hospitality");
    setPrompt(cur.systemPrompt ?? "");
    setQuery("");
  }, [selectedAgent, s.agents]);

  const freeModels = useMemo(() => catalog.models.filter((m) => m.tier === "free"), [catalog.models]);
  const paidModels = useMemo(() => catalog.models.filter((m) => m.tier === "paid"), [catalog.models]);
  const visible = useMemo(() => {
    const pool = modelTier === "free" ? freeModels : paidModels;
    const q = query.trim().toLowerCase();
    if (!q) return pool.slice(0, 80);
    return pool.filter((m) => `${m.label} ${m.id} ${m.provider}`.toLowerCase().includes(q)).slice(0, 80);
  }, [modelTier, freeModels, paidModels, query]);
  const selectedModel = findModel(catalog.models, modelId);

  const saveAgent = () => {
    if (apiKey !== s.openrouterApiKey) {
      engine.setOpenRouterKey(apiKey);
    }
    engine.updateAgentSettings(selectedAgent, {
      openrouter: {
        enabled: true,
        model_tier: modelTier,
        model_id: modelId,
      },
      behavior: {
        tone,
        system_prompt: prompt,
      },
    });
  };

  return (
    <>
      <Head
        title="AGENT & OPENROUTER SETTINGS"
        sub="Free & Paid OpenRouter models + Behavioral settings for all agents"
        onClose={() => engine.setOverlay(null)}
      />
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <Section label="WORKSPACE OPENROUTER API KEY">
          <div className="py-2.5">
            <Micro className="text-white/25">SHARED OPENROUTER KEY (FREE & PAID MODELS)</Micro>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-…"
              autoComplete="off"
              spellCheck={false}
              className="mt-2 w-full border border-line bg-void/60 px-3 py-2 font-mono text-[12px] text-white/90 outline-none focus:border-accent/60"
            />
            <p className="micro-sm mt-1.5 text-white/25">
              Stored in this browser&apos;s localStorage for this tenant. Demo build only — see SECURITY.md.
            </p>
          </div>
        </Section>

        <div className="flex gap-1">
          {(["tala", "nyx", "hermes"] as const).map((id) => (
            <button
              key={id}
              onClick={() => setSelectedAgent(id)}
              className={cn(
                "micro flex-1 border py-2.5 transition-colors",
                selectedAgent === id
                  ? "border-accent/50 bg-accent-soft text-accent"
                  : "border-line/90 text-white/35 hover:text-white/70",
              )}
            >
              {AGENT_DEFS[id].codename}
            </button>
          ))}
        </div>

        <Section label={`${AGENT_DEFS[selectedAgent].codename} · LIVE OPENROUTER CATALOG`}>
          <div className="py-3 space-y-3">
            {/* Sync status + refresh — green light, daily */}
            <div className="flex items-center gap-2 border border-line/80 bg-void/50 px-2.5 py-2">
              <span
                className={cn("h-2 w-2 rounded-full", catalog.health === "live" ? "bg-accent animate-pulse" : catalog.health === "loading" ? "bg-white/40 animate-pulse" : "bg-amber-400")}
                style={catalog.health === "live" ? { boxShadow: "0 0 8px var(--accent)" } : undefined}
              />
              <div className="min-w-0 flex-1">
                <div className="micro text-white/70">
                  {catalog.health === "live" ? `${catalog.total} MODELS · LIVE` : catalog.health === "loading" ? "REFRESHING…" : "FALLBACK LIST"}
                </div>
                <div className="micro-sm mt-0.5 text-white/30">
                  {catalog.fetchedAt ? `synced ${timeAgo(catalog.fetchedAt)} · daily auto-refresh` : "tap refresh to sync"} · {catalog.freeCount} free / {catalog.paidCount} paid
                </div>
              </div>
              <button
                onClick={() => catalog.refresh(true)}
                disabled={catalog.loading}
                className="micro shrink-0 border border-accent/45 bg-accent-soft px-2.5 py-1.5 text-accent disabled:opacity-50"
              >
                {catalog.loading ? "SYNC…" : "↻ REFRESH"}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setModelTier("free");
                  if (freeModels[0]) setModelId(freeModels[0].id);
                }}
                className={cn(
                  "border p-2.5 text-left",
                  modelTier === "free" ? "border-accent/55 bg-accent-soft text-accent" : "border-line text-white/40",
                )}
              >
                <span className="micro block">FREE ({freeModels.length})</span>
                <span className="micro-sm mt-1 block text-white/30">$0 · live catalog</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setModelTier("paid");
                  if (paidModels[0]) setModelId(paidModels[0].id);
                }}
                className={cn(
                  "border p-2.5 text-left",
                  modelTier === "paid" ? "border-amber-400/55 bg-amber-400/10 text-amber-300" : "border-line text-white/40",
                )}
              >
                <span className="micro block">PAID ({paidModels.length})</span>
                <span className="micro-sm mt-1 block text-white/30">metered · live catalog</span>
              </button>
            </div>

            <div>
              <Micro className="text-white/25">SEARCH {modelTier.toUpperCase()} MODELS</Micro>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${visible.length} ${modelTier} models…`}
                className="mt-1.5 w-full border border-line bg-void/70 px-2.5 py-2 font-mono text-[11.5px] text-white/85 outline-none placeholder:text-white/25"
              />
            </div>

            <div className="max-h-56 overflow-y-auto border border-line/80 scroll-thin">
              {visible.length === 0 && (
                <div className="px-3 py-4 text-center font-mono text-[11px] text-white/30">
                  No matches — try another search or refresh.
                </div>
              )}
              {visible.map((m) => (
                <button
                  key={m.id}
                  onClick={() => { setModelId(m.id); setModelTier(m.tier); }}
                  className={cn(
                    "flex w-full items-start gap-2 border-b border-line/50 px-2.5 py-2 text-left last:border-0",
                    modelId === m.id ? "bg-accent-soft" : "hover:bg-white/[0.03]",
                  )}
                >
                  <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full border", modelId === m.id ? "border-accent bg-accent" : "border-white/25")} />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate font-mono text-[11.5px]", modelId === m.id ? "text-accent" : "text-white/85")}>{m.label}</span>
                    <span className="micro-sm mt-0.5 block truncate text-white/30">{m.id}</span>
                    <span className="micro-sm mt-0.5 block text-white/25">{m.provider} · {m.context_window} · {m.cost_label}</span>
                  </span>
                </button>
              ))}
            </div>
            {selectedModel && (
              <div className="micro-sm text-white/35">
                SELECTED: <span className="text-accent">{selectedModel.id}</span>
              </div>
            )}
          </div>
        </Section>

        <Section label={`${AGENT_DEFS[selectedAgent].codename} · BEHAVIORAL SETTINGS`}>
          <div className="py-3 space-y-3">
            <label className="block">
              <Micro className="text-white/25">COMMUNICATION TONE</Micro>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value as BehaviorTone)}
                className="mt-1.5 w-full border border-line bg-void/70 px-2.5 py-2 font-mono text-[11.5px] text-white/85 outline-none"
              >
                <option value="hospitality" className="bg-panel">Warm &amp; Hospitality-First</option>
                <option value="concise" className="bg-panel">Direct &amp; Concise</option>
                <option value="executive" className="bg-panel">Executive &amp; Operational</option>
                <option value="persuasive" className="bg-panel">Conversion &amp; Sales-Focused</option>
                <option value="custom" className="bg-panel">Custom Persona</option>
              </select>
            </label>

            <label className="block">
              <Micro className="text-white/25">SYSTEM BEHAVIORAL PROMPT</Micro>
              <textarea
                rows={4}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="mt-1.5 w-full border border-line bg-void/70 p-2.5 font-mono text-[11.5px] leading-relaxed text-white/85 outline-none focus:border-accent/60"
              />
            </label>
          </div>
        </Section>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-line/90 px-4 py-3">
        <a href="#/admin/agents" className="micro text-white/40 hover:text-accent">
          FULL ADMIN AGENT STUDIO →
        </a>
        <button
          onClick={saveAgent}
          className="micro border border-accent/45 bg-accent-soft px-4 py-2 text-accent hover:border-accent"
        >
          SAVE {AGENT_DEFS[selectedAgent].codename} SETTINGS
        </button>
      </div>
    </>
  );
}