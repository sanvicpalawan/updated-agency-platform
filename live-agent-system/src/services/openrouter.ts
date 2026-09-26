import { useSyncExternalStore, useEffect } from "react";
import { OPENROUTER_MODELS } from "../config/platform";
import type { ModelTier, OpenRouterModelOption } from "../types/database";

/* ------------------------------------------------------------------ */
/* Live OpenRouter model catalog with daily refresh + green-light sync  */
/* ------------------------------------------------------------------ */

const MODELS_URL = "https://openrouter.ai/api/v1/models";
const KEY_URL = "https://openrouter.ai/api/v1/auth/key";
const CACHE_KEY = "core.openrouter.catalog.v1";
const META_KEY = "core.openrouter.meta.v1";
export const DAILY_REFRESH_MS = 24 * 60 * 60 * 1000;

export type SyncSource = "live" | "fallback" | "loading";
export type SyncHealth = "live" | "stale" | "loading" | "error";

export interface CatalogState {
  models: OpenRouterModelOption[];
  fetchedAt: string | null;
  source: SyncSource;
  loading: boolean;
  error: string | null;
  total: number;
  freeCount: number;
  paidCount: number;
}

interface RawModel {
  id: string;
  name?: string;
  description?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  top_provider?: { context_length?: number; max_completion_tokens?: number | null };
}

