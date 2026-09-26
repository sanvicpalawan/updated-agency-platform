import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ACCENTS, AGENT_DEFS, BUSINESS_TYPES, fmtClock, fmtMoney, rel } from "../system/config";
import { findModel, timeAgo, useOpenRouterCatalog } from "../services/openrouter";
import { engine } from "../system/useSystemEngine";
import { csv } from "../app/admin/utils";
import { cn } from "../utils/cn";
import type { AccentTheme } from "../system/config";
import type { Lead, LeadStatus, SystemState } from "../system/types";
import type { BehaviorTone, Channel as DbChannel } from "../types/database";
import { Bar, ChannelTag, Dot, KeyVal, Micro } from "./ui";

/* ------------------------------------------------------------------ shell */

export function Overlay({
  s,
  onClose,
  accent,
  setAccent,
}: {
  s: SystemState;
  onClose: () => void;
  accent: AccentTheme;
  setAccent: (a: AccentTheme) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!s.overlay) return null;
  const modal = s.overlay === "whatsapp" || s.overlay === "export";

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
      <button
        aria-label="Close overlay"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-[3px]"
      />
      {modal ? (
        <div className="relative m-auto w-[calc(100%-2rem)] max-w-md animate-event-in border border-line bg-panel shadow-[0_40px_120px_-20px_rgba(0,0,0,0.9)]">
          {s.overlay === "whatsapp" && <WhatsAppConnect s={s} onClose={onClose} />}
          {s.overlay === "export" && <ExportBundle s={s} onClose={onClose} />}
        </div>
      ) : (
        <aside className="relative ml-auto flex h-full w-full max-w-[560px] animate-event-in flex-col border-l border-line bg-panel shadow-[-40px_0_120px_-30px_rgba(0,0,0,0.9)]">
          {s.overlay === "leads" && <LeadsDrawer s={s} />}
          {s.overlay === "bookings" && <BookingsDrawer s={s} />}
          {s.overlay === "tools" && <ToolsDrawer s={s} />}
          {s.overlay === "agents_config" && <AgentsConfigDrawer s={s} />}
          {s.overlay === "settings" && <SettingsDrawer s={s} accent={accent} setAccent={setAccent} />}
        </aside>
      )}
    </div>
  );
}

function Head({ title, sub, onClose }: { title: string; sub: string; onClose: () => void }) {
  return (
    <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line/90 px-4 py-3">
      <div>
        <h2 className="micro text-white/70">{title}</h2>
        <p className="micro-sm mt-1.5 text-white/25">{sub}</p>
      </div>
      <button
        onClick={onClose}
        className="micro border border-line/90 px-2 py-1.5 text-white/35 transition-colors hover:border-white/25 hover:text-white/70"
      >
        ESC ✕
      </button>
    </header>
  );
}

/* ----------------------------------------------------- tools & outcomes */

