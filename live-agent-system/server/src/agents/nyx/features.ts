/**
 * NYX — feature extraction.
 *
 * Pure function: raw lead input in, normalised feature vector out. No scoring
 * happens here. Keeping extraction separate from scoring is what makes the LLM
 * swap cheap: an LLM strategy can be handed the same feature vector as
 * structured context instead of a raw inquiry blob.
 */
import type { NyxDecisionInput } from "../llm/strategy.ts";

export type EmailDomainKind = "free" | "business" | "disposable" | "unknown";

export interface LeadFeatures {
  has_email: boolean;
  email_domain_kind: EmailDomainKind;
  inquiry_length: number;
  inquiry_word_count: number;
  urgency_hit: boolean;
  budget_hit: boolean;
  timeline_hit: boolean;
  booking_intent_hit: boolean;
  price_sensitivity_hit: boolean;
  matched_keywords: string[];
  channel: string;
  channel_weight: number;
  prior_touches: number;
  lead_age_hours: number;
  is_group_or_corporate: boolean;
  question_count: number;
  sentiment_negative: boolean;
}

const FREE_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com",
  "aol.com", "proton.me", "protonmail.com", "mail.com", "zoho.com",
]);
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "tempmail.com", "10minutemail.com", "guerrillamail.com", "throwaway.email",
]);

const INTENT_KEYWORDS: { re: RegExp; tag: string }[] = [
  { re: /\b(book|booking|reserve|reservation|hold)\b/i, tag: "booking_intent" },
  { re: /\b(quote|quotation|estimate|pricing|price|cost|rate|rates)\b/i, tag: "price_inquiry" },
  { re: /\b(install|installation|renovat|build|construct)\b/i, tag: "project_scope" },
  { re: /\b(urgent|asap|as soon as possible|immediately|today|tonight)\b/i, tag: "urgency" },
  { re: /\b(budget|afford|discount|cheaper|deal|promo)\b/i, tag: "price_sensitive" },
  { re: /\b(next week|this week|tomorrow|next month|\d{1,2}(st|nd|rd|th)\b|january|february|march|april|may|june|july|august|september|october|november|december)\b/i, tag: "timeline_given" },
  { re: /\b(group|party of|team|corporate|company|wedding|event|conference|delegation)\b/i, tag: "group_or_corporate" },
  { re: /\b(cancell?ation|refund|complaint|disappointed|problem|issue|broken)\b/i, tag: "risk_negative" },
];

/** Channels differ in commercial intent: a WhatsApp DM beats a cold web form. */
const CHANNEL_WEIGHTS: Record<string, number> = {
  WhatsApp: 1.0,
  Instagram: 0.85,
  Email: 0.8,
  Website: 0.65,
};

function classifyEmailDomain(email: string): EmailDomainKind {
  if (!email.includes("@")) return "unknown";
  const domain = email.split("@")[1]?.toLowerCase().trim() ?? "";
  if (!domain) return "unknown";
  if (DISPOSABLE_DOMAINS.has(domain)) return "disposable";
  if (FREE_DOMAINS.has(domain)) return "free";
  return "business";
}

export function extractFeatures(input: NyxDecisionInput): LeadFeatures {
  const inquiry = input.inquiry ?? "";
  const words = inquiry.trim().split(/\s+/).filter(Boolean);
  const matched_keywords: string[] = [];

  let urgency_hit = false;
  let budget_hit = false;
  let timeline_hit = false;
  let booking_intent_hit = false;
  let price_sensitivity_hit = false;
  let is_group_or_corporate = false;
  let sentiment_negative = false;

  for (const { re, tag } of INTENT_KEYWORDS) {
    if (re.test(inquiry)) {
      matched_keywords.push(tag);
      if (tag === "urgency") urgency_hit = true;
      if (tag === "price_inquiry") budget_hit = true;
      if (tag === "timeline_given") timeline_hit = true;
      if (tag === "booking_intent") booking_intent_hit = true;
      if (tag === "price_sensitive") price_sensitivity_hit = true;
      if (tag === "group_or_corporate") is_group_or_corporate = true;
      if (tag === "risk_negative") sentiment_negative = true;
    }
  }

  return {
    has_email: Boolean(input.email?.includes("@")),
    email_domain_kind: classifyEmailDomain(input.email ?? ""),
    inquiry_length: inquiry.length,
    inquiry_word_count: words.length,
    urgency_hit,
    budget_hit,
    timeline_hit,
    booking_intent_hit,
    price_sensitivity_hit,
    matched_keywords,
    channel: input.channel,
    channel_weight: CHANNEL_WEIGHTS[input.channel] ?? 0.6,
    prior_touches: input.prior_touches,
    lead_age_hours: input.lead_age_hours,
    is_group_or_corporate,
    question_count: (inquiry.match(/\?/g) ?? []).length,
    sentiment_negative,
  };
}

/** Flatten features into the compact context block an LLM prompt would carry. */
export function featuresToPromptContext(f: LeadFeatures): Record<string, unknown> {
  return {
    contact: { has_email: f.has_email, domain_class: f.email_domain_kind },
    message: {
      words: f.inquiry_word_count,
      questions: f.question_count,
      detected_signals: f.matched_keywords,
    },
    timing: { lead_age_hours: Math.round(f.lead_age_hours * 10) / 10, prior_touches: f.prior_touches },
    channel: f.channel,
  };
}