function formatContext(n?: number): string {
  if (!n || n <= 0) return "—";
  if (n >= 1_000_000) return `${parseFloat((n / 1_000_000).toFixed(1))}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return `${n}`;
}

function formatCost(prompt?: string, completion?: string): string {
  const p = parseFloat(prompt ?? "0");
  const c = parseFloat(completion ?? "0");
  if (!isFinite(p) || !isFinite(c)) return "See openrouter.ai";
  if (p === 0 && c === 0) return "$0.00 / 1M tokens";
  const per1M = (v: number) => `$${(v * 1_000_000).toFixed(2)}`;
  return `${per1M(p)} in · ${per1M(c)} out`;
}

function isFreeModel(id: string, pricing?: { prompt?: string; completion?: string }): boolean {
  if (id.endsWith(":free")) return true;
  const p = parseFloat(pricing?.prompt ?? "NaN");
  const c = parseFloat(pricing?.completion ?? "NaN");
  return p === 0 && c === 0;
}

function providerFromId(id: string): string {
  const slug = id.split("/")[0] ?? "";
  const pretty: Record<string, string> = {
    anthropic: "Anthropic",
    openai: "OpenAI",
    google: "Google",
    meta: "Meta",
    "meta-llama": "Meta",
    mistralai: "Mistral",
    deepseek: "DeepSeek",
    qwen: "Qwen",
    microsoft: "Microsoft",
    nvidia: "NVIDIA",
    xai: "xAI",
    cohere: "Cohere",
    ai21: "AI21",
    perplexity: "Perplexity",
  };
  const label = pretty[slug] ?? (slug ? slug.charAt(0).toUpperCase() + slug.slice(1) : "OpenRouter");
  return `${label} via OpenRouter`;
}

function labelFromId(id: string, name?: string): string {
  const base = (name ?? id.split("/").pop() ?? id)
    .replace(/:free$/i, "")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return base
    .split(" ")
    .map((w) => (/^\d/.test(w) || w.length <= 3 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ")
    .slice(0, 64);
}

function transformLive(data: { data?: RawModel[] }): OpenRouterModelOption[] {
  const rows = Array.isArray(data?.data) ? data.data : [];
  const seen = new Set<string>();
  const out: OpenRouterModelOption[] = [];
  for (const m of rows) {
    if (!m?.id || seen.has(m.id)) continue;
    seen.add(m.id);
    const tier: ModelTier = isFreeModel(m.id, m.pricing) ? "free" : "paid";
    const ctx = m.context_length ?? m.top_provider?.context_length ?? 0;
    out.push({
      id: m.id,
      label: tier === "free" ? `${labelFromId(m.id, m.name)} (Free)` : labelFromId(m.id, m.name),
      provider: providerFromId(m.id),
      tier,
      context_window: formatContext(ctx),
      cost_label: formatCost(m.pricing?.prompt, m.pricing?.completion),
      recommended_for: ["tala", "nyx", "hermes"],
    });
  }
  // Free first (alpha), then paid (alpha) — deterministic order
  out.sort((a, b) =>
    a.tier === b.tier ? a.label.localeCompare(b.label) : a.tier === "free" ? -1 : 1,
  );
  return out;
}

function readCache(): { models: OpenRouterModelOption[]; fetchedAt: string } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { models: OpenRouterModelOption[]; fetchedAt: string };
    if (!Array.isArray(parsed.models) || !parsed.models.length || !parsed.fetchedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(models: OpenRouterModelOption[], fetchedAt: string) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ models, fetchedAt }));
    localStorage.setItem(META_KEY, JSON.stringify({ fetchedAt, total: models.length }));
  } catch {
    /* memory-only environments */
  }
}

class CatalogStore {
  private state: CatalogState;
  private listeners = new Set<() => void>();
  private inflight: Promise<CatalogState> | null = null;
  private timer: number | null = null;

  constructor() {
    const cached = readCache();
    const fresh = cached && Date.now() - Date.parse(cached.fetchedAt) < DAILY_REFRESH_MS;
    this.state = cached
      ? {
          models: cached.models,
          fetchedAt: cached.fetchedAt,
          source: fresh ? "live" : "live",
          loading: false,
          error: null,
          total: cached.models.length,
          freeCount: cached.models.filter((m) => m.tier === "free").length,
          paidCount: cached.models.filter((m) => m.tier === "paid").length,
        }
      : {
          models: [...OPENROUTER_MODELS],
          fetchedAt: null,
          source: "fallback",
          loading: false,
          error: null,
          total: OPENROUTER_MODELS.length,
          freeCount: OPENROUTER_MODELS.filter((m) => m.tier === "free").length,
          paidCount: OPENROUTER_MODELS.filter((m) => m.tier === "paid").length,
        };
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = () => this.state;

  private emit() {
    this.listeners.forEach((l) => l());
  }

  health(): SyncHealth {
    if (this.state.loading) return "loading";
    if (this.state.source === "live" && this.state.fetchedAt) {
      return Date.now() - Date.parse(this.state.fetchedAt) < DAILY_REFRESH_MS ? "live" : "stale";
    }
    return this.state.error ? "error" : "stale";
  }

  /** Next scheduled daily refresh (24h after last fetch, or now if never). */
  nextRefreshAt(): number {
    if (!this.state.fetchedAt) return Date.now();
    return Date.parse(this.state.fetchedAt) + DAILY_REFRESH_MS;
  }

  async refresh(force = false): Promise<CatalogState> {
    if (this.inflight) return this.inflight;
    // Skip network when cache is fresh unless forced
    if (!force && this.state.fetchedAt && Date.now() - Date.parse(this.state.fetchedAt) < DAILY_REFRESH_MS && this.state.source === "live") {
      return this.state;
    }
    this.state = { ...this.state, loading: true, error: null };
    this.emit();
    const ctrl = new AbortController();
    const timeout = window.setTimeout(() => ctrl.abort(), 12000);
    this.inflight = fetch(MODELS_URL, { signal: ctrl.signal, headers: { Accept: "application/json" } })
      .then(async (res) => {
        if (!res.ok) throw new Error(`OpenRouter responded ${res.status}`);
        const json = (await res.json()) as { data?: RawModel[] };
        const models = transformLive(json);
        if (!models.length) throw new Error("Empty model catalog");
        const fetchedAt = new Date().toISOString();
        writeCache(models, fetchedAt);
        this.state = {
          models,
          fetchedAt,
          source: "live",
          loading: false,
          error: null,
          total: models.length,
          freeCount: models.filter((m) => m.tier === "free").length,
          paidCount: models.filter((m) => m.tier === "paid").length,
        };
        this.emit();
        return this.state;
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Refresh failed";
        // Keep last good data; fall back to curated list only if we have nothing live
        const hasLive = this.state.source === "live" && this.state.fetchedAt;
        this.state = {
          ...this.state,
          loading: false,
          source: hasLive ? "live" : "fallback",
          models: hasLive ? this.state.models : [...OPENROUTER_MODELS],
          error: message,
          total: hasLive ? this.state.total : OPENROUTER_MODELS.length,
          freeCount: hasLive
            ? this.state.freeCount
            : OPENROUTER_MODELS.filter((m) => m.tier === "free").length,
          paidCount: hasLive
            ? this.state.paidCount
            : OPENROUTER_MODELS.filter((m) => m.tier === "paid").length,
        };
        this.emit();
        return this.state;
      })
      .finally(() => {
        window.clearTimeout(timeout);
        this.inflight = null;
        this.scheduleDaily();
      });
    return this.inflight;
  }

  /** Validate an OpenRouter API key (green light for key, independent of catalog). */
  async validateKey(apiKey: string): Promise<{ ok: boolean; label?: string; usage?: number; limit?: number | null }> {
    const key = apiKey.trim();
    if (!key) return { ok: false };
    if (!/^sk-or-v1-[A-Za-z0-9_-]{8,}$/.test(key)) return { ok: false };
    try {
      const ctrl = new AbortController();
      const t = window.setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch(KEY_URL, {
        signal: ctrl.signal,
        headers: { Authorization: `Bearer ${key}` },
      });
      window.clearTimeout(t);
      if (!res.ok) return { ok: false };
      const json = (await res.json()) as { data?: { label?: string; usage?: number; limit?: number | null } };
      return { ok: true, label: json?.data?.label, usage: json?.data?.usage, limit: json?.data?.limit ?? null };
    } catch {
      // Offline / CORS-blocked: format-valid keys still count as "stored", just unverified
      return { ok: false };
    }
  }

  private scheduleDaily() {
    if (this.timer !== null) window.clearTimeout(this.timer);
    const wait = Math.max(60_000, this.nextRefreshAt() - Date.now() + 5_000);
    this.timer = window.setTimeout(() => {
      void this.refresh(true);
    }, Math.min(wait, 24 * 60 * 60 * 1000 + 60_000));
  }

  startAuto() {
    this.scheduleDaily();
    if (!this.state.fetchedAt || Date.now() - Date.parse(this.state.fetchedAt) >= DAILY_REFRESH_MS) {
      void this.refresh(false);
    }
  }
}

export const openRouterCatalog = new CatalogStore();

export function useOpenRouterCatalog(): CatalogState & { health: SyncHealth; nextRefreshAt: number; refresh: (force?: boolean) => Promise<CatalogState> } {
  const state = useSyncExternalStore(
    openRouterCatalog.subscribe,
    openRouterCatalog.getSnapshot,
    openRouterCatalog.getSnapshot,
  );
  useEffect(() => {
    openRouterCatalog.startAuto();
  }, []);
  return {
    ...state,
    health: openRouterCatalog.health(),
    nextRefreshAt: openRouterCatalog.nextRefreshAt(),
    refresh: (force = true) => openRouterCatalog.refresh(force),
  };
}

/* ------------------------------ formatting ------------------------------ */

export function timeAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return "never";
  const s = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  if (s < 60) return s <= 5 ? "just now" : `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : `${d}d ago`;
}

export function countdown(target: number, now = Date.now()): string {
  const ms = Math.max(0, target - now);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function findModel(models: OpenRouterModelOption[], id: string): OpenRouterModelOption | undefined {
  return models.find((m) => m.id === id) ?? OPENROUTER_MODELS.find((m) => m.id === id);
}
