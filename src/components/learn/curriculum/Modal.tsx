"use client";

import { useEffect } from "react";
import { ui } from "@/components/learn/ui";

/** A dialog over the page: Escape or Close shuts it. `wide` fills most of the screen (editors, viewers). */
export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-3">
      <div className={`flex max-h-full w-full flex-col overflow-hidden rounded-xl bg-white shadow-xl ${wide ? "h-full max-w-5xl" : "max-w-lg"}`}>
        <div className="flex items-center justify-between gap-3 border-b border-gold-light px-4 py-2.5">
          <p className="min-w-0 truncate text-sm font-semibold text-ink">{title}</p>
          <button type="button" onClick={onClose} className={`${ui.btnSecondary} ${ui.sm}`}>
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </div>
    </div>
  );
}

/** One line per item in a textarea, for lists such as objectives or key terms. */
export function LinesField({ label, hint, value, onChange, rows = 3, disabled }: { label: string; hint?: string; value: string[]; onChange: (v: string[]) => void; rows?: number; disabled?: boolean }) {
  return (
    <label className="block">
      <span className={ui.label}>{label}</span>
      {hint && <span className={`block ${ui.hint}`}>{hint}</span>}
      <textarea value={value.join("\n")} onChange={(e) => onChange(e.target.value.split("\n"))} rows={Math.max(rows, Math.min(value.length + 1, 12))} disabled={disabled} className={`mt-1 ${ui.textarea}`} />
    </label>
  );
}

export function TextField({ label, hint, value, onChange, disabled, multiline, placeholder }: { label: string; hint?: string; value: string; onChange: (v: string) => void; disabled?: boolean; multiline?: boolean; placeholder?: string }) {
  return (
    <label className="block">
      <span className={ui.label}>{label}</span>
      {hint && <span className={`block ${ui.hint}`}>{hint}</span>}
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} rows={3} placeholder={placeholder} className={`mt-1 ${ui.textarea}`} />
      ) : (
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} placeholder={placeholder} className={`mt-1 ${ui.input}`} />
      )}
    </label>
  );
}
