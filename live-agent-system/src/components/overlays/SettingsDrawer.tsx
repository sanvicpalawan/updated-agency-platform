import { ACCENTS, BUSINESS_TYPES } from "../../system/config";
import { engine } from "../../system/useSystemEngine";
import { cn } from "../../utils/cn";
import type { AccentTheme } from "../../system/config";
import type { SystemState } from "../../system/types";
import { Dot, KeyVal, Micro } from "../ui";
import { Head, Section } from "./shared";

/* --------------------------------------------------------------- settings */

export function SettingsDrawer({
  s,
  accent,
  setAccent,
}: {
  s: SystemState;
  accent: AccentTheme;
  setAccent: (a: AccentTheme) => void;
}) {
  return (
    <>
      <Head
        title="TENANT & SYSTEM SETTINGS"
        sub="White-label configuration · workspace switcher · runtime scope"
        onClose={() => engine.setOverlay(null)}
      />
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <Section label="ACTIVE TENANT WORKSPACE">
          <div className="py-2.5">
            <Micro className="text-white/25">SWITCH TENANT</Micro>
            <select
              value={s.tenant_id ?? ""}
              onChange={(e) => engine.switchTenant(e.target.value)}
              className="mt-2 w-full border border-line bg-void/70 px-3 py-2 font-mono text-[12px] text-white/90 outline-none"
            >
              {s.tenantsList.map((t) => (
                <option key={t.id} value={t.id} className="bg-panel">
                  {t.name} ({t.slug})
                </option>
              ))}
            </select>
            <div className="mt-2.5 flex justify-between">
              <a href="#/admin/tenants" className="micro-sm text-accent hover:underline">
                + CREATE / EDIT / DELETE TENANTS IN ADMIN →
              </a>
            </div>
          </div>
        </Section>

        <Section label="IDENTITY / WHITE-LABEL">
          <label className="block py-2">
            <Micro className="text-white/25">BUSINESS NAME</Micro>
            <input
              value={s.brand.name}
              onChange={(e) => engine.setBrandName(e.target.value.slice(0, 26))}
              className="mt-2 w-full border border-line bg-void/60 px-3 py-2 font-mono text-[13px] tracking-[0.08em] text-white/90 outline-none focus:border-accent/60"
            />
          </label>
          <label className="block border-t border-line/60 py-2">
            <Micro className="text-white/25">BUSINESS TYPE / SYSTEM LABEL</Micro>
            <input
              value={s.brand.type}
              onChange={(e) => engine.setBrandType(e.target.value.slice(0, 32))}
              className="mt-2 w-full border border-line bg-void/60 px-3 py-2 font-mono text-[12px] text-white/80 outline-none focus:border-accent/60"
            />
            <div className="mt-2 flex flex-wrap gap-1">
              {BUSINESS_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => engine.setBrandType(t)}
                  className={cn(
                    "micro-sm border px-1.5 py-1 leading-none transition-colors",
                    s.brand.type === t
                      ? "border-accent/45 bg-accent-soft text-accent"
                      : "border-line/90 text-white/30 hover:text-white/60",
                  )}
                >
                  {t.replace(" System", "")}
                </button>
              ))}
            </div>
          </label>
          <KeyVal k="DEPLOYMENT" v="MULTI-TENANT · GITHUB READY" />
          <KeyVal k="LOCALE" v={`${s.brand.property} · ${s.brand.timezone}`} />
        </Section>

        <Section label="INTERFACE ACCENT">
          <div className="flex gap-2 py-3">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                onClick={() => setAccent(a)}
                className={cn(
                  "group flex flex-1 flex-col items-center gap-2 border px-2 py-3 transition-colors",
                  accent.id === a.id ? "border-white/25 bg-white/[0.04]" : "border-line/90 hover:border-white/15",
                )}
              >
                <span
                  className="h-4 w-4 rounded-full"
                  style={{ background: a.hex, boxShadow: `0 0 14px -2px ${a.hex}` }}
                />
                <span className="micro-sm text-center leading-tight text-white/35">{a.label}</span>
              </button>
            ))}
          </div>
        </Section>

        <Section label="AUTONOMY">
          <div className="flex gap-1 py-3">
            {[1, 2, 3].map((lvl) => (
              <button
                key={lvl}
                onClick={() => engine.setAutonomy(lvl as 1 | 2 | 3)}
                className={cn(
                  "flex-1 border py-2 transition-colors",
                  s.autonomy === lvl
                    ? "border-accent/50 bg-accent-soft text-accent"
                    : "border-line/90 text-white/30 hover:text-white/60",
                )}
              >
                <span className="micro block">L{lvl}</span>
                <span className="micro-sm mt-1 block text-white/25">
                  {lvl === 1 ? "ASSISTED" : lvl === 2 ? "BALANCED" : "AUTONOMOUS"}
                </span>
              </button>
            ))}
          </div>
        </Section>

        <Section label="CHANNEL SURFACES">
          <div className="py-1">
            {s.channels.map((c) => (
              <div key={c.id} className="flex items-center gap-3 border-b border-line/60 py-2.5 last:border-0">
                <Dot tone={c.connected ? "accent" : "idle"} size={5} />
                <span className="micro flex-1 text-white/60">{c.label}</span>
                <button
                  onClick={() => engine.setChannel(c.id, !c.connected)}
                  className={cn(
                    "micro-sm border px-2 py-1 transition-colors",
                    c.connected
                      ? "border-line/90 text-white/40 hover:border-red-500/40 hover:text-red-300"
                      : "border-accent/40 bg-accent-soft text-accent",
                  )}
                >
                  {c.connected ? "DETACH" : "ATTACH"}
                </button>
              </div>
            ))}
          </div>
        </Section>

        <Section label="RUNTIME">
          <div className="flex items-center justify-between py-3">
            <div>
              <Micro className="text-white/45">RESET SYSTEM RUNTIME</Micro>
              <p className="micro-sm mt-1.5 text-white/25">Resets this view / tenant records are retained</p>
            </div>
            <button
              onClick={() => engine.resetAll()}
              className="micro border border-red-500/35 px-2.5 py-2 text-red-300/80 transition-colors hover:bg-red-500/10"
            >
              RESET
            </button>
          </div>
        </Section>
      </div>
    </>
  );
}