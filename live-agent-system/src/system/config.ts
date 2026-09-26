import type { AgentDef, AgentId, LedgerKey, StageKey } from "./types";

/** Labels for the "Completed Today" historical proof block. */
export const LEDGER_DEFS: { key: LedgerKey; label: string; agent: AgentId }[] = [
  { key: "leads", label: "Leads captured", agent: "nyx" },
  { key: "responses", label: "Guest responses sent", agent: "tala" },
  { key: "bookings", label: "Bookings processed", agent: "tala" },
  { key: "followups", label: "Follow-ups completed", agent: "nyx" },
  { key: "invoices", label: "Invoices issued", agent: "hermes" },
  { key: "payments", label: "Payments settled", agent: "hermes" },
  { key: "staff", label: "Staff tasks dispatched", agent: "hermes" },
  { key: "concierge", label: "Concierge services arranged", agent: "tala" },
  { key: "crm", label: "CRM records synced", agent: "core" },
  { key: "escalations", label: "Escalations routed to human", agent: "core" },
];

/** Forward-looking automation chain for the "What happens next" block. */
export const PIPELINE_DEFS: {
  key: StageKey;
  trigger: string;
  action: string;
  target: string;
  agent: AgentId;
}[] = [
  { key: "inbound", trigger: "New inquiry lands", action: "Auto-response sent", target: "< 30 s", agent: "tala" },
  { key: "qualify", trigger: "Lead received", action: "Lead scored + follow-up checked", target: "rule-based", agent: "nyx" },
  { key: "confirm", trigger: "Booking received", action: "Confirmation + staff notice", target: "instant", agent: "hermes" },
  { key: "settle", trigger: "Record updated", action: "Tenant records reconciled", target: "instant", agent: "hermes" },
  { key: "sync", trigger: "Any system event", action: "Dashboard + log updated", target: "live", agent: "core" },
];

export interface AccentTheme {
  id: string;
  label: string;
  hex: string;
  rgb: string;
}

export const ACCENTS: AccentTheme[] = [
  { id: "signal", label: "Signal Green", hex: "#6ee7b7", rgb: "110 231 183" },
  { id: "cyan", label: "Console Cyan", hex: "#67e8f9", rgb: "103 232 249" },
  { id: "amber", label: "Ops Amber", hex: "#fcd34d", rgb: "252 211 77" },
  { id: "violet", label: "Node Violet", hex: "#c4b5fd", rgb: "196 181 253" },
];

export const AGENT_DEFS: Record<AgentId, AgentDef> = {
  tala: {
    id: "tala",
    codename: "TALA",
    role: "Concierge / Booking Agent",
    domain: "GUEST SURFACE",
    accent: "#67e8f9",
    accentRgb: "103 232 249",
    weight: 0.42,
  },
  nyx: {
    id: "nyx",
    codename: "NYX",
    role: "Lead + Growth Agent",
    domain: "ACQUISITION",
    accent: "#c4b5fd",
    accentRgb: "196 181 253",
    weight: 0.31,
  },
  hermes: {
    id: "hermes",
    codename: "HERMES",
    role: "Operations + Finance Agent",
    domain: "BACK OFFICE",
    accent: "#fcd34d",
    accentRgb: "252 211 77",
    weight: 0.24,
  },
  core: {
    id: "core",
    codename: "CORE",
    role: "Orchestration Kernel",
    domain: "SYSTEM",
    accent: "#6ee7b7",
    accentRgb: "110 231 183",
    weight: 0.03,
  },
};

export const AGENT_ORDER: AgentId[] = ["tala", "nyx", "hermes"];

export const DEFAULT_BRAND = {
  name: "AURELIA SUITES",
  type: "Resort Operations System",
  property: "Bodrum · TR",
  timezone: "UTC+03",
};

export const BUSINESS_TYPES = [
  "Resort Operations System",
  "Hotel Operations System",
  "Clinic Operations System",
  "Restaurant Group System",
  "Real Estate Desk System",
  "Service Agency System",
];

export const AUTONOMY_LABELS: Record<number, { label: string; note: string; range: [number, number] }> =
  {
    1: { label: "ASSISTED", note: "Automatic actions paused / manual dispatch", range: [5200, 9400] },
    2: { label: "BALANCED", note: "Agent acts · human reviews", range: [2700, 5200] },
    3: { label: "AUTONOMOUS", note: "Agent acts · no approval gate", range: [1300, 2900] },
  };

export const fmtMoney = (n: number) =>
  "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });

export const fmtClock = (ts: number) => {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

export const pad = (n: number) => String(n).padStart(2, "0");

export function rel(ts: number | null, now = Date.now()): string {
  if (ts == null) return "never";
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 5) return "now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function dur(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${pad(h)}:${pad(m)}:${pad(s % 60)}`;
}
