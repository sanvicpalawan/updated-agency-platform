/**
 * Seed data.
 *
 * Ports the browser mock's demo workspaces into SQLite so the backend has real
 * rows to operate on. Leads and bookings are inserted as *state only* — no
 * agent runs are fabricated, so the audit tables start honest and every row in
 * `agent_runs` reflects a genuine execution.
 */
import { randomUUID } from "node:crypto";
import { db, resetDatabase } from "./connection.ts";

const AGENTS = ["tala", "nyx", "hermes"] as const;

const DEFAULT_CONFIG: Record<string, Record<string, unknown>> = {
  tala: { auto_reply: true },
  nyx: { qualification_threshold: 65, follow_up_hours: 24 },
  hermes: { confirm_bookings: true, notify_staff: true },
};

const DEFAULT_BEHAVIOR: Record<string, Record<string, unknown>> = {
  tala: { tone: "hospitality", autonomy_mode: "auto_execute", response_sla_seconds: 25 },
  nyx: { tone: "persuasive", autonomy_mode: "auto_execute", response_sla_seconds: 45 },
  hermes: { tone: "executive", autonomy_mode: "auto_execute", response_sla_seconds: 15 },
};

/** name, slug, industry, lettermark, accent, status */
const TENANT_PRESETS = [
  ["BAIA", "baia", "Hospitality", "B", "#dab77a", "active"],
  ["Azarraga Glass", "azarraga-glass", "Architecture & glass", "A", "#9bc7e5", "active"],
  ["Marina Terrace", "marina-terrace", "Food & beverage", "M", "#bcb3e9", "active"],
  ["Aurelia Suites", "aurelia-suites", "Boutique hotel", "a", "#b7c7ad", "active"],
  ["Studio North", "studio-north", "Design studio", "N", "#e9b69d", "paused"],
  ["The Atrium", "the-atrium", "Events & venues", "A", "#d4c895", "setup"],
] as const;

const NAMES = [
  "Isabella Cruz", "James Wilson", "Sofia Reyes", "Daniel Park", "Olivia Chen", "Mateo Santos",
  "Emma Taylor", "Lucas Rivera", "Amelia Wright", "Noah Garcia", "Mia Johnson", "Ethan Brooks",
  "Aria Mendoza", "Liam Martin", "Chloe Bennett", "Leo Anderson", "Camila Flores", "Oliver Lee",
];

const CHANNELS = ["Website", "WhatsApp", "Instagram", "Email"] as const;
const LEAD_STATUSES = ["new", "contacted", "converted", "contacted", "new"] as const;
const BOOKING_STATUSES = ["confirmed", "confirmed", "pending", "completed", "confirmed", "cancelled"] as const;

const LEAD_COUNTS = [54, 38, 31, 28, 13, 5];
const BOOKING_COUNTS = [18, 9, 13, 11, 4, 1];

const iso = (msAgo: number): string => new Date(Date.now() - msAgo).toISOString();
const DAY = 86_400_000;

