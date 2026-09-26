import {
  AGENT_IDS,
  createDefaultToolsConfig,
  DEFAULT_AGENT_BEHAVIOR,
  DEFAULT_AGENT_CONFIG,
  DEFAULT_AGENT_OPENROUTER,
  DEFAULT_RULES,
} from "../config/platform";
import { TENANT_PRESETS } from "../config/tenants";
import type { AgentId, BookingStatus, Channel, EventLevel, LeadStatus, MockDatabase, SystemEvent, Tenant } from "../types/database";

export const makeId = (): string => globalThis.crypto?.randomUUID?.() ?? "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
  const n = Math.floor(Math.random() * 16);
  return (c === "x" ? n : (n & 3) | 8).toString(16);
});

const names = ["Isabella Cruz", "James Wilson", "Sofia Reyes", "Daniel Park", "Olivia Chen", "Mateo Santos", "Emma Taylor", "Lucas Rivera", "Amelia Wright", "Noah Garcia", "Mia Johnson", "Ethan Brooks", "Aria Mendoza", "Liam Martin", "Chloe Bennett", "Leo Anderson", "Camila Flores", "Oliver Lee", "Ella Robinson", "Sebastian Diaz", "Luna Mercado", "Henry Lewis", "Ava Mitchell", "Gabriel Torres"];