function ToolsDrawer({ s }: { s: SystemState }) {
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

/* --------------------------------------------- agent & openrouter cfg */

function AgentsConfigDrawer({ s }: { s: SystemState }) {
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
              placeholder="sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="mt-2 w-full border border-line bg-void/60 px-3 py-2 font-mono text-[12px] text-white/90 outline-none focus:border-accent/60"
            />
            <p className="micro-sm mt-1.5 text-white/25">
              Stored in tenant config for GitHub / backend deployment.
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
                <option value="hospitality" className="bg-panel">Warm & Hospitality-First</option>
                <option value="concise" className="bg-panel">Direct & Concise</option>
                <option value="executive" className="bg-panel">Executive & Operational</option>
                <option value="persuasive" className="bg-panel">Conversion & Sales-Focused</option>
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

/* ------------------------------------------------------------------ leads */

const LEAD_TABS: (LeadStatus | "ALL")[] = ["ALL", "NEW", "QUALIFIED", "BOOKED", "NURTURE", "CLOSED"];

function LeadsDrawer({ s }: { s: SystemState }) {
  const [tab, setTab] = useState<LeadStatus | "ALL">("ALL");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [channel, setChannel] = useState<DbChannel>("Website");
  const [inquiry, setInquiry] = useState("");

  const rows = s.leads.filter((l) => tab === "ALL" || l.status === tab);

  const addLead = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    engine.createLead({ name, email, channel, inquiry: inquiry || "Availability inquiry" });
    setName("");
    setEmail("");
    setInquiry("");
    setAdding(false);
  };

  return (
    <>
      <Head
        title="LEAD RECORDS · CRM (ADD / EDIT / DELETE)"
        sub={`${s.leads.length} records · Tool: Lead Capture & CRM`}
        onClose={() => engine.setOverlay(null)}
      />
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-1 border-b border-line/70 px-4 py-2">
        <div className="flex flex-wrap gap-1">
          {LEAD_TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "micro-sm border px-1.5 py-1 leading-none transition-colors",
                tab === t
                  ? "border-accent/45 bg-accent-soft text-accent"
                  : "border-transparent text-white/25 hover:text-white/60",
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <button
          onClick={() => setAdding(!adding)}
          className="micro-sm border border-accent/45 bg-accent-soft px-2 py-1 text-accent"
        >
          {adding ? "CANCEL" : "+ ADD LEAD"}
        </button>
      </div>

      {adding && (
        <form onSubmit={addLead} className="space-y-2 border-b border-line bg-void/60 px-4 py-3">
          <div className="grid grid-cols-2 gap-2">
            <input
              required
              placeholder="Lead full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border border-line bg-panel px-2.5 py-1.5 text-[12px] text-white outline-none"
            />
            <input
              required
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border border-line bg-panel px-2.5 py-1.5 text-[12px] text-white outline-none"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as DbChannel)}
              className="border border-line bg-panel px-2 py-1.5 text-[11px] text-white/80 outline-none"
            >
              <option value="Website">Website</option>
              <option value="WhatsApp">WhatsApp</option>
              <option value="Instagram">Instagram</option>
              <option value="Email">Email</option>
            </select>
            <input
              placeholder="Inquiry summary..."
              value={inquiry}
              onChange={(e) => setInquiry(e.target.value)}
              className="flex-1 border border-line bg-panel px-2.5 py-1.5 text-[12px] text-white outline-none"
            />
            <button type="submit" className="micro border border-accent/50 bg-accent-soft px-3 py-1.5 text-accent">
              SAVE
            </button>
          </div>
        </form>
      )}

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {rows.map((l) => (
          <LeadRow key={l.id} l={l} now={Date.now()} />
        ))}
        {rows.length === 0 && (
          <div className="grid h-24 place-items-center">
            <Micro className="text-white/20">NO RECORDS IN THIS STATE</Micro>
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center justify-between border-t border-line/90 px-4 py-2.5">
        <a href="#/admin/leads" className="micro text-white/40 hover:text-accent">
          OPEN FULL LEADS CRUD TABLE →
        </a>
        <button
          onClick={() => engine.setOverlay("export")}
          className="micro text-accent hover:underline"
        >
          EXPORT SET →
        </button>
      </div>
    </>
  );
}

const LEAD_TONE: Record<LeadStatus, string> = {
  NEW: "text-accent border-accent/35 bg-accent-soft",
  QUALIFIED: "text-sky-300 border-sky-400/30 bg-sky-400/10",
  BOOKED: "text-emerald-300 border-emerald-400/30 bg-emerald-400/10",
  NURTURE: "text-violet-300 border-violet-400/30 bg-violet-400/10",
  CLOSED: "text-white/30 border-white/12 bg-white/[0.03]",
};

function LeadRow({ l, now }: { l: Lead; now: number }) {
  return (
    <div className="group border-b border-line/50 px-4 py-3 transition-colors hover:bg-white/[0.02]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] text-white/85">{l.name}</span>
            <ChannelTag channel={l.channel} />
          </div>
          <p className="mt-1 truncate text-[11px] text-white/40">{l.intent}</p>
        </div>
        <span className={cn("micro-sm shrink-0 border px-1.5 py-1 leading-none", LEAD_TONE[l.status])}>
          {l.status}
        </span>
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <span className="w-20 shrink-0">
          <Bar value={l.score} tone={l.score > 70 ? "accent" : "warn"} />
        </span>
        <span className="micro-sm text-white/30">SCORE {l.score}</span>
        <span className="micro-sm text-white/20">{AGENT_DEFS[l.owner].codename}</span>
        <span className="micro-sm ml-auto text-white/20">{rel(l.ts, now)}</span>
        {(l.status === "NEW" || l.status === "QUALIFIED" || l.status === "NURTURE") && (
          <button
            onClick={() => engine.qualifyLead(l.id)}
            className="micro-sm border border-line/90 px-1.5 py-1 text-white/50 transition-all hover:border-accent/50 hover:text-accent"
          >
            ADVANCE →
          </button>
        )}
        <button
          onClick={() => engine.deleteLead(l.id)}
          className="micro-sm border border-line/90 px-1.5 py-1 text-white/30 transition-all hover:border-red-500/40 hover:text-red-300"
          title="Delete lead"
        >
          DEL
        </button>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- bookings */

function BookingsDrawer({ s }: { s: SystemState }) {
  const [adding, setAdding] = useState(false);
  const [guest, setGuest] = useState("");
  const [email, setEmail] = useState("");
  const [service, setService] = useState("");
  const [amount, setAmount] = useState("320");
  const total = s.bookings.reduce((sum, b) => sum + b.value, 0);

  const addBooking = (e: FormEvent) => {
    e.preventDefault();
    if (!guest.trim() || !email.trim() || !service.trim()) return;
    engine.createBooking({
      guest,
      email,
      service,
      date: new Date(Date.now() + 86_400_000).toISOString(),
      amount: Number(amount) || 250,
    });
    setGuest("");
    setEmail("");
    setService("");
    setAdding(false);
  };

  return (
    <>
      <Head
        title="BOOKINGS · RESERVATIONS (ADD / CONFIRM / DELETE)"
        sub={`${s.bookings.length} active · Tool: Booking & Reservation Scheduler`}
        onClose={() => engine.setOverlay(null)}
      />
      <div className="flex shrink-0 items-center justify-between border-b border-line/70 px-4 py-2">
        <Micro className="text-white/35">RESERVATION PIPELINE</Micro>
        <button
          onClick={() => setAdding(!adding)}
          className="micro-sm border border-accent/45 bg-accent-soft px-2 py-1 text-accent"
        >
          {adding ? "CANCEL" : "+ ADD BOOKING"}
        </button>
      </div>

      {adding && (
        <form onSubmit={addBooking} className="space-y-2 border-b border-line bg-void/60 px-4 py-3">
          <div className="grid grid-cols-2 gap-2">
            <input
              required
              placeholder="Guest full name"
              value={guest}
              onChange={(e) => setGuest(e.target.value)}
              className="border border-line bg-panel px-2.5 py-1.5 text-[12px] text-white outline-none"
            />
            <input
              required
              type="email"
              placeholder="Guest email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border border-line bg-panel px-2.5 py-1.5 text-[12px] text-white outline-none"
            />
          </div>
          <div className="flex gap-2">
            <input
              required
              placeholder="Service / room / table"
              value={service}
              onChange={(e) => setService(e.target.value)}
              className="flex-1 border border-line bg-panel px-2.5 py-1.5 text-[12px] text-white outline-none"
            />
            <input
              required
              type="number"
              min="0"
              placeholder="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-24 border border-line bg-panel px-2.5 py-1.5 text-[12px] text-white outline-none"
            />
            <button type="submit" className="micro border border-accent/50 bg-accent-soft px-3 py-1.5 text-accent">
              SAVE
            </button>
          </div>
        </form>
      )}

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {s.bookings.map((b) => (
          <div key={b.id} className="border-b border-line/50 px-4 py-3 transition-colors hover:bg-white/[0.02]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-accent/80">{b.ref}</span>
                  <span className="truncate text-[13px] text-white/85">{b.guest}</span>
                </div>
                <p className="mt-1 truncate text-[11px] text-white/45">{b.item}</p>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-mono text-[12px] tnum text-white/80">{fmtMoney(b.value)}</div>
                <div className="micro-sm mt-1 text-white/25">{b.status}</div>
              </div>
            </div>
            <div className="mt-2.5 flex items-center gap-2">
              <span className="micro-sm text-white/30">{b.slot}</span>
              <span className="micro-sm ml-auto text-white/20">
                {AGENT_DEFS[b.owner].codename} · {rel(b.ts, Date.now())}
              </span>
              {b.status === "PENDING" && (
                <button
                  onClick={() => engine.confirmBooking(b.id)}
                  className="micro-sm border border-accent/40 bg-accent-soft px-1.5 py-1 text-accent"
                >
                  CONFIRM ✓
                </button>
              )}
              <button
                onClick={() => engine.deleteBooking(b.id)}
                className="micro-sm border border-line/90 px-1.5 py-1 text-white/30 hover:border-red-500/40 hover:text-red-300"
                title="Delete booking"
              >
                DEL
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex shrink-0 items-center justify-between border-t border-line/90 px-4 py-2.5">
        <a href="#/admin/bookings" className="micro text-white/40 hover:text-accent">
          OPEN FULL BOOKINGS CRUD TABLE →
        </a>
        <span className="font-mono text-[13px] tnum text-accent">{fmtMoney(total)}</span>
      </div>
    </>
  );
}

/* --------------------------------------------------------------- settings */

function SettingsDrawer({
  s,
  accent,
  setAccent,
}: {
  s: SystemState;
  accent: AccentTheme;
  setAccent: (a: AccentTheme) => void;
}) {
  return (
    <>
      <Head
        title="TENANT & SYSTEM SETTINGS"
        sub="White-label configuration · workspace switcher · runtime scope"
        onClose={() => engine.setOverlay(null)}
      />
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <Section label="ACTIVE TENANT WORKSPACE">
          <div className="py-2.5">
            <Micro className="text-white/25">SWITCH TENANT</Micro>
            <select
              value={s.tenant_id ?? ""}
              onChange={(e) => engine.switchTenant(e.target.value)}
              className="mt-2 w-full border border-line bg-void/70 px-3 py-2 font-mono text-[12px] text-white/90 outline-none"
            >
              {s.tenantsList.map((t) => (
                <option key={t.id} value={t.id} className="bg-panel">
                  {t.name} ({t.slug})
                </option>
              ))}
            </select>
            <div className="mt-2.5 flex justify-between">
              <a href="#/admin/tenants" className="micro-sm text-accent hover:underline">
                + CREATE / EDIT / DELETE TENANTS IN ADMIN →
              </a>
            </div>
          </div>
        </Section>

        <Section label="IDENTITY / WHITE-LABEL">
          <label className="block py-2">
            <Micro className="text-white/25">BUSINESS NAME</Micro>
            <input
              value={s.brand.name}
              onChange={(e) => engine.setBrandName(e.target.value.slice(0, 26))}
              className="mt-2 w-full border border-line bg-void/60 px-3 py-2 font-mono text-[13px] tracking-[0.08em] text-white/90 outline-none focus:border-accent/60"
            />
          </label>
          <label className="block border-t border-line/60 py-2">
            <Micro className="text-white/25">BUSINESS TYPE / SYSTEM LABEL</Micro>
            <input
              value={s.brand.type}
              onChange={(e) => engine.setBrandType(e.target.value.slice(0, 32))}
              className="mt-2 w-full border border-line bg-void/60 px-3 py-2 font-mono text-[12px] text-white/80 outline-none focus:border-accent/60"
            />
            <div className="mt-2 flex flex-wrap gap-1">
              {BUSINESS_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => engine.setBrandType(t)}
                  className={cn(
                    "micro-sm border px-1.5 py-1 leading-none transition-colors",
                    s.brand.type === t
                      ? "border-accent/45 bg-accent-soft text-accent"
                      : "border-line/90 text-white/30 hover:text-white/60",
                  )}
                >
                  {t.replace(" System", "")}
                </button>
              ))}
            </div>
          </label>
          <KeyVal k="DEPLOYMENT" v="MULTI-TENANT · GITHUB READY" />
          <KeyVal k="LOCALE" v={`${s.brand.property} · ${s.brand.timezone}`} />
        </Section>

        <Section label="INTERFACE ACCENT">
          <div className="flex gap-2 py-3">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                onClick={() => setAccent(a)}
                className={cn(
                  "group flex flex-1 flex-col items-center gap-2 border px-2 py-3 transition-colors",
                  accent.id === a.id ? "border-white/25 bg-white/[0.04]" : "border-line/90 hover:border-white/15",
                )}
              >
                <span
                  className="h-4 w-4 rounded-full"
                  style={{ background: a.hex, boxShadow: `0 0 14px -2px ${a.hex}` }}
                />
                <span className="micro-sm text-center leading-tight text-white/35">{a.label}</span>
              </button>
            ))}
          </div>
        </Section>

        <Section label="AUTONOMY">
          <div className="flex gap-1 py-3">
            {[1, 2, 3].map((lvl) => (
              <button
                key={lvl}
                onClick={() => engine.setAutonomy(lvl as 1 | 2 | 3)}
                className={cn(
                  "flex-1 border py-2 transition-colors",
                  s.autonomy === lvl
                    ? "border-accent/50 bg-accent-soft text-accent"
                    : "border-line/90 text-white/30 hover:text-white/60",
                )}
              >
                <span className="micro block">L{lvl}</span>
                <span className="micro-sm mt-1 block text-white/25">
                  {lvl === 1 ? "ASSISTED" : lvl === 2 ? "BALANCED" : "AUTONOMOUS"}
                </span>
              </button>
            ))}
          </div>
        </Section>

        <Section label="CHANNEL SURFACES">
          <div className="py-1">
            {s.channels.map((c) => (
              <div key={c.id} className="flex items-center gap-3 border-b border-line/60 py-2.5 last:border-0">
                <Dot tone={c.connected ? "accent" : "idle"} size={5} />
                <span className="micro flex-1 text-white/60">{c.label}</span>
                <button
                  onClick={() => engine.setChannel(c.id, !c.connected)}
                  className={cn(
                    "micro-sm border px-2 py-1 transition-colors",
                    c.connected
                      ? "border-line/90 text-white/40 hover:border-red-500/40 hover:text-red-300"
                      : "border-accent/40 bg-accent-soft text-accent",
                  )}
                >
                  {c.connected ? "DETACH" : "ATTACH"}
                </button>
              </div>
            ))}
          </div>
        </Section>

        <Section label="RUNTIME">
          <div className="flex items-center justify-between py-3">
            <div>
              <Micro className="text-white/45">RESET SYSTEM RUNTIME</Micro>
              <p className="micro-sm mt-1.5 text-white/25">Resets this view / tenant records are retained</p>
            </div>
            <button
              onClick={() => engine.resetAll()}
              className="micro border border-red-500/35 px-2.5 py-2 text-red-300/80 transition-colors hover:bg-red-500/10"
            >
              RESET
            </button>
          </div>
        </Section>
      </div>
    </>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mb-5 border border-line/90">
      <div className="border-b border-line/80 bg-white/[0.012] px-3 py-2">
        <Micro className="text-white/40">{label}</Micro>
      </div>
      <div className="px-3">{children}</div>
    </section>
  );
}

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

function WhatsAppConnect({ s, onClose }: { s: SystemState; onClose: () => void }) {
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
              Simulate the connection to update this tenant's local channel settings.
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
              The channel is enabled in this tenant's local configuration. Messages remain in
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

function ExportBundle({ s, onClose }: { s: SystemState; onClose: () => void }) {
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
