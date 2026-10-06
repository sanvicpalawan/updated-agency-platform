/**
 * Frontend regression tests for the da39f3c Agents-page crash.
 *
 * The page used `config.behavior ?? DEFAULT_AGENT_BEHAVIOR[id]`. The backend
 * returns `{}` — not null — for an unset profile, so `??` never fell through,
 * and `behavior.system_prompt.replace(...)` threw, taking the whole page to
 * the error boundary (which rendered "No workspaces yet — Create tenant").
 *
 * These tests feed the helpers exactly the payloads the backend produces
 * (including `{}` and the legacy minimal profile) and assert that every field
 * the UI dereferences exists. Run: npm run verify:config
 */
import {
  AGENT_IDS,
  DEFAULT_AGENT_BEHAVIOR,
  DEFAULT_AGENT_OPENROUTER,
  mergeBehavior,
  mergeOpenRouter,
} from "../src/config/platform";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("── mergeBehavior ────────────────────────────────────");

for (const agent of AGENT_IDS) {
  // The exact payload shape that crashed the page: behavior === {}
  const fromEmpty = mergeBehavior(agent, {});
  check(
    `${agent}: {} merges to a complete profile`,
    typeof fromEmpty.system_prompt === "string" &&
      fromEmpty.system_prompt.length > 40 &&
      Array.isArray(fromEmpty.connected_tools) &&
      fromEmpty.connected_tools.length > 0 &&
      typeof fromEmpty.persona_title === "string" &&
      typeof fromEmpty.escalation_rule === "string" &&
      Number.isFinite(fromEmpty.response_sla_seconds),
    JSON.stringify(fromEmpty),
  );

  // The exact expression that threw in agents/page.tsx must not throw.
  let crashed = false;
  try {
    fromEmpty.system_prompt.replace(/\{business\}/g, "BAIA");
    fromEmpty.autonomy_mode.replace(/_/g, " ");
  } catch {
    crashed = true;
  }
  check(`${agent}: page render expressions do not throw on {} profile`, !crashed);

  // Legacy seeded shape (tone/autonomy/SLA only) must also come back complete.
  const legacy = mergeBehavior(agent, {
    tone: DEFAULT_AGENT_BEHAVIOR[agent].tone,
    autonomy_mode: "auto_execute",
    response_sla_seconds: 25,
  });
  check(
    `${agent}: legacy minimal profile is completed from defaults`,
    legacy.system_prompt === DEFAULT_AGENT_BEHAVIOR[agent].system_prompt &&
      legacy.persona_title === DEFAULT_AGENT_BEHAVIOR[agent].persona_title,
    JSON.stringify(legacy),
  );

  // undefined / null behave the same as {}.
  check(`${agent}: undefined falls back to defaults`,
    mergeBehavior(agent, undefined).system_prompt === DEFAULT_AGENT_BEHAVIOR[agent].system_prompt);
  check(`${agent}: null falls back to defaults`,
    mergeBehavior(agent, null).connected_tools.length === DEFAULT_AGENT_BEHAVIOR[agent].connected_tools.length);

  // Genuine customisations still win over defaults.
  const custom = mergeBehavior(agent, { system_prompt: "Custom prompt", response_sla_seconds: 99 });
  check(`${agent}: saved overrides are preserved`,
    custom.system_prompt === "Custom prompt" && custom.response_sla_seconds === 99,
    JSON.stringify({ sp: custom.system_prompt, sla: custom.response_sla_seconds }));

  // Garbage field types cannot poison the page.
  const garbage = mergeBehavior(agent, {
    system_prompt: "",
    response_sla_seconds: Number.NaN,
    connected_tools: "nope" as unknown as never,
  });
  check(`${agent}: empty/garbage values fall back safely`,
    garbage.system_prompt === DEFAULT_AGENT_BEHAVIOR[agent].system_prompt &&
      garbage.response_sla_seconds === DEFAULT_AGENT_BEHAVIOR[agent].response_sla_seconds &&
      Array.isArray(garbage.connected_tools),
    JSON.stringify(garbage));
}

console.log("\n── mergeOpenRouter ──────────────────────────────────");

for (const agent of AGENT_IDS) {
  const fromEmpty = mergeOpenRouter(agent, {});
  check(
    `${agent}: {} merges to a complete openrouter profile`,
    typeof fromEmpty.model_id === "string" &&
      fromEmpty.model_id.length > 0 &&
      (fromEmpty.model_tier === "free" || fromEmpty.model_tier === "paid") &&
      Number.isFinite(fromEmpty.temperature) &&
      Number.isFinite(fromEmpty.max_tokens) &&
      typeof fromEmpty.fallback_to_rules === "boolean",
    JSON.stringify(fromEmpty),
  );
  const custom = mergeOpenRouter(agent, { model_tier: "paid", model_id: "openai/gpt-4o", temperature: 0.7 });
  check(`${agent}: saved openrouter overrides are preserved`,
    custom.model_id === "openai/gpt-4o" && custom.model_tier === "paid" && custom.temperature === 0.7,
    JSON.stringify(custom));
}

console.log(`\n${passed}/${passed + failed} checks passed.`);
if (failed) {
  console.error("\nFailures:");
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
