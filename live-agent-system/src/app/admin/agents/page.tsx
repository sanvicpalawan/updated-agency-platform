import { useState } from "react";
import {
  ArrowRight,
  Braces,
  Check,
  Cpu,
  Eye,
  EyeOff,
  KeyRound,
  Play,
  Plus,
  Sliders,
  Sparkles,
  Wrench,
} from "lucide-react";
import { agentsApi, validateAgentConfig } from "../../../api/agents";
import { eventsApi } from "../../../api/events";
import { getAdminData, tenantsApi } from "../../../api/tenants";
import {
  AGENTS,
  AGENT_IDS,
  createDefaultToolsConfig,
  mergeBehavior,
  mergeOpenRouter,
  TOOL_IDS,
} from "../../../config/platform";
import { db } from "../../../services/db";
import { findModel, useOpenRouterCatalog } from "../../../services/openrouter";
import { ModelPicker, ModelSyncStatus, SyncDot } from "../components/OpenRouterSync";
import type {
  AgentBehaviorConfig,
  AgentConfig,
  AgentId,
  AgentOpenRouterConfig,
  AutonomyMode,
  BehaviorTone,
  ModelTier,
  Tenant,
  ToolId,
} from "../../../types/database";
import { useAdmin, useTenantTarget } from "../AdminContext";
import {
  AgentMark,
  EventFeed,
  Modal,
  PageHeader,
  SectionHeading,
  Status,
  TenantSelect,
  Toggle,
  WorkspaceGate,
} from "../components/shared";
import { errorMessage, number, relative } from "../utils";

