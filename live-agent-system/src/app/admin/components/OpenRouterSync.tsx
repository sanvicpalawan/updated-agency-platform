import { useMemo, useState } from "react";
import { Check, Cpu, RefreshCw, Search } from "lucide-react";
import { cn } from "../../../utils/cn";
import {
  countdown,
  timeAgo,
  useOpenRouterCatalog,
  type CatalogState,
} from "../../../services/openrouter";
import type { AgentId, ModelTier, OpenRouterModelOption } from "../../../types/database";

/* ------------------------------------------------------------------ */
/* Green-light sync pill + refresh button + live model picker          */
/* ------------------------------------------------------------------ */

export function SyncDot({ health, size = 8 }: { health: string; size?: number }) {
  const color =
    health === "live"
      ? "var(--admin-accent, #bcf58b)"
      : health === "loading"
        ? "var(--admin-faint, #8a8a8a)"
        : health === "stale"
          ? "#efc080"
          : "#e26d5a";
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: color,
        boxShadow: health === "live" ? `0 0 8px ${color}` : undefined,
        display: "inline-block",
        flexShrink: 0,
        animation: health === "live" ? "or-pulse 2s ease-in-out infinite" : health === "loading" ? "or-pulse 1s linear infinite" : undefined,
      }}
    />
  );
}

