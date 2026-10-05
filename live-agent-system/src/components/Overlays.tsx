import { useEffect } from "react";
import type { AccentTheme } from "../system/config";
import type { SystemState } from "../system/types";
import { AgentsConfigDrawer } from "./overlays/AgentsConfigDrawer";
import { BookingsDrawer } from "./overlays/BookingsDrawer";
import { ExportBundle } from "./overlays/ExportBundle";
import { LeadsDrawer } from "./overlays/LeadsDrawer";
import { SettingsDrawer } from "./overlays/SettingsDrawer";
import { ToolsDrawer } from "./overlays/ToolsDrawer";
import { WhatsAppConnect } from "./overlays/WhatsAppConnect";

/**
 * Overlay shell — routes the active overlay to its drawer.
 * Each drawer's implementation lives in ./overlays/.
 */
export function Overlay({
  s,
  onClose,
  accent,
  setAccent,
}: {
  s: SystemState;
  onClose: () => void;
  accent: AccentTheme;
  setAccent: (a: AccentTheme) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!s.overlay) return null;
  const modal = s.overlay === "whatsapp" || s.overlay === "export";

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
      <button
        aria-label="Close overlay"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-[3px]"
      />
      {modal ? (
        <div className="relative m-auto w-[calc(100%-2rem)] max-w-md animate-event-in border border-line bg-panel shadow-[0_40px_120px_-20px_rgba(0,0,0,0.9)]">
          {s.overlay === "whatsapp" && <WhatsAppConnect s={s} onClose={onClose} />}
          {s.overlay === "export" && <ExportBundle s={s} onClose={onClose} />}
        </div>
      ) : (
        <aside className="relative ml-auto flex h-full w-full max-w-[560px] animate-event-in flex-col border-l border-line bg-panel shadow-[-40px_0_120px_-30px_rgba(0,0,0,0.9)]">
          {s.overlay === "leads" && <LeadsDrawer s={s} />}
          {s.overlay === "bookings" && <BookingsDrawer s={s} />}
          {s.overlay === "tools" && <ToolsDrawer s={s} />}
          {s.overlay === "agents_config" && <AgentsConfigDrawer s={s} />}
          {s.overlay === "settings" && <SettingsDrawer s={s} accent={accent} setAccent={setAccent} />}
        </aside>
      )}
    </div>
  );
}