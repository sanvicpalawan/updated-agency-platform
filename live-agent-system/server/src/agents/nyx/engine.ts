/**
 * NYX — decision engine.
 *
 * Pipeline:  input → extractFeatures → weighted scorers → structured decision.
 *
 * Returns the exact contract the LLM strategy must also satisfy:
 *   { score: number, reasoning: string, tags: string[] }
 * plus a `breakdown` for UI traceability and token fields (null on the local
 * path, populated on the LLM path).
 */
import { extractFeatures, featuresToPromptContext, type LeadFeatures } from "./features.ts";
import { SCORERS, TOTAL_WEIGHT } from "./scorers.ts";
import type { NyxDecision, NyxDecisionInput, NyxScoringStrategy } from "../llm/strategy.ts";

export interface ScoredBreakdown {
  key: string;
  label: string;
  points: number;
  weight: number;
  contribution: number;
  why: string;
}

export interface LocalNyxResult extends NyxDecision {
  features: LeadFeatures;
  breakdown: (ScoredBreakdown & { key: string })[];
  prompt_context: Record<string, unknown>;
}

export function scoreWithFeatures(features: LeadFeatures): {
  raw: number;
  breakdown: ScoredBreakdown[];
  tags: string[];
  reasons: string[];
} {
  const breakdown: ScoredBreakdown[] = [];
  const tags: string[] = [];
  const reasons: string[] = [];

  for (const scorer of SCORERS) {
    const { points, why, tag } = scorer.evaluate(features);
    const clamped = Math.max(0, Math.min(scorer.max, points));
    const contribution = (clamped / scorer.max) * scorer.weight * 100;
    breakdown.push({
      key: scorer.key,
      label: scorer.label,
      points: clamped,
      weight: scorer.weight,
      contribution: Math.round(contribution * 10) / 10,
      why,
    });
    if (tag) tags.push(tag);
    reasons.push(`${scorer.label}: ${why}`);
  }

  // Normalise against the actual weight mass so adding a scorer cannot silently
  // rescale every existing score.
  const weighted = breakdown.reduce((sum, b) => sum + b.contribution, 0);
  const raw = Math.round((weighted / (TOTAL_WEIGHT * 100)) * 100);

  return { raw, breakdown, tags: [...new Set(tags)], reasons };
}

export class LocalNyxStrategy implements NyxScoringStrategy {
  readonly id = "local" as const;
  readonly label = "Local decision engine (weighted feature scoring)";

  async scoreLead(input: NyxDecisionInput): Promise<LocalNyxResult> {
    const features = extractFeatures(input);
    const { raw, breakdown, tags, reasons } = scoreWithFeatures(features);

    const score = Math.max(0, Math.min(100, raw));

    const verdict =
      score >= 80 ? "Hot — prioritise immediate personal follow-up"
      : score >= 65 ? "Qualified — route to booking flow"
      : score >= 45 ? "Warm — needs one more qualification touch"
      : "Cold — nurture sequence";

    return {
      score,
      reasoning: `${verdict}. ${reasons.join("; ")}.`,
      tags: score >= 80 ? [...tags, "hot"] : score >= 65 ? [...tags, "qualified"] : tags,
      strategy: "local",
      breakdown: breakdown as LocalNyxResult["breakdown"],
      features,
      prompt_context: featuresToPromptContext(features),
      tokens_in: null,
      tokens_out: null,
      cost_usd: null,
      model_id: null,
    };
  }
}

export const localNyx = new LocalNyxStrategy();
