"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { ukToday } from "@/lib/learn/ukTime";
import { categoryOf, type ActionItem, type CategoryKey } from "@/lib/learn/actionCentre";
import { SidePanel } from "@/components/learn/kit";
import { Icon, type IconName } from "@/components/learn/Icon";
import { Status, ui } from "@/components/learn/ui";

type Lesson = { id: string; start_time: string; end_time: string; className: string; registered: number };
type CoverRow = { id: string; covering_teacher_user_id: string | null; reason: string | null; timetable_slots?: { start_time: string; classes?: { name: string } | null } | null };

/** Today's cover (cover_assignments for today, RLS: staff who manage cover). */
function useCoverToday() {
  const [rows, setRows] = useState<CoverRow[] | null>(null);
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    supabase
      .from("cover_assignments")
      .select("id, covering_teacher_user_id, reason, timetable_slots(start_time, classes(name))")
      .eq("cover_date", ukToday())
      .then(({ data, error }) => {
        if (alive) setRows(error ? [] : ((data as unknown as CoverRow[]) || []));
      });
    return () => {
      alive = false;
    };
  }, []);
  return rows;
}

type ModuleKey = "attendance" | "safeguarding" | "admissions" | "cover" | "approvals";

/**
 * The head teacher's Today, built from a few purposeful modules (owner, 11 Nov 2026;
 * docs/portal-structure.md, pattern 6): today's attendance, safeguarding, the admissions
 * queue, cover and approvals. Each shows one figure and one line; pressing it opens the list
 * behind it in a panel over Today, with each item's own action. Every figure is the same query
 * as the page it comes from (the Action centre's items, today's lessons, today's cover).
 */
