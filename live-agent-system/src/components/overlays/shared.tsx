import type { ReactNode } from "react";
import { Micro } from "../ui";

/* ------------------------------------------------------------------- chrome */

/** Header strip shared by every drawer/modal in the overlay system. */
export function Head({ title, sub, onClose }: { title: string; sub: string; onClose: () => void }) {
  return (
    <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line/90 px-4 py-3">
      <div>
        <h2 className="micro text-white/70">{title}</h2>
        <p className="micro-sm mt-1.5 text-white/25">{sub}</p>
      </div>
      <button
        onClick={onClose}
        className="micro border border-line/90 px-2 py-1.5 text-white/35 transition-colors hover:border-white/25 hover:text-white/70"
      >
        ESC ✕
      </button>
    </header>
  );
}

/** Bordered, labelled block used to group fields inside drawers. */
export function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mb-5 border border-line/90">
      <div className="border-b border-line/80 bg-white/[0.012] px-3 py-2">
        <Micro className="text-white/40">{label}</Micro>
      </div>
      <div className="px-3">{children}</div>
    </section>
  );
}