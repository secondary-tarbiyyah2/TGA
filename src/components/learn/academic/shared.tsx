"use client";

import { Icon } from "@/components/learn/Icon";
import type { ReactNode } from "react";
import { ui } from "@/components/learn/ui";

export type AcademicYear = { id: string; label: string; starts_on: string; ends_on: string; is_test: boolean };
export type Term = { id: string; name: string; starts_on: string; ends_on: string; academic_year_id: string; sanity_document_id: string | null };
export type YearGroup = { id: string; name: string; sort_order: number; capacity: number | null };
export type Subject = { id: string; name: string; code: string | null; is_core: boolean };
export type ClassRow = {
  id: string;
  name: string;
  year_group_id: string | null;
  subject_id: string | null;
  weekly_lessons: number;
  lesson_length_minutes: number;
  academic_year_id: string | null;
  meeting_url: string | null;
};
export type Child = { id: string; name: string; year_group_id?: string | null };
export type Enrolment = { id: string; class_id: string; child_id: string };
export type Teacher = { id: string; full_name: string };
export type ClassTeacher = { id: number; user_id: string; scope_id: string };

export const inputCls = ui.input;
export const primaryBtn = ui.btnPrimary;
export const ghostBtn = `${ui.btnSecondary} ${ui.sm}`;
export const dangerBtn = "rounded-lg px-2 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50";

export function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs font-medium text-ink/70">{label}</span>
      <span className="mt-1 block">{children}</span>
      {hint && <span className="mt-1 block text-xs text-ink/65">{hint}</span>}
    </label>
  );
}

export function StepCard({ step, title, help, done, children, id }: { step: number; title: string; help: string; done: boolean; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="scroll-mt-20 rounded-2xl border border-gold-light/50 bg-white p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${done ? "bg-green-600 text-white" : "bg-gold-100 text-gold-900"}`}
        >
          {done ? <Icon name="check" className="h-3.5 w-3.5" strokeWidth={2.5} /> : step}
        </span>
        <div className="min-w-0">
          <h2 className="font-serif text-h3 font-semibold text-ink">{title}</h2>
          <p className="mt-0.5 text-sm text-ink/65">{help}</p>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-gold-light bg-cream/60 px-4 py-4 text-sm text-ink/70">{children}</p>;
}

export function Notice({ tone, children }: { tone: "error" | "ok"; children: ReactNode }) {
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`rounded-lg px-3 py-2 text-xs ${tone === "error" ? "bg-red-50 text-red-800" : "bg-green-50 text-green-800"}`}>
      {children}
    </p>
  );
}

/** Returns the cleaned link, null when blank, or "invalid". */
export function cleanMeetingUrl(raw: string): string | null | "invalid" {
  const v = raw.trim();
  if (!v) return null;
  if (!/^https:\/\//i.test(v)) return "invalid";
  try {
    new URL(v);
  } catch {
    return "invalid";
  }
  return v;
}