export function createMockDatabase(): MockDatabase {
  const now = Date.now();
  const day = 86_400_000;
  const iso = (ago: number) => new Date(now - ago).toISOString();
  const tenants: Tenant[] = TENANT_PRESETS.map(([name, slug, industry, logo, color, status], i) => ({
    id: `10000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    name,
    slug,
    industry,
    status,
    branding_config: { app_name: name, logo, primary_color: color, theme: "dark" },
    rules: { ...DEFAULT_RULES },
    openrouter_api_key: "",
    tools_config: createDefaultToolsConfig(slug),
    created_at: iso((i === 5 ? 2 : 30 + i * 9) * day),
  }));
  const data: MockDatabase = { version: 1, tenants, users: [], leads: [], bookings: [], messages: [], events: [], agents: [] };

  function event(tenant_id: string, type: string, agent: AgentId | null, message: string, created_at: string, entity_id: string | null = null, payload: Record<string, unknown> = {}, level: SystemEvent["level"] = "success") {
    data.events.push({ id: makeId(), tenant_id, type, agent, message, created_at, entity_id, payload, level });
  }

  tenants.forEach((tenant, t) => {
    data.users.push({ id: makeId(), tenant_id: tenant.id, name: `${tenant.name} Admin`, email: `admin@${tenant.slug}.example`, role: "admin", created_at: tenant.created_at });
    const leadCount = [54, 38, 31, 28, 13, 5][t] ?? 0;
    for (let i = 0; i < leadCount; i++) {
      const id = makeId();
      const name = names[(i * 7 + t * 3) % names.length];
      const age = ((i * 29 + t * 13) % 166) / 24 + (i % 9 === 0 ? 7 : 0);
      const created_at = iso(Math.max(0.03, age) * day);
      const channel = (["Website", "WhatsApp", "Instagram", "Email"] as Channel[])[(i + t) % 4];
      const status = (["new", "contacted", "converted", "contacted", "new"] as LeadStatus[])[i % 5];
      const assigned_agent: AgentId = i % 3 === 0 ? "nyx" : "tala";
      const inquiry = t === 1 ? "Request for a custom glass installation estimate" : t === 2 ? "Private dining reservation for a group of six" : "Availability and booking details for next week";
      data.leads.push({ id, tenant_id: tenant.id, name, email: `${name.toLowerCase().replace(/ /g, ".")}@example.com`, channel, status, assigned_agent, score: 48 + (i * 11 + t * 5) % 51, inquiry, created_at, updated_at: created_at });
      event(tenant.id, "lead.created", "tala", `New inquiry captured from ${channel}`, created_at, id, { name, channel, status: "new", tool: "lead_capture" });
      if (status !== "new") {
        const repliedAt = new Date(new Date(created_at).getTime() + 22_000).toISOString();
        data.messages.push({ id: makeId(), tenant_id: tenant.id, lead_id: id, agent: "tala", content: `Thank you for reaching out to ${tenant.name}. Your inquiry has been received.`, channel, direction: "outbound", created_at: repliedAt });
        event(tenant.id, "message.sent", "tala", `Responded to ${name}'s inquiry`, repliedAt, id, { channel, response_time_seconds: 22, tool: "whatsapp_responder" });
        event(tenant.id, "lead.scored", "nyx", `Lead qualified: ${name}`, new Date(new Date(created_at).getTime() + 45_000).toISOString(), id, { score: 48 + (i * 11 + t * 5) % 51, tool: "lead_capture" });
      }
      if (status === "converted") event(tenant.id, "lead.status_updated", "nyx", `${name} marked as converted`, new Date(new Date(created_at).getTime() + 90_000).toISOString(), id, { previous: "contacted", status, tool: "lead_capture" });
    }

    const bookingCount = [18, 9, 13, 11, 4, 1][t] ?? 0;
    for (let i = 0; i < bookingCount; i++) {
      const id = makeId();
      const guest = names[(i * 5 + t) % names.length];
      const created_at = iso(((i * 19 + t * 5) % 164) * 3_600_000);
      const status = (["confirmed", "confirmed", "pending", "completed", "confirmed", "cancelled"] as BookingStatus[])[i % 6];
      const service = t === 1 ? ["Glass consultation", "Installation appointment"][i % 2] : t === 2 ? ["Terrace table", "Private dining"][i % 2] : t === 5 ? "Private event" : ["Ocean suite", "Deluxe room", "Airport transfer"][i % 3];
      const amount = t === 1 ? 850 + i * 75 : t === 2 ? 80 + i * 20 : 240 + i * 45;
      const reference = `${tenant.name.substring(0, 2).toUpperCase()}-${String(2401 + i).padStart(4, "0")}`;
      data.bookings.push({ id, tenant_id: tenant.id, reference, guest, email: `${guest.toLowerCase().replace(/ /g, ".")}@example.com`, service, date: new Date(now + (i % 9 + 1) * day).toISOString(), amount, status, assigned_agent: "hermes", created_at, updated_at: created_at });
      event(tenant.id, "booking.created", "hermes", `Booking ${reference} received`, created_at, id, { reference, service, amount, tool: "booking_engine" });
      if (status !== "pending") event(tenant.id, "booking.status_updated", "hermes", `Booking ${reference} ${status}`, new Date(new Date(created_at).getTime() + 12_000).toISOString(), id, { previous: "pending", status, guest, tool: "booking_engine" });
    }

    AGENT_IDS.forEach((agent) => {
      const actions = data.events.filter((e) => e.tenant_id === tenant.id && e.agent === agent);
      const newest = [...actions].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      data.agents.push({
        id: `${tenant.id}:${agent}`,
        tenant_id: tenant.id,
        agent,
        enabled: tenant.status !== "setup",
        config: { ...DEFAULT_AGENT_CONFIG[agent] },
        openrouter: { ...DEFAULT_AGENT_OPENROUTER[agent] },
        behavior: {
          ...DEFAULT_AGENT_BEHAVIOR[agent],
          connected_tools: [...DEFAULT_AGENT_BEHAVIOR[agent].connected_tools],
        },
        actions_completed: actions.length,
        last_action: newest?.message ?? "Awaiting first request",
        last_active_at: newest?.created_at ?? null,
      });
    });
  });

  const highlights: [number, AgentId, string, string, EventLevel][] = [
    [0, "tala", "message.sent", "TALA responded to a new inquiry", "success"],
    [2, "hermes", "booking.confirmed", "Table reservation confirmed", "success"],
    [1, "nyx", "lead.qualified", "New installation lead qualified", "success"],
    [0, "nyx", "followup.sent", "Follow-up sent to Isabella Cruz", "info"],
    [3, "hermes", "booking.confirmed", "Suite booking confirmed", "success"],
    [4, "hermes", "automation.paused", "Tenant automation is paused", "warning"],
  ];
  highlights.forEach(([t, agent, type, message, level], i) => {
    const tenant = tenants[t];
    if (!tenant) return;
    event(tenant.id, type, agent, message, iso((i * 39 + 8) * 1000), null, { source: "mock_runtime", workflow: agent }, level);
    const config = data.agents.find((a) => a.tenant_id === tenant.id && a.agent === agent);
    if (config && tenant.status === "active") {
      config.last_active_at = iso((i * 39 + 8) * 1000);
      config.last_action = message;
    }
  });
  return data;
}
