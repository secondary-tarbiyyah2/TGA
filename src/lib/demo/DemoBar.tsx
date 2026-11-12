"use client";

// Portal demo only: the small floating "Demo" bar. Switch role (the page
// reloads as that person, keeping this session's changes) or reset the
// made-up school to how it started.

import { useEffect, useRef, useState } from "react";
import { navigate } from "@/lib/demo/router";
import { resetDemo, setRole } from "@/lib/demo/store";
import { ROLE_LABEL, ROLE_ORDER, type DemoRole } from "@/lib/demo/seed";

const HOME: Record<DemoRole, string> = { head_teacher: "/admin/dashboard", admin: "/admin/dashboard", teacher: "/teach/dashboard", parent: "/family/dashboard", student: "/student/dashboard" };

export function DemoBar({ role }: { role: DemoRole }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const switchTo = (r: DemoRole) => {
    setRole(r);
    navigate(HOME[r], { replace: true });
    window.location.reload();
  };
  const reset = () => {
    resetDemo();
    window.location.reload();
  };

  return (
    <div ref={ref} data-demo-bar className="portal fixed bottom-[76px] right-3 z-[90] text-sm md:bottom-4 md:right-4" style={{ fontFamily: "var(--font-sans, Inter, sans-serif)" }}>
      {open && (
        <div role="dialog" aria-label="Demo" className="mb-2 w-64 rounded-[10px] border border-gold-light bg-white p-3 shadow-[var(--portal-shadow-pop)]">
          <p className="t-eyebrow">Portal demo</p>
          <p className="t-meta mt-0.5">A made-up school. Nothing is sent anywhere.</p>
          <p className="mt-3 text-xs font-medium text-ink">View as</p>
          <ul className="mt-1 grid grid-cols-1 gap-1">
            {ROLE_ORDER.map((r) => (
              <li key={r}>
                <button type="button" aria-pressed={r === role} onClick={() => (r === role ? setOpen(false) : switchTo(r))} className={`flex min-h-9 w-full items-center justify-between rounded-[7px] px-2.5 text-left ${r === role ? "bg-[var(--portal-sunken)] font-semibold text-forest-700" : "text-ink hover:bg-[var(--portal-hover)]"}`}>
                  {ROLE_LABEL[r]}
                  {r === role && <span className="text-xs font-normal text-ink-500">now</span>}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={reset} className="mt-3 flex min-h-9 w-full items-center justify-center rounded-[7px] border border-gold-light text-ink hover:bg-[var(--portal-hover)]">
            Reset demo data
          </button>
        </div>
      )}
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="ml-auto flex min-h-9 items-center gap-2 rounded-full border border-gold-light bg-white px-3.5 font-medium text-ink shadow-[var(--portal-shadow-pop)] hover:border-forest-700">
        <span className="h-2 w-2 rounded-full bg-forest-700" aria-hidden="true" />
        Demo: {ROLE_LABEL[role]}
      </button>
    </div>
  );
}