export function HeadModules({
  lessons,
  items,
  lessonsToApprove,
  now,
  onRegister,
}: {
  lessons: Lesson[] | null;
  items: ActionItem[] | null;
  lessonsToApprove: number | null;
  /** "HH:MM", UK time. */
  now: string;
  onRegister: (lessonId: string) => void;
}) {
  const cover = useCoverToday();
  const [open, setOpen] = useState<ModuleKey | null>(null);
  const urgent = (items || []).filter((i) => i.urgency !== "info");
  const inCat = (...keys: CategoryKey[]) => urgent.filter((i) => keys.includes(categoryOf(i.area)));
  const started = (lessons || []).filter((l) => now >= l.start_time.slice(0, 5));
  const missing = started.filter((l) => l.registered === 0);
  const safeguarding = inCat("safeguarding");
  const admissions = inCat("admissions");
  const approvals = inCat("curriculum", "documents");
  const uncovered = (cover || []).filter((c) => !c.covering_teacher_user_id);

  const modules: { key: ModuleKey; label: string; icon: IconName; value: ReactNode; note: string; alert: boolean }[] = [
    {
      key: "attendance",
      label: "Registers today",
      icon: "userCheck",
      value: lessons === null ? "…" : `${started.length - missing.length}/${started.length}`,
      note: lessons === null ? "Loading" : missing.length ? `${missing.length} missing so far` : started.length ? "All taken so far" : "No lessons started yet",
      alert: missing.length > 0,
    },
    { key: "safeguarding", label: "Safeguarding", icon: "shieldAlert", value: items === null ? "…" : safeguarding.length, note: safeguarding.length ? "Needs a decision" : "Nothing open", alert: safeguarding.length > 0 },
    { key: "admissions", label: "Admissions", icon: "userRoundPlus", value: items === null ? "…" : admissions.length, note: admissions.length ? "Waiting in the queue" : "Queue clear", alert: false },
    { key: "cover", label: "Cover today", icon: "calendarX", value: cover === null ? "…" : cover.length, note: cover === null ? "Loading" : uncovered.length ? `${uncovered.length} without a teacher` : cover.length ? "All covered" : "No cover needed", alert: uncovered.length > 0 },
    {
      key: "approvals",
      label: "Approvals",
      icon: "clipboardCheck",
      value: lessonsToApprove === null || items === null ? "…" : lessonsToApprove + approvals.filter((i) => categoryOf(i.area) !== "curriculum").length,
      note: lessonsToApprove ? `${lessonsToApprove} lesson${lessonsToApprove === 1 ? "" : "s"} to review` : "Nothing to approve",
      alert: false,
    },
  ];

  const itemList = (list: ActionItem[], empty: string) =>
    list.length === 0 ? (
      <p className="text-sm text-ink-500">{empty}</p>
    ) : (
      <ul className="divide-y divide-gold-light">
        {list.map((i) => (
          <li key={i.id} className="py-3">
            <p className="text-sm font-semibold text-ink">{i.title}</p>
            <p className="mt-0.5 text-sm text-ink-500">{i.detail}</p>
            <Link href={i.href} className={`${i.urgency === "now" ? ui.btnPrimary : ui.btnSecondary} ${ui.sm} mt-2`}>
              {i.cta}
            </Link>
          </li>
        ))}
      </ul>
    );

  const panel: Record<ModuleKey, { title: string; body: ReactNode; more: { href: string; label: string } }> = {
    attendance: {
      title: "Registers today",
      more: { href: "/admin/attendance", label: "Open Registers" },
      body:
        started.length === 0 ? (
          <p className="text-sm text-ink-500">No lessons have started yet today.</p>
        ) : (
          <ul className="divide-y divide-gold-light">
            {started.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="w-14 shrink-0 text-sm tabular-nums text-ink-500">{l.start_time.slice(0, 5)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{l.className}</span>
                  {l.registered > 0 ? <Status kind="completed">Register taken</Status> : <Status kind="overdue">Register missing</Status>}
                </span>
                <button type="button" onClick={() => { setOpen(null); onRegister(l.id); }} className={`${l.registered ? ui.btnSecondary : ui.btnPrimary} ${ui.sm}`}>
                  {l.registered ? "Register" : "Take register"}
                </button>
              </li>
            ))}
          </ul>
        ),
    },
    safeguarding: { title: "Safeguarding", more: { href: "/admin/compliance", label: "Open Safeguarding" }, body: itemList(safeguarding, "Nothing is open. New concerns appear here as soon as they are reported.") },
    admissions: { title: "Admissions queue", more: { href: "/admin/admissions", label: "Open Applications" }, body: itemList(admissions, "No applications are waiting on the school.") },
    cover: {
      title: "Cover today",
      more: { href: "/admin/absences?tab=cover", label: "Open Staff cover" },
      body:
        !cover || cover.length === 0 ? (
          <p className="text-sm text-ink-500">No lessons need cover today.</p>
        ) : (
          <ul className="divide-y divide-gold-light">
            {cover.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-3 text-sm">
                <span className="w-14 shrink-0 tabular-nums text-ink-500">{c.timetable_slots?.start_time?.slice(0, 5) || ""}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-ink">{c.timetable_slots?.classes?.name || "A lesson"}</span>
                  {c.reason && <span className="block text-ink-500">{c.reason}</span>}
                </span>
                {c.covering_teacher_user_id ? <Status kind="completed">Covered</Status> : <Status kind="attention">Needs a teacher</Status>}
              </li>
            ))}
          </ul>
        ),
    },
    approvals: {
      title: "Approvals",
      more: { href: "/admin/curriculum/review", label: "Open Lesson review" },
      body: (
        <div className="space-y-4">
          {!!lessonsToApprove && (
            <p className="text-sm text-ink">
              <span className="font-semibold">{lessonsToApprove}</span> lesson{lessonsToApprove === 1 ? "" : "s"} waiting for review.{" "}
              <Link href="/admin/curriculum/review" className="font-medium text-forest-700 hover:underline">
                Review them
              </Link>
            </p>
          )}
          {itemList(approvals.filter((i) => categoryOf(i.area) !== "curriculum"), lessonsToApprove ? "Nothing else is waiting for your approval." : "Nothing is waiting for your approval.")}
        </div>
      ),
    },
  };

  return (
    <section aria-label="Today at a glance" data-guide="head-modules">
      <ul className="grid gap-px overflow-hidden rounded-[10px] border border-gold-light bg-gold-light sm:grid-cols-2 lg:grid-cols-5">
        {modules.map((m, n) => (
          <li key={m.key} className={`bg-white ${n === modules.length - 1 ? "sm:col-span-2 lg:col-span-1" : ""}`}>
            <button type="button" onClick={() => setOpen(m.key)} aria-haspopup="dialog" className="flex h-full w-full flex-col items-start gap-1 px-4 py-3.5 text-left transition-colors hover:bg-[var(--portal-hover)]">
              <span className="flex items-center gap-1.5 text-[0.8125rem] font-medium text-ink-500">
                <Icon name={m.icon} size="sm" />
                {m.label}
              </span>
              <span className={`text-[1.5rem] font-semibold leading-tight tabular-nums ${m.alert ? "text-amber-900" : "text-ink"}`}>{m.value}</span>
              <span className={`text-xs ${m.alert ? "font-medium text-amber-900" : "text-ink-500"}`}>{m.note}</span>
            </button>
          </li>
        ))}
      </ul>
      {open && (
        <SidePanel
          title={panel[open].title}
          eyebrow="Today"
          onClose={() => setOpen(null)}
          footer={
            <Link href={panel[open].more.href} className={`${ui.btnSecondary} ml-auto`}>
              {panel[open].more.label}
            </Link>
          }
        >
          {panel[open].body}
        </SidePanel>
      )}
    </section>
  );
}