function seed(): { tenants: number; leads: number; bookings: number } {
  const now = Date.now();
  let leadTotal = 0;
  let bookingTotal = 0;

  db.exec("BEGIN");
  try {
    TENANT_PRESETS.forEach(([name, slug, industry, logo, color, status], i) => {
      const tenantId = `10000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`;
      const createdAt = iso((i === 5 ? 2 : 30 + i * 9) * DAY);

      db.prepare(
        `INSERT INTO tenants (id, name, slug, industry, status, branding_config, rules, created_at)
         VALUES ($id,$name,$slug,$industry,$status,$branding_config,$rules,$created_at)`,
      ).run({
        id: tenantId,
        name,
        slug,
        industry,
        status,
        branding_config: JSON.stringify({ app_name: name, logo, primary_color: color, theme: "dark" }),
        rules: JSON.stringify({
          tala: "auto-reply-leads",
          nyx: "follow-up-after-24h",
          hermes: "log-all-bookings",
        }),
        created_at: createdAt,
      });

      db.prepare(
        `INSERT INTO users (id, tenant_id, name, email, role, created_at) VALUES (?,?,?,?,?,?)`,
      ).run(randomUUID(), tenantId, `${name} Admin`, `admin@${slug}.example`, "admin", createdAt);

      AGENTS.forEach((agent) => {
        db.prepare(
          `INSERT INTO agents (id, tenant_id, agent, enabled, config, behavior,
                               actions_completed, last_action, last_active_at)
           VALUES (?,?,?,?,?,?,0,'Awaiting first request',NULL)`,
        ).run(
          `${tenantId}:${agent}`,
          tenantId,
          agent,
          status !== "setup" ? 1 : 0,
          JSON.stringify(DEFAULT_CONFIG[agent]),
          JSON.stringify(DEFAULT_BEHAVIOR[agent]),
        );
      });

      const leadCount = LEAD_COUNTS[i] ?? 0;
      for (let j = 0; j < leadCount; j++) {
        const person = NAMES[(j * 7 + i * 3) % NAMES.length];
        const ageDays = ((j * 29 + i * 13) % 166) / 24 + (j % 9 === 0 ? 7 : 0);
        const createdAt = iso(Math.max(0.03, ageDays) * DAY);
        const channel = CHANNELS[(j + i) % 4];
        const leadStatus = LEAD_STATUSES[j % 5];
        const inquiry =
          i === 1 ? "Request for a custom glass installation estimate for a storefront"
          : i === 2 ? "Private dining reservation for a group of six next week"
          : i === 3 ? "Looking to book two suites for a wedding party, need a quote"
          : "Availability and booking details for next week";

        db.prepare(
          `INSERT INTO leads (id, tenant_id, name, email, channel, status, assigned_agent,
                              score, score_reasoning, score_tags, inquiry, created_at, updated_at)
           VALUES ($id,$tenant_id,$name,$email,$channel,$status,$assigned_agent,
                   0,'','[]',$inquiry,$created_at,$updated_at)`,
        ).run({
          id: randomUUID(),
          tenant_id: tenantId,
          name: person,
          email: `${person.toLowerCase().replace(/ /g, ".")}@example.com`,
          channel,
          status: leadStatus,
          assigned_agent: j % 3 === 0 ? "nyx" : "tala",
          inquiry,
          created_at: createdAt,
          updated_at: createdAt,
        });
        leadTotal++;
      }

      const bookingCount = BOOKING_COUNTS[i] ?? 0;
      for (let j = 0; j < bookingCount; j++) {
        const guest = NAMES[(j * 5 + i) % NAMES.length];
        const createdAt = iso(((j * 19 + i * 5) % 164) * 3_600_000);
        const service =
          i === 1 ? ["Glass consultation", "Installation appointment"][j % 2]
          : i === 2 ? ["Terrace table", "Private dining"][j % 2]
          : i === 5 ? "Private event"
          : ["Ocean suite", "Deluxe room", "Airport transfer"][j % 3];

        db.prepare(
          `INSERT INTO bookings (id, tenant_id, reference, guest, email, service, date, amount,
                                 status, assigned_agent, created_at, updated_at)
           VALUES ($id,$tenant_id,$reference,$guest,$email,$service,$date,$amount,$status,
                   'hermes',$created_at,$updated_at)`,
        ).run({
          id: randomUUID(),
          tenant_id: tenantId,
          reference: `${name.slice(0, 2).toUpperCase()}-${String(2401 + j).padStart(4, "0")}`,
          guest,
          email: `${guest.toLowerCase().replace(/ /g, ".")}@example.com`,
          service,
          date: new Date(now + ((j % 9) + 1) * DAY).toISOString(),
          amount: i === 1 ? 850 + j * 75 : i === 2 ? 80 + j * 20 : 240 + j * 45,
          status: BOOKING_STATUSES[j % 6],
          created_at: createdAt,
          updated_at: createdAt,
        });
        bookingTotal++;
      }
    });

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return { tenants: TENANT_PRESETS.length, leads: leadTotal, bookings: bookingTotal };
}

/** Seed only when the database is empty. Returns true when it wrote rows. */
export function seedIfEmpty(): boolean {
  const { c } = db.prepare("SELECT count(*) c FROM tenants").get() as { c: number };
  if (c > 0) return false;
  seed();
  return true;
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

const invokedDirectly =
  process.argv[1] && /seed(\.ts|\.js)$/.test(process.argv[1]);

if (invokedDirectly) {
  const force = process.argv.includes("--reset") || process.argv.includes("--force");
  if (force) {
    resetDatabase();
    console.log("Cleared all tables.");
  }
  const result = seed();
  console.log(
    `Seeded ${result.tenants} tenants, ${result.leads} leads, ${result.bookings} bookings.`,
  );
}
