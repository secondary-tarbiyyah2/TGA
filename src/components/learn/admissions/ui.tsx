import type { ReactNode } from "react";
import { ui } from "@/components/learn/ui";

export const fieldCls = `mt-1 ${ui.input}`;
export const primaryBtn = ui.btnPrimary;
export const ghostBtn = ui.btnSecondary;

export function Group({ title, help, children }: { title: string; help?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-gold-light/50 bg-cream/40 p-4">
      <h3 className="font-serif text-lg font-semibold text-ink">{title}</h3>
      {help && <div className="mb-3 mt-1 text-xs leading-relaxed text-ink/65">{help}</div>}
      {children}
    </section>
  );
}

export function Pill({ tone, children }: { tone: "good" | "warn" | "bad" | "neutral"; children: ReactNode }) {
  const cls = { good: "bg-teal-50 text-teal-800", warn: "bg-amber-50 text-amber-800", bad: "bg-red-50 text-red-700", neutral: "bg-cream text-ink/70" }[tone];
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{children}</span>;
}
