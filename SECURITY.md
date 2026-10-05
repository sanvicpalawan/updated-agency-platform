# Security

## What this application is

CORE is a **client-side demonstration application**. It has no backend, no
database and no server. Every record it shows — tenants, leads, bookings,
messages, events — lives in the browser's `localStorage`. The three agents
(TALA, NYX, HERMES) are deterministic rule scripts, not live LLM calls.

It is built to be white-labeled and shipped as a single self-contained HTML
file. That is a deliberate product decision, not an oversight.

## Do not put real or sensitive data in this build

This is the single most important line in this document.

Tenant isolation is enforced **in JavaScript, on the client**. That means:

- Anyone with browser devtools can read every tenant's leads, bookings and
  messages. Tenant scoping in `src/core/tenantResolver.ts` and
  `src/services/db.ts` prevents accidental cross-tenant reads inside the UI; it
  does **not** prevent deliberate access.
- Per-tenant OpenRouter API keys (`openrouter_api_key`) are persisted to
  `localStorage` in plaintext. They are readable by anyone with access to the
  browser profile, and are included in any profile export.
- The build inlines the entire application — including that key field — into a
  single `dist/index.html` via `vite-plugin-singlefile`.

Never use a production OpenRouter key here. Use a scoped, low-limit key that you
are willing to rotate.

## The WhatsApp panel is a mock

`src/components/overlays/WhatsAppConnect.tsx` renders a QR-like block that is
**generated locally from a PRNG and is not a scannable device-link code**. No
WhatsApp credentials are exchanged and no message ever leaves the browser. The UI
states this in-app; the statement is accurate.

## Isolation checks are a regression guard, not a control

`src/core/isolationChecks.ts` verifies client-side tenant scoping. It is now run
in CI via `scripts/verify-isolation.ts`. Treat a green run as "the scoping logic
did not regress" — never as "the data is secure."

## Open dependency advisory

`npm audit` reports 3 high-severity advisories in the transitive chain
`vite-plugin-singlefile → micromatch → braces` (stack-exhaustion DoS via deeply
nested glob patterns).

This is **build-time only**. The app performs no glob processing on
user-supplied input at runtime. The only fix npm offers is
`--force`, which downgrades `vite-plugin-singlefile` to `0.9.0` — a breaking
change that removes the single-file output this product is built around. We
accept the advisory deliberately rather than break the deliverable.

## Hardening checklist

The current open items, in priority order:

1. **Backend.** Move records out of `localStorage` into a real datastore with
   server-side authorization. This is the only change that makes tenant
   isolation meaningful.
2. **API keys.** Stop persisting OpenRouter keys in `localStorage`. Proxy model
   calls through a server that holds the key and returns only completions.
3. **Authentication.** There is none. `MOCK_ADMIN` in `src/config/platform.ts`
   is a hardcoded session. Any real deployment needs real login before any of
   the above matters.
4. **Content-Security-Policy.** Add a CSP header on deploy so a future
   `dangerouslySetInnerHTML` or injected script cannot exfiltrate local data.
5. **Rotate any key ever entered into a demo build.**

## Reporting

Report suspected vulnerabilities privately to the repository owner rather than
in a public issue.