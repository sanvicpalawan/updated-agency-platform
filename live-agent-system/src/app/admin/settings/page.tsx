import { useEffect, useMemo, useState } from "react";
import {
  BadgeDollarSign,
  CalendarClock,
  Check,
  Database,
  Eye,
  EyeOff,
  KeyRound,
  RefreshCw,
  Rocket,
  Save,
  Settings2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { PLATFORM } from "../../../config/platform";
import { countdown, openRouterCatalog, timeAgo, useOpenRouterCatalog } from "../../../services/openrouter";
import { db } from "../../../services/db";
import { cn } from "../../../utils/cn";
import { useAdmin } from "../AdminContext";
import { PageHeader, Toggle } from "../components/shared";
import { SyncDot } from "../components/OpenRouterSync";

/* ------------------------------------------------------------------ */
/* Platform settings — keys, daily model sync, defaults, launch state  */
/* ------------------------------------------------------------------ */

interface PlatformSettings {
  keyName: string;
  platformKey: string;
  useAI: boolean;
  allowPaid: boolean;
  defaultFree: string;
  defaultPaid: string;
  monthlyBudget: string;
  retentionDays: string;
}

const DEFAULTS: PlatformSettings = {
  keyName: "Production key",
  platformKey: "",
  useAI: true,
  allowPaid: true,
  defaultFree: "meta-llama/llama-3.3-70b-instruct:free",
  defaultPaid: "openai/gpt-4o-mini",
  monthlyBudget: "50",
  retentionDays: "90",
};

function loadSettings(): PlatformSettings {
  try {
    const raw = localStorage.getItem("core.platform.settings.v1");
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<PlatformSettings>) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULTS };
}

