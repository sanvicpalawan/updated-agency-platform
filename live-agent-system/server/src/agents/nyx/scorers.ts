/**
 * NYX — weighted scoring functions.
 *
 * Each scorer is an independent, named signal that returns raw points plus a
 * human-readable justification. The engine sums `points * weight` and folds the
 * justifications into `reasoning`.
 *
 * This is the layer an LLM replaces. Because scorers are declarative, they also
 * become the *rubric* handed to an LLM: the model is asked to produce the same
 * `{score, reasoning, tags}` shape, and `agent_runs.strategy` records which
 * path produced the number.
 */
import type { LeadFeatures } from "./features.ts";

export interface ScorerResult {
  points: number;
  why: string;
  tag?: string;
}

export interface Scorer {
  key: string;
  label: string;
  /** Relative influence. Normalised by the engine. */
  weight: number;
  /** Ceiling on raw points before weighting. */
  max: number;
  evaluate(f: LeadFeatures): ScorerResult;
}

export const SCORERS: Scorer[] = [
  {
    key: "contact_quality",
    label: "Contact quality",
    weight: 0.14,
    max: 100,
    evaluate(f) {
      if (!f.has_email) return { points: 30, why: "No email address captured" };
      if (f.email_domain_kind === "disposable") {
        return { points: 10, why: "Disposable email domain — likely not a real buyer", tag: "risk_disposable_email" };
      }
      if (f.email_domain_kind === "business") {
        return { points: 100, why: "Business email domain — strong buying signal", tag: "business_domain" };
      }
      return { points: 65, why: "Personal email domain" };
    },
  },
  {
    key: "message_substance",
    label: "Message substance",
    weight: 0.12,
    max: 100,
    evaluate(f) {
      if (f.inquiry_word_count === 0) return { points: 0, why: "Empty inquiry body" };
      if (f.inquiry_word_count < 6) return { points: 35, why: `Very short inquiry (${f.inquiry_word_count} words)` };
      if (f.inquiry_word_count < 20) return { points: 70, why: `Moderate detail (${f.inquiry_word_count} words)` };
      return { points: 100, why: `Detailed inquiry (${f.inquiry_word_count} words)`, tag: "high_detail" };
    },
  },
  {
    key: "booking_intent",
    label: "Booking intent",
    weight: 0.22,
    max: 100,
    evaluate(f) {
      if (f.booking_intent_hit) {
        return { points: 100, why: "Explicit booking or reservation language", tag: "booking_intent" };
      }
      if (f.budget_hit) return { points: 72, why: "Asked about pricing or a quote", tag: "price_inquiry" };
      if (f.inquiry_word_count > 0) return { points: 34, why: "General enquiry, no explicit booking language" };
      return { points: 0, why: "No intent signal" };
    },
  },
  {
    key: "timeline",
    label: "Timeline specificity",
    weight: 0.16,
    max: 100,
    evaluate(f) {
      const urgent = f.urgency_hit;
      if (f.timeline_hit && urgent) {
        return { points: 100, why: "Concrete date and urgency language", tag: "hot_timeline" };
      }
      if (f.timeline_hit) return { points: 78, why: "Specific date or timeframe given", tag: "timeline_given" };
      if (urgent) return { points: 70, why: "Urgency expressed without a date", tag: "urgency" };
      return { points: 25, why: "No timeframe mentioned" };
    },
  },
  {
    key: "deal_size",
    label: "Deal size signal",
    weight: 0.14,
    max: 100,
    evaluate(f) {
      if (f.is_group_or_corporate) {
        return { points: 100, why: "Group, corporate or event scale indicated", tag: "high_value" };
      }
      return { points: 45, why: "Single-party request" };
    },
  },
  {
    key: "channel_value",
    label: "Channel value",
    weight: 0.1,
    max: 100,
    evaluate: (f) => ({
      points: Math.round(f.channel_weight * 100),
      why: `Inbound via ${f.channel}`,
    }),
  },
  {
    key: "engagement",
    label: "Engagement history",
    weight: 0.07,
    max: 100,
    evaluate(f) {
      if (f.prior_touches === 0) return { points: 40, why: "First contact" };
      if (f.prior_touches <= 2) return { points: 75, why: `${f.prior_touches} prior touch(es)`, tag: "engaged" };
      return { points: 60, why: `${f.prior_touches} prior touches — risk of stalling`, tag: "needs_nudge" };
    },
  },
  {
    key: "risk",
    label: "Risk flags",
    weight: 0.05,
    max: 100,
    evaluate(f) {
      if (f.sentiment_negative) {
        return { points: 0, why: "Complaint or refund language — route to human", tag: "risk_escalate" };
      }
      if (f.price_sensitivity_hit) {
        return { points: 45, why: "Price sensitivity expressed", tag: "price_sensitive" };
      }
      return { points: 80, why: "No risk flags" };
    },
  },
];

export const TOTAL_WEIGHT = SCORERS.reduce((sum, s) => sum + s.weight, 0);

/** Exposed so the rubric can be handed verbatim to an LLM strategy later. */
export function scoringRubric(): { key: string; label: string; weight: number }[] {
  return SCORERS.map(({ key, label, weight }) => ({ key, label, weight }));
}
