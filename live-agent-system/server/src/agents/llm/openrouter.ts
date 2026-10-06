/**
 * OpenRouter adapter — the drop-in LLM replacement for the local strategies.
 *
 * INERT BY DEFAULT. Nothing in this module runs unless BOTH are set:
 *   AGENT_LLM_PROVIDER=openrouter
 *   OPENROUTER_API_KEY=sk-or-v1-...
 *
 * The sandbox this was built in has no egress to openrouter.ai, so the local
 * strategies remain the default and this path is exercised only on a host with
 * network access. `GET /api/agents/runtime` reports which provider is live.
 *
 * Both strategies return the same structured contract as their local twins, so
 * swapping providers changes no calling code and no schema.
 */
import { scoringRubric } from "../nyx/scorers.ts";
import { extractFeatures, featuresToPromptContext } from "../nyx/features.ts";
import type {
  NyxDecision,
  NyxDecisionInput,
  NyxScoringStrategy,
  TalaDecision,
  TalaDecisionInput,
  TalaResponseStrategy,
  TokenUsage,
} from "./strategy.ts";

const OPENROUTER_BASE = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = process.env.OPENROUTER_MODEL ?? "meta-llama/llama-3.3-70b-instruct:free";
const REQUEST_TIMEOUT_MS = Number(process.env.OPENROUTER_TIMEOUT_MS ?? 20_000);

export function llmProviderEnabled(): boolean {
  return (
    process.env.AGENT_LLM_PROVIDER === "openrouter" &&
    /^sk-or-v1-[A-Za-z0-9_-]{8,}$/.test(process.env.OPENROUTER_API_KEY ?? "")
  );
}

interface ChatChoice {
  message?: { content?: string };
}
interface ChatResponse {
  choices?: ChatChoice[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_cost?: number };
  model?: string;
}

/** Single chat/completions round-trip. Throws on any non-2xx or malformed body. */
async function chat(
  system: string,
  user: string,
  opts: { jsonMode?: boolean } = {},
): Promise<{ text: string; usage: TokenUsage }> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.OPENROUTER_REFERER ?? "http://localhost:5173",
        "X-Title": process.env.OPENROUTER_TITLE ?? "CORE Agent Runtime",
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenRouter responded ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    const json = (await res.json()) as ChatResponse;
    const text = json.choices?.[0]?.message?.content ?? "";
    if (!text.trim()) throw new Error("OpenRouter returned an empty completion");
    return {
      text,
      usage: {
        tokens_in: json.usage?.prompt_tokens ?? null,
        tokens_out: json.usage?.completion_tokens ?? null,
        cost_usd: json.usage?.total_cost ?? null,
        model_id: json.model ?? DEFAULT_MODEL,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Tolerant JSON extraction: handles ```json fences and leading prose. */
function parseJsonLoose<T>(raw: string): T {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error(`No JSON object in model output: ${raw.slice(0, 200)}`);
  return JSON.parse(candidate.slice(start, end + 1)) as T;
}

function clampScore(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`Model returned a non-numeric score: ${String(value)}`);
  return Math.max(0, Math.min(100, Math.round(n)));
}

/* ------------------------------------------------------------------ */
/* NYX via LLM                                                         */
/* ------------------------------------------------------------------ */

const NYX_SYSTEM = `You are NYX, a lead-qualification analyst for a hospitality and services business.
Score the inbound lead from 0 to 100 using the supplied rubric weights as guidance.
You MUST respond with a single JSON object and nothing else, matching exactly:
{
  "score": <integer 0-100>,
  "reasoning": "<one or two sentences citing the strongest signals>",
  "tags": ["<lowercase_snake_tag>", ...]
}
Rules: a score of 80+ means hot and needs immediate human follow-up; 65-79 is qualified;
45-64 is warm; below 45 is cold. Never invent details absent from the inquiry.`;

export class OpenRouterNyxStrategy implements NyxScoringStrategy {
  readonly id = "openrouter" as const;
  readonly label = `OpenRouter (${DEFAULT_MODEL})`;

  async scoreLead(input: NyxDecisionInput): Promise<NyxDecision> {
    const features = extractFeatures(input);
    const user = JSON.stringify(
      {
        rubric: scoringRubric(),
        lead: {
          name: input.name,
          email: input.email || null,
          channel: input.channel,
          inquiry: input.inquiry,
          prior_touches: input.prior_touches,
          lead_age_hours: Math.round(input.lead_age_hours * 10) / 10,
          business: input.tenant_name,
        },
        extracted_features: featuresToPromptContext(features),
      },
      null,
      2,
    );

    const { text, usage } = await chat(NYX_SYSTEM, user, { jsonMode: true });
    const parsed = parseJsonLoose<{ score: unknown; reasoning: unknown; tags: unknown }>(text);

    return {
      score: clampScore(parsed.score),
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "Model returned no reasoning.",
      tags: Array.isArray(parsed.tags)
        ? parsed.tags.filter((t): t is string => typeof t === "string").slice(0, 12)
        : [],
      strategy: "openrouter",
      breakdown: [
        {
          key: "llm",
          points: clampScore(parsed.score),
          weight: 1,
          why: `Produced by ${usage.model_id ?? DEFAULT_MODEL}`,
        },
      ],
      ...usage,
    };
  }
}

/* ------------------------------------------------------------------ */
/* TALA via LLM                                                        */
/* ------------------------------------------------------------------ */

const TALA_SYSTEM = `You are TALA, the front-desk concierge agent for a hospitality business.
Write one reply to the guest. Be warm, specific, and concise (under 90 words).
Use the retrieved memory to avoid repeating questions the guest already answered.
Never promise availability you were not given. Never mention that you are an AI.
Respond with a single JSON object and nothing else:
{
  "reply": "<the message to send>",
  "intent": "<booking|pricing|availability|support|general>",
  "next_action": "<what the business should do next, one sentence>"
}`;

export class OpenRouterTalaStrategy implements TalaResponseStrategy {
  readonly id = "openrouter" as const;
  readonly label = `OpenRouter (${DEFAULT_MODEL})`;

  async composeReply(input: TalaDecisionInput): Promise<TalaDecision> {
    const user = JSON.stringify(
      {
        business: input.business_name,
        tone: input.tone,
        lead: { name: input.lead_name, channel: input.channel, inquiry: input.inquiry },
        prior_outbound_messages: input.prior_outbound_count,
        retrieved_memory: input.memory,
      },
      null,
      2,
    );

    const { text, usage } = await chat(TALA_SYSTEM, user, { jsonMode: true });
    const parsed = parseJsonLoose<{ reply: unknown; intent: unknown; next_action: unknown }>(text);

    if (typeof parsed.reply !== "string" || !parsed.reply.trim()) {
      throw new Error("Model returned no usable reply text");
    }

    return {
      reply: parsed.reply.trim(),
      intent: typeof parsed.intent === "string" ? parsed.intent : "general",
      next_action: typeof parsed.next_action === "string" ? parsed.next_action : "",
      strategy: "openrouter",
      ...usage,
    };
  }
}
