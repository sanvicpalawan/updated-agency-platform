/**
 * Agent runtime — resolves which decision strategy each agent uses.
 *
 * Default is the local engine (no network). Set
 *   AGENT_LLM_PROVIDER=openrouter
 *   OPENROUTER_API_KEY=sk-or-v1-...
 * to route NYX scoring and TALA replies through OpenRouter. `GET /api/agents/runtime`
 * reports the live configuration so the UI can show what actually ran.
 */
import { localNyx } from "./nyx/engine.ts";
import { localTala } from "./tala/engine.ts";
import { llmProviderEnabled, OpenRouterNyxStrategy, OpenRouterTalaStrategy } from "./llm/openrouter.ts";
import type { AgentRuntimeConfig, ProviderId } from "./llm/strategy.ts";

const nyxStrategy = llmProviderEnabled() ? new OpenRouterNyxStrategy() : localNyx;
const talaStrategy = llmProviderEnabled() ? new OpenRouterTalaStrategy() : localTala;

export const runtime: AgentRuntimeConfig = { nyx: nyxStrategy, tala: talaStrategy };

export function runtimeInfo(): {
  provider: ProviderId;
  llm_configured: boolean;
  nyx: { strategy: string; label: string };
  tala: { strategy: string; label: string };
  hermes: { strategy: string; label: string };
} {
  return {
    provider: llmProviderEnabled() ? "openrouter" : "local",
    llm_configured: llmProviderEnabled(),
    nyx: { strategy: runtime.nyx.id, label: runtime.nyx.label },
    tala: { strategy: runtime.tala.id, label: runtime.tala.label },
    hermes: {
      strategy: "local",
      label: "Deterministic orchestrator (no LLM — routes events and executes tools)",
    },
  };
}