export default function AgentsPage() {
  const { session, act, navigate, setScope, setTenantDialog, notify } = useAdmin();
  const { target, selectTarget } = useTenantTarget();
  const [modal, setModal] = useState<{ agent: AgentId; tab: "openrouter" | "behavior" | "json" } | null>(null);
  const [showTenantKey, setShowTenantKey] = useState(false);
  const [tenantKeyDraft, setTenantKeyDraft] = useState<string | null>(null);

  const catalog = useOpenRouterCatalog();
  const scoped = target ? getAdminData(session, target.id) : null;
  const tools = target ? target.tools_config ?? createDefaultToolsConfig(target.slug) : null;
  const currentTenantKey = tenantKeyDraft !== null ? tenantKeyDraft : (target?.openrouter_api_key ?? "");

  const saveWorkspaceKey = () => {
    if (!target) return;
    act(() => {
      tenantsApi.update(session, target.id, { openrouter_api_key: currentTenantKey.trim() });
      setTenantKeyDraft(null);
    }, `OpenRouter API key saved for ${target.name}.`);
  };

  return (
    <>
      <PageHeader
        eyebrow="AGENT WORKFORCE · AI & BEHAVIOR"
        title="Agents, OpenRouter & Behavior"
        description="Configure OpenRouter API keys (Free & Paid models), behavioral prompts, and tool connections for TALA, NYX, and HERMES."
      >
        <button className="button secondary" onClick={() => navigate("tools")}>
          <Wrench size={14} />
          Tools & outcomes
        </button>
        <button className="button secondary" onClick={() => navigate("rules")}>
          <Braces size={14} />
          Automation rules
        </button>
      </PageHeader>

      {!target || !scoped || !tools ? (
        <WorkspaceGate
          onRetry={() => void db.load(true).catch(() => undefined)}
          title="No workspaces yet"
          description="Create a tenant to configure its agents, OpenRouter models, and behavioral settings."
          action={
            <button className="button primary" onClick={() => setTenantDialog({ kind: "create" })}>
              <Plus size={14} />
              Create tenant
            </button>
          }
        />
      ) : (
        <>
          <div className="context-toolbar">
            <div className="context-picker">
              <TenantSelect
                value={target.id}
                onChange={(id) => {
                  selectTarget(id);
                  setModal(null);
                  setTenantKeyDraft(null);
                }}
                label="CONFIGURING WORKSPACE"
              />
            </div>
            <div className="context-note">
              <KeyRound size={15} />
              <span>
                Settings apply to <strong>{target.name}</strong> and are ready for GitHub / backend hookup.
              </span>
              <Status value={target.status} />
            </div>
          </div>

          {/* Workspace-level OpenRouter API Key Card + live daily sync */}
          <section className="panel" style={{ marginBottom: 22, padding: "18px 22px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
              <div style={{ minWidth: 240, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <KeyRound size={15} className="primary-text" />
                  <h2 style={{ fontSize: 13, fontWeight: 500 }}>OpenRouter API Gateway ({target.name})</h2>
                  <span className="live-indicator">
                    <SyncDot health={target.openrouter_api_key ? "live" : catalog.health === "live" ? "live" : "stale"} size={6} />
                    {target.openrouter_api_key ? "Key configured" : "Free models ready · key optional"}
                  </span>
                </div>
                <p className="subtle" style={{ fontSize: 11, marginTop: 4 }}>
                  Provide a shared OpenRouter key (<code>sk-or-v1-...</code>) for all agents in {target.name}, or set individual keys per agent below. The full model catalog below is <strong>refreshed from OpenRouter daily</strong> — green light means live.
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 360px", maxWidth: 520 }}>
                <div style={{ position: "relative", flex: 1 }}>
                  <input
                    type={showTenantKey ? "text" : "password"}
                    value={currentTenantKey}
                    onChange={(e) => setTenantKeyDraft(e.target.value)}
                    placeholder="sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    aria-label="Workspace OpenRouter API Key"
                    style={{
                      width: "100%",
                      border: "1px solid var(--admin-line)",
                      borderRadius: 5,
                      background: "var(--admin-bg)",
                      color: "var(--admin-text)",
                      fontSize: 12,
                      padding: "8px 34px 8px 11px",
                      fontFamily: '"JetBrains Mono", monospace',
                    }}
                  />
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => setShowTenantKey(!showTenantKey)}
                    aria-label={showTenantKey ? "Hide API key" : "Show API key"}
                    style={{ position: "absolute", right: 3, top: "50%", transform: "translateY(-50%)", width: 26, height: 26 }}
                  >
                    {showTenantKey ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
                <button className="button primary small" onClick={saveWorkspaceKey}>
                  <Check size={13} />
                  Save key
                </button>
              </div>
            </div>
            {/* Daily catalog sync status + refresh — green light */}
            <div style={{ marginTop: 14 }}>
              <ModelSyncStatus />
            </div>
          </section>

          <div className="agent-controls-grid">
            {AGENT_IDS.map((id) => {
              const config = scoped.agents.find((a) => a.agent === id);
              if (!config) return null;
              const active = config.enabled && target.status === "active";
              // Merge over defaults field-by-field: the backend may return a
              // partial or empty profile, and `?? DEFAULT` never fires for {}.
              const orConfig = mergeOpenRouter(id, config.openrouter);
              const behavior = mergeBehavior(id, config.behavior);
              const modelObj = findModel(catalog.models, orConfig.model_id);
              const hasKey = Boolean(orConfig.api_key || target.openrouter_api_key);

              return (
                <section className="agent-control panel" key={id}>
                  <div className="agent-control-top">
                    <AgentMark agent={id} size="large" />
                    <Toggle
                      checked={config.enabled}
                      label={`Enable ${AGENTS[id].name} for ${target.name}`}
                      onChange={(enabled) =>
                        act(
                          () => agentsApi.update(session, target.id, id, { enabled }),
                          `${AGENTS[id].name} ${enabled ? "enabled" : "disabled"} for ${target.name}.`,
                        )
                      }
                    />
                  </div>

                  <div className="agent-control-name">
                    <h2>{AGENTS[id].name}</h2>
                    <Status value={active ? "active" : "paused"} />
                  </div>
                  <p className="agent-description">{behavior.persona_title || AGENTS[id].description}</p>

                  {/* OpenRouter Model Readout */}
                  <div className="agent-rule" style={{ paddingBlock: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span>OPENROUTER MODEL ({orConfig.model_tier.toUpperCase()})</span>
                      <span
                        style={{
                          fontSize: 9,
                          padding: "2px 6px",
                          borderRadius: 4,
                          fontFamily: '"JetBrains Mono", monospace',
                          background: orConfig.model_tier === "free" ? "var(--admin-soft)" : "#efc0801f",
                          color: orConfig.model_tier === "free" ? "var(--admin-accent)" : "#efc080",
                          border: "1px solid currentColor",
                        }}
                      >
                        {orConfig.model_tier === "free" ? "FREE MODEL" : "PAID MODEL"}
                      </span>
                    </div>
                    <code style={{ marginTop: 6 }}>{modelObj?.label ?? orConfig.model_id}</code>
                    <div className="subtle" style={{ fontSize: 10, marginTop: 4, display: "flex", justifyContent: "space-between" }}>
                      <span>Key: {hasKey ? "Configured ✓" : "Rule fallback mode"}</span>
                      <span>Temp: {orConfig.temperature}</span>
                    </div>
                  </div>

                  {/* Behavioral Profile Readout */}
                  <div style={{ paddingBlock: 12, borderBottom: "1px solid var(--admin-line)" }}>
                    <span style={{ display: "block", color: "var(--admin-faint)", fontSize: 8, letterSpacing: "0.13em" }}>
                      BEHAVIORAL PROFILE & SLA
                    </span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 7 }}>
                      <span className="live-indicator">Tone: {behavior.tone}</span>
                      <span className="live-indicator">Mode: {behavior.autonomy_mode.replace(/_/g, " ")}</span>
                      <span className="live-indicator">SLA: &lt;{behavior.response_sla_seconds}s</span>
                    </div>
                    <p
                      className="subtle"
                      style={{
                        fontSize: 10.5,
                        marginTop: 7,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      “{behavior.system_prompt.replace(/\{business\}/g, target.branding_config.app_name)}”
                    </p>
                  </div>

                  {/* Connected Tools Readout */}
                  <div style={{ paddingBlock: 12, borderBottom: "1px solid var(--admin-line)" }}>
                    <span style={{ display: "block", color: "var(--admin-faint)", fontSize: 8, letterSpacing: "0.13em" }}>
                      CONNECTED TOOLS ({behavior.connected_tools.length})
                    </span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 7 }}>
                      {behavior.connected_tools.map((toolId) => (
                        <button
                          key={toolId}
                          type="button"
                          onClick={() => navigate("tools")}
                          className="live-indicator"
                          style={{ cursor: "pointer", color: "var(--admin-text)" }}
                          title="Open Tools & Outcomes"
                        >
                          <Wrench size={10} />
                          {tools[toolId]?.name.split("&")[0].trim() ?? toolId}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="agent-completions" style={{ paddingBlock: 14 }}>
                    <strong>{number(config.actions_completed)}</strong>
                    <span>recorded actions</span>
                    <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--admin-faint)" }}>
                      {config.last_active_at ? relative(config.last_active_at) : "Ready"}
                    </span>
                  </div>

                  <div className="agent-control-actions" style={{ flexWrap: "wrap", paddingTop: 4 }}>
                    <button
                      className="button secondary small"
                      onClick={() => setModal({ agent: id, tab: "openrouter" })}
                    >
                      <Cpu size={12} />
                      OpenRouter AI
                    </button>
                    <button
                      className="button secondary small"
                      onClick={() => setModal({ agent: id, tab: "behavior" })}
                    >
                      <Sliders size={12} />
                      Behavior & Tools
                    </button>
                    <button
                      className="button primary small"
                      disabled={!active}
                      onClick={() =>
                        act(
                          () => eventsApi.trigger(session, target.id, id),
                          `${AGENTS[id].name} executed workflow and updated tool outcomes.`,
                        )
                      }
                    >
                      <Play size={12} />
                      Test agent
                    </button>
                  </div>

                  <button
                    className="agent-log-link"
                    onClick={() => {
                      setScope(target.id);
                      window.location.hash = `/admin/logs?agent=${id}`;
                    }}
                  >
                    View activity logs ({config.last_action})
                    <ArrowRight size={12} />
                  </button>
                </section>
              );
            })}
          </div>

          <section className="panel agent-activity-panel">
            <SectionHeading
              title="Recent agent & tool activity"
              description={`Live execution trail for ${target.name}.`}
              action={
                <button
                  className="text-button"
                  onClick={() => {
                    setScope(target.id);
                    navigate("logs");
                  }}
                >
                  All activity
                  <ArrowRight size={12} />
                </button>
              }
            />
            <EventFeed events={scoped.events.filter((event) => event.agent !== null)} limit={6} />
          </section>

          {modal && (
            <AgentSettingsModal
              tenant={target}
              config={scoped.agents.find((a) => a.agent === modal.agent)!}
              initialTab={modal.tab}
              onClose={() => setModal(null)}
              onSaved={(msg) => notify(msg)}
            />
          )}
        </>
      )}
    </>
  );
}

export function AgentSettingsModal({
  tenant,
  config,
  initialTab,
  onClose,
  onSaved,
}: {
  tenant: Tenant;
  config: AgentConfig;
  initialTab: "openrouter" | "behavior" | "json";
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { session } = useAdmin();
  const [tab, setTab] = useState<"openrouter" | "behavior" | "json">(initialTab);
  const [orDraft, setOrDraft] = useState<AgentOpenRouterConfig>(() =>
    mergeOpenRouter(config.agent, config.openrouter),
  );
  const [behDraft, setBehDraft] = useState<AgentBehaviorConfig>(() =>
    mergeBehavior(config.agent, config.behavior),
  );
  const [jsonDraft, setJsonDraft] = useState(() => JSON.stringify(config.config, null, 2));
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const catalog = useOpenRouterCatalog();

  const selectedModel = findModel(catalog.models, orDraft.model_id);
  const tools = tenant.tools_config ?? createDefaultToolsConfig(tenant.slug);

  const toggleTool = (toolId: ToolId) => {
    setBehDraft((prev) => ({
      ...prev,
      connected_tools: prev.connected_tools.includes(toolId)
        ? prev.connected_tools.filter((id) => id !== toolId)
        : [...prev.connected_tools, toolId],
    }));
  };

  const selectTier = (tier: ModelTier) => {
    const firstInTier = catalog.models.find((m) => m.tier === tier);
    setOrDraft((prev) => ({
      ...prev,
      model_tier: tier,
      model_id: firstInTier ? firstInTier.id : prev.model_id,
    }));
  };

  /**
   * Await the server before claiming success (part of the da39f3c act() fix):
   * the modal only closes and the success toast only fires once the backend
   * has actually persisted the profile; a rejection renders inline instead.
   */
  const saveAll = async () => {
    setError("");
    let parsedJson;
    try {
      parsedJson = validateAgentConfig(config.agent, JSON.parse(jsonDraft));
    } catch (err) {
      setError(errorMessage(err));
      return;
    }
    setSaving(true);
    try {
      await agentsApi.update(session, tenant.id, config.agent, {
        openrouter: orDraft,
        behavior: behDraft,
        config: parsedJson,
      });
      onSaved(`${AGENTS[config.agent].name} settings (OpenRouter, Behavior & Tools) saved for ${tenant.name}.`);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`${AGENTS[config.agent].name} — Agent Settings`}
      description={`Configure OpenRouter (Free & Paid models), behavioral persona, and tool bindings for ${tenant.name}.`}
      onClose={onClose}
      wide
    >
      <div className="filter-tabs" role="tablist" style={{ marginBottom: 18, borderBottom: "1px solid var(--admin-line)", paddingBottom: 10 }}>
        <button
          type="button"
          className={tab === "openrouter" ? "active" : ""}
          onClick={() => setTab("openrouter")}
        >
          <Cpu size={12} style={{ display: "inline", marginRight: 5 }} />
          OpenRouter API (Free & Paid Models)
        </button>
        <button
          type="button"
          className={tab === "behavior" ? "active" : ""}
          onClick={() => setTab("behavior")}
        >
          <Sparkles size={12} style={{ display: "inline", marginRight: 5 }} />
          Behavioral Settings & Tools
        </button>
        <button
          type="button"
          className={tab === "json" ? "active" : ""}
          onClick={() => setTab("json")}
        >
          <Braces size={12} style={{ display: "inline", marginRight: 5 }} />
          Rule Parameters (JSON)
        </button>
      </div>

      {tab === "openrouter" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, padding: "12px 14px", border: "1px solid var(--admin-line)", borderRadius: 6, background: "var(--admin-bg)" }}>
            <div>
              <strong style={{ fontSize: 12, display: "block" }}>Enable OpenRouter LLM for {AGENTS[config.agent].name}</strong>
              <span className="subtle" style={{ fontSize: 11 }}>
                When enabled, {AGENTS[config.agent].name} uses your selected Free or Paid OpenRouter model and falls back to deterministic rules if offline.
              </span>
            </div>
            <Toggle
              checked={orDraft.enabled}
              label="Enable OpenRouter for this agent"
              onChange={(enabled) => setOrDraft({ ...orDraft, enabled })}
            />
          </div>

          <label className="admin-field">
            <span>Agent OpenRouter API Key (optional override)</span>
            <div style={{ position: "relative" }}>
              <input
                type={showKey ? "text" : "password"}
                value={orDraft.api_key}
                onChange={(e) => setOrDraft({ ...orDraft, api_key: e.target.value })}
                placeholder={tenant.openrouter_api_key ? "Using workspace OpenRouter key (enter to override)" : "sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}
                className="mono"
              />
              <button
                type="button"
                className="icon-button"
                onClick={() => setShowKey(!showKey)}
                style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)" }}
                aria-label="Toggle API key visibility"
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <small>
              Stored in tenant configuration for GitHub / backend deployment (`OPENROUTER_API_KEY`). Leave blank to inherit the workspace key.
            </small>
          </label>

          {/* Live OpenRouter catalog: searchable Free vs Paid picker */}
          <div className="admin-field">
            <span>Live OpenRouter catalog — search & select model</span>
            <ModelPicker
              value={orDraft.model_id}
              tier={orDraft.model_tier}
              onTier={selectTier}
              agentId={config.agent}
              onSelect={(m) => setOrDraft({ ...orDraft, model_id: m.id, model_tier: m.tier })}
            />
            {selectedModel && (
              <small style={{ marginTop: 8, display: "block" }}>
                Selected: <code>{selectedModel.id}</code> · {selectedModel.provider} · {selectedModel.context_window} ctx · {selectedModel.cost_label}
              </small>
            )}
          </div>

          <div className="form-grid">
            <label className="admin-field">
              <span>Temperature ({orDraft.temperature})</span>
              <input
                type="number"
                min="0"
                max="1"
                step="0.05"
                value={orDraft.temperature}
                onChange={(e) => setOrDraft({ ...orDraft, temperature: Number(e.target.value) })}
              />
              <small>Lower (0.1–0.3) keeps operational actions deterministic.</small>
            </label>
            <label className="admin-field">
              <span>Max output tokens</span>
              <input
                type="number"
                min="64"
                max="4096"
                step="32"
                value={orDraft.max_tokens}
                onChange={(e) => setOrDraft({ ...orDraft, max_tokens: Number(e.target.value) })}
              />
              <small>Recommended 240–512 for fast guest & booking responses.</small>
            </label>
          </div>
        </div>
      )}

      {tab === "behavior" && (
        <div>
          <div className="form-grid">
            <label className="admin-field">
              <span>Agent Persona Title</span>
              <input
                value={behDraft.persona_title}
                onChange={(e) => setBehDraft({ ...behDraft, persona_title: e.target.value })}
                placeholder="e.g. TALA — Concierge Specialist"
              />
            </label>
            <label className="admin-field">
              <span>Communication Tone</span>
              <select
                value={behDraft.tone}
                onChange={(e) => setBehDraft({ ...behDraft, tone: e.target.value as BehaviorTone })}
              >
                <option value="hospitality">Warm & Hospitality-First</option>
                <option value="concise">Direct & Concise</option>
                <option value="executive">Executive & Operational</option>
                <option value="persuasive">Conversion & Sales-Focused</option>
                <option value="custom">Custom Persona</option>
              </select>
            </label>
            <label className="admin-field">
              <span>Autonomy Mode</span>
              <select
                value={behDraft.autonomy_mode}
                onChange={(e) => setBehDraft({ ...behDraft, autonomy_mode: e.target.value as AutonomyMode })}
              >
                <option value="auto_execute">Auto-Execute (No human gate)</option>
                <option value="draft_only">Draft & Queue for Review</option>
                <option value="manual_approval">Manual Approval Required</option>
              </select>
            </label>
            <label className="admin-field">
              <span>Target Response SLA (seconds)</span>
              <input
                type="number"
                min="5"
                max="3600"
                value={behDraft.response_sla_seconds}
                onChange={(e) => setBehDraft({ ...behDraft, response_sla_seconds: Number(e.target.value) })}
              />
            </label>
          </div>

          <label className="admin-field">
            <span>System Behavioral Prompt (Instructions for {AGENTS[config.agent].name})</span>
            <textarea
              value={behDraft.system_prompt}
              onChange={(e) => setBehDraft({ ...behDraft, system_prompt: e.target.value })}
              rows={4}
            />
            <small>Use <code>{"{business}"}</code> to dynamically inject {tenant.branding_config.app_name}.</small>
          </label>

          <label className="admin-field">
            <span>Human Escalation Rule</span>
            <input
              value={behDraft.escalation_rule}
              onChange={(e) => setBehDraft({ ...behDraft, escalation_rule: e.target.value })}
            />
            <small>Defines when {AGENTS[config.agent].name} routes an item to the human attention queue.</small>
          </label>

          <div className="admin-field">
            <span>Connected Tools ({behDraft.connected_tools.length} active)</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {TOOL_IDS.map((toolId) => {
                const tool = tools[toolId];
                const checked = behDraft.connected_tools.includes(toolId);
                return (
                  <label
                    key={toolId}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 9,
                      padding: "10px 12px",
                      border: checked ? "1px solid var(--admin-accent)" : "1px solid var(--admin-line)",
                      borderRadius: 5,
                      background: checked ? "var(--admin-soft)" : "var(--admin-bg)",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleTool(toolId)}
                      style={{ width: "auto", marginTop: 3 }}
                    />
                    <div>
                      <strong style={{ display: "block", fontSize: 11.5 }}>{tool.name}</strong>
                      <span className="subtle" style={{ fontSize: 10 }}>{tool.outcome_label}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {tab === "json" && (
        <div>
          <div className="code-heading">
            <span>RULE PARAMETERS</span>
            <span>JSON</span>
          </div>
          <textarea
            className="json-editor"
            aria-label={`${AGENTS[config.agent].name} JSON configuration`}
            spellCheck={false}
            value={jsonDraft}
            onChange={(e) => {
              setJsonDraft(e.target.value);
              setError("");
            }}
          />
          <p className="page-footnote">
            {config.agent === "tala"
              ? "Use {business} in reply_template to insert the tenant's app name."
              : config.agent === "nyx"
                ? "qualification_threshold: 0-100. follow_up_hours: 1-720."
                : "confirm_bookings and notify_staff accept true or false."}
          </p>
        </div>
      )}

      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}

      <div className="dialog-footer">
        <span className="subtle small-text">
          All settings are saved to the tenant profile and exported in your GitHub config bundle.
        </span>
        <button className="button secondary" onClick={onClose}>
          Cancel
        </button>
        <button className="button primary" onClick={() => void saveAll()} disabled={saving}>
          <Check size={14} />
          {saving ? "Saving…" : "Save agent settings"}
        </button>
      </div>
    </Modal>
  );
}
