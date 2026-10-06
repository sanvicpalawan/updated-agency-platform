/**
 * TALA — templated response engine.
 *
 * Three layers, kept separate on purpose so an LLM can replace only the last:
 *   1. intent classification   (which template family)
 *   2. context assembly        (business, guest, channel, memory facts)
 *   3. rendering               (slot injection + variant pick)
 */

export type GuestIntent = "booking" | "pricing" | "availability" | "support" | "general";

export interface TemplateContext {
  business: string;
  first_name: string;
  channel: string;
  greeting_style: string;
  /** Facts pulled from agent_memory, already phrased for insertion. */
  memory_lines: string[];
  intent: GuestIntent;
  next_action: string;
  is_followup: boolean;
}

interface TemplateVariant {
  body: string;
  when?: (ctx: TemplateContext) => boolean;
}

const TEMPLATES: Record<GuestIntent, TemplateVariant[]> = {
  booking: [
    {
      when: (c) => c.is_followup && c.memory_lines.length > 0,
      body:
        `Hello {{first_name}}, thank you for reaching out to {{business}}. ` +
        `I have your earlier details to hand, so we can pick up right where we left off.\n\n` +
        `{{memory_block}}` +
        `I have pencilled your request in and our team will confirm the specifics with you shortly. ` +
        `{{next_action}}`,
    },
    {
      body:
        `Hello {{first_name}}, thank you for contacting {{business}}. ` +
        `I have logged your booking request and passed it to our reservations team.\n\n` +
        `To lock it in we just need your preferred dates and party size. ` +
        `{{next_action}}`,
    },
  ],
  pricing: [
    {
      body:
        `Hello {{first_name}}, thanks for your interest in {{business}}. ` +
        `Pricing depends on the scope you have in mind, so I have flagged your request for a tailored quote.\n\n` +
        `If you can share rough dimensions or dates, I can have an estimate with you quickly. {{next_action}}`,
    },
  ],
  availability: [
    {
      body:
        `Hello {{first_name}}, thank you for writing to {{business}}. ` +
        `I am checking current availability against your requested window now.\n\n` +
        `I will come back to you with the open options as soon as I have them. {{next_action}}`,
    },
  ],
  support: [
    {
      body:
        `Hello {{first_name}}, thank you for getting in touch with {{business}}. ` +
        `I am sorry to hear something has not gone to plan. I have escalated this to a member of our team ` +
        `who will contact you directly.\n\n{{next_action}}`,
    },
  ],
  general: [
    {
      when: (c) => c.is_followup,
      body:
        `Hello again {{first_name}}, following up on your enquiry with {{business}}. ` +
        `I wanted to make sure nothing was waiting on you. Is there anything else I can help with?`,
    },
    {
      body:
        `Hello {{first_name}}, thank you for contacting {{business}}. ` +
        `Your enquiry has been received and I have started looking into it.\n\n{{next_action}}`,
    },
  ],
};

const INTENT_RULES: { intent: GuestIntent; re: RegExp }[] = [
  { intent: "support", re: /\b(complaint|refund|cancel|problem|issue|broken|disappoint|unhappy)\b/i },
  { intent: "booking", re: /\b(book|booking|reserve|reservation|hold|table|room|suite)\b/i },
  { intent: "pricing", re: /\b(price|pricing|cost|quote|estimate|rate|rates|how much|budget)\b/i },
  { intent: "availability", re: /\b(available|availability|free|open|slot|vacan)/i },
];

export function classifyIntent(inquiry: string): GuestIntent {
  for (const { intent, re } of INTENT_RULES) {
    if (re.test(inquiry)) return intent;
  }
  return "general";
}

/** Pick the first variant whose guard passes, else the last (default) variant. */
function selectVariant(intent: GuestIntent, ctx: TemplateContext): string {
  const variants = TEMPLATES[intent] ?? TEMPLATES.general;
  const guarded = variants.find((v) => (v.when ? v.when(ctx) : true));
  return (guarded ?? variants[variants.length - 1]).body;
}

export function renderTemplate(template: string, ctx: TemplateContext): string {
  const memory_block = ctx.memory_lines.length
    ? `${ctx.memory_lines.map((l) => `- ${l}`).join("\n")}\n\n`
    : "";

  return template
    .replace(/\{\{business\}\}/g, ctx.business)
    .replace(/\{\{first_name\}\}/g, ctx.first_name)
    .replace(/\{\{channel\}\}/g, ctx.channel)
    .replace(/\{\{memory_block\}\}/g, memory_block)
    .replace(/\{\{next_action\}\}/g, ctx.next_action ? `${ctx.next_action} ` : "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildReply(ctx: TemplateContext): string {
  return renderTemplate(selectVariant(ctx.intent, ctx), ctx);
}

export const NEXT_ACTIONS: Record<GuestIntent, string> = {
  booking: "Our reservations team will confirm availability and hold the slot for you.",
  pricing: "We will prepare an itemised estimate for you.",
  availability: "We will send the open windows as soon as they are confirmed.",
  support: "A duty manager will contact you directly to resolve this.",
  general: "We will reply with a full answer shortly.",
};