export function ModelSyncStatus({ compact = false }: { compact?: boolean }) {
  const catalog = useOpenRouterCatalog();
  const [spinning, setSpinning] = useState(false);

  const label =
    catalog.health === "live"
      ? `${catalog.total} models · synced ${timeAgo(catalog.fetchedAt)}`
      : catalog.health === "loading"
        ? "Syncing OpenRouter catalog…"
        : catalog.health === "stale"
          ? catalog.fetchedAt
            ? `Stale · last sync ${timeAgo(catalog.fetchedAt)}`
            : "Using curated fallback list"
          : "Sync failed · using fallback";

  const onRefresh = async () => {
    setSpinning(true);
    try {
      await catalog.refresh(true);
    } finally {
      window.setTimeout(() => setSpinning(false), 600);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
        padding: compact ? "8px 10px" : "10px 12px",
        border: "1px solid var(--admin-line)",
        borderRadius: 6,
        background: "var(--admin-bg)",
      }}
    >
      <SyncDot health={catalog.health} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <strong style={{ fontSize: 11.5 }}>
            {catalog.health === "live" ? "OpenRouter catalog live" : catalog.health === "loading" ? "Refreshing catalog…" : "OpenRouter catalog"}
          </strong>
          <span
            className="mono"
            style={{
              fontSize: 9.5,
              padding: "1px 6px",
              borderRadius: 4,
              border: "1px solid currentColor",
              color: catalog.source === "live" ? "var(--admin-accent)" : "#efc080",
            }}
          >
            {catalog.source === "live" ? `LIVE · ${catalog.freeCount} FREE / ${catalog.paidCount} PAID` : "FALLBACK LIST"}
          </span>
        </div>
        <div className="subtle" style={{ fontSize: 10, marginTop: 2 }}>
          {label}
          {!compact && catalog.fetchedAt && catalog.health === "live" && (
            <> · next daily refresh in {countdown(catalog.nextRefreshAt)}</>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={catalog.loading}
        className={cn("button secondary small")}
        title="Refresh model list from OpenRouter now"
        style={{ whiteSpace: "nowrap" }}
      >
        <RefreshCw size={13} style={catalog.loading || spinning ? { animation: "or-spin 1s linear infinite" } : undefined} />
        {catalog.loading ? "Refreshing…" : "Refresh models"}
      </button>
      <style>{`@keyframes or-spin{to{transform:rotate(360deg)}}@keyframes or-pulse{0%,100%{opacity:1}50%{opacity:.45}}`}</style>
    </div>
  );
}

interface PickerProps {
  value: string;
  tier: ModelTier;
  onTier: (tier: ModelTier) => void;
  onSelect: (model: OpenRouterModelOption) => void;
  agentId?: AgentId;
}

/** Searchable live picker replacing the basic static <select>. */
export function ModelPicker({ value, tier, onTier, onSelect, agentId }: PickerProps) {
  const catalog = useOpenRouterCatalog();
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("all");

  const providers = useMemo(() => {
    const set = new Set<string>();
    catalog.models.forEach((m) => {
      if (m.tier === tier) set.add(m.provider);
    });
    return ["all", ...[...set].sort()];
  }, [catalog.models, tier]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.models
      .filter((m) => m.tier === tier)
      .filter((m) => provider === "all" || m.provider === provider)
      .filter((m) => !q || `${m.label} ${m.id} ${m.provider}`.toLowerCase().includes(q))
      .slice(0, 120);
  }, [catalog.models, tier, provider, query]);

  const freeCount = catalog.models.filter((m) => m.tier === "free").length;
  const paidCount = catalog.models.filter((m) => m.tier === "paid").length;

  return (
    <div>
      <ModelSyncStatus compact />
      {/* Tier toggle with LIVE counts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
        <button
          type="button"
          onClick={() => onTier("free")}
          style={{
            padding: "12px 14px",
            borderRadius: 6,
            textAlign: "left",
            border: tier === "free" ? "1px solid var(--admin-accent)" : "1px solid var(--admin-line)",
            background: tier === "free" ? "var(--admin-soft)" : "var(--admin-bg)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong style={{ fontSize: 12, color: tier === "free" ? "var(--admin-accent)" : "var(--admin-text)" }}>
              Free models
            </strong>
            <span className="mono" style={{ fontSize: 10, color: "var(--admin-accent)" }}>
              {freeCount} · $0
            </span>
          </div>
          <small className="subtle" style={{ display: "block", marginTop: 4, fontSize: 10 }}>
            Live from OpenRouter · refreshed daily
          </small>
        </button>
        <button
          type="button"
          onClick={() => onTier("paid")}
          style={{
            padding: "12px 14px",
            borderRadius: 6,
            textAlign: "left",
            border: tier === "paid" ? "1px solid #efc080" : "1px solid var(--admin-line)",
            background: tier === "paid" ? "#efc08014" : "var(--admin-bg)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong style={{ fontSize: 12, color: tier === "paid" ? "#efc080" : "var(--admin-text)" }}>
              Paid models
            </strong>
            <span className="mono" style={{ fontSize: 10, color: "#efc080" }}>
              {paidCount} · metered
            </span>
          </div>
          <small className="subtle" style={{ display: "block", marginTop: 4, fontSize: 10 }}>
            Live from OpenRouter · refreshed daily
          </small>
        </button>
      </div>

      {/* Search + provider */}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <label
          className="table-search"
          style={{ flex: 1, minWidth: 0 }}
        >
          <Search size={14} />
          <input
            placeholder={`Search ${tier} models… (e.g. llama, claude, gpt)`}
            aria-label="Search OpenRouter models"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="Filter by provider"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          style={{
            maxWidth: 170,
            border: "1px solid var(--admin-line)",
            borderRadius: 5,
            background: "var(--admin-bg)",
            color: "var(--admin-text)",
            fontSize: 11,
            padding: "8px 10px",
          }}
        >
          {providers.map((p) => (
            <option key={p} value={p}>
              {p === "all" ? "All providers" : p.replace(" via OpenRouter", "")}
            </option>
          ))}
        </select>
      </div>

      {/* Results */}
      <div
        role="listbox"
        aria-label={`${tier} OpenRouter models`}
        style={{
          marginTop: 10,
          border: "1px solid var(--admin-line)",
          borderRadius: 6,
          maxHeight: 264,
          overflowY: "auto",
          background: "var(--admin-bg)",
        }}
      >
        {results.length === 0 && (
          <div style={{ padding: 18, textAlign: "center" }} className="subtle">
            No {tier} models match “{query}”. Try another search or refresh the catalog.
          </div>
        )}
        {results.map((m) => {
          const selected = value === m.id;
          const recommended = agentId ? m.recommended_for.includes(agentId) : false;
          return (
            <button
              key={m.id}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => onSelect(m)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                textAlign: "left",
                padding: "9px 12px",
                borderBottom: "1px solid var(--admin-line)",
                background: selected ? "var(--admin-soft)" : "transparent",
              }}
            >
              <span
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 999,
                  border: selected ? "5px solid var(--admin-accent)" : "1px solid var(--admin-line)",
                  marginTop: 2,
                  flexShrink: 0,
                  background: selected ? "var(--admin-bg)" : "transparent",
                }}
              />
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <strong style={{ fontSize: 12, color: selected ? "var(--admin-accent)" : "var(--admin-text)" }}>
                    {m.label}
                  </strong>
                  {m.tier === "free" && (
                    <span
                      className="mono"
                      style={{ fontSize: 8.5, padding: "1px 5px", borderRadius: 3, background: "var(--admin-soft)", color: "var(--admin-accent)", border: "1px solid currentColor" }}
                    >
                      FREE
                    </span>
                  )}
                  {recommended && (
                    <span className="mono" style={{ fontSize: 8.5, color: "var(--admin-faint)" }}>
                      ★ recommended
                    </span>
                  )}
                </span>
                <span className="mono subtle" style={{ display: "block", fontSize: 10, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {m.id}
                </span>
                <span className="subtle" style={{ display: "block", fontSize: 10, marginTop: 2 }}>
                  {m.provider} · {m.context_window} ctx · {m.cost_label}
                </span>
              </span>
              {selected && <Check size={14} style={{ color: "var(--admin-accent)", marginTop: 3, flexShrink: 0 }} />}
            </button>
          );
        })}
      </div>
      <div className="subtle" style={{ fontSize: 10, marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
        <Cpu size={11} />
        Showing {results.length} of {tier === "free" ? freeCount : paidCount} {tier} models
        {catalog.source === "live" ? " · live OpenRouter catalog" : " · curated fallback (refresh to go live)"}
      </div>
    </div>
  );
}

export type { CatalogState };