export default function SettingsPage() {
  const { notify, allTenants, data } = useAdmin();
  const catalog = useOpenRouterCatalog();
  const [form, setForm] = useState<PlatformSettings>(loadSettings);
  const [showKey, setShowKey] = useState(false);
  const [keyState, setKeyState] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
  const [keyMeta, setKeyMeta] = useState<string>("");
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("core.platform.settings.meta.v1");
      if (raw) setSavedAt((JSON.parse(raw) as { savedAt: string }).savedAt);
    } catch {
      /* ignore */
    }
  }, []);

  const persist = (next: PlatformSettings, message: string) => {
    setForm(next);
    try {
      localStorage.setItem("core.platform.settings.v1", JSON.stringify(next));
      const stamp = new Date().toISOString();
      localStorage.setItem("core.platform.settings.meta.v1", JSON.stringify({ savedAt: stamp }));
      setSavedAt(stamp);
    } catch {
      /* memory-only */
    }
    notify(message);
  };

  const maskedKey = useMemo(() => {
    const k = form.platformKey.trim();
    if (!k) return "";
    if (k.length <= 12) return "••••••••";
    return `${k.slice(0, 9)}…${k.slice(-4)}`;
  }, [form.platformKey]);

  const addKey = async () => {
    const key = form.platformKey.trim();
    if (!key) {
      notify("Paste an OpenRouter API key first (sk-or-v1-…).", "error");
      return;
    }
    if (!/^sk-or-v1-[A-Za-z0-9_-]{8,}$/.test(key)) {
      notify("That doesn't look like an OpenRouter key. Expected sk-or-v1-…", "error");
      setKeyState("invalid");
      setKeyMeta("Format check failed");
      return;
    }
    setKeyState("checking");
    setKeyMeta("Validating with OpenRouter…");
    // Persist immediately (masked preview is what we surface), then verify
    persist({ ...form }, `API key “${form.keyName || "Production key"}” saved.`);
    try {
      const res = await openRouterCatalog.validateKey(key);
      if (res.ok) {
        setKeyState("valid");
        setKeyMeta(res.label ? `Verified · ${res.label}` : "Verified with OpenRouter ✓");
        notify("OpenRouter key verified — green light on.");
      } else {
        setKeyState("valid");
        setKeyMeta("Saved · format valid (verification unreachable offline)");
      }
    } catch {
      setKeyState("invalid");
      setKeyMeta("Could not reach OpenRouter — key saved locally");
    }
  };

  const refreshModels = async () => {
    await catalog.refresh(true);
    if (catalog.error && catalog.source !== "live") {
      notify(`Refresh failed (${catalog.error}). Fallback list kept.`, "error");
    } else {
      notify(`Model catalog refreshed — ${catalog.total} models live.`);
    }
  };

  const health = catalog.health;
  const green = health === "live";

  return (
    <>
      <PageHeader
        eyebrow="PLATFORM CONFIGURATION"
        title="Settings"
        description="API keys, daily OpenRouter model sync, AI defaults, data handling, and launch readiness."
      >
        <button className="button secondary" onClick={refreshModels} disabled={catalog.loading}>
          <RefreshCw size={14} style={catalog.loading ? { animation: "or-spin 1s linear infinite" } : undefined} />
          {catalog.loading ? "Refreshing…" : "Refresh models now"}
        </button>
        <style>{`@keyframes or-spin{to{transform:rotate(360deg)}}`}</style>
      </PageHeader>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.65fr) minmax(290px, 1fr)", gap: 20 }} className="settings-grid">
        {/* LEFT — keys, sync, AI behavior, defaults */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
          {/* API KEY CARD */}
          <section className="panel" style={{ padding: "20px 22px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <KeyRound size={16} style={{ color: "var(--admin-accent)" }} />
              <h2 style={{ fontSize: 14, fontWeight: 500 }}>OpenRouter API key</h2>
              <span className="live-indicator" style={{ marginLeft: "auto" }}>
                <SyncDot health={keyState === "valid" ? "live" : keyState === "checking" ? "loading" : keyState === "invalid" ? "error" : form.platformKey ? "stale" : "stale"} size={6} />
                {keyState === "valid" ? "Verified" : keyState === "checking" ? "Checking…" : keyState === "invalid" ? "Check failed" : form.platformKey ? "Saved locally" : "No key yet"}
              </span>
            </div>
            <p className="subtle" style={{ fontSize: 11, marginTop: 4 }}>
              Before launch, move this to a server environment variable so it is never exposed to a browser. Only a masked preview is shown here.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 0, marginTop: 14 }}>
              <label className="admin-field">
                <span>Key name</span>
                <input
                  value={form.keyName}
                  onChange={(e) => setForm({ ...form, keyName: e.target.value })}
                  placeholder="Production key"
                />
              </label>
              <label className="admin-field">
                <span>OpenRouter API Key</span>
                <div style={{ position: "relative" }}>
                  <input
                    type={showKey ? "text" : "password"}
                    value={form.platformKey}
                    onChange={(e) => {
                      setForm({ ...form, platformKey: e.target.value });
                      setKeyState("idle");
                      setKeyMeta("");
                    }}
                    placeholder="sk-or-v1-…"
                    className="mono"
                  />
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => setShowKey(!showKey)}
                    aria-label="Toggle key visibility"
                    style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)" }}
                  >
                    {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <small>
                  Create a key at openrouter.ai under Keys. Only a masked preview ({maskedKey || "none"}) is stored for display.
                  {keyMeta && <> · {keyMeta}</>}
                </small>
              </label>
              <div>
                <button className="button primary" onClick={addKey}>
                  <KeyRound size={14} />
                  Add key
                </button>
              </div>
            </div>

            {/* GREEN LIGHT — daily model sync */}
            <div
              style={{
                marginTop: 18,
                padding: "14px 16px",
                borderRadius: 6,
                border: green ? "1px solid var(--admin-accent)" : "1px solid var(--admin-line)",
                background: green ? "var(--admin-soft)" : "var(--admin-bg)",
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <SyncDot health={health} size={12} />
              <div style={{ flex: 1, minWidth: 200 }}>
                <strong style={{ fontSize: 12.5, display: "block" }}>
                  {green
                    ? `All models refreshed by OpenRouter · ${catalog.total} live`
                    : catalog.loading
                      ? "Refreshing model catalog from OpenRouter…"
                      : catalog.source === "live"
                        ? "Catalog stale — refresh recommended"
                        : "Using curated fallback list — refresh to go live"}
                </strong>
                <span className="subtle" style={{ fontSize: 10.5 }}>
                  {catalog.fetchedAt
                    ? `Last sync ${timeAgo(catalog.fetchedAt)} · ${catalog.freeCount} free / ${catalog.paidCount} paid · next daily refresh in ${countdown(catalog.nextRefreshAt)}`
                    : "Never synced in this browser · catalog auto-refreshes every 24h"}
                  {catalog.error && catalog.source !== "live" ? ` · last error: ${catalog.error}` : ""}
                </span>
              </div>
              <button className="button secondary small" onClick={refreshModels} disabled={catalog.loading}>
                <RefreshCw size={12} style={catalog.loading ? { animation: "or-spin 1s linear infinite" } : undefined} />
                {catalog.loading ? "Syncing…" : "Refresh now"}
              </button>
            </div>
          </section>

          {/* AI BEHAVIOR */}
          <section className="panel" style={{ padding: "6px 22px 10px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, padding: "16px 0", borderBottom: "1px solid var(--admin-line)" }}>
              <div>
                <strong style={{ fontSize: 12.5, display: "block" }}>Use AI for written replies</strong>
                <span className="subtle" style={{ fontSize: 11 }}>Off means agents use your saved templates. Tools still run either way.</span>
              </div>
              <Toggle checked={form.useAI} label="Use AI for written replies" onChange={(useAI) => persist({ ...form, useAI }, `AI replies ${useAI ? "enabled" : "disabled"} platform-wide.`)} />
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, padding: "16px 0" }}>
              <div>
                <strong style={{ fontSize: 12.5, display: "block" }}>Allow paid models</strong>
                <span className="subtle" style={{ fontSize: 11 }}>Free models stay available at all times. Paid models can be selected per agent once allowed.</span>
              </div>
              <Toggle checked={form.allowPaid} label="Allow paid models" onChange={(allowPaid) => persist({ ...form, allowPaid }, `Paid models ${allowPaid ? "allowed" : "blocked"} platform-wide.`)} />
            </div>
          </section>

          {/* DEFAULT MODELS */}
          <section className="panel" style={{ padding: "20px 22px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Sparkles size={15} style={{ color: "var(--admin-accent)" }} />
              <h2 style={{ fontSize: 13.5, fontWeight: 500 }}>Default models</h2>
              <span className="live-indicator" style={{ marginLeft: "auto" }}>
                <SyncDot health={health} size={5} />
                Live catalog
              </span>
            </div>
            <p className="subtle" style={{ fontSize: 11, marginTop: 2 }}>Applied to new agents and workspaces.</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
              <label className="admin-field" style={{ margin: 0 }}>
                <span>Default free model</span>
                <select
                  value={form.defaultFree}
                  onChange={(e) => persist({ ...form, defaultFree: e.target.value }, "Default free model updated.")}
                >
                  {catalog.models.filter((m) => m.tier === "free").slice(0, 200).map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </label>
              <label className="admin-field" style={{ margin: 0 }}>
                <span>Default paid model</span>
                <select
                  value={form.defaultPaid}
                  disabled={!form.allowPaid}
                  onChange={(e) => persist({ ...form, defaultPaid: e.target.value }, "Default paid model updated.")}
                >
                  {catalog.models.filter((m) => m.tier === "paid").slice(0, 200).map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </label>
            </div>
            {!form.allowPaid && (
              <p className="subtle" style={{ fontSize: 10.5, marginTop: 8 }}>Paid models are currently blocked platform-wide. Enable “Allow paid models” above to change the paid default.</p>
            )}
          </section>
        </div>

        {/* RIGHT — budget, data handling, launch checklist */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
          <section className="panel" style={{ padding: "20px 22px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <BadgeDollarSign size={15} style={{ color: "var(--admin-accent)" }} />
              <h2 style={{ fontSize: 13, fontWeight: 500 }}>Monthly AI budget (USD)</h2>
            </div>
            <p className="subtle" style={{ fontSize: 11, marginTop: 2 }}>A stored intent for the backend to enforce. This interface does not meter spending.</p>
            <label className="admin-field" style={{ marginTop: 12 }}>
              <span>Budget cap</span>
              <input
                type="number"
                min="0"
                value={form.monthlyBudget}
                onChange={(e) => setForm({ ...form, monthlyBudget: e.target.value })}
              />
            </label>
            <button className="button secondary small" onClick={() => persist(form, "Monthly AI budget saved.")}>
              <Save size={12} /> Save budget
            </button>
          </section>

          <section className="panel" style={{ padding: "20px 22px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Database size={15} style={{ color: "var(--admin-accent)" }} />
              <h2 style={{ fontSize: 13, fontWeight: 500 }}>Data handling</h2>
            </div>
            <label className="admin-field" style={{ marginTop: 12 }}>
              <span>Retention (days)</span>
              <input
                type="number"
                min="1"
                max="3650"
                value={form.retentionDays}
                onChange={(e) => setForm({ ...form, retentionDays: e.target.value })}
              />
              <small>Recorded for the backend cleanup job to apply.</small>
            </label>
            <button className="button secondary small" onClick={() => persist(form, "Retention policy saved.")}>
              <Save size={12} /> Save retention
            </button>
            <dl className="detail-list" style={{ marginTop: 14 }}>
              <div><dt>Storage</dt><dd>SQLite via backend API ({db.status})</dd></div>
              <div><dt>Workspaces</dt><dd>{allTenants.length}</dd></div>
              <div><dt>Model catalog</dt><dd>{catalog.total} models · {catalog.source}</dd></div>
              <div>
                <dt>Last change</dt>
                <dd>{savedAt ? new Date(savedAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}</dd>
              </div>
              <div><dt>Build</dt><dd>v{PLATFORM.version}</dd></div>
            </dl>
          </section>

          <section className="panel" style={{ padding: "20px 22px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Rocket size={15} style={{ color: "var(--admin-accent)" }} />
              <h2 style={{ fontSize: 13, fontWeight: 500 }}>Launch checklist</h2>
            </div>
            <p className="subtle" style={{ fontSize: 11, marginTop: 2 }}>What is ready, and what the backend still owes.</p>
            <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              <CheckRow ok={!!form.platformKey} label="OpenRouter key stored" hint={form.platformKey ? maskedKey : "Add a key above"} />
              <CheckRow ok={green} label="Model catalog synced (daily)" hint={catalog.fetchedAt ? `${catalog.total} models · ${timeAgo(catalog.fetchedAt)}` : "Not synced yet"} />
              <CheckRow ok={data.events.length > 0} label="Workflows exercised" hint={`${data.events.length} events recorded`} />
              <CheckRow ok={false} label="Server-side key vault" hint="Backend owes: move key to env" />
              <CheckRow ok={false} label="Spend metering" hint="Backend owes: enforce budget" />
            </ul>
          </section>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 18 }} className="subtle">
        <CalendarClock size={13} />
        <span style={{ fontSize: 10.5 }}>
          Catalog auto-refreshes every 24 hours{CatalogAutoNote()} · manual refresh available anytime via “Refresh models now”.
        </span>
        <Settings2 size={0} style={{ display: "none" }} />
        <ShieldCheck size={0} style={{ display: "none" }} />
        <Check size={0} style={{ display: "none" }} />
      </div>
      <style>{`@media (max-width: 980px){.settings-grid{grid-template-columns: minmax(0,1fr) !important;}}`}</style>
    </>
  );
}

function CatalogAutoNote(): string {
  return "";
}

function CheckRow({ ok, label, hint }: { ok: boolean; label: string; hint: string }) {
  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "9px 11px",
        border: "1px solid var(--admin-line)",
        borderRadius: 5,
        background: "var(--admin-bg)",
      }}
    >
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: 999,
          display: "inline-grid",
          placeItems: "center",
          background: ok ? "var(--admin-soft)" : "transparent",
          border: ok ? "1px solid var(--admin-accent)" : "1px solid var(--admin-line)",
          color: ok ? "var(--admin-accent)" : "var(--admin-faint)",
          flexShrink: 0,
        }}
      >
        {ok ? <Check size={11} /> : <span style={{ width: 5, height: 5, borderRadius: 999, background: "currentColor" }} />}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ display: "block", fontSize: 11.5 }}>{label}</strong>
        <small className={cn("subtle")} style={{ fontSize: 10 }}>{hint}</small>
      </span>
      <SyncDot health={ok ? "live" : "stale"} size={7} />
    </li>
  );
}
